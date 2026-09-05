const { auth, db } = require('../config/firebaseAdmin');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. No Firebase ID token provided.' });
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    const profile = await db.collection('users').doc(decoded.uid).get();
    const data = profile.exists ? profile.data() : {};
    const role = (data.role_name || data.role || 'MEMBER').toUpperCase();

    if (data.isActive === false) {
      return res.status(403).json({ success: false, message: 'User account is inactive.' });
    }

    req.user = {
      ...decoded,
      ...data,
      id: decoded.uid,
      uid: decoded.uid,
      email: decoded.email || data.email,
      name: data.fullName || data.name || decoded.name || decoded.email,
      role,
      role_name: role,
      groupId: data.groupId || 'shivshahi_group_001',
      memberId: data.memberId || null,
    };
    return next();
  } catch (err) {
    if (err.code === 'auth/id-token-expired' || err.code === 'auth/id-token-revoked') {
      return res.status(401).json({ success: false, message: 'Token has expired. Please login again.' });
    }
    if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
      return res.status(401).json({ success: false, message: 'Invalid Firebase ID token.' });
    }
    console.error('Firebase Admin authentication is unavailable:', err.message || err);
    return res.status(503).json({
      success: false,
      message: 'Admin service is not configured. Member profile fields can still be saved, but login password/account changes require the Firebase service account.',
    });
  }
}

module.exports = authenticateToken;
