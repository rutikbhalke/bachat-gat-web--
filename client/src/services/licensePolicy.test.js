import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_OFFLINE_GRACE_MS,
  daysRemaining,
  deriveLicenseStatus,
  deriveOfflineStatus,
  needsExpiryWarning,
} from './licensePolicy.js';

test('final eight-day warning is shown only in the warning window', () => {
  const now = new Date('2026-09-20T06:00:00Z');
  assert.equal(daysRemaining('2026-09-28', now), 8);
  assert.equal(needsExpiryWarning('active', '2026-09-28', now), true);
  assert.equal(needsExpiryWarning('active', '2026-10-01', now), false);
});

test('expiry remains active for the complete Asia Kolkata calendar date', () => {
  const record = { status: 'active', expiryDate: new Date('2026-09-28T18:29:59.999Z') };
  assert.equal(deriveLicenseStatus(record, new Date('2026-09-28T18:29:59Z')).valid, true);
  assert.equal(deriveLicenseStatus(record, new Date('2026-09-28T18:30:00Z')).status, 'expired');
});

test('offline cache is accepted for 24 hours but never beyond expiry', () => {
  const now = new Date('2026-09-20T10:00:00Z');
  const cache = {
    organisationId: 'org-a',
    status: 'active',
    expiryDate: '2026-09-28',
    lastVerifiedAt: new Date(now.getTime() - MAX_OFFLINE_GRACE_MS).toISOString(),
  };
  assert.equal(deriveOfflineStatus(cache, 'org-a', now).valid, true);
  const stale = { ...cache, lastVerifiedAt: new Date(now.getTime() - MAX_OFFLINE_GRACE_MS - 1).toISOString() };
  assert.equal(deriveOfflineStatus(stale, 'org-a', now).valid, false);
  assert.equal(deriveOfflineStatus({ ...cache, expiryDate: '2026-09-19' }, 'org-a', now).status, 'expired');
});

test('offline cache rejects an obvious clock rollback', () => {
  const now = new Date('2026-09-28T10:00:00Z');
  const cache = {
    organisationId: 'shivshahi_group_001',
    status: 'active',
    expiryDate: '2026-10-10',
    lastVerifiedAt: '2026-09-28T11:00:00Z',
  };

  assert.equal(
    deriveOfflineStatus(cache, 'shivshahi_group_001', now).status,
    'unavailable',
  );
});
