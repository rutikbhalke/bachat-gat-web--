const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  decodeLicenseKey,
  getBusinessDate,
  parseStrictDate,
  validateLicense,
} = require('../src/services/licenseService');

const TEST_SECRET = 'fixture-secret-never-production';
const MACHINE_ID = 'MACHINE-ABC123';
const FIXTURE_KEY = 'TUFDSElORS1BQkMxMjN8MjA5OS0xMi0zMXw2MDVjZGIxZDQyMjQyNTNlYWY0NDdmMjY1ZmMxOTFjYTE1ODQ1YmIwZDQ0ODVkODVkOWY4MTBmYTA0N2VjYzc3';

function validate(overrides = {}) {
  return validateLicense({
    machineId: MACHINE_ID,
    key: FIXTURE_KEY,
    secret: TEST_SECRET,
    now: new Date('2027-09-19T12:00:00.000Z'),
    ...overrides,
  });
}

test('generator-compatible known fixture validates', () => {
  const result = validate();
  assert.equal(result.valid, true);
  assert.equal(result.machineId, MACHINE_ID);
  assert.equal(result.expiryDate, '2099-12-31');
});

test('correct Machine ID and uppercase normalization are enforced', () => {
  assert.equal(validate({ machineId: '  machine-abc123  ' }).valid, true);
  assert.throws(() => validate({ machineId: 'OTHER-MACHINE' }), /invalid or expired/i);
});

test('future expiry is valid and an expired key is rejected', () => {
  assert.equal(validate().valid, true);
  assert.throws(
    () => validate({ now: new Date('2100-01-01T12:00:00.000Z') }),
    /invalid or expired/i
  );
});

test('licence remains valid through the complete expiry calendar date', () => {
  assert.equal(validate({ now: new Date('2099-12-31T18:29:59.000Z') }).daysRemaining, 0);
  assert.throws(
    () => validate({ now: new Date('2099-12-31T18:30:00.000Z') }),
    /invalid or expired/i
  );
});

test('strict dates reject invalid calendar values', () => {
  assert.equal(parseStrictDate('2027-02-29'), null);
  assert.equal(parseStrictDate('2028-02-29') instanceof Date, true);
  assert.equal(parseStrictDate('19-09-2027'), null);
});

test('modified payload and modified signature are rejected', () => {
  const decoded = Buffer.from(FIXTURE_KEY, 'base64url').toString('utf8');
  const modifiedPayload = Buffer.from(decoded.replace('2099-12-31', '2099-12-30')).toString('base64url');
  const modifiedSignature = Buffer.from(`${decoded.slice(0, -1)}0`).toString('base64url');
  assert.throws(() => validate({ key: modifiedPayload }), /invalid or expired/i);
  assert.throws(() => validate({ key: modifiedSignature }), /invalid or expired/i);
});

test('invalid Base64URL is rejected', () => {
  assert.throws(() => validate({ key: '***not-base64***' }), /invalid or expired/i);
  assert.throws(() => decodeLicenseKey('A'), /invalid or expired/i);
});

test('Base64URL padding and no-padding are both accepted', () => {
  const padding = '='.repeat((4 - (FIXTURE_KEY.length % 4)) % 4);
  assert.equal(validate({ key: FIXTURE_KEY }).valid, true);
  assert.equal(validate({ key: `${FIXTURE_KEY}${padding}` }).valid, true);
});

test('missing server secret fails closed', () => {
  assert.throws(() => validate({ secret: '' }), /unavailable/i);
});

test('business date uses the configured calendar timezone', () => {
  assert.equal(getBusinessDate(new Date('2027-09-18T19:00:00.000Z')), '2027-09-19');
});

test('licence validation does not modify business data', () => {
  const businessData = Object.freeze({ members: 43, totalSavings: 55000, loans: 31 });
  const before = JSON.stringify(businessData);
  validate();
  assert.equal(JSON.stringify(businessData), before);
});

test('exact POST /api/license/activate route is served', async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.LICENSE_SIGNING_SECRET = TEST_SECRET;
  const app = require('../src/index');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/license/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machineId: MACHINE_ID, key: FIXTURE_KEY }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.valid, true);
  assert.equal(body.message, 'Licence activated successfully.');
});
