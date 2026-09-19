const crypto = require('crypto');

const BUSINESS_TIME_ZONE = 'Asia/Kolkata';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

class LicenseValidationError extends Error {
  constructor(message = 'The licence key is invalid or expired.') {
    super(message);
    this.name = 'LicenseValidationError';
    this.statusCode = 400;
  }
}

function normalizeMachineId(machineId) {
  return String(machineId || '').trim().toUpperCase();
}

function getBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseStrictDate(dateText) {
  if (!DATE_PATTERN.test(dateText)) return null;
  const [year, month, day] = dateText.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

function calendarDaysBetween(fromDate, toDate) {
  const from = parseStrictDate(fromDate);
  const to = parseStrictDate(toDate);
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function decodeLicenseKey(key) {
  const encoded = String(key || '').trim();
  if (!encoded || !BASE64URL_PATTERN.test(encoded) || encoded.length % 4 === 1) {
    throw new LicenseValidationError();
  }

  const unpadded = encoded.replace(/=+$/, '');
  let decoded;
  try {
    const bytes = Buffer.from(unpadded, 'base64url');
    if (!bytes.length || bytes.toString('base64url') !== unpadded) {
      throw new Error('Non-canonical Base64URL');
    }
    decoded = bytes.toString('utf8');
  } catch {
    throw new LicenseValidationError();
  }

  if (decoded.includes('\uFFFD')) throw new LicenseValidationError();
  const parts = decoded.split('|');
  if (parts.length !== 3) throw new LicenseValidationError();
  return parts;
}

function validateLicense({ machineId, key, secret, now = new Date() }) {
  const submittedMachineId = normalizeMachineId(machineId);
  if (!submittedMachineId || !String(key || '').trim()) {
    throw new LicenseValidationError('Machine ID and licence key are required.');
  }
  if (!secret) {
    const error = new Error('Licence service is unavailable.');
    error.statusCode = 503;
    throw error;
  }

  const [keyMachineIdRaw, expiryDate, signature] = decodeLicenseKey(key);
  const keyMachineId = normalizeMachineId(keyMachineIdRaw);
  if (!keyMachineId || keyMachineId !== submittedMachineId) {
    throw new LicenseValidationError();
  }
  if (!parseStrictDate(expiryDate) || !SIGNATURE_PATTERN.test(signature)) {
    throw new LicenseValidationError();
  }

  const payload = `${keyMachineId}|${expiryDate}`;
  const expected = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  const signatureBuffer = Buffer.from(signature, 'ascii');
  const expectedBuffer = Buffer.from(expected, 'ascii');
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new LicenseValidationError();
  }

  const today = getBusinessDate(now);
  const daysRemaining = calendarDaysBetween(today, expiryDate);
  if (daysRemaining < 0) throw new LicenseValidationError();

  return {
    success: true,
    valid: true,
    machineId: keyMachineId,
    expiryDate,
    daysRemaining,
  };
}

module.exports = {
  BUSINESS_TIME_ZONE,
  LicenseValidationError,
  calendarDaysBetween,
  decodeLicenseKey,
  getBusinessDate,
  normalizeMachineId,
  parseStrictDate,
  validateLicense,
};
