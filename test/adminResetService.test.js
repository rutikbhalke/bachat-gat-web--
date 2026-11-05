import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateTargetProject,
  verifyAdminAuthorization,
  filterApprovedMembers,
  validateMonetaryAmount,
  acquireDistributedLock,
  releaseDistributedLock,
  createAndVerifyBackup,
  restoreFromBackup,
  fetchResetPreview,
  executeAdminReset,
  verifyPostResetState,
  AdminResetError,
  TARGET_PROJECT_ID,
  FORBIDDEN_PROJECT_ID,
} from '../client/src/services/adminResetService.js';

import {
  filterApprovedMembers as serverFilterApproved,
  validateMonetaryAmount as serverValidateAmount,
} from '../server/src/controllers/adminResetController.js';

import {
  calculateGroupFinancialSummary,
} from '../client/src/services/financialService.js';

import {
  calculateMonthlyMemberStatus,
} from '../client/src/utils/formatters.js';

/**
 * In-memory Mock Firestore for isolated, safe testing without touching live data
 */
function createMockFirestore(initialData = {}) {
  const store = {
    groups: new Map(),
    users: new Map(),
    monthlyContributions: new Map(),
    loans: new Map(),
    repayments: new Map(),
    transactions: new Map(),
    systemLocks: new Map(),
    ...initialData,
  };

  for (const [col, val] of Object.entries(store)) {
    if (!(val instanceof Map)) {
      store[col] = new Map(Object.entries(val));
    }
  }

  return {
    _store: store,
  };
}

function createMockSdk(mockDb) {
  return {
    collection(dbInstance, colName) {
      return { _colName: colName };
    },
    doc(dbInstance, colName, docId) {
      if (typeof colName === 'object' && colName._colName) {
        return { _colName: colName._colName, id: docId };
      }
      return { _colName: colName, id: docId };
    },
    async getDoc(docRef) {
      const colMap = mockDb._store[docRef._colName] || new Map();
      const data = colMap.get(docRef.id);
      return {
        id: docRef.id,
        exists: () => data !== undefined,
        data: () => (data ? { ...data } : undefined),
      };
    },
    async getDocs(colRef) {
      const colMap = mockDb._store[colRef._colName] || new Map();
      const docs = Array.from(colMap.entries()).map(([id, data]) => ({
        id,
        ref: { _colName: colRef._colName, id },
        data: () => ({ ...data }),
      }));
      return {
        size: docs.length,
        docs,
      };
    },
    writeBatch() {
      const operations = [];
      return {
        set(ref, data, options = {}) {
          operations.push({ op: 'set', ref, data, options });
        },
        update(ref, data) {
          operations.push({ op: 'update', ref, data });
        },
        delete(ref) {
          operations.push({ op: 'delete', ref });
        },
        async commit() {
          for (const item of operations) {
            const colMap = mockDb._store[item.ref._colName] || new Map();
            if (item.op === 'delete') {
              colMap.delete(item.ref.id);
            } else if (item.op === 'set') {
              if (item.options?.merge) {
                const existing = colMap.get(item.ref.id) || {};
                colMap.set(item.ref.id, { ...existing, ...item.data });
              } else {
                colMap.set(item.ref.id, { ...item.data });
              }
            } else if (item.op === 'update') {
              const existing = colMap.get(item.ref.id) || {};
              colMap.set(item.ref.id, { ...existing, ...item.data });
            }
            mockDb._store[item.ref._colName] = colMap;
          }
        },
      };
    },
  };
}

// -----------------------------------------------------------------------------
// TEST SUITE: Complete Production-Readiness Audit (Isolated Safe Environment)
// -----------------------------------------------------------------------------

test('1. Firebase Project Isolation: Strictly enforces bachat-gat-32ffe and blocks bachatgatapp-5158', () => {
  // Correct target project passes
  assert.equal(validateTargetProject({ projectId: TARGET_PROJECT_ID }), true);

  // Forbidden Flutter project bachatgatapp-5158 must throw
  assert.throws(
    () => validateTargetProject({ projectId: FORBIDDEN_PROJECT_ID }),
    (err) => err instanceof AdminResetError && err.step === 'FORBIDDEN_PROJECT'
  );

  // Any other random project must throw
  assert.throws(
    () => validateTargetProject({ projectId: 'demo-unrelated-project-999' }),
    (err) => err instanceof AdminResetError && err.step === 'INVALID_PROJECT'
  );

  // Missing project ID must throw
  assert.throws(
    () => validateTargetProject({}),
    (err) => err instanceof AdminResetError && err.step === 'PROJECT_CHECK'
  );
});

