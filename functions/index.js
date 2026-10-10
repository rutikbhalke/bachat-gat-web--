const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const {
  LicenceError,
  activateSharedLicenceRecord,
  verifySharedLicenceRecord,
} = require('./src/licenseCore');

initializeApp();
const db = getFirestore();
const signingSecret = defineSecret('LICENSE_SIGNING_SECRET');
const callableOptions = { region: 'asia-south1' };

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  return request.auth.uid;
}

function safeError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof LicenceError) {
    return new HttpsError(error.code, error.message);
  }
  console.error('Shared licence operation failed:', error?.message || error);
  return new HttpsError('internal', 'Licence operation failed. Please try again.');
}

exports.activateSharedLicence = onCall(
  { ...callableOptions, secrets: [signingSecret] },
  async (request) => {
    try {
      return await activateSharedLicenceRecord({
        db,
        uid: requireAuth(request),
        data: request.data,
        secret: signingSecret.value(),
      });
    } catch (error) {
      throw safeError(error);
    }
  },
);

exports.verifySharedLicence = onCall(callableOptions, async (request) => {
  try {
    return await verifySharedLicenceRecord({
      db,
      uid: requireAuth(request),
      data: request.data,
    });
  } catch (error) {
    throw safeError(error);
  }
});
