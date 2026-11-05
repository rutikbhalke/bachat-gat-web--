const fs = require('fs');
const path = require('path');
const { db } = require('../config/firebaseAdmin');
const { DEFAULT_GROUP_ID } = require('../utils/firestore');

const TARGET_PROJECT_ID = 'bachat-gat-32ffe';
const FORBIDDEN_PROJECT_ID = 'bachatgatapp-5158';
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let isResetInProgress = false;

function validateMonetaryAmount(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) {
    throw new Error('Opening amount must be a valid finite number.');
  }
  if (num <= 0) {
    throw new Error('Opening amount must be strictly greater than zero.');
  }
  if (num > 100000000) {
    throw new Error('Opening amount exceeds maximum permissible limit (₹10,00,00,000).');
  }
  if (Math.round(num * 100) !== num * 100) {
    throw new Error('Opening amount cannot contain fractions beyond 2 decimal places.');
  }
  return num;
}

function filterApprovedMembers(allUsers = []) {
  return allUsers.filter((u) => {
    const role = (u.role_name || u.role || '').toUpperCase();
    const email = (u.email || '').toLowerCase();
    const isAdmin = role === 'ADMIN' || email.includes('admin');
    if (isAdmin) return false;

    if (u.isDeleted === true || u.isActive === false) return false;
    const status = (u.status || '').toLowerCase();
    if (status === 'inactive' || status === 'deleted' || status === 'rejected') return false;

    return true;
  });
}

/**
 * Strict server-side Admin verification directly from Firestore document users/{uid}
 */
async function verifyServerAdmin(uid) {
  if (!uid) {
    throw new Error('Authentication required. Missing user identifier.');
  }
  const userDocSnap = await db.collection('users').doc(uid).get();
  if (!userDocSnap.exists) {
    throw new Error('User profile not found in Firestore.');
  }
  const userData = userDocSnap.data() || {};
  const role = (userData.role_name || userData.role || '').toUpperCase();
  if (role !== 'ADMIN') {
    throw new Error('Unauthorized: User profile in Firestore is not an ADMIN.');
  }
  if (userData.isActive === false || userData.isDeleted === true) {
    throw new Error('Unauthorized: Admin account is inactive or disabled.');
  }
  return userData;
}

/**
 * GET /api/group/reset-preview
 */
