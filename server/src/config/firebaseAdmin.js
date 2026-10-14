const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const fs = require('fs');

function parseServiceAccountJson(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Try direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch (_) {}
  // Try base64 decoded JSON parse
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (_) {}
  return null;
}

function resolveFilePath(filePath) {
  if (!filePath) return null;
  const trimmed = filePath.trim();
  if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
    return trimmed;
  }
  const relativeToServer = path.resolve(__dirname, '../../', trimmed);
  if (fs.existsSync(relativeToServer)) {
    return relativeToServer;
  }
  const relativeToCwd = path.resolve(process.cwd(), trimmed);
  if (fs.existsSync(relativeToCwd)) {
    return relativeToCwd;
  }
  return null;
}

function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const parsed = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (parsed) {
      return admin.credential.cert(parsed);
    }
    console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON as valid JSON or Base64.');
  }

  const explicitPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicitPath) {
    const resolved = resolveFilePath(explicitPath);
    if (resolved) {
      try {
        return admin.credential.cert(resolved);
      } catch (e) {
        console.warn('Failed to load credentials from file:', e.message);
      }
    } else {
      console.warn(`Credential file path not found: ${explicitPath}`);
    }
    try {
      return admin.credential.applicationDefault();
    } catch (_) {}
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

// Optional Secondary Firebase Admin App for Flutter Project (bachatgatapp-5158b)
const FLUTTER_PROJECT_ID = process.env.FLUTTER_FIREBASE_PROJECT_ID || 'bachatgatapp-5158b';
let flutterApp = null;
let flutterDb = null;
let hasFlutterAdmin = false;

function getFlutterCredential() {
  if (process.env.FLUTTER_FIREBASE_SERVICE_ACCOUNT_JSON) {
    const parsed = parseServiceAccountJson(process.env.FLUTTER_FIREBASE_SERVICE_ACCOUNT_JSON);
    if (parsed) {
      return admin.credential.cert(parsed);
    }
    console.warn('Failed to parse FLUTTER_FIREBASE_SERVICE_ACCOUNT_JSON as valid JSON or Base64.');
  }

  const explicitFlutterPath = process.env.FLUTTER_FIREBASE_SERVICE_ACCOUNT_PATH || process.env.FLUTTER_GOOGLE_APPLICATION_CREDENTIALS;
  if (explicitFlutterPath) {
    const resolved = resolveFilePath(explicitFlutterPath);
    if (resolved) {
      try {
        return admin.credential.cert(resolved);
      } catch (e) {
        console.warn('Failed to load FLUTTER credentials from file:', e.message);
      }
    } else {
      console.warn(`Flutter credential file path not found: ${explicitFlutterPath}`);
    }
  }

  return undefined;
}

try {
  const flutterCred = getFlutterCredential();
  if (flutterCred) {
    const existingFlutterApp = admin.apps.find((a) => a && a.name === 'flutterApp');
    flutterApp = existingFlutterApp || admin.initializeApp(
      {
        credential: flutterCred,
        projectId: FLUTTER_PROJECT_ID,
      },
      'flutterApp'
    );
    flutterDb = admin.firestore(flutterApp);
    hasFlutterAdmin = true;
    console.log(`[FirebaseAdmin] Secondary Flutter app connected for project: ${FLUTTER_PROJECT_ID}`);
  } else {
    console.log(`[FirebaseAdmin] Secondary Flutter app unconfigured (no credentials provided for ${FLUTTER_PROJECT_ID}). Outbox queueing active.`);
  }
} catch (err) {
  console.warn(`[FirebaseAdmin] Could not initialize secondary Flutter app: ${err.message}`);
}

module.exports = {
  admin,
  auth,
  db,
  hasServiceAccount,
  flutterApp,
  flutterDb,
  hasFlutterAdmin,
  FLUTTER_PROJECT_ID,
};