test('2. Server-Side Admin Authorization: Cannot be bypassed by role tampering or email substring spoofing', async () => {
  const mockDb = createMockFirestore({
    users: {
      legit_admin: { role: 'admin', role_name: 'ADMIN', email: 'admin@bachatgat.com', isActive: true },
      member_user_01: { role: 'member', role_name: 'MEMBER', email: 'member@bachatgat.com', isActive: true },
      spoofed_email_user: { role: 'member', role_name: 'MEMBER', email: 'attacker_admin@domain.com', isActive: true },
      inactive_admin: { role: 'admin', role_name: 'ADMIN', email: 'admin@bachatgat.com', isActive: false },
      deleted_admin: { role: 'admin', role_name: 'ADMIN', email: 'admin@bachatgat.com', isDeleted: true },
    },
  });

  const mockSdk = createMockSdk(mockDb);

  // Genuine Admin passes
  const adminAuth = { currentUser: { uid: 'legit_admin', email: 'admin@bachatgat.com' } };
  const adminVerified = await verifyAdminAuthorization(adminAuth, mockDb, mockSdk);
  assert.equal(adminVerified.role, 'ADMIN');

  // Normal member user must be rejected
  const memberAuth = { currentUser: { uid: 'member_user_01', email: 'member@bachatgat.com' } };
  await assert.rejects(
    () => verifyAdminAuthorization(memberAuth, mockDb, mockSdk),
    (err) => err.step === 'AUTH_CHECK' && err.message.includes('Only authenticated Admin users')
  );

  // User with email containing 'admin' but member role must be rejected (no email substring bypass!)
  const spoofAuth = { currentUser: { uid: 'spoofed_email_user', email: 'attacker_admin@domain.com' } };
  await assert.rejects(
    () => verifyAdminAuthorization(spoofAuth, mockDb, mockSdk),
    (err) => err.step === 'AUTH_CHECK' && err.message.includes('Only authenticated Admin users')
  );

  // Inactive or deleted admin must be rejected
  const inactiveAuth = { currentUser: { uid: 'inactive_admin', email: 'admin@bachatgat.com' } };
  await assert.rejects(
    () => verifyAdminAuthorization(inactiveAuth, mockDb, mockSdk),
    (err) => err.step === 'AUTH_CHECK' && err.message.includes('inactive or disabled')
  );

  const deletedAuth = { currentUser: { uid: 'deleted_admin', email: 'admin@bachatgat.com' } };
  await assert.rejects(
    () => verifyAdminAuthorization(deletedAuth, mockDb, mockSdk),
    (err) => err.step === 'AUTH_CHECK' && err.message.includes('inactive or disabled')
  );

  // Unauthenticated session must be rejected
  await assert.rejects(
    () => verifyAdminAuthorization({ currentUser: null }, mockDb, mockSdk),
    (err) => err.step === 'AUTH_CHECK' && err.message.includes('Authentication required')
  );
});

test('3. Monetary Amount Validation: Validates positive, safe numerical bounds and rejects malformed values', () => {
  // Valid amounts pass on both client and server
  assert.equal(validateMonetaryAmount('120000'), 120000);
  assert.equal(serverValidateAmount('120000'), 120000);
  assert.equal(validateMonetaryAmount(50000.50), 50000.50);

  // Negative amounts reject
  assert.throws(() => validateMonetaryAmount('-1000'), /greater than zero/);
  assert.throws(() => serverValidateAmount('-1000'), /greater than zero/);

  // Zero rejects
  assert.throws(() => validateMonetaryAmount('0'), /greater than zero/);
  assert.throws(() => serverValidateAmount('0'), /greater than zero/);

  // NaN or non-numeric rejects
  assert.throws(() => validateMonetaryAmount('abc'), /valid finite number/);
  assert.throws(() => serverValidateAmount('abc'), /valid finite number/);

  // Infinity rejects
  assert.throws(() => validateMonetaryAmount(Infinity), /valid finite number/);
  assert.throws(() => serverValidateAmount(Infinity), /valid finite number/);

  // Excessively large overflow (> 10 Crore) rejects
  assert.throws(() => validateMonetaryAmount('100000001'), /maximum permissible limit/);
  assert.throws(() => serverValidateAmount('100000001'), /maximum permissible limit/);

  // More than 2 decimal places rejects
  assert.throws(() => validateMonetaryAmount('120000.999'), /decimal places/);
  assert.throws(() => serverValidateAmount('120000.999'), /decimal places/);
});

