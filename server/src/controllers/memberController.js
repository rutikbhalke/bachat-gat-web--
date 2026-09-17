const { auth, db, admin } = require('../config/firebaseAdmin');
const legacyController = require('./firebaseController');
const { calculateLoanOutstanding } = require('../services/financialService');

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

    const memberIds = [...new Set([found.snap.id, member.memberId, member.member_id, member.id].filter(Boolean))];
    const groupId = member.groupId || req.user.groupId || DEFAULT_GROUP_ID;

    // 1. Check for Active / Outstanding Loans
    const memberLoans = [];
    for (const mid of memberIds) {
      const q1 = await db.collection('loans').where('memberId', '==', mid).get();
      const q2 = await db.collection('loans').where('member_id', '==', mid).get();
      q1.docs.forEach(d => memberLoans.push({ id: d.id, ...d.data() }));
      q2.docs.forEach(d => memberLoans.push({ id: d.id, ...d.data() }));
    }

    const uniqueLoansMap = new Map();
    memberLoans.forEach(l => uniqueLoansMap.set(l.id, l));
    const uniqueLoans = [...uniqueLoansMap.values()];

    let activeOrOutstandingLoan = null;
    let totalOutstanding = 0;

    for (const loan of uniqueLoans) {
      const rep1 = await db.collection('repayments').where('loanId', '==', loan.id).get();
      const rep2 = await db.collection('repayments').where('loan_id', '==', loan.id).get();
      const repMap = new Map();
      [...rep1.docs, ...rep2.docs].forEach(d => repMap.set(d.id, d.data()));
      const reps = [...repMap.values()];

      const outstanding = calculateLoanOutstanding(loan, reps);
      const rawStatus = (loan.status || '').toUpperCase();
      const isClosed = outstanding <= 0 && (rawStatus === 'CLOSED' || rawStatus === 'REJECTED');

      if (!isClosed && (outstanding > 0 || rawStatus === 'ACTIVE')) {
        totalOutstanding += outstanding;
        if (!activeOrOutstandingLoan) {
          activeOrOutstandingLoan = loan;
        }
      }
    }

    if (activeOrOutstandingLoan || totalOutstanding > 0) {
      const formattedAmount = Math.round(totalOutstanding).toLocaleString('en-IN');
      return res.status(400).json({
        success: false,
        message: `This member has an outstanding loan of ₹${formattedAmount}. Please fully repay the loan before deleting this member.`,
        outstandingLoan: totalOutstanding,
        activeLoanId: activeOrOutstandingLoan ? activeOrOutstandingLoan.id : null,
      });
    }

    // 2. Safe Soft Delete (PRESERVE all historical financial data!)
    const nowIso = new Date().toISOString();
    const nowServer = admin.firestore.FieldValue.serverTimestamp();
    const memberName = member.fullName || member.name || 'Member';

    const batch = db.batch();

    // Mark member document as soft-deleted
    batch.set(found.ref, {
      isActive: false,
      is_active: false,
      status: 'inactive',
      isDeleted: true,
      deletedAt: nowIso,
      updatedAt: nowServer,
    }, { merge: true });

    // Mark linked auth profile as soft-deleted if separate
    if (authUid && found.ref.path !== `users/${authUid}`) {
      const loginRef = db.collection('users').doc(authUid);
      batch.set(loginRef, {
        isActive: false,
        is_active: false,
        status: 'inactive',
        isDeleted: true,
        deletedAt: nowIso,
        updatedAt: nowServer,
      }, { merge: true });
    }

    // Decrement group active members count safely
    try {
      const groupRef = db.collection('groups').doc(groupId);
      batch.update(groupRef, {
        activeMembers: admin.firestore.FieldValue.increment(-1),
        active_members: admin.firestore.FieldValue.increment(-1),
        updatedAt: nowServer,
      });
    } catch (e) {
      // Ignore group increment error if doc doesn't exist
    }

    // Record Audit Transaction log
    const actRef = db.collection('transactions').doc();
    batch.set(actRef, {
      id: actRef.id,
      groupId,
      type: 'MEMBER_SOFT_DELETED',
      memberId: found.snap.id,
      memberName,
      referenceId: found.snap.id,
      description: `Member soft deleted: ${memberName}`,
      recordedBy: req.user.uid,
      date: nowIso,
      createdAt: nowServer,
    });

    await batch.commit();

    // Disable Firebase Auth user login without deleting account
    if (authUid) {
      await auth.updateUser(authUid, { disabled: true }).catch(() => {});
    }

    return res.json({
      success: true,
      message: 'Member deleted successfully. The member has been removed from the active member list. Historical financial records have been preserved.',
      memberId: found.snap.id,
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
