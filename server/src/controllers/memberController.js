const { auth, db, admin } = require('../config/firebaseAdmin');
const legacyController = require('./firebaseController');

const DEFAULT_GROUP_ID = 'shivshahi_group_001';
const ALLOWED_ROLES = new Set(['ADMIN', 'MEMBER', 'TREASURER', 'SECRETARY']);

function cleanRole(value) {
  const role = String(value || 'MEMBER').trim().toUpperCase();
  if (!ALLOWED_ROLES.has(role)) throw new Error('Invalid role.');
  return role;
}

async function findMember(memberId) {
  const directRef = db.collection('users').doc(memberId);
  const direct = await directRef.get();
  if (direct.exists) return { ref: directRef, snap: direct };

  for (const field of ['memberId', 'member_id', 'authUid', 'firebaseUid', 'userId']) {
    const result = await db.collection('users').where(field, '==', memberId).limit(1).get();
    if (!result.empty) return { ref: result.docs[0].ref, snap: result.docs[0] };
  }
  return null;
}

async function manageMemberAccess(req, res, next) {
  try {
    const found = await findMember(req.params.id);
    if (!found) return res.status(404).json({ success: false, message: 'Member record not found.' });

    const member = found.snap.data();
    const roleName = cleanRole(req.body.role || req.body.role_name || member.role || member.role_name);
    const email = String(req.body.email || member.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || req.body.fullName || member.name || member.fullName || 'Member').trim();
    const phone = String(req.body.phone ?? member.phone ?? '').trim();
    const memberCode = String(req.body.memberCode || req.body.member_code || member.memberCode || member.member_code || found.snap.id).trim();
    const isActive = req.body.isActive === undefined ? member.isActive !== false : Boolean(req.body.isActive);

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'A valid login email is required.' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (req.user.uid === (member.authUid || member.firebaseUid || member.userId || found.snap.id) && roleName !== 'ADMIN') {
      return res.status(400).json({ success: false, message: 'You cannot remove your own admin access.' });
    }

    let authUid = member.authUid || member.firebaseUid || member.userId;
    let authUser;
    if (authUid) {
      try {
        authUser = await auth.updateUser(authUid, {
          email,
          displayName: name,
          disabled: !isActive,
          ...(password ? { password } : {}),
        });
      } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
        authUid = null;
      }
    }

    if (!authUid) {
      if (!password) {
        return res.status(400).json({ success: false, message: 'Enter a temporary password to create this member login.' });
      }
      authUser = await auth.createUser({ email, password, displayName: name, disabled: !isActive });
      authUid = authUser.uid;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const groupId = member.groupId || req.user.groupId || DEFAULT_GROUP_ID;
    const shared = {
      name,
      fullName: name,
      email,
      phone,
      memberCode,
      member_code: memberCode,
      role: roleName.toLowerCase(),
      roleName,
      role_name: roleName,
      isActive,
      is_active: isActive,
      authUid,
      firebaseUid: authUid,
      userId: authUid,
      groupId,
      updatedAt: now,
    };

    const batch = db.batch();
    const loginRef = db.collection('users').doc(authUid);
    const loginProfile = {
      ...shared,
      uid: authUid,
      memberId: found.snap.id,
      member_id: found.snap.id,
      createdAt: member.createdAt || now,
    };
    if (found.ref.path === loginRef.path) {
      batch.set(found.ref, loginProfile, { merge: true });
    } else {
      batch.set(found.ref, shared, { merge: true });
      batch.set(loginRef, loginProfile, { merge: true });
    }
    const activityRef = db.collection('transactions').doc();
    batch.set(activityRef, {
      id: activityRef.id,
      groupId,
      type: 'member_access_updated',
      memberId: found.snap.id,
      memberName: name,
      referenceId: authUid,
      description: `Member login and role updated to ${roleName}`,
      recordedBy: req.user.uid,
      date: new Date().toISOString(),
      createdAt: now,
    });
    await batch.commit();

    return res.json({
      success: true,
      message: 'Member profile, login, password, and role updated successfully.',
      member: { id: found.snap.id, ...shared, updatedAt: new Date().toISOString() },
    });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ success: false, message: 'That email is already used by another login.' });
    }
    return next(error);
  }
}

async function deleteMember(req, res, next) {
  try {
    const found = await findMember(req.params.id);
    if (!found) return res.status(404).json({ success: false, message: 'Member record not found.' });

    const member = found.snap.data();
    const authUid = member.authUid || member.firebaseUid || member.userId;
    if (req.user.uid === authUid || req.user.uid === found.snap.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own signed-in admin account.' });
    }

    const memberIds = [...new Set([found.snap.id, member.memberId, member.member_id].filter(Boolean))];
    const refs = new Map([[found.ref.path, found.ref]]);
    if (authUid) refs.set(`users/${authUid}`, db.collection('users').doc(authUid));

    for (const collectionName of ['monthlyContributions', 'loans', 'repayments', 'transactions']) {
      for (const field of ['memberId', 'member_id']) {
        for (const id of memberIds) {
          const snapshot = await db.collection(collectionName).where(field, '==', id).get();
          snapshot.docs.forEach((document) => refs.set(document.ref.path, document.ref));
        }
      }
    }

    const references = [...refs.values()];
    for (let index = 0; index < references.length; index += 450) {
      const batch = db.batch();
      references.slice(index, index + 450).forEach((reference) => batch.delete(reference));
      await batch.commit();
    }
    if (authUid) {
      await auth.deleteUser(authUid).catch((error) => {
        if (error.code !== 'auth/user-not-found') throw error;
      });
    }

    return res.json({
      success: true,
      message: 'Member, login account, and related records deleted successfully.',
      deletedRecords: references.length,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getAllMembers: legacyController.getAllMembers,
  getMemberById: legacyController.getMemberById,
  createMember: legacyController.createMember,
  updateMember: legacyController.updateMember,
  manageMemberAccess,
  deleteMember,
};