test('4. Concurrency Protection & Distributed Lock: Multi-instance and multi-tab protection', async () => {
  const mockDb = createMockFirestore({
    systemLocks: {
      admin_reset_lock: {
        isLocked: true,
        lockedAt: new Date().toISOString(),
        lockedAtTimestamp: Date.now(),
        lockedBy: 'admin_primary@bachatgat.com',
      },
    },
  });

  const mockSdk = createMockSdk(mockDb);

  // Attempting to acquire lock while locked must throw CONCURRENCY_LOCK
  await assert.rejects(
    () => acquireDistributedLock(mockDb, 'second_admin@bachatgat.com', mockSdk),
    (err) => err instanceof AdminResetError && err.step === 'CONCURRENCY_LOCK'
  );

  // After releasing lock, acquiring succeeds
  await releaseDistributedLock(mockDb, mockSdk);
  assert.equal(mockDb._store.systemLocks.get('admin_reset_lock').isLocked, false);

  await acquireDistributedLock(mockDb, 'second_admin@bachatgat.com', mockSdk);
  assert.equal(mockDb._store.systemLocks.get('admin_reset_lock').isLocked, true);
  assert.equal(mockDb._store.systemLocks.get('admin_reset_lock').lockedBy, 'second_admin@bachatgat.com');

  await releaseDistributedLock(mockDb, mockSdk);
});

test('5. Step 1 Preview & Dynamic Member Discovery: Accurate dynamic counting', async () => {
  const mockDb = createMockFirestore({
    users: {
      admin_uid: { id: 'admin_uid', role: 'admin', role_name: 'ADMIN', isActive: true },
      REG_001: { id: 'REG_001', role: 'member', status: 'active', isDeleted: false },
      REG_002: { id: 'REG_002', role: 'member', status: 'active', isDeleted: false },
      REG_003: { id: 'REG_003', role: 'member', status: 'inactive' }, // Excluded
      REG_004: { id: 'REG_004', role: 'member', isDeleted: true }, // Excluded
    },
    monthlyContributions: { c1: { id: 'c1' }, c2: { id: 'c2' } },
    loans: { l1: { id: 'l1' } },
    repayments: { r1: { id: 'r1' } },
    transactions: { t1: { id: 't1' }, t2: { id: 't2' } },
    groups: {
      shivshahi_group_001: {
        id: 'shivshahi_group_001',
        groupName: 'श्री सदुबाबा युवा स्वयम सहायता बचतगट',
        monthlyContribution: 1000,
      },
    },
  });

  const mockSdk = createMockSdk(mockDb);
  const mockAuth = { currentUser: { uid: 'admin_uid', email: 'admin@bachatgat.com' } };

  const preview = await fetchResetPreview(
    'shivshahi_group_001',
    mockDb,
    mockAuth,
    mockSdk,
    { projectId: TARGET_PROJECT_ID }
  );

  assert.equal(preview.memberCount, 2);
  assert.equal(preview.financialCounts.totalRecords, 6);
  assert.equal(preview.group.monthlyContribution, 1000);
});

