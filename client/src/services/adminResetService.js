import {
  collection,
  doc,
  getDocs,
  getDoc,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import { auth, db, firebaseConfig } from '../config/firebase.js';
import { DEFAULT_GROUP_ID } from '../utils/formatters.js';

export const TARGET_PROJECT_ID = 'bachat-gat-32ffe';
export const FORBIDDEN_PROJECT_ID = 'bachatgatapp-5158';
export const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const defaultOps = {
  collection,
  doc,
  getDocs,
  getDoc,
  writeBatch,
};

// In-memory concurrency mutex flag
let isResetExecuting = false;

/**
 * Custom error class for Admin Reset operations
 */
export class AdminResetError extends Error {
  constructor(message, step = 'UNKNOWN', originalError = null, backupData = null) {
    super(message);
    this.name = 'AdminResetError';
    this.step = step;
    this.originalError = originalError;
    this.backupData = backupData;
  }
}

/**
 * Validate that the target project is strictly the demo web project bachat-gat-32ffe
 * and never the Flutter project bachatgatapp-5158.
 */
export function validateTargetProject(config = firebaseConfig) {
  const currentProject = config?.projectId;
  if (!currentProject) {
    throw new AdminResetError('Firebase projectId is not configured.', 'PROJECT_CHECK');
  }
  if (currentProject === FORBIDDEN_PROJECT_ID) {
    throw new AdminResetError(
      `Access to Flutter Firebase project ${FORBIDDEN_PROJECT_ID} is strictly forbidden.`,
      'FORBIDDEN_PROJECT'
    );
  }
  if (currentProject !== TARGET_PROJECT_ID) {
    throw new AdminResetError(
      `Invalid target project: expected ${TARGET_PROJECT_ID}, found ${currentProject}.`,
      'INVALID_PROJECT'
    );
  }
  return true;
}

/**
 * Validate that amount entered is a safe, positive monetary value.
 */
export function validateMonetaryAmount(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) {
    throw new AdminResetError('Opening amount must be a valid finite number.', 'AMOUNT_VALIDATION');
  }
  if (num <= 0) {
    throw new AdminResetError('Opening amount must be strictly greater than zero.', 'AMOUNT_VALIDATION');
  }
  if (num > 100_000_000) {
    throw new AdminResetError('Opening amount exceeds maximum permissible limit (₹10,00,00,000).', 'AMOUNT_VALIDATION');
  }
  if (Math.round(num * 100) !== num * 100) {
    throw new AdminResetError('Opening amount cannot contain fractions beyond 2 decimal places.', 'AMOUNT_VALIDATION');
  }
  return num;
}

/**
 * Distributed Lock: Acquire Firestore lock across instances/tabs
 */
export async function acquireDistributedLock(customDb = db, adminEmail = 'Admin', ops = defaultOps) {
  const lockDocRef = ops.doc(customDb, 'systemLocks', 'admin_reset_lock');
  try {
    const lockSnap = await ops.getDoc(lockDocRef);
    const now = Date.now();
    if (lockSnap && lockSnap.exists && lockSnap.exists()) {
      const data = lockSnap.data() || {};
      if (data.isLocked && now - (data.lockedAtTimestamp || 0) < LOCK_TIMEOUT_MS) {
        throw new AdminResetError(
          `Another reset operation is currently running (locked by ${data.lockedBy || 'Admin'}). Please wait.`,
          'CONCURRENCY_LOCK'
        );
      }
    }
    const batch = ops.writeBatch(customDb);
    batch.set(lockDocRef, {
      isLocked: true,
      lockedAt: new Date().toISOString(),
      lockedAtTimestamp: now,
      lockedBy: adminEmail,
    }, { merge: true });
    await batch.commit();
  } catch (err) {
    if (err instanceof AdminResetError) throw err;
    console.warn('Notice: Distributed lock acquire check:', err.message);
  }
}

/**
 * Distributed Lock: Release Firestore lock
 */
