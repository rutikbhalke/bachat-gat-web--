const crypto = require('crypto');
const { Timestamp } = require('firebase-admin/firestore');

const BUSINESS_TIMEZONE_OFFSET_MINUTES = 330;
const ISSUER = 'BizFlow India';

class LicenceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function businessDate(now = new Date()) {
  return new Date(now.getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60000)
    .toISOString()
    .slice(0, 10);
}

function expiryTimestamp(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return Timestamp.fromMillis(Date.UTC(year, month - 1, day, 18, 29, 59, 999));
}

function validateDate(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;
  const [year, month, day] = dateText.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function decodeLicenceKey(key) {
  const clean = typeof key === 'string' ? key.trim() : '';
  if (!clean || !/^[A-Za-z0-9_-]+={0,2}$/.test(clean)) {
    throw new LicenceError('invalid-argument', 'The licence key is malformed.');
  }
  try {
    const bytes = Buffer.from(clean.replace(/=+$/, ''), 'base64url');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parts = decoded.split('|');
    if (parts.length !== 3) throw new Error('parts');
    const [identityRaw, expiryDate, signatureRaw] = parts;
    const identity = identityRaw.trim().toUpperCase();
    const signature = signatureRaw.trim();
    if (!identity || !validateDate(expiryDate) || !/^[a-f0-9]{64}$/.test(signature)) {
      throw new Error('payload');
    }
    return { identity, expiryDate, signature };
  } catch (error) {
    if (error instanceof LicenceError) throw error;
    throw new LicenceError('invalid-argument', 'The licence key is malformed.');
  }
}

function verifyLicenceKey({ key, expectedIdentity, secret, now = new Date() }) {
  if (!secret) {
    throw new LicenceError('failed-precondition', 'Licence verification is unavailable.');
  }
  const decoded = decodeLicenceKey(key);
  const normalizedIdentity = String(expectedIdentity || '').trim().toUpperCase();
  if (!normalizedIdentity || decoded.identity !== normalizedIdentity) {
    throw new LicenceError('permission-denied', 'The licence is for a different organisation.');
  }
  const payload = `${decoded.identity}|${decoded.expiryDate}`;
  const expected = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  const actualBytes = Buffer.from(decoded.signature, 'ascii');
  const expectedBytes = Buffer.from(expected, 'ascii');
  if (actualBytes.length !== expectedBytes.length ||
      !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
    throw new LicenceError('permission-denied', 'The licence key is invalid.');
  }
  if (decoded.expiryDate < businessDate(now)) {
    throw new LicenceError('failed-precondition', 'The licence key has expired.');
  }
  return decoded;
}

function licenceDocumentPath(organisationId) {
  return `organisations/${organisationId}/licence/current`;
}

function userOrganisation(data) {
  return String(data?.groupId || data?.group_id || data?.organisationId || '').trim();
}

async function assertMembership(db, uid, organisationId) {
  const profile = await db.collection('users').doc(uid).get();
  if (!profile.exists || userOrganisation(profile.data()) !== organisationId) {
    throw new LicenceError('permission-denied', 'User does not belong to this organisation.');
  }
  return profile.data();
}

async function activateSharedLicenceRecord({
  db,
  uid,
  data,
  secret,
  now = new Date(),
}) {
  const organisationId = String(data?.organisationId || '').trim();
  const platform = data?.platform === 'web' ? 'web' : 'android';
  const key = typeof data?.key === 'string' ? data.key.trim() : '';
  const deviceId = String(data?.deviceId || '').trim().toUpperCase();
  const migration = data?.migration === true;
  if (!uid || !organisationId || !key) {
    throw new LicenceError('invalid-argument', 'Organisation and licence key are required.');
  }
  await assertMembership(db, uid, organisationId);

  const decoded = decodeLicenceKey(key);
  const organisationIdentity = organisationId.toUpperCase();
  const isOrganisationKey = decoded.identity === organisationIdentity;
  const isLegacyDeviceKey = migration && deviceId && decoded.identity === deviceId;
  if (!isOrganisationKey && !isLegacyDeviceKey) {
    throw new LicenceError('permission-denied', 'The licence is for a different organisation.');
  }
  const verified = verifyLicenceKey({
    key,
    expectedIdentity: decoded.identity,
    secret,
    now,
  });
  const licenceRef = db.doc(licenceDocumentPath(organisationId));
  const keyHash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
  const activatedAt = Timestamp.fromDate(now);

  const result = await db.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(licenceRef);
    const existing = existingSnapshot.exists ? existingSnapshot.data() : null;
    if (isLegacyDeviceKey && existingSnapshot.exists) {
      throw new LicenceError(
        'failed-precondition',
        'A shared licence already exists; legacy migration cannot overwrite it.',
      );
    }
    const existingExpiry = existing?.expiryDate?.toDate?.();
    const newExpiry = expiryTimestamp(verified.expiryDate);
    if (existingExpiry && existingExpiry.getTime() > newExpiry.toDate().getTime()) {
      return {
        status: existing.status || 'active',
        expiryDate: businessDate(existingExpiry),
        unchanged: true,
      };
    }
    transaction.set(licenceRef, {
      status: 'active',
      expiryDate: newExpiry,
      activatedAt: existing?.activatedAt || activatedAt,
      updatedAt: activatedAt,
      activatedBy: uid,
      licenceKeyHash: keyHash,
      plan: 'yearly',
      issuer: ISSUER,
      lastActivationPlatform: platform,
      schemaVersion: 1,
    }, { merge: false });
    return { status: 'active', expiryDate: verified.expiryDate, unchanged: false };
  });

  return {
    valid: result.status === 'active',
    status: result.status,
    organisationId,
    expiryDate: result.expiryDate,
    unchanged: result.unchanged,
    serverDate: businessDate(now),
  };
}

async function verifySharedLicenceRecord({ db, uid, data, now = new Date() }) {
  const organisationId = String(data?.organisationId || '').trim();
  if (!uid || !organisationId) {
    throw new LicenceError('invalid-argument', 'Organisation is required.');
  }
  await assertMembership(db, uid, organisationId);
  const snapshot = await db.doc(licenceDocumentPath(organisationId)).get();
  if (!snapshot.exists) {
    return {
      valid: false,
      status: 'missing',
      organisationId,
      expiryDate: null,
      serverDate: businessDate(now),
    };
  }
  const record = snapshot.data();
  const expiry = record.expiryDate?.toDate?.();
  const expiryDate = expiry ? businessDate(expiry) : null;
  const status = String(record.status || 'inactive').toLowerCase();
  const valid = status === 'active' && expiryDate && expiryDate >= businessDate(now);
  return {
    valid: Boolean(valid),
    status: valid ? 'active' : (status === 'active' ? 'expired' : status),
    organisationId,
    expiryDate,
    serverDate: businessDate(now),
    schemaVersion: record.schemaVersion || 1,
  };
}

module.exports = {
  LicenceError,
  activateSharedLicenceRecord,
  businessDate,
  decodeLicenceKey,
  expiryTimestamp,
  licenceDocumentPath,
  verifyLicenceKey,
  verifySharedLicenceRecord,
};