test('6. Double Confirmation Enforcement: Rejects invalid or lowercase text', async () => {
  const mockDb = createMockFirestore({
    users: {
      admin_uid: { role: 'admin', role_name: 'ADMIN', isActive: true },
    },
  });
  const mockSdk = createMockSdk(mockDb);
  const mockAuth = { currentUser: { uid: 'admin_uid', email: 'admin@bachatgat.com' } };

  // Lowercase 'reset data'
  await assert.rejects(
    () => executeAdminReset({
      amountPerMember: 120000,
      confirmationText: 'reset data',
      customDb: mockDb,
      customAuth: mockAuth,
      customConfig: { projectId: TARGET_PROJECT_ID },
      ops: mockSdk,
    }),
    (err) => err.step === 'CONFIRMATION_CHECK'
  );

  // Partial 'RESET'
  await assert.rejects(
    () => executeAdminReset({
      amountPerMember: 120000,
      confirmationText: 'RESET',
      customDb: mockDb,
      customAuth: mockAuth,
      customConfig: { projectId: TARGET_PROJECT_ID },
      ops: mockSdk,
    }),
    (err) => err.step === 'CONFIRMATION_CHECK'
  );
});

test('7. Complete Reset Execution & Verification: Full lifecycle, deterministic doc IDs, preservation invariants', async () => {
  const NUM_MEMBERS = 43;
  const AMOUNT_PER_MEMBER = 120000;
  const EXPECTED_TOTAL = NUM_MEMBERS * AMOUNT_PER_MEMBER; // 5,160,000

  const usersMap = {};
  usersMap['admin_uid_001'] = {
    id: 'admin_uid_001',
    role: 'admin',
    role_name: 'ADMIN',
    email: 'admin@bachatgat.com',
    fullName: 'System Admin',
    isActive: true,
  };

  for (let i = 1; i <= NUM_MEMBERS; i++) {
    const id = `REG_${String(i).padStart(3, '0')}`;
    usersMap[id] = {
      id,
      name: `सदस्य नाव ${i}`,
      role: 'member',
      role_name: 'MEMBER',
      status: 'active',
      isActive: true,
      memberCode: String(i).padStart(3, '0'),
      totalSavings: 4000,
      phone: `98765432${String(i).padStart(2, '0')}`,
      shares: 1,
    };
  }

  const mockDb = createMockFirestore({
    users: usersMap,
    monthlyContributions: {
      old_c1: { id: 'old_c1', amount: 1000 },
      old_c2: { id: 'old_c2', amount: 1000 },
    },
    loans: {
      old_l1: { id: 'old_l1', principal: 50000, remainingAmount: 40000, status: 'ACTIVE' },
    },
    repayments: {
      old_r1: { id: 'old_r1', amount: 5000 },
    },
    transactions: {
      old_t1: { id: 'old_t1', amount: 1000 },
    },
    groups: {
      shivshahi_group_001: {
        id: 'shivshahi_group_001',
        groupName: 'श्री सदुबाबा युवा स्वयम सहायता बचतगट',
        monthlyContribution: 1000,
        totalSavings: 2000,
        totalFund: 2000,
      },
    },
  });

  const mockAuth = { currentUser: { uid: 'admin_uid_001', email: 'admin@bachatgat.com' } };
  const mockConfig = { projectId: TARGET_PROJECT_ID };
  const mockSdk = createMockSdk(mockDb);

  const result = await executeAdminReset({
    amountPerMember: AMOUNT_PER_MEMBER,
    groupId: 'shivshahi_group_001',
    confirmationText: 'RESET DATA',
    customDb: mockDb,
    customAuth: mockAuth,
    customConfig: mockConfig,
    ops: mockSdk,
  });

  assert.equal(result.success, true);
  assert.equal(result.memberCount, 43);
  assert.equal(result.totalAllocation, 5160000);

  // Invariant 1: Exactly 43 member docs preserved, 0 new members, 0 members deleted
  assert.equal(mockDb._store.users.size, 44); // 43 members + 1 admin
  for (let i = 1; i <= NUM_MEMBERS; i++) {
    const id = `REG_${String(i).padStart(3, '0')}`;
    const user = mockDb._store.users.get(id);
    assert.ok(user);
    assert.equal(user.totalSavings, 120000);
    assert.equal(user.total_savings, 120000);
    assert.equal(user.name, `सदस्य नाव ${i}`); // Name preserved
    assert.equal(user.phone, `98765432${String(i).padStart(2, '0')}`); // Phone preserved
    assert.equal(user.role, 'member'); // Role preserved
  }

  // Invariant 2: Base savings records match
  assert.equal(mockDb._store.monthlyContributions.size, 43);
  const sampleBase = mockDb._store.monthlyContributions.get('C_REG_001_BASE_SAVINGS');
  assert.equal(sampleBase.paidAmount, 120000);
  assert.equal(sampleBase.isBase, true);
  assert.equal(sampleBase.type, 'BASE_SAVINGS');
  assert.equal(sampleBase.month, 0);

  // Invariant 3: Opening transactions match
  assert.equal(mockDb._store.transactions.size, 43);
  const sampleTx = mockDb._store.transactions.get('ACT_REG_001_base_savings');
  assert.equal(sampleTx.amount, 120000);
  assert.equal(sampleTx.type, 'SAVINGS_DEPOSIT');

  // Invariant 4: Loans and repayments completely 0
  assert.equal(mockDb._store.loans.size, 0);
  assert.equal(mockDb._store.repayments.size, 0);

  // Invariant 5: Group document metrics match
  const group = mockDb._store.groups.get('shivshahi_group_001');
  assert.equal(group.totalSavings, 5160000);
  assert.equal(group.totalFund, 5160000);
  assert.equal(group.availableBalance, 5160000);
  assert.equal(group.activeLoans, 0);
  assert.equal(group.groupName, 'श्री सदुबाबा युवा स्वयम सहायता बचतगट');
  assert.equal(group.monthlyContribution, 1000);
});

