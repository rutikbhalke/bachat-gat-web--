import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireClient = createRequire(path.join(__dirname, '../client/package.json'));

const { signInWithEmailAndPassword } = requireClient('firebase/auth');

// Use the exact same singleton Firebase app and Firestore instance as client services
const {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
} = await import('../client/src/config/firebase.js');

const { savingsService } = await import('../client/src/services/savingsService.js');
const { loanService, resolveRegularHapta } = await import('../client/src/services/loanService.js');
const {
  formatFlutterContribution,
  formatFlutterTransaction,
  syncBulkContributionsToFlutter,
  getSyncStatus,
} = await import('../server/src/services/crossProjectSyncService.js');

const PROD_GROUP_ID = 'shivshahi_group_001';
const TEST_GROUP_ID = 'test_isolated_group_999';

console.log('================================================================================');
console.log('STARTING INTEGRATION TEST SUITE: BULK MONTHLY SAVINGS & FLUTTER COMPATIBILITY');
console.log('================================================================================');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✔ [PASS] Test ${totalTests}: ${testName}`);
  } catch (err) {
    console.error(`❌ [FAIL] Test ${totalTests}: ${testName}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAsyncTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✔ [PASS] Test ${totalTests}: ${testName}`);
  } catch (err) {
    console.error(`❌ [FAIL] Test ${totalTests}: ${testName}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  // 1. Authenticate with Firebase Auth as Admin
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // Verify production initial state is intact
  const prodGroupSnapBefore = await getDoc(doc(db, 'groups', PROD_GROUP_ID));
  assert.ok(prodGroupSnapBefore.exists(), 'Production group shivshahi_group_001 must exist');
  const prodInitialTotals = prodGroupSnapBefore.data();
  console.log(`[SAFETY CHECK] Production Group: ${PROD_GROUP_ID}`);
  console.log(`               Total Savings: ₹${prodInitialTotals.totalSavings}`);
  console.log(`               Total Fund: ₹${prodInitialTotals.totalFund}`);
  console.log(`               Available Balance: ₹${prodInitialTotals.availableBalance}\n`);

  // Ensure Isolated Test Group Document Exists
  const testGroupRef = doc(db, 'groups', TEST_GROUP_ID);
  await setDoc(
    testGroupRef,
    {
      id: TEST_GROUP_ID,
      groupId: TEST_GROUP_ID,
      groupName: 'Isolated Test Group 999',
      monthlyContribution: 1000,
      totalSavings: 50000,
      availableBalance: 50000,
      totalFund: 50000,
      activeLoans: 0,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Set up 4 Test Members with distinct multi-share amounts in TEST_GROUP_ID
  const testMembers = [
    { id: 'test_user_share_1', name: 'Member 1-Share', memberCode: 'TM-01', monthlyContribution: 1000 },
    { id: 'test_user_share_2', name: 'Member 2-Shares', memberCode: 'TM-02', monthlyContribution: 2000 },
    { id: 'test_user_share_3', name: 'Member 3-Shares', memberCode: 'TM-03', monthlyContribution: 3000 },
    { id: 'test_user_share_5', name: 'Member 5-Shares', memberCode: 'TM-05', monthlyContribution: 5000 },
  ];

  for (const tm of testMembers) {
    await setDoc(
      doc(db, 'users', tm.id),
      {
        id: tm.id,
        groupId: TEST_GROUP_ID,
        name: tm.name,
        fullName: tm.name,
        memberCode: tm.memberCode,
        monthlyContribution: tm.monthlyContribution,
        monthlyShare: tm.monthlyContribution,
        status: 'ACTIVE',
        isActive: true,
        isDeleted: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  const testPeriodMonth = 9;
  const testPeriodYear = 2029;

  // Clean up any test contributions from previous runs for this period
  for (const tm of testMembers) {
    const docId = `C_${tm.id}_${testPeriodYear}_${String(testPeriodMonth).padStart(2, '0')}`;
    await deleteDoc(doc(db, 'monthlyContributions', docId));
  }

  console.log('--- SECTION 1: MULTI-SHARE MEMBER DUES CALCULATION TESTS ---');

  // TEST 1: Configured multi-share dues are respected in preview
  await runAsyncTest('Preview calculates distinct configured shares (₹1,000, ₹2,000, ₹3,000, ₹5,000)', async () => {
    const preview = await savingsService.getBulkSavingsPreview(
      { month: testPeriodMonth, year: testPeriodYear },
      TEST_GROUP_ID
    );
    assert.ok(preview.success, 'Preview query must succeed');

    const m1 = preview.members.find((m) => m.memberId === 'test_user_share_1');
    const m2 = preview.members.find((m) => m.memberId === 'test_user_share_2');
    const m3 = preview.members.find((m) => m.memberId === 'test_user_share_3');
    const m5 = preview.members.find((m) => m.memberId === 'test_user_share_5');

    assert.ok(m1 && m2 && m3 && m5, 'All test members must be present in preview');
    assert.strictEqual(m1.configuredShare, 1000, 'Member 1 must be configured for ₹1,000');
    assert.strictEqual(m2.configuredShare, 2000, 'Member 2 must be configured for ₹2,000');
    assert.strictEqual(m3.configuredShare, 3000, 'Member 3 must be configured for ₹3,000');
    assert.strictEqual(m5.configuredShare, 5000, 'Member 5 must be configured for ₹5,000');

    assert.strictEqual(m1.remainingDue, 1000);
    assert.strictEqual(m2.remainingDue, 2000);
    assert.strictEqual(m3.remainingDue, 3000);
    assert.strictEqual(m5.remainingDue, 5000);
  });

  console.log('\n--- SECTION 2: PARTIAL PAYMENT & LEDGER CONTINUITY TESTS ---');

  // TEST 2: Partial payment of ₹500 for member with ₹2,000 configured share
  await runAsyncTest('Partial payment records partial status and leaves exact remaining balance', async () => {
    const res = await savingsService.recordBulkSavings(
      {
        month: testPeriodMonth,
        year: testPeriodYear,
        clientRequestId: `PARTIAL_TEST_1_${Date.now()}`,
        items: [{ memberId: 'test_user_share_2', amount: 500, expectedAmount: 2000 }],
      },
      TEST_GROUP_ID
    );
    assert.ok(res.success, 'Partial payment must record successfully');

    // Check contribution document
    const docId = `C_test_user_share_2_${testPeriodYear}_${String(testPeriodMonth).padStart(2, '0')}`;
    const snap = await getDoc(doc(db, 'monthlyContributions', docId));
    assert.ok(snap.exists(), 'Contribution document must exist');
    const data = snap.data();
    assert.strictEqual(data.paidAmount, 500, 'Paid amount must be ₹500');
    assert.strictEqual(data.expectedAmount, 2000, 'Expected amount must be ₹2,000');
    assert.strictEqual(data.status, 'partial', 'Status must be partial (lowercase for Flutter)');

    // Verify preview now reflects remaining due of ₹1,500
    const preview = await savingsService.getBulkSavingsPreview(
      { month: testPeriodMonth, year: testPeriodYear },
      TEST_GROUP_ID
    );
    const m2 = preview.members.find((m) => m.memberId === 'test_user_share_2');
    assert.strictEqual(m2.alreadyPaid, 500, 'Already paid must be ₹500');
    assert.strictEqual(m2.remainingDue, 1500, 'Remaining due must be ₹1,500');
    assert.strictEqual(m2.isPartial, true, 'isPartial flag must be true');
    assert.strictEqual(m2.isPaidFull, false, 'isPaidFull must be false');
  });

  // TEST 3: Completing remaining ₹1,500 marks record fully paid
  await runAsyncTest('Completing remaining due advances status to paid without resetting previous payments', async () => {
    const res = await savingsService.recordBulkSavings(
      {
        month: testPeriodMonth,
        year: testPeriodYear,
        clientRequestId: `PARTIAL_TEST_2_${Date.now()}`,
        items: [{ memberId: 'test_user_share_2', amount: 1500, expectedAmount: 2000 }],
      },
      TEST_GROUP_ID
    );
    assert.ok(res.success, 'Completing payment must record successfully');

    const docId = `C_test_user_share_2_${testPeriodYear}_${String(testPeriodMonth).padStart(2, '0')}`;
    const snap = await getDoc(doc(db, 'monthlyContributions', docId));
    const data = snap.data();
    assert.strictEqual(data.paidAmount, 2000, 'Total paid must now equal ₹2,000 (500 + 1500)');
    assert.strictEqual(data.status, 'paid', 'Status must be paid');

    const preview = await savingsService.getBulkSavingsPreview(
      { month: testPeriodMonth, year: testPeriodYear },
      TEST_GROUP_ID
    );
    const m2 = preview.members.find((m) => m.memberId === 'test_user_share_2');
    assert.strictEqual(m2.alreadyPaid, 2000);
    assert.strictEqual(m2.remainingDue, 0);
    assert.strictEqual(m2.isPaidFull, true);
  });

  console.log('\n--- SECTION 3: IDEMPOTENCY & DUPLICATE PREVENTION TESTS ---');

  // TEST 4: Resubmission with same clientRequestId must be rejected / replay safely
  await runAsyncTest('Submitting identical bulk request twice prevents double increment of group totals', async () => {
    const initialGroupSnap = await getDoc(doc(db, 'groups', TEST_GROUP_ID));
    const initialTotalSavings = initialGroupSnap.data().totalSavings;
    const initialAvailable = initialGroupSnap.data().availableBalance;

    const fixedRequestId = `IDEMPOTENT_KEY_FIXED_${Date.now()}`;
    const payload = {
      month: testPeriodMonth,
      year: testPeriodYear,
      clientRequestId: fixedRequestId,
      items: [
        { memberId: 'test_user_share_1', amount: 1000, expectedAmount: 1000 },
        { memberId: 'test_user_share_3', amount: 3000, expectedAmount: 3000 },
      ],
    };

    // First attempt: succeeds and increments totals by ₹4,000
    const res1 = await savingsService.recordBulkSavings(payload, TEST_GROUP_ID);
    assert.ok(res1.success, 'First attempt must succeed');
    assert.strictEqual(res1.isIdempotentReplay, false);
    assert.strictEqual(res1.totalCollected, 4000);

    const midGroupSnap = await getDoc(doc(db, 'groups', TEST_GROUP_ID));
    assert.strictEqual(midGroupSnap.data().totalSavings, initialTotalSavings + 4000);
    assert.strictEqual(midGroupSnap.data().availableBalance, initialAvailable + 4000);

    // Second attempt with SAME clientRequestId: must be identified as replay
    const res2 = await savingsService.recordBulkSavings(payload, TEST_GROUP_ID);
    assert.ok(res2.success, 'Second attempt must return success with replay flag');
    assert.strictEqual(res2.isIdempotentReplay, true, 'isIdempotentReplay must be true');

    // Group totals must NOT have been incremented a second time!
    const finalGroupSnap = await getDoc(doc(db, 'groups', TEST_GROUP_ID));
    assert.strictEqual(
      finalGroupSnap.data().totalSavings,
      initialTotalSavings + 4000,
      'Total savings must NOT double increment!'
    );
    assert.strictEqual(
      finalGroupSnap.data().availableBalance,
      initialAvailable + 4000,
      'Available balance must NOT double increment!'
    );
  });

  console.log('\n--- SECTION 4: LOAN PAYMENT REGULAR HAPTA DEDUPLICATION TESTS ---');

  // TEST 5: If bulk savings was already recorded for period, loan repayment adds ₹0 regular savings
  await runAsyncTest('Loan repayment detects already-paid bulk savings and collects ₹0 regular hafta', async () => {
    // test_user_share_1 has already paid ₹1,000 for 11/2026 in Section 3
    // Create an active loan for test_user_share_1
    const testLoanId = `TEST_LN_${Date.now()}`;
    await setDoc(doc(db, 'loans', testLoanId), {
      id: testLoanId,
      groupId: TEST_GROUP_ID,
      memberId: 'test_user_share_1',
      memberName: 'Member 1-Share',
      principalAmount: 10000,
      remainingAmount: 10000,
      pendingPrincipal: 10000,
      interestRate: 2,
      durationMonths: 10,
      status: 'ACTIVE',
      monthlyContribution: 1000,
      createdAt: new Date().toISOString(),
    });

    const initialGroupSnap = await getDoc(doc(db, 'groups', TEST_GROUP_ID));
    const initialSavings = initialGroupSnap.data().totalSavings;

    // Record loan repayment for month 11 / 2026
    const repayRes = await loanService.recordRepayment(
      {
        loanId: testLoanId,
        memberId: 'test_user_share_1',
        installmentNumber: 1,
        paymentMonth: testPeriodMonth,
        paymentYear: testPeriodYear,
        principalAmount: 1000,
        interestAmount: 200,
        regularHaptaAmount: 1000, // Form submitted ₹1,000 regular hafta
        clientRequestId: `REPAY_DEDUP_${Date.now()}`,
      },
      TEST_GROUP_ID
    );

    assert.ok(repayRes.success, 'Loan repayment must record successfully');

    // Verify savings document: paidAmount remains ₹1,000 (NOT incremented to ₹2,000!)
    const contribSnap = await getDoc(
      doc(db, 'monthlyContributions', `C_test_user_share_1_${testPeriodYear}_${String(testPeriodMonth).padStart(2, '0')}`)
    );
    assert.strictEqual(
      contribSnap.data().paidAmount,
      1000,
      'Contribution paidAmount must remain ₹1,000 without double addition'
    );

    // Verify group total savings was NOT incremented by loan repayment since savings were already paid
    const updatedGroupSnap = await getDoc(doc(db, 'groups', TEST_GROUP_ID));
    assert.strictEqual(
      updatedGroupSnap.data().totalSavings,
      initialSavings,
      'Group total savings must not increment when regular hafta is already paid'
    );

    // Clean up test loan
    await deleteDoc(doc(db, 'loans', testLoanId));
  });

  // TEST 6: Loan repayment idempotency key prevents duplicate loan repayment documents
  await runAsyncTest('Rapid double submission of loan repayment uses clientRequestId and prevents duplicate deduction', async () => {
    const testLoanId2 = `TEST_LN_IDEM_${Date.now()}`;
    await setDoc(doc(db, 'loans', testLoanId2), {
      id: testLoanId2,
      groupId: TEST_GROUP_ID,
      memberId: 'test_user_share_5',
      principalAmount: 5000,
      remainingAmount: 5000,
      pendingPrincipal: 5000,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    });

    const clientRequestId = `UNIQUE_CLIENT_REPAY_${Date.now()}`;
    const payload = {
      loanId: testLoanId2,
      memberId: 'test_user_share_5',
      installmentNumber: 1,
      paymentMonth: 12,
      paymentYear: 2026,
      principalAmount: 1000,
      interestAmount: 100,
      regularHaptaAmount: 0,
      clientRequestId,
    };

    const firstCall = await loanService.recordRepayment(payload, TEST_GROUP_ID);
    assert.ok(firstCall.success);
    assert.strictEqual(firstCall.isIdempotentReplay, undefined);

    // Immediate second call with identical clientRequestId
    const secondCall = await loanService.recordRepayment(payload, TEST_GROUP_ID);
    assert.ok(secondCall.success);
    assert.strictEqual(secondCall.isIdempotentReplay, true, 'Second call must return isIdempotentReplay: true');

    // Loan remaining principal must be 4000, NOT 3000!
    const loanSnap = await getDoc(doc(db, 'loans', testLoanId2));
    assert.strictEqual(loanSnap.data().remainingAmount, 4000, 'Principal must only be reduced once');

    await deleteDoc(doc(db, 'loans', testLoanId2));
  });

  console.log('\n--- SECTION 5: FLUTTER JSON ENUM & DART MODEL COMPATIBILITY TESTS ---');

  // TEST 7: formatFlutterContribution produces exact lowercase enum 'paid' / 'partial'
  runTest('Flutter MonthlyContribution Dart model compatibility (ContributionStatus enum)', () => {
    const fullPaidDoc = formatFlutterContribution({
      contribId: 'C_test_1',
      memberId: 'm1',
      memberName: 'Vaibhav',
      amount: 1000,
      expectedAmount: 1000,
      month: 11,
      year: 2026,
    });

    // In Dart: ContributionStatus.values.byName(json['status'])
    // Valid Dart enums: 'paid', 'pending', 'partial', 'overdue'
    assert.strictEqual(fullPaidDoc.status, 'paid', "Status must strictly be lowercase 'paid'");
    assert.strictEqual(typeof fullPaidDoc.amount, 'number');
    assert.strictEqual(typeof fullPaidDoc.expectedAmount, 'number');
    assert.strictEqual(typeof fullPaidDoc.month, 'number');
    assert.strictEqual(typeof fullPaidDoc.year, 'number');

    const partialDoc = formatFlutterContribution({
      contribId: 'C_test_2',
      memberId: 'm2',
      amount: 500,
      expectedAmount: 1000,
      month: 11,
      year: 2026,
    });
    assert.strictEqual(partialDoc.status, 'partial', "Status must strictly be lowercase 'partial'");
  });

  // TEST 8: formatFlutterTransaction produces exact camelCase enum 'monthlyInvestment'
  runTest('Flutter AppTransaction Dart model compatibility (TransactionType enum)', () => {
    const flutterTx = formatFlutterTransaction({
      actId: 'ACT_test_1',
      groupId: TEST_GROUP_ID,
      memberId: 'm1',
      memberName: 'Vaibhav',
      amount: 1000,
      description: 'Monthly savings received',
    });

    // In Dart: TransactionType.values.byName(json['type'])
    // Valid Dart enum: 'monthlyInvestment'
    assert.strictEqual(flutterTx.type, 'monthlyInvestment', "Transaction type must strictly be camelCase 'monthlyInvestment'");
    assert.strictEqual(typeof flutterTx.amount, 'number');
    assert.strictEqual(typeof flutterTx.id, 'string');
  });

  console.log('\n--- SECTION 6: OUTBOX QUEUEING & BACKEND SYNCHRONIZATION TESTS ---');

  // TEST 9: Cross-project sync records are safely queued in syncOutbox
  await runAsyncTest('Bulk savings outbox replication queues tasks with Flutter schema for bachatgatapp-5158b', async () => {
    const syncRes = await syncBulkContributionsToFlutter({
      groupId: TEST_GROUP_ID,
      contributions: [
        formatFlutterContribution({
          contribId: 'C_test_outbox_1',
          memberId: 'test_user_share_1',
          memberName: 'Member 1-Share',
          amount: 1000,
          expectedAmount: 1000,
          month: testPeriodMonth,
          year: testPeriodYear,
        }),
      ],
      transactions: [
        formatFlutterTransaction({
          actId: 'ACT_test_outbox_1',
          groupId: TEST_GROUP_ID,
          memberId: 'test_user_share_1',
          amount: 1000,
        }),
      ],
      totalDeltaSavings: 1000,
    });

    assert.ok(syncRes.success, 'Sync queueing must succeed');
    assert.ok(
      syncRes.status === 'QUEUED_PENDING_CONFIG' || syncRes.status === 'SYNCED',
      'Status must be queued or synced'
    );

    const health = await getSyncStatus(TEST_GROUP_ID);
    assert.ok(health.success, 'Sync health check must succeed');
    assert.strictEqual(health.flutterProjectId, 'bachatgatapp-5158b');
    assert.strictEqual(health.hasFlutterAdmin, false, 'Flutter admin is unconfigured (outbox active)');
  });

  console.log('\n--- SECTION 7: PRODUCTION SAFETY AUDIT ---');

  // TEST 10: Verify production group shivshahi_group_001 was 100% UNTOUCHED
  await runAsyncTest('PRODUCTION SAFETY AUDIT: shivshahi_group_001 strictly untouched', async () => {
    const prodGroupSnapAfter = await getDoc(doc(db, 'groups', PROD_GROUP_ID));
    assert.ok(prodGroupSnapAfter.exists(), 'Production group must exist');
    const prodFinalTotals = prodGroupSnapAfter.data();

    assert.strictEqual(
      prodFinalTotals.totalSavings,
      prodInitialTotals.totalSavings,
      'Production totalSavings must not have changed'
    );
    assert.strictEqual(
      prodFinalTotals.totalFund,
      prodInitialTotals.totalFund,
      'Production totalFund must not have changed'
    );
    assert.strictEqual(
      prodFinalTotals.availableBalance,
      prodInitialTotals.availableBalance,
      'Production availableBalance must not have changed'
    );

    // Verify no contributions were written to production group during tests
    const prodContribs = await getDocs(
      query(
        collection(db, 'monthlyContributions'),
        where('groupId', '==', PROD_GROUP_ID),
        where('year', '==', testPeriodYear),
        where('month', '==', testPeriodMonth)
      )
    );
    assert.strictEqual(prodContribs.size, 0, 'Zero test contributions must be written to production group');
  });

  console.log('\n================================================================================');
  console.log(`INTEGRATION TEST SUITE RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================================');

  if (passedTests === totalTests) {
    console.log('🎉 ALL INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
  } else {
    console.error(`💥 ${totalTests - passedTests} TESTS FAILED!`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
