const assert = require('node:assert/strict');
const crypto = require('crypto');
const test = require('node:test');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
  activateSharedLicenceRecord,
  verifySharedLicenceRecord,
} = require('../src/licenseCore');

const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const secret = 'emulator-only-bizflow-compatible-secret';
const projectId = 'shared-licence-emulator-test';

function fixture(identity, expiryDate) {
  const normalized = identity.trim().toUpperCase();
  const payload = `${normalized}|${expiryDate}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}|${signature}`, 'utf8').toString('base64url');
}

test('activation from mobile unlocks web; renewal and revocation are shared', {
  skip: !emulatorEnabled,
}, async () => {
  const app = initializeApp({ projectId }, `licence-${Date.now()}`);
  const db = getFirestore(app);
  const uid = 'shared-admin';
  const organisationId = 'test_shared_group';
  await db.collection('users').doc(uid).set({ groupId: organisationId, role: 'admin' });

  const mobileActivation = await activateSharedLicenceRecord({
    db,
    uid,
    data: {
      organisationId,
      key: fixture(organisationId, '2027-01-31'),
      platform: 'android',
    },
    secret,
    now: new Date('2026-09-28T10:00:00Z'),
  });
  assert.equal(mobileActivation.valid, true);

  const webRead = await verifySharedLicenceRecord({
    db,
    uid,
    data: { organisationId },
    now: new Date('2026-09-28T10:00:00Z'),
  });
  assert.equal(webRead.expiryDate, '2027-01-31');

  await activateSharedLicenceRecord({
    db,
    uid,
    data: {
      organisationId,
      key: fixture(organisationId, '2027-12-31'),
      platform: 'web',
    },
    secret,
    now: new Date('2026-09-28T11:00:00Z'),
  });
  const renewedForMobile = await verifySharedLicenceRecord({
    db,
    uid,
    data: { organisationId },
    now: new Date('2026-09-28T11:00:00Z'),
  });
  assert.equal(renewedForMobile.expiryDate, '2027-12-31');

  await db.doc(`organisations/${organisationId}/licence/current`).update({ status: 'revoked' });
  const revoked = await verifySharedLicenceRecord({
    db,
    uid,
    data: { organisationId },
    now: new Date('2026-09-28T12:00:00Z'),
  });
  assert.equal(revoked.valid, false);
  assert.equal(revoked.status, 'revoked');

  await db.recursiveDelete(db.collection('organisations').doc(organisationId));
  await db.collection('users').doc(uid).delete();
  await deleteApp(app);
});

test('wrong organisation membership is rejected', { skip: !emulatorEnabled }, async () => {
  const app = initializeApp({ projectId }, `wrong-org-${Date.now()}`);
  const db = getFirestore(app);
  await db.collection('users').doc('wrong-user').set({ groupId: 'group_a' });
  await assert.rejects(() => activateSharedLicenceRecord({
    db,
    uid: 'wrong-user',
    data: {
      organisationId: 'group_b',
      key: fixture('group_b', '2027-12-31'),
      platform: 'web',
    },
    secret,
  }), /does not belong/i);
  await db.collection('users').doc('wrong-user').delete();
  await deleteApp(app);
});