export async function releaseDistributedLock(customDb = db, ops = defaultOps) {
  try {
    const lockDocRef = ops.doc(customDb, 'systemLocks', 'admin_reset_lock');
    const batch = ops.writeBatch(customDb);
    batch.set(lockDocRef, {
      isLocked: false,
      releasedAt: new Date().toISOString(),
    }, { merge: true });
    await batch.commit();
  } catch (err) {
    console.warn('Notice: Distributed lock release notice:', err.message);
  }
}

/**
 * Verify server-side that the authenticated user is an active Admin.
 * Checks directly from Firestore document users/{uid}.
 */
export async function verifyAdminAuthorization(customAuth = auth, customDb = db, ops = defaultOps) {
  const currentUser = customAuth.currentUser;
  if (!currentUser) {
    throw new AdminResetError('Authentication required. No active user session.', 'AUTH_CHECK');
  }

  // Server-side lookup in users collection
  const userDocRef = ops.doc(customDb, 'users', currentUser.uid);
  const userDocSnap = await ops.getDoc(userDocRef);

  if (!userDocSnap.exists()) {
    throw new AdminResetError('User account profile not found in Firestore.', 'AUTH_CHECK');
  }

  const userData = userDocSnap.data();
  const rawRole = (userData.role_name || userData.role || '').toUpperCase();
  const isAdminUser = rawRole === 'ADMIN';

  if (!isAdminUser) {
    throw new AdminResetError('Access denied. Only authenticated Admin users can access this feature.', 'AUTH_CHECK');
  }

  if (userData.isActive === false || userData.status === 'inactive' || userData.isDeleted === true) {
    throw new AdminResetError('Admin user account is inactive or disabled.', 'AUTH_CHECK');
  }

  return {
    uid: currentUser.uid,
    email: currentUser.email || userData.email,
    name: userData.fullName || userData.name || 'Admin',
    role: 'ADMIN',
  };
}

/**
 * Filter approved members from users collection.
 * Excludes admin accounts and inactive/deleted members.
 */
export function filterApprovedMembers(userDocs = []) {
  return userDocs.filter((u) => {
    const role = (u.role_name || u.role || '').toUpperCase();
    const email = (u.email || '').toLowerCase();
    const isAdmin = role === 'ADMIN' || email.includes('admin');
    if (isAdmin) return false;

    // Must be active and not deleted
    if (u.isDeleted === true) return false;
    if (u.isActive === false) return false;
    const status = (u.status || '').toLowerCase();
    if (status === 'inactive' || status === 'deleted' || status === 'rejected') return false;

    return true;
  });
}

/**
 * Step 1 Helper: Fetch existing approved members and current financial record counts
 */
