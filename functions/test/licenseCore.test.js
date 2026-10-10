const assert = require('node:assert/strict');
const crypto = require('crypto');
const test = require('node:test');
const {
  LicenceError,
  businessDate,
  decodeLicenceKey,
  verifyLicenceKey,
} = require('../src/licenseCore');

const secret = 'emulator-only-bizflow-compatible-secret';

function fixture(identity, expiryDate, fixtureSecret = secret) {
  const normalized = identity.trim().toUpperCase();
  const payload = `${normalized}|${expiryDate}`;
  const signature = crypto.createHmac('sha256', fixtureSecret).update(payload).digest('hex');
  return Buffer.from(`${payload}|${signature}`, 'utf8').toString('base64url');
}

test('BizFlow-compatible key validates for the shared organisation', () => {
  const key = fixture('SHIVSHAHI_GROUP_001', '2027-09-17');
  const result = verifyLicenceKey({
    key,
    expectedIdentity: 'shivshahi_group_001',
    secret,
    now: new Date('2027-09-17T18:29:59.000Z'),
  });
  assert.equal(result.expiryDate, '2027-09-17');
});

test('padding and no-padding Base64URL keys are both accepted', () => {
  const key = fixture('SHIVSHAHI_GROUP_001', '2027-09-17');
  const padding = '='.repeat((4 - (key.length % 4)) % 4);
  assert.equal(decodeLicenceKey(key).identity, 'SHIVSHAHI_GROUP_001');
  assert.equal(decodeLicenceKey(`${key}${padding}`).identity, 'SHIVSHAHI_GROUP_001');
});

test('malformed, altered-signature and wrong-organisation keys are rejected', () => {
  assert.throws(() => decodeLicenceKey('not/a/key'), LicenceError);
  const key = fixture('SHIVSHAHI_GROUP_001', '2027-09-17');
  const decoded = Buffer.from(key, 'base64url').toString('utf8');
  const altered = Buffer.from(`${decoded.slice(0, -1)}0`).toString('base64url');
  assert.throws(() => verifyLicenceKey({ key: altered, expectedIdentity: 'SHIVSHAHI_GROUP_001', secret }), /invalid/i);
  assert.throws(() => verifyLicenceKey({ key, expectedIdentity: 'OTHER_GROUP', secret }), /different organisation/i);
});

test('expired keys fail while the complete expiry date remains valid in Asia Kolkata', () => {
  const key = fixture('SHIVSHAHI_GROUP_001', '2026-09-28');
  assert.doesNotThrow(() => verifyLicenceKey({
    key,
    expectedIdentity: 'SHIVSHAHI_GROUP_001',
    secret,
    now: new Date('2026-09-28T18:29:59.000Z'),
  }));
  assert.throws(() => verifyLicenceKey({
    key,
    expectedIdentity: 'SHIVSHAHI_GROUP_001',
    secret,
    now: new Date('2026-09-28T18:30:00.000Z'),
  }), /expired/i);
  assert.equal(businessDate(new Date('2026-09-28T18:30:00.000Z')), '2026-09-29');
});

test('missing signing secret fails closed', () => {
  const key = fixture('SHIVSHAHI_GROUP_001', '2027-09-17');
  assert.throws(() => verifyLicenceKey({ key, expectedIdentity: 'SHIVSHAHI_GROUP_001', secret: '' }), /unavailable/i);
});

test('deployed callable names match both client integrations', () => {
  const endpoints = require('../index');
  assert.equal(typeof endpoints.activateSharedLicence, 'function');
  assert.equal(typeof endpoints.verifySharedLicence, 'function');
});
