import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LICENSE_STORAGE_KEYS,
  createMachineId,
  getOrCreateMachineId,
  shouldReplaceStoredLicence,
  shouldShowDailyWarning,
} from '../src/services/licenseService.js';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const fixedCrypto = {
  getRandomValues(bytes) {
    bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    return bytes;
  },
};

test('Machine ID is uppercase Base64URL and persists after restart', () => {
  const storage = new MemoryStorage();
  const first = getOrCreateMachineId(storage, fixedCrypto);
  const second = getOrCreateMachineId(storage, { getRandomValues() { throw new Error('must not regenerate'); } });
  assert.match(first, /^[A-Z0-9_-]+$/);
  assert.equal(first, second);
  assert.equal(storage.getItem(LICENSE_STORAGE_KEYS.machineId), first);
});

test('12 secure random bytes produce an unpadded Machine ID', () => {
  const machineId = createMachineId(fixedCrypto);
  assert.equal(machineId.length, 16);
  assert.equal(machineId.includes('='), false);
});

test('Machine ID is not silently regenerated when partial licence data exists', () => {
  const storage = new MemoryStorage({ [LICENSE_STORAGE_KEYS.activationKey]: 'saved-key' });
  assert.throws(() => getOrCreateMachineId(storage, fixedCrypto), /Machine ID is missing/i);
});

test('warning appears only once per business calendar day at eight days or fewer', () => {
  assert.equal(shouldShowDailyWarning(8, '2027-09-18', '2027-09-19'), true);
  assert.equal(shouldShowDailyWarning(8, '2027-09-19', '2027-09-19'), false);
  assert.equal(shouldShowDailyWarning(9, '2027-09-18', '2027-09-19'), false);
});

test('existing longer valid licence is not shortened', () => {
  assert.equal(shouldReplaceStoredLicence('2028-12-31', '2028-01-01', true), false);
  assert.equal(shouldReplaceStoredLicence('2028-01-01', '2028-12-31', true), true);
  assert.equal(shouldReplaceStoredLicence('2028-12-31', '2028-01-01', false), true);
});
