import licenseCore from '../../functions/src/licenseCore.js';
import { getAdminServices } from './firebaseAdmin.js';

const {
  LicenceError,
  activateSharedLicenceRecord,
  verifySharedLicenceRecord,
} = licenseCore;

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function readBearerToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function publicError(error) {
  if (error instanceof LicenceError) {
    const status = error.code === 'permission-denied'
      ? 403
      : error.code === 'unauthenticated'
        ? 401
        : 400;
    return { status, code: error.code, message: error.message };
  }
  if (error?.code === 'auth/id-token-expired' || error?.code === 'auth/argument-error') {
    return { status: 401, code: 'unauthenticated', message: 'Authentication is required.' };
  }
  console.error('Shared licence API failed:', error?.message || 'Unknown error');
  return {
    status: 503,
    code: 'unavailable',
    message: 'Licence service is unavailable.',
  };
}

export function createSharedLicenceHandler(action) {
  return async function sharedLicenceHandler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { success: false, valid: false, code: 'method-not-allowed', message: 'Method not allowed.' });
    }

    try {
      const token = readBearerToken(req);
      if (!token) {
        return send(res, 401, { success: false, valid: false, code: 'unauthenticated', message: 'Authentication is required.' });
      }

      const { auth, db } = getAdminServices();
      const decoded = await auth.verifyIdToken(token);
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const result = action === 'activate'
        ? await activateSharedLicenceRecord({
            db,
            uid: decoded.uid,
            data,
            secret: process.env.LICENSE_SIGNING_SECRET,
          })
        : await verifySharedLicenceRecord({ db, uid: decoded.uid, data });

      return send(res, 200, { success: true, ...result });
    } catch (error) {
      const safe = publicError(error);
      return send(res, safe.status, {
        success: false,
        valid: false,
        code: safe.code,
        message: safe.message,
      });
    }
  };
}