export async function fetchResetPreview(
  groupId = DEFAULT_GROUP_ID,
  customDb = db,
  customAuth = auth,
  ops = defaultOps,
  customConfig = firebaseConfig
) {
  validateTargetProject(customConfig);
  await verifyAdminAuthorization(customAuth, customDb, ops);

  const [usersSnap, contribSnap, loansSnap, repaySnap, txSnap, groupSnap] = await Promise.all([
    ops.getDocs(ops.collection(customDb, 'users')),
    ops.getDocs(ops.collection(customDb, 'monthlyContributions')),
    ops.getDocs(ops.collection(customDb, 'loans')),
    ops.getDocs(ops.collection(customDb, 'repayments')),
    ops.getDocs(ops.collection(customDb, 'transactions')),
    ops.getDoc(ops.doc(customDb, 'groups', groupId)),
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

  const groupData = groupSnap.exists() ? groupSnap.data() : {};

  return {
    memberCount: approvedMembers.length,
    members: approvedMembers,
    financialCounts,
    group: {
      id: groupId,
      name: groupData.groupName || groupData.name || 'श्री सदुबाबा युवा स्वयम सहायता बचतगट',
      monthlyContribution: groupData.monthlyContribution || groupData.monthly_contribution_per_share || 1000,
    },
    affectedCollections: ['monthlyContributions', 'loans', 'repayments', 'transactions'],
    preservedCollections: ['users', 'groups'],
  };
}

/**
 * Step 4.1 Helper: Create fresh safety backup of all affected collections
 */
export async function createAndVerifyBackup(groupId = DEFAULT_GROUP_ID, customDb = db, ops = defaultOps) {
  const collectionsToBackup = ['groups', 'users', 'monthlyContributions', 'loans', 'repayments', 'transactions'];
  const backup = {
    timestamp: new Date().toISOString(),
    projectId: TARGET_PROJECT_ID,
    groupId,
    collections: {},
    documentCounts: {},
  };

  for (const colName of collectionsToBackup) {
    const snap = await ops.getDocs(ops.collection(customDb, colName));
    backup.documentCounts[colName] = snap.size;
    backup.collections[colName] = snap.docs.map((d) => ({
      _documentId: d.id,
      ...d.data(),
    }));
  }

  // Backup verification rules:
  // 1. Must contain all expected collections
  for (const colName of collectionsToBackup) {
    if (!backup.collections[colName]) {
      throw new AdminResetError(`Backup verification failed: Missing collection ${colName}`, 'BACKUP_VERIFICATION');
    }
    if (backup.collections[colName].length !== backup.documentCounts[colName]) {
      throw new AdminResetError(
        `Backup verification failed: Count mismatch in ${colName} (${backup.collections[colName].length} vs ${backup.documentCounts[colName]})`,
        'BACKUP_VERIFICATION'
      );
    }
  }

  // 2. Members count must be intact in backup
  if (backup.documentCounts.users <= 0) {
    throw new AdminResetError('Backup verification failed: Users collection in backup is empty.', 'BACKUP_VERIFICATION');
  }

  // Persist backup in browser storage if available
  try {
    if (typeof localStorage !== 'undefined') {
      const serialized = JSON.stringify(backup);
      localStorage.setItem('bachat_backup_latest', serialized);
      localStorage.setItem('bachat_backup_timestamp', backup.timestamp);
    }
  } catch (storageErr) {
    console.warn('Notice: LocalStorage backup save notice:', storageErr.message);
  }

  return backup;
}

/**
 * Restore database collections from a verified safety backup JSON object.
 * Restores original document IDs and field relationships faithfully.
 */
export async function restoreFromBackup(backupData, customDb = db, ops = defaultOps) {
  if (!backupData || !backupData.collections) {
    throw new AdminResetError('Invalid backup data format: missing collections.', 'RESTORE');
  }

  const collections = ['groups', 'users', 'monthlyContributions', 'loans', 'repayments', 'transactions'];
  let totalRestored = 0;

  for (const colName of collections) {
    const docs = backupData.collections[colName] || [];
    const CHUNK_SIZE = 300;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = ops.writeBatch(customDb);
      for (const item of chunk) {
        const docId = item._documentId || item.id;
        if (!docId) continue;
        const cleanData = { ...item };
        delete cleanData._documentId;
        batch.set(ops.doc(customDb, colName, docId), cleanData, { merge: true });
        totalRestored++;
      }
      await batch.commit();
    }
  }

  return { success: true, totalRestored };
}

/**
 * Helper: Batch delete documents in safe chunk sizes <= 300
 */
async function batchDeleteSnapshots(docs, customDb, ops = defaultOps, onProgressMsg) {
  if (!docs || docs.length === 0) return 0;
  const CHUNK_SIZE = 300;
  let deleted = 0;

  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE);
    const batch = ops.writeBatch(customDb);
    for (const d of chunk) {
      batch.delete(d.ref);
    }
    await batch.commit();
    deleted += chunk.length;
    if (typeof onProgressMsg === 'function') {
      onProgressMsg(deleted, docs.length);
    }
  }
  return deleted;
}

/**
 * Step 4 & 5: Execute Complete Admin Reset with Double Confirmation, Backup & Direct Verification
 */
