import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('Firebase Admin credentials are not configured.');
  }

  try {
    const serviceAccount = JSON.parse(raw);
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('Firebase Admin credentials are incomplete.');
    }
    if (serviceAccount.project_id !== 'bachat-gat-32ffe') {
      throw new Error('Firebase Admin credentials belong to another project.');
    }
    return serviceAccount;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Firebase Admin credentials are invalid JSON.');
    }
    throw error;
  }
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({ credential: cert(readServiceAccount()) });
}

export function getAdminServices() {
  const app = getAdminApp();
  return {
    auth: getAuth(app),
    db: getFirestore(app),
  };
}
