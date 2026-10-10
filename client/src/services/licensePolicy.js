export const MAX_OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000;

export function businessDate(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

export function dateFromValue(value) {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return businessDate(date);
}

export function daysRemaining(expiryDate, now = new Date()) {
  if (!expiryDate) return 0;
  const current = Date.parse(`${businessDate(now)}T00:00:00Z`);
  const expiry = Date.parse(`${expiryDate}T00:00:00Z`);
  return Math.round((expiry - current) / 86400000);
}

export function deriveLicenseStatus(record, now = new Date()) {
  if (!record) return { valid: false, status: 'missing', expiryDate: null };
  const expiryDate = dateFromValue(record.expiryDate);
  const rawStatus = String(record.status || 'inactive').toLowerCase();
  if (rawStatus !== 'active') {
    return { valid: false, status: rawStatus, expiryDate };
  }
  if (!expiryDate || expiryDate < businessDate(now)) {
    return { valid: false, status: 'expired', expiryDate };
  }
  return { valid: true, status: 'active', expiryDate };
}

export function deriveOfflineStatus(cache, organisationId, now = new Date()) {
  if (!cache || cache.organisationId !== organisationId) {
    return { valid: false, status: 'unavailable', expiryDate: null };
  }
  if (!cache.expiryDate || cache.expiryDate < businessDate(now)) {
    return { valid: false, status: 'expired', expiryDate: cache.expiryDate || null };
  }
  const verifiedAt = Date.parse(cache.lastVerifiedAt || '');
  const verificationAge = now.getTime() - verifiedAt;
  if (!Number.isFinite(verifiedAt) || verificationAge < 0 || verificationAge > MAX_OFFLINE_GRACE_MS) {
    return { valid: false, status: 'unavailable', expiryDate: cache.expiryDate };
  }
  if (cache.status !== 'active') {
    return { valid: false, status: cache.status || 'inactive', expiryDate: cache.expiryDate };
  }
  return { valid: true, status: 'offlineGrace', expiryDate: cache.expiryDate };
}

export function needsExpiryWarning(status, expiryDate, now = new Date()) {
  const remaining = daysRemaining(expiryDate, now);
  return (status === 'active' || status === 'offlineGrace') && remaining >= 0 && remaining <= 8;
}