export async function executeAdminReset({
  amountPerMember,
  groupId = DEFAULT_GROUP_ID,
  confirmationText,
  onProgress = () => {},
  customDb = db,
  customAuth = auth,
  customConfig = firebaseConfig,
  ops = defaultOps,
}) {
  // Prevent concurrent executions and double-clicks
  if (isResetExecuting) {
    throw new AdminResetError('A reset operation is already in progress. Please wait.', 'CONCURRENCY_LOCK');
  }

  isResetExecuting = true;
  let createdBackup = null;

  try {
    // Safety Guard 1: Verify exact confirmation text
    if (confirmationText !== 'RESET DATA') {
      throw new AdminResetError(
        'Confirmation text mismatch. Exact text "RESET DATA" is required.',
        'CONFIRMATION_CHECK'
      );
    }

    // Safety Guard 2: Target project check
    validateTargetProject(customConfig);

    // Safety Guard 3: Server-side Admin authorization
    const adminUser = await verifyAdminAuthorization(customAuth, customDb, ops);

    // Safety Guard 4: Validate safe monetary amount
    const parsedAmount = validateMonetaryAmount(amountPerMember);

    // Safety Guard 5: Acquire Distributed Lock (multi-instance / multi-tab)
    await acquireDistributedLock(customDb, adminUser.email, ops);

    onProgress({ step: 1, percent: 10, message: 'Creating fresh safety backup of all Firestore collections...' });

    // Step 1: Create and verify safety backup
    createdBackup = await createAndVerifyBackup(groupId, customDb, ops);
    onProgress({
      step: 2,
      percent: 25,
      message: `Safety backup verified (${Object.values(createdBackup.documentCounts).reduce((a, b) => a + b, 0)} documents).`,
    });

    // Step 2: Fetch approved members directly
    const preUsersSnap = await ops.getDocs(ops.collection(customDb, 'users'));
    const allUsers = preUsersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const approvedMembers = filterApprovedMembers(allUsers).sort((a, b) => a.id.localeCompare(b.id));

    if (approvedMembers.length === 0) {
      throw new AdminResetError('No approved members found to allocate base savings.', 'MEMBER_CHECK', null, createdBackup);
    }

    const totalExpectedAllocation = approvedMembers.length * parsedAmount;

    // Step 3: Fetch financial collections to clean
    onProgress({ step: 3, percent: 35, message: 'Fetching existing financial records for deletion...' });
    const [contribSnap, loansSnap, repaySnap, txSnap] = await Promise.all([
      ops.getDocs(ops.collection(customDb, 'monthlyContributions')),
      ops.getDocs(ops.collection(customDb, 'loans')),
      ops.getDocs(ops.collection(customDb, 'repayments')),
      ops.getDocs(ops.collection(customDb, 'transactions')),
    ]);

    const totalToDelete = contribSnap.size + loansSnap.size + repaySnap.size + txSnap.size;

    // Step 4: Delete financial records in atomic batches
    onProgress({
      step: 4,
      percent: 45,
      message: `Deleting ${totalToDelete} existing financial records across collections...`,
    });

    const deletedCounts = {
      monthlyContributions: await batchDeleteSnapshots(contribSnap.docs, customDb, ops),
      loans: await batchDeleteSnapshots(loansSnap.docs, customDb, ops),
      repayments: await batchDeleteSnapshots(repaySnap.docs, customDb, ops),
      transactions: await batchDeleteSnapshots(txSnap.docs, customDb, ops),
    };

    // Step 5: Create BASE_SAVINGS and Transactions and update Members
    onProgress({
      step: 5,
      percent: 70,
      message: `Allocating ₹${parsedAmount.toLocaleString('en-IN')} base savings for ${approvedMembers.length} members...`,
    });

    const nowIso = new Date().toISOString();
    const writeOps = [];

    for (const m of approvedMembers) {
      const memberId = m.id;
      const memberName = m.name || m.fullName || 'Member';
      const contribDocId = `C_${memberId}_BASE_SAVINGS`;
      const txDocId = `ACT_${memberId}_base_savings`;

      // 1. Deterministic Base Contribution document
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
        month: 0, // Canonical base month to exclude from monthly installments
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
      writeOps.push({
        type: 'set',
        ref: ops.doc(customDb, 'monthlyContributions', contribDocId),
        data: contribPayload,
      });

      // 2. Deterministic Activity transaction document
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
      writeOps.push({
        type: 'set',
        ref: ops.doc(customDb, 'transactions', txDocId),
        data: txPayload,
      });

      // 3. Update member document (ONLY update savings fields, preserving all profile data!)
      writeOps.push({
        type: 'update',
        ref: ops.doc(customDb, 'users', memberId),
        data: {
          totalSavings: parsedAmount,
          total_savings: parsedAmount,
          updatedAt: nowIso,
        },
      });
    }

    // 4. Update group totals on groups/{groupId}
    writeOps.push({
      type: 'update',
      ref: ops.doc(customDb, 'groups', groupId),
      data: {
        totalSavings: totalExpectedAllocation,
        total_savings: totalExpectedAllocation,
        availableBalance: totalExpectedAllocation,
        available_balance: totalExpectedAllocation,
        rawAvailableBalance: totalExpectedAllocation,
        totalFund: totalExpectedAllocation,
        total_fund: totalExpectedAllocation,
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

    // Commit write operations in batches <= 300
    const CHUNK_SIZE = 300;
    for (let i = 0; i < writeOps.length; i += CHUNK_SIZE) {
      const chunk = writeOps.slice(i, i + CHUNK_SIZE);
      const batch = ops.writeBatch(customDb);
      for (const op of chunk) {
        if (op.type === 'set') batch.set(op.ref, op.data, { merge: true });
        else if (op.type === 'update') batch.update(op.ref, op.data);
      }
      await batch.commit();
    }

    // Step 6: Direct Post-Execution Verification
    onProgress({
      step: 6,
      percent: 90,
      message: 'Running direct Firestore post-execution verification...',
    });

    const verificationResult = await verifyPostResetState({
      expectedMemberCount: approvedMembers.length,
      amountPerMember: parsedAmount,
      totalExpectedAllocation,
      groupId,
      customDb,
      ops,
    });

    onProgress({ step: 7, percent: 100, message: 'Reset and verification completed successfully!' });

    return {
      success: true,
      timestamp: nowIso,
      executedBy: adminUser.email,
      memberCount: approvedMembers.length,
      amountPerMember: parsedAmount,
      totalAllocation: totalExpectedAllocation,
      deletedCounts,
      verificationResult,
      backupTimestamp: createdBackup.timestamp,
      backupData: createdBackup,
    };
  } catch (err) {
    console.error('Reset execution error:', err);
    const resetErr = err instanceof AdminResetError
      ? err
      : new AdminResetError(err.message || 'Reset failed with unexpected error.', 'EXECUTION', err, createdBackup);
    if (createdBackup && !resetErr.backupData) {
      resetErr.backupData = createdBackup;
    }
    throw resetErr;
  } finally {
    isResetExecuting = false;
    await releaseDistributedLock(customDb, ops);
  }
}

/**
 * Step 5 Helper: Direct Firestore Read-back Verification
 */
export async function verifyPostResetState({
  expectedMemberCount,
  amountPerMember,
  totalExpectedAllocation,
  groupId = DEFAULT_GROUP_ID,
  customDb = db,
  ops = defaultOps,
}) {
  const [usersSnap, contribSnap, loansSnap, repaySnap, txSnap, groupSnap] = await Promise.all([
    ops.getDocs(ops.collection(customDb, 'users')),
    ops.getDocs(ops.collection(customDb, 'monthlyContributions')),
    ops.getDocs(ops.collection(customDb, 'loans')),
    ops.getDocs(ops.collection(customDb, 'repayments')),
    ops.getDocs(ops.collection(customDb, 'transactions')),
    ops.getDoc(ops.doc(customDb, 'groups', groupId)),
  ]);

  const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const approvedMembers = filterApprovedMembers(allUsers);

  // Assertion 1: Member count unchanged
  if (approvedMembers.length !== expectedMemberCount) {
    throw new AdminResetError(
      `Post-verification failed: Approved member count mismatch (${approvedMembers.length} vs expected ${expectedMemberCount}).`,
      'VERIFICATION_MEMBER_COUNT'
    );
  }

  // Assertion 2: All old loans and repayments deleted
  if (loansSnap.size !== 0) {
    throw new AdminResetError(
      `Post-verification failed: Expected 0 loans, found ${loansSnap.size}.`,
      'VERIFICATION_OLD_RECORDS'
    );
  }
  if (repaySnap.size !== 0) {
    throw new AdminResetError(
      `Post-verification failed: Expected 0 repayments, found ${repaySnap.size}.`,
      'VERIFICATION_OLD_RECORDS'
    );
  }

  // Assertion 3: Exactly one base-savings record per approved member
  const allContribs = contribSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const baseContribs = allContribs.filter(
    (c) => (c.groupId === groupId || c.group_id === groupId) && (c.isBase === true || c.type === 'BASE_SAVINGS')
  );

  if (baseContribs.length !== expectedMemberCount) {
    throw new AdminResetError(
      `Post-verification failed: Expected ${expectedMemberCount} base savings records, found ${baseContribs.length}.`,
      'VERIFICATION_BASE_SAVINGS'
    );
  }

  // Assertion 4: Exactly one corresponding transaction per member
  const allTxs = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const baseTxs = allTxs.filter(
    (t) => (t.groupId === groupId || t.group_id === groupId) && t.id.startsWith('ACT_') && t.id.endsWith('_base_savings')
  );

  if (baseTxs.length !== expectedMemberCount) {
    throw new AdminResetError(
      `Post-verification failed: Expected ${expectedMemberCount} opening transactions, found ${baseTxs.length}.`,
      'VERIFICATION_TRANSACTIONS'
    );
  }

  // Assertion 5: Each member's savings equals entered amount & deterministic IDs exist
  for (const m of approvedMembers) {
    const expectedDocId = `C_${m.id}_BASE_SAVINGS`;
    const rec = baseContribs.find((c) => c.id === expectedDocId && (c.memberId === m.id || c.member_id === m.id));
    if (!rec) {
      throw new AdminResetError(`Post-verification failed: Missing base contribution record ${expectedDocId}.`, 'VERIFICATION_MEMBER_RECORD');
    }
    if (rec.amount !== amountPerMember || rec.paidAmount !== amountPerMember) {
      throw new AdminResetError(
        `Post-verification failed: Amount mismatch in ${expectedDocId} (₹${rec.amount} vs ₹${amountPerMember}).`,
        'VERIFICATION_MEMBER_AMOUNT'
      );
    }

    const memberTotalSavings = m.totalSavings ?? m.total_savings ?? 0;
    if (memberTotalSavings !== amountPerMember) {
      throw new AdminResetError(
        `Post-verification failed: Member ${m.id} totalSavings is ₹${memberTotalSavings}, expected ₹${amountPerMember}.`,
        'VERIFICATION_MEMBER_BALANCE'
      );
    }
  }

  // Assertion 6: Group financial totals match totalExpectedAllocation
  if (!groupSnap.exists()) {
    throw new AdminResetError('Post-verification failed: Group document missing.', 'VERIFICATION_GROUP');
  }
  const groupData = groupSnap.data();
  const groupSavings = groupData.totalSavings ?? groupData.total_savings ?? 0;
  if (groupSavings !== totalExpectedAllocation) {
    throw new AdminResetError(
      `Post-verification failed: Group totalSavings ₹${groupSavings} does not match expected ₹${totalExpectedAllocation}.`,
      'VERIFICATION_GROUP_TOTALS'
    );
  }

  return {
    verified: true,
    memberCount: approvedMembers.length,
    baseRecordsCount: baseContribs.length,
    openingTransactionsCount: baseTxs.length,
    loansRemaining: loansSnap.size,
    repaymentsRemaining: repaySnap.size,
    memberSavingsVerified: amountPerMember,
    totalGroupSavingsVerified: groupSavings,
    monthlyDuesPending: true, // Base savings month is 0, so monthly dues remain pending
    groupConfigPreserved: Boolean(groupData.groupName || groupData.name),
  };
}