test('8. Financial Calculations Audit: No double-counting of savings and transactions', () => {
  // Simulating post-reset state
  const baseContributions = [
    { id: 'C_REG_001_BASE_SAVINGS', memberId: 'REG_001', paidAmount: 120000, isBase: true, type: 'BASE_SAVINGS' },
    { id: 'C_REG_002_BASE_SAVINGS', memberId: 'REG_002', paidAmount: 120000, isBase: true, type: 'BASE_SAVINGS' },
  ];

  const transactions = [
    { id: 'ACT_REG_001_base_savings', memberId: 'REG_001', amount: 120000, type: 'SAVINGS_DEPOSIT' },
    { id: 'ACT_REG_002_base_savings', memberId: 'REG_002', amount: 120000, type: 'SAVINGS_DEPOSIT' },
  ];

  const loans = [];
  const repayments = [];

  const summary = calculateGroupFinancialSummary(baseContributions, loans, repayments, transactions);

  // Total Group Savings must strictly equal 240,000, NOT 480,000 (transactions must NOT be double-counted)
  assert.equal(summary.totalGroupSavings, 240000);
  assert.equal(summary.totalGroupFund, 240000);
  assert.equal(summary.activeLoansOutstanding, 0);
  assert.equal(summary.availableBalance, 240000);
});

test('9. Monthly Dues Audit: Base savings record is excluded from monthly installment calculations', () => {
  const member = { id: 'REG_001', monthlyContribution: 1000 };
  const allPayments = [
    // Base savings record for opening capital
    { memberId: 'REG_001', paidAmount: 120000, isBase: true, type: 'BASE_SAVINGS', month: 0, year: 2026 },
  ];

  // Evaluating status for October 2026 (month 10)
  const statusInfo = calculateMonthlyMemberStatus({
    member,
    payments: allPayments,
    selectedMonth: 10,
    selectedYear: 2026,
    monthlyShare: 1000,
  });

  // Regular monthly dues must remain UNPAID / PENDING despite ₹1,20,000 base capital
  assert.equal(statusInfo.isPaid, false);
  assert.equal(statusInfo.isPending, true);
  assert.equal(statusInfo.status, 'Pending');
  assert.equal(statusInfo.currentDues, 1000);
  assert.equal(statusInfo.amountPaid, 0);
});

