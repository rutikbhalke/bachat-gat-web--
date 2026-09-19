export const LICENSE_STORAGE_KEYS = Object.freeze({
  machineId: 'license_machine_id',
  activationKey: 'license_activation_key',
  expiry: 'license_expiry',
  warningLastShown: 'license_warning_last_shown',
  policy: 'license_policy',
});

export const LICENSE_POLICY = 'server-verified-v1';
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

export function createMachineId(cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.getRandomValues) throw new Error('Secure random generation is unavailable.');
  const bytes = new Uint8Array(12);
  cryptoApi.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').toUpperCase();
}

export function getOrCreateMachineId(storage = globalThis.localStorage, cryptoApi = globalThis.crypto) {
  const existing = String(storage.getItem(LICENSE_STORAGE_KEYS.machineId) || '').trim();
  if (existing) return existing.toUpperCase();

  const hasPartialLicence = Boolean(
    storage.getItem(LICENSE_STORAGE_KEYS.activationKey) ||
    storage.getItem(LICENSE_STORAGE_KEYS.expiry)
  );
  if (hasPartialLicence) {
    throw new Error('The saved Machine ID is missing. Clear the incomplete licence state or contact support.');
  }

  const machineId = createMachineId(cryptoApi);
  storage.setItem(LICENSE_STORAGE_KEYS.machineId, machineId);
  return machineId;
}

export function getBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shouldShowDailyWarning(daysRemaining, lastShown, today = getBusinessDate()) {
  return Number.isInteger(daysRemaining) &&
    daysRemaining >= 0 &&
    daysRemaining <= 8 &&
    lastShown !== today;
}

export function shouldReplaceStoredLicence(existingExpiry, newExpiry, existingIsValid) {
  if (!existingIsValid || !existingExpiry) return true;
  return newExpiry >= existingExpiry;
}

async function postLicence(path, machineId, key) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machineId, key }),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || !data?.valid) {
    throw new Error(data?.message || 'Unable to validate the licence. Please try again.');
  }
  return data;
}

export const licenseApi = {
  activate: (machineId, key) => postLicence('/api/license/activate', machineId, key),
  verify: (machineId, key) => postLicence('/api/license/verify', machineId, key),
};
