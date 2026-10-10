import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { businessDate, deriveLicenseStatus, deriveOfflineStatus } from './licensePolicy';

const CACHE_KEY = 'shared_licence_cache_v1';
const DEVICE_KEY = 'license_machine_id';
const LEGACY_KEY = 'license_activation_key';
const WARNING_KEY = 'license_warning_last_shown';

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (id) return id;
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  id = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
    .toUpperCase();
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

function cacheVerified(organisationId, status) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    organisationId,
    status: status.valid ? 'active' : status.status,
    expiryDate: status.expiryDate || null,
    lastVerifiedAt: new Date().toISOString(),
  }));
}

async function verify(organisationId) {
  const result = await authenticatedPost('/api/license/verify', { organisationId });
  cacheVerified(organisationId, result);
  return result;
}

async function activate({ key, organisationId, migration = false }) {
  const result = await authenticatedPost('/api/license/activate', {
    key: key.trim(),
    organisationId,
    platform: 'web',
    deviceId: getDeviceId(),
    migration,
  });
  cacheVerified(organisationId, result);
  if (result.valid) localStorage.removeItem(LEGACY_KEY);
  return result;
}

async function authenticatedPost(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again before verifying the licence.');
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.message || 'Licence service is unavailable.');
  }
  return data;
}

async function migrateIfNeeded(organisationId, currentStatus) {
  if (currentStatus?.status !== 'missing') return currentStatus;
  const key = localStorage.getItem(LEGACY_KEY)?.trim();
  if (!key) return currentStatus;
  try {
    return await activate({ key, organisationId, migration: true });
  } catch {
    return currentStatus;
  }
}

function subscribe(organisationId, onStatus, onError) {
  const reference = doc(db, 'organisations', organisationId, 'licence', 'current');
  return onSnapshot(reference, { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) {
      onStatus(deriveOfflineStatus(readCache(), organisationId));
      return;
    }
    const status = deriveLicenseStatus(snapshot.exists() ? snapshot.data() : null);
    cacheVerified(organisationId, status);
    onStatus(status);
  }, () => {
    const offline = deriveOfflineStatus(readCache(), organisationId);
    onStatus(offline);
    if (onError) onError(offline);
  });
}

function consumeDailyWarning() {
  const today = businessDate();
  if (localStorage.getItem(WARNING_KEY) === today) return false;
  localStorage.setItem(WARNING_KEY, today);
  return true;
}

function revalidateLocalStatus(status, organisationId) {
  if (status?.status === 'offlineGrace') {
    return deriveOfflineStatus(readCache(), organisationId);
  }
  if (status?.status === 'active') {
    return deriveLicenseStatus({ status: 'active', expiryDate: status.expiryDate });
  }
  return status;
}

export const licenseService = {
  activate,
  consumeDailyWarning,
  getDeviceId,
  migrateIfNeeded,
  readCache,
  revalidateLocalStatus,
  subscribe,
  verify,
};