test('10. Backup & Restore Fidelity Audit: Restores original document IDs and field relationships', async () => {
  const originalData = {
    groups: {
      shivshahi_group_001: { id: 'shivshahi_group_001', groupName: 'Test Group', monthlyContribution: 1000 },
    },
    users: {
      admin_uid: { id: 'admin_uid', role: 'admin', email: 'admin@bachatgat.com', isActive: true },
      REG_001: { id: 'REG_001', name: 'Original Name 1', role: 'member', status: 'active' },
      REG_002: { id: 'REG_002', name: 'Original Name 2', role: 'member', status: 'active' },
    },
    monthlyContributions: {
      c_orig_1: { id: 'c_orig_1', memberId: 'REG_001', amount: 1000, month: 5, year: 2026 },
    },
    loans: {
      l_orig_1: { id: 'l_orig_1', memberId: 'REG_001', principal: 25000, status: 'ACTIVE' },
    },
    repayments: {
      r_orig_1: { id: 'r_orig_1', loanId: 'l_orig_1', memberId: 'REG_001', amount: 2500 },
    },
    transactions: {
      t_orig_1: { id: 't_orig_1', memberId: 'REG_001', amount: 1000, type: 'SAVINGS' },
    },
  };

  const sourceDb = createMockFirestore(originalData);
  const sourceSdk = createMockSdk(sourceDb);

  // 1. Create backup
  const backup = await createAndVerifyBackup('shivshahi_group_001', sourceDb, sourceSdk);
  assert.equal(backup.documentCounts.users, 3);
  assert.equal(backup.documentCounts.loans, 1);
  assert.equal(backup.documentCounts.repayments, 1);

  // 2. Restore into a fresh target database
  const targetDb = createMockFirestore({});
  const targetSdk = createMockSdk(targetDb);

  const restoreResult = await restoreFromBackup(backup, targetDb, targetSdk);
  assert.equal(restoreResult.success, true);

  // 3. Verify all collections restored with original document IDs and relationships
  assert.equal(targetDb._store.users.size, 3);
  assert.ok(targetDb._store.users.get('REG_001'));
  assert.equal(targetDb._store.users.get('REG_001').name, 'Original Name 1');

  assert.equal(targetDb._store.loans.size, 1);
  assert.ok(targetDb._store.loans.get('l_orig_1'));
  assert.equal(targetDb._store.loans.get('l_orig_1').memberId, 'REG_001');

  assert.equal(targetDb._store.repayments.size, 1);
  assert.ok(targetDb._store.repayments.get('r_orig_1'));
  assert.equal(targetDb._store.repayments.get('r_orig_1').loanId, 'l_orig_1');
  assert.equal(targetDb._store.repayments.get('r_orig_1').memberId, 'REG_001');
});

test('11. Failure Recovery Audit: Backup is preserved and attached if failure occurs during execution', async () => {
  const mockDb = createMockFirestore({
    users: {
      admin_uid: { id: 'admin_uid', role: 'admin', role_name: 'ADMIN', isActive: true },
      REG_001: { id: 'REG_001', role: 'member', status: 'active' },
    },
    monthlyContributions: { c1: { id: 'c1', amount: 1000 } },
    loans: {},
    repayments: {},
    transactions: {},
    groups: {
      shivshahi_group_001: { id: 'shivshahi_group_001', groupName: 'Test Group' },
    },
  });

  const mockSdk = createMockSdk(mockDb);
  const mockAuth = { currentUser: { uid: 'admin_uid', email: 'admin@bachatgat.com' } };

  // Simulate a failure during writeBatch commit in allocation phase (after backup created)
  let totalCommits = 0;
  const faultySdk = {
    ...mockSdk,
    writeBatch() {
      const realBatch = mockSdk.writeBatch();
      return {
        ...realBatch,
        async commit() {
          totalCommits++;
          // Allow lock (1st commit) and deletion commit (2nd commit), fail on allocation commit (3rd commit)
          if (totalCommits >= 3) {
            throw new Error('Simulated network interruption during allocation');
          }
          return realBatch.commit();
        },
      };
    },
  };

  try {
    await executeAdminReset({
      amountPerMember: 120000,
      groupId: 'shivshahi_group_001',
      confirmationText: 'RESET DATA',
      customDb: mockDb,
      customAuth: mockAuth,
      customConfig: { projectId: TARGET_PROJECT_ID },
      ops: faultySdk,
    });
    assert.fail('Should have thrown on simulated failure');
  } catch (err) {
    // Assert backup data is preserved and attached to the error
    assert.ok(err.backupData, 'Backup data must be preserved and attached to the error object');
    assert.equal(err.backupData.documentCounts.users, 2);
    assert.equal(err.backupData.documentCounts.monthlyContributions, 1);
  }
});