async function getResetPreview(req, res, next) {
  try {
    const currentProjectId = process.env.FIREBASE_PROJECT_ID || TARGET_PROJECT_ID;
    if (currentProjectId === FORBIDDEN_PROJECT_ID) {
      return res.status(403).json({ success: false, message: 'Flutter Firebase project access is forbidden.' });
    }
    if (currentProjectId !== TARGET_PROJECT_ID) {
      return res.status(400).json({ success: false, message: `Invalid target project: ${currentProjectId}` });
    }

    // Verify admin directly in Firestore
    await verifyServerAdmin(req.user.uid);

    const groupId = req.user.groupId || DEFAULT_GROUP_ID;

    const [usersSnap, contribSnap, loansSnap, repaySnap, txSnap, groupSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('monthlyContributions').get(),
      db.collection('loans').get(),
      db.collection('repayments').get(),
      db.collection('transactions').get(),
      db.collection('groups').doc(groupId).get(),
    ]);

    const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const approvedMembers = filterApprovedMembers(allUsers).sort((a, b) => a.id.localeCompare(b.id));

    const financialCounts = {
      monthlyContributions: contribSnap.size,
      loans: loansSnap.size,
      repayments: repaySnap.size,
      transactions: txSnap.size,
      totalRecords: contribSnap.size + loansSnap.size + repaySnap.size + txSnap.size,
    };

    return res.json({
      success: true,
      memberCount: approvedMembers.length,
      members: approvedMembers.map((m) => ({ id: m.id, name: m.name || m.fullName, memberCode: m.memberCode || m.member_code })),
      financialCounts,
      group: groupSnap.exists ? groupSnap.data() : {},
      affectedCollections: ['monthlyContributions', 'loans', 'repayments', 'transactions'],
      preservedCollections: ['users', 'groups'],
    });
  } catch (err) {
    return res.status(403).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/group/reset-data
 */
async function resetCleanData(req, res, next) {
  if (isResetInProgress) {
    return res.status(409).json({ success: false, message: 'A reset operation is already in progress on this instance.' });
  }

  isResetInProgress = true;
  let createdBackup = null;
  const lockDocRef = db.collection('systemLocks').doc('admin_reset_lock');

  try {
    const currentProjectId = process.env.FIREBASE_PROJECT_ID || TARGET_PROJECT_ID;
    if (currentProjectId === FORBIDDEN_PROJECT_ID) {
      return res.status(403).json({ success: false, message: 'Flutter Firebase project access is forbidden.' });
    }
    if (currentProjectId !== TARGET_PROJECT_ID) {
      return res.status(400).json({ success: false, message: `Invalid target project: ${currentProjectId}` });
    }

    // 1. Strict Server-side Admin Authorization directly against Firestore
    await verifyServerAdmin(req.user.uid);

    // 2. Validate confirmation text
    const { confirmationText, amountPerMember } = req.body;
    if (confirmationText !== 'RESET DATA') {
      return res.status(400).json({
        success: false,
        message: 'Invalid confirmation text. Exact text "RESET DATA" is required.',
      });
    }

    // 3. Safe monetary amount validation
    let parsedAmount;
    try {
      parsedAmount = validateMonetaryAmount(amountPerMember);
    } catch (valErr) {
      return res.status(400).json({ success: false, message: valErr.message });
    }

    // 4. Distributed lock acquisition via Firestore
    const lockSnap = await lockDocRef.get();
    const nowTimestamp = Date.now();
    if (lockSnap.exists) {
      const lockData = lockSnap.data() || {};
      if (lockData.isLocked && nowTimestamp - (lockData.lockedAtTimestamp || 0) < LOCK_TIMEOUT_MS) {
        return res.status(409).json({
          success: false,
          message: `Another reset operation is currently running across instances (locked by ${lockData.lockedBy || 'Admin'}).`,
        });
      }
    }
    await lockDocRef.set({
      isLocked: true,
      lockedAt: new Date().toISOString(),
      lockedAtTimestamp: nowTimestamp,
      lockedBy: req.user.email || req.user.uid,
    }, { merge: true });

    const groupId = req.user.groupId || DEFAULT_GROUP_ID;

    // 5. Create safety backup
    const collectionsToBackup = ['groups', 'users', 'monthlyContributions', 'loans', 'repayments', 'transactions'];
    const backup = {
      timestamp: new Date().toISOString(),
      projectId: TARGET_PROJECT_ID,
      groupId,
      collections: {},
      documentCounts: {},
    };

    for (const colName of collectionsToBackup) {
      const snap = await db.collection(colName).get();
      backup.documentCounts[colName] = snap.size;
      backup.collections[colName] = snap.docs.map((d) => ({ _documentId: d.id, ...d.data() }));
    }

    // Verify backup completeness
    for (const colName of collectionsToBackup) {
      if (!backup.collections[colName] || backup.collections[colName].length !== backup.documentCounts[colName]) {
        return res.status(500).json({ success: false, message: `Backup verification failed on collection ${colName}` });
      }
    }
    if (backup.documentCounts.users <= 0) {
      return res.status(500).json({ success: false, message: 'Backup verification failed: Users collection is empty.' });
    }
    createdBackup = backup;

    // Persist backup to disk in development/server folder
    try {
      const backupDir = path.resolve(__dirname, '../../..');
      const backupFilePath = path.join(backupDir, `database_backup_reset_${Date.now()}.json`);
      fs.writeFileSync(backupFilePath, JSON.stringify(backup, null, 2), 'utf8');
    } catch (fsErr) {
      console.warn('Backup disk write notice:', fsErr.message);
    }

    // 6. Fetch approved members
    const usersSnap = await db.collection('users').get();
    const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const approvedMembers = filterApprovedMembers(allUsers).sort((a, b) => a.id.localeCompare(b.id));

    if (approvedMembers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No approved members found.',
        backupData: createdBackup,
      });
    }

    const totalAllocation = approvedMembers.length * parsedAmount;

    // 7. Delete financial records in atomic chunks
    const financialCollections = ['monthlyContributions', 'loans', 'repayments', 'transactions'];
    const deletedCounts = {};

    for (const colName of financialCollections) {
      const colSnap = await db.collection(colName).get();
      deletedCounts[colName] = colSnap.size;

      const docs = colSnap.docs;
      const CHUNK_SIZE = 300;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();
        for (const d of chunk) {
          batch.delete(d.ref);
        }
        await batch.commit();
      }
    }

    // 8. Create base savings, activity transactions, and update member/group summaries
    const nowIso = new Date().toISOString();
    const ops = [];

    for (const m of approvedMembers) {
      const memberId = m.id;
      const memberName = m.name || m.fullName || 'Member';
      const contribDocId = `C_${memberId}_BASE_SAVINGS`;
      const txDocId = `ACT_${memberId}_base_savings`;

      const contribPayload = {
        id: contribDocId,
        contribId: contribDocId,
        contrib_id: contribDocId,
        groupId,
        group_id: groupId,
        memberId,
        member_id: memberId,
        memberName,
        member_name: memberName,
        memberCode: m.memberCode || m.member_code || '',
        member_code: m.memberCode || m.member_code || '',
        amount: parsedAmount,
        paidAmount: parsedAmount,
        paid_amount: parsedAmount,
        expectedAmount: parsedAmount,
        expected_amount: parsedAmount,
        regularHaftaAmount: parsedAmount,
        regular_hafta_amount: parsedAmount,
        totalPaid: parsedAmount,
        total_paid: parsedAmount,
        loanPrincipalPaid: 0,
        interestAmount: 0,
        month: 0,
        year: 2026,
        isBase: true,
        type: 'BASE_SAVINGS',
        status: 'paid',
        status_lower: 'paid',
        status_upper: 'PAID',
        paymentMode: 'OPENING_BALANCE',
        payment_mode: 'OPENING_BALANCE',
        notes: 'Accumulated opening capital savings',
        remarks: 'Accumulated opening capital savings',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      ops.push({ type: 'set', ref: db.collection('monthlyContributions').doc(contribDocId), data: contribPayload });

      const txPayload = {
        id: txDocId,
        groupId,
        type: 'SAVINGS_DEPOSIT',
        type_flutter: 'monthlyInvestment',
        amount: parsedAmount,
        description: `Opening savings capital of ₹${parsedAmount.toLocaleString('en-IN')} allocated for ${memberName}`,
        memberId,
        memberName,
        referenceId: contribDocId,
        date: nowIso,
        createdAt: nowIso,
      };
      ops.push({ type: 'set', ref: db.collection('transactions').doc(txDocId), data: txPayload });

      ops.push({
        type: 'update',
        ref: db.collection('users').doc(memberId),
        data: {
          totalSavings: parsedAmount,
          total_savings: parsedAmount,
          updatedAt: nowIso,
        },
      });
    }

    ops.push({
      type: 'update',
      ref: db.collection('groups').doc(groupId),
      data: {
        totalSavings: totalAllocation,
        total_savings: totalAllocation,
        availableBalance: totalAllocation,
        available_balance: totalAllocation,
        rawAvailableBalance: totalAllocation,
        totalFund: totalAllocation,
        total_fund: totalAllocation,
        activeLoans: 0,
        active_loans: 0,
        activeLoansOutstanding: 0,
        totalOutstandingLoans: 0,
        total_outstanding_loans: 0,
        totalInterest: 0,
        total_interest: 0,
        totalInterestPaid: 0,
        total_interest_paid: 0,
        totalInterestCollected: 0,
        currentMonthlyInterest: 0,
        current_monthly_interest: 0,
        loanDeposit: 0,
        totalLoanDeposits: 0,
        total_loan_deposits: 0,
        updatedAt: nowIso,
      },
    });

    const CHUNK_SIZE = 300;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();
      for (const op of chunk) {
        if (op.type === 'set') batch.set(op.ref, op.data, { merge: true });
        else if (op.type === 'update') batch.update(op.ref, op.data);
      }
      await batch.commit();
    }

    // 9. Post-reset verification
    const [postUsersSnap, postContribSnap, postLoansSnap, postRepaySnap, postTxSnap, postGroupSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('monthlyContributions').get(),
      db.collection('loans').get(),
      db.collection('repayments').get(),
      db.collection('transactions').get(),
      db.collection('groups').doc(groupId).get(),
    ]);

    const postApproved = filterApprovedMembers(postUsersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

    if (postApproved.length !== approvedMembers.length) {
      return res.status(500).json({
        success: false,
        message: 'Post-verification failed: Approved member count mismatch.',
        backupData: createdBackup,
      });
    }
    if (postLoansSnap.size !== 0 || postRepaySnap.size !== 0) {
      return res.status(500).json({
        success: false,
        message: 'Post-verification failed: Old loans or repayments remain.',
        backupData: createdBackup,
      });
    }
    if (postContribSnap.size !== approvedMembers.length) {
      return res.status(500).json({
        success: false,
        message: 'Post-verification failed: Base contributions count mismatch.',
        backupData: createdBackup,
      });
    }

    const postGroup = postGroupSnap.data() || {};
    if (postGroup.totalSavings !== totalAllocation) {
      return res.status(500).json({
        success: false,
        message: 'Post-verification failed: Group totalSavings mismatch.',
        backupData: createdBackup,
      });
    }

    return res.json({
      success: true,
      message: 'Reset and allocation executed and verified successfully.',
      memberCount: approvedMembers.length,
      amountPerMember: parsedAmount,
      totalAllocation,
      deletedCounts,
      verified: true,
      backupTimestamp: backup.timestamp,
      backupData: createdBackup,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Reset failed with unexpected error.',
      backupData: createdBackup,
    });
  } finally {
    isResetInProgress = false;
    try {
      await lockDocRef.set({ isLocked: false, releasedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn('Notice: Lock release notice:', e.message);
    }
  }
}

module.exports = {
  getResetPreview,
  resetCleanData,
  filterApprovedMembers,
  validateMonetaryAmount,
};
