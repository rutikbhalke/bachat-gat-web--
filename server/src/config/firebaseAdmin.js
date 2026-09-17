const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } catch (e) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
    }
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const fs = require('fs');
      if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        return admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      }
    } catch (e) {
      console.warn('Failed to load GOOGLE_APPLICATION_CREDENTIALS file:', e.message);
    }
    return admin.credential.applicationDefault();
  }

  return undefined;
}

const credential = getCredential();
const hasServiceAccount = Boolean(credential) || Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const firebaseApp = admin.apps.length
  ? admin.app()
  : admin.initializeApp({
      ...(credential ? { credential } : {}),
      projectId: process.env.FIREBASE_PROJECT_ID || 'bachat-gat-32ffe',
    });

const auth = admin.auth(firebaseApp);
const db = admin.firestore(firebaseApp);

module.exports = { admin, auth, db, hasServiceAccount };