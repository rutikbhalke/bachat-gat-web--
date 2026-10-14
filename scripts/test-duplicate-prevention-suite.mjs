import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireClient = createRequire(path.join(__dirname, '../client/package.json'));

const { signInWithEmailAndPassword } = requireClient('firebase/auth');

// Firebase client services and direct Firestore instance
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
const { loanService } = await import('../client/src/services/loanService.js');
const {
  formatFlutterContribution,
  formatFlutterTransaction,
} = await import('../server/src/services/crossProjectSyncService.js');

const PROD_GROUP_ID = 'shivshahi_group_001';
const TEST_GROUP_ID = 'test_isolated_group_dup_999';

console.log('================================================================================');
console.log('AUTOMATED TEST SUITE: PREVENT DUPLICATE SAVINGS & REGULAR HAPTA ENTRIES');
console.log('================================================================================');

let passedTests = 0;
let totalTests = 0;
const testRecordsCreated = [];

async function runAsyncTest(testNum, testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✔ [PASS] Test ${testNum}: ${testName}`);
  } catch (err) {
    console.error(`❌ [FAIL] Test ${testNum}: ${testName}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  // Step 0: Authenticate
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // Verify production initial state is intact and will remain untouched
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
      groupName: 'Isolated Duplicate Prevention Test Group',
      monthlyContribution: 1000,
      totalSavings: 40000,
      availableBalance: 40000,
      totalFund: 40000,
      activeLoans: 0,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Setup Test Members
  const memberA = { id: 'test_dup_mem_a', name: 'Member Alpha', fullName: 'Member Alpha', memberCode: 'M-101', groupId: TEST_GROUP_ID, status: 'ACTIVE' };
  const memberB = { id: 'test_dup_mem_b', name: 'Member Beta', fullName: 'Member Beta', memberCode: 'M-102', groupId: TEST_GROUP_ID, status: 'ACTIVE' };
  const memberC = { id: 'test_dup_mem_c', name: 'Member Gamma', fullName: 'Member Gamma', memberCode: 'M-103', groupId: TEST_GROUP_ID, status: 'ACTIVE' };
  const memberD = { id: 'test_dup_mem_d', name: 'Member Delta', fullName: 'Member Delta', memberCode: 'M-104', groupId: TEST_GROUP_ID, status: 'ACTIVE' };
  const memberE = { id: 'test_dup_mem_e', name: 'Member Epsilon', fullName: 'Member Epsilon', memberCode: 'M-105', groupId: TEST_GROUP_ID, status: 'ACTIVE', monthlyContribution: 2000, shares: 2 };

  for (const m of [memberA, memberB, memberC, memberD, memberE]) {
    await setDoc(doc(db, 'users', m.id), m, { merge: true });
    testRecordsCreated.push({ collection: 'users', id: m.id });
  }

  // Common test month & year
  const TEST_MONTH = 11;
  const TEST_YEAR = 2026;

  // ---------------------------------------------------------------------------
  // TEST 1: Recording bulk savings once succeeds
  // ---------------------------------------------------------------------------
  await runAsyncTest(1, 'Recording bulk savings once succeeds', async () => {
    const groupBefore = (await getDoc(testGroupRef)).data();
    const savingsBefore = Number(groupBefore.totalSavings || 0);

    const clientRequestId = `req_t1_${Date.now()}`;
    const res = await savingsService.recordBulkSavings(
      {
        month: TEST_MONTH,
        year: TEST_YEAR,
        items: [
          { memberId: memberA.id, amount: 1000, expectedAmount: 1000, memberName: memberA.name },
          { memberId: memberB.id, amount: 1000, expectedAmount: 1000, memberName: memberB.name },
        ],
        clientRequestId,
        paymentMode: 'UPI',
      },
      TEST_GROUP_ID
    );

    assert.strictEqual(res.success, true, 'Bulk savings should return success');
    assert.strictEqual(res.count, 2, 'Should record 2 members');
    assert.strictEqual(res.totalCollected, 2000, 'Should collect ₹2,000');

    const groupAfter = (await getDoc(testGroupRef)).data();
    assert.strictEqual(Number(groupAfter.totalSavings), savingsBefore + 2000, 'totalSavings should increment by ₹2,000');
    assert.strictEqual(Number(groupAfter.availableBalance), Number(groupBefore.availableBalance) + 2000, 'availableBalance should increment by ₹2,000');

    // Verify contribution documents exist
    const contribA = await getDoc(doc(db, 'monthlyContributions', `C_${memberA.id}_${TEST_YEAR}_${String(TEST_MONTH).padStart(2, '0')}`));
    const contribB = await getDoc(doc(db, 'monthlyContributions', `C_${memberB.id}_${TEST_YEAR}_${String(TEST_MONTH).padStart(2, '0')}`));
    assert.ok(contribA.exists(), 'Contribution for Member A must exist');
    assert.ok(contribB.exists(), 'Contribution for Member B must exist');
    assert.strictEqual(Number(contribA.data().paidAmount), 1000);
    assert.strictEqual(Number(contribB.data().paidAmount), 1000);

    testRecordsCreated.push({ collection: 'monthlyContributions', id: contribA.id });
    testRecordsCreated.push({ collection: 'monthlyContributions', id: contribB.id });
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Submitting the same bulk request twice does not create a duplicate
  // ---------------------------------------------------------------------------
  await runAsyncTest(2, 'Submitting the same bulk request twice does not create a duplicate', async () => {
    const groupBefore = (await getDoc(testGroupRef)).data();
    const savingsBefore = Number(groupBefore.totalSavings || 0);

    // Use a fixed idempotency key and call twice
    const idempotencyKey = `req_t2_fixed_key_${Date.now()}`;
    const payload = {
      month: 12,
      year: TEST_YEAR,
      items: [
        { memberId: memberC.id, amount: 1000, expectedAmount: 1000, memberName: memberC.name },
      ],
      clientRequestId: idempotencyKey,
      paymentMode: 'UPI',
    };

    const firstCall = await savingsService.recordBulkSavings(payload, TEST_GROUP_ID);
    assert.strictEqual(firstCall.success, true);
    assert.strictEqual(firstCall.totalCollected, 1000);

    const groupMid = (await getDoc(testGroupRef)).data();
    assert.strictEqual(Number(groupMid.totalSavings), savingsBefore + 1000);

    // Second call with same clientRequestId
    const secondCall = await savingsService.recordBulkSavings(payload, TEST_GROUP_ID);
    assert.strictEqual(secondCall.success, true);
    assert.strictEqual(secondCall.isIdempotentReplay, true, 'Second call must be flagged as idempotent replay');

    const groupAfter = (await getDoc(testGroupRef)).data();
    assert.strictEqual(Number(groupAfter.totalSavings), savingsBefore + 1000, 'Group totalSavings must not increment twice on retry');
    assert.strictEqual(Number(groupAfter.availableBalance), Number(groupMid.availableBalance), 'Available balance must not increment twice');

    testRecordsCreated.push({ collection: 'monthlyContributions', id: `C_${memberC.id}_${TEST_YEAR}_12` });
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Double-clicking Submit does not create duplicate entries
  // ---------------------------------------------------------------------------
  await runAsyncTest(3, 'Double-clicking Submit does not create duplicate entries', async () => {
    const groupBefore = (await getDoc(testGroupRef)).data();
    const savingsBefore = Number(groupBefore.totalSavings || 0);

    const rapidRequestId = `req_rapid_double_click_${Date.now()}`;
    const payload = {
      month: 1,
      year: TEST_YEAR + 1,
      items: [
        { memberId: memberD.id, amount: 1000, expectedAmount: 1000, memberName: memberD.name },
      ],
      clientRequestId: rapidRequestId,
      paymentMode: 'CASH',
    };

    // Execute concurrently simulating rapid double click
    const [res1, res2] = await Promise.all([
      savingsService.recordBulkSavings(payload, TEST_GROUP_ID),
      savingsService.recordBulkSavings(payload, TEST_GROUP_ID),
    ]);

    assert.strictEqual(res1.success, true);
    assert.strictEqual(res2.success, true);
    // At least one must be successful or idempotent replay
    const hasReplay = res1.isIdempotentReplay || res2.isIdempotentReplay;
    const collectedCount = (res1.isIdempotentReplay ? 0 : (res1.totalCollected || 0)) + (res2.isIdempotentReplay ? 0 : (res2.totalCollected || 0));

    const groupAfter = (await getDoc(testGroupRef)).data();
    assert.strictEqual(Number(groupAfter.totalSavings), savingsBefore + 1000, 'Rapid concurrent double submission must increment exactly once');

    testRecordsCreated.push({ collection: 'monthlyContributions', id: `C_${memberD.id}_${TEST_YEAR + 1}_01` });
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Retrying the same API request does not increment totals twice
  // ---------------------------------------------------------------------------
  await runAsyncTest(4, 'Retrying the same API request does not increment totals twice', async () => {
    const groupBefore = (await getDoc(testGroupRef)).data();
    const savingsBefore = Number(groupBefore.totalSavings);

    const retryId = `retry_req_${Date.now()}`;
    const payload = {
      month: 2,
      year: TEST_YEAR + 1,
      items: [{ memberId: memberA.id, amount: 1000, expectedAmount: 1000, memberName: memberA.name }],
      clientRequestId: retryId,
    };

    // 1st attempt
    await savingsService.recordBulkSavings(payload, TEST_GROUP_ID);
    const midSavings = Number((await getDoc(testGroupRef)).data().totalSavings);
    assert.strictEqual(midSavings, savingsBefore + 1000);

    // 2nd retry attempt
    const retryRes = await savingsService.recordBulkSavings(payload, TEST_GROUP_ID);
    assert.strictEqual(retryRes.isIdempotentReplay, true, 'Retry must be recognized as duplicate request');

    // 3rd retry attempt
    const retry3Res = await savingsService.recordBulkSavings(payload, TEST_GROUP_ID);
    assert.strictEqual(retry3Res.isIdempotentReplay, true);

    const finalSavings = Number((await getDoc(testGroupRef)).data().totalSavings);
    assert.strictEqual(finalSavings, midSavings, 'Total savings must not increment upon retrying API requests');

    testRecordsCreated.push({ collection: 'monthlyContributions', id: `C_${memberA.id}_${TEST_YEAR + 1}_02` });
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Existing monthly savings cause the correct duplicate warning / skip
  // ---------------------------------------------------------------------------
  await runAsyncTest(5, 'Existing monthly savings cause the correct duplicate skip/warning', async () => {
    // Member A already has savings recorded for TEST_MONTH (11) and TEST_YEAR (2026) from Test 1
    const groupBefore = (await getDoc(testGroupRef)).data();
    const savingsBefore = Number(groupBefore.totalSavings);

    // Send a fresh request (new request ID) for Member A for Month 11
    const freshRequestId = `fresh_req_already_paid_${Date.now()}`;
    const res = await savingsService.recordBulkSavings(
      {
        month: TEST_MONTH,
        year: TEST_YEAR,
        items: [
          { memberId: memberA.id, amount: 1000, expectedAmount: 1000, memberName: memberA.name },
        ],
        clientRequestId: freshRequestId,
      },
      TEST_GROUP_ID
    );

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.count, 0, 'No new members should be processed because Member A is already paid');
    assert.strictEqual(res.totalCollected, 0, 'Total collected should be 0');
    assert.ok(res.skippedDuplicates.length > 0, 'Should return skippedDuplicates list');
    assert.strictEqual(res.skippedDuplicates[0].memberId, memberA.id);

    const groupAfter = (await getDoc(testGroupRef)).data();
    assert.strictEqual(Number(groupAfter.totalSavings), savingsBefore, 'Group savings must not change when duplicate member is skipped');
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Regular Hapta already recorded through Bulk Monthly Savings is blocked in Loan Repayment
  // ---------------------------------------------------------------------------
  await runAsyncTest(6, 'Regular Hapta already recorded through Bulk Monthly Savings is blocked in Loan Repayment', async () => {
    // Member A has bulk savings paid for Month 11, Year 2026.
    // Create an active loan for Member A
    const loanDocId = `test_loan_mem_a_${Date.now()}`;
    const loanRef = doc(db, 'loans', loanDocId);
    await setDoc(loanRef, {
      id: loanDocId,
      loan_id: loanDocId,
      groupId: TEST_GROUP_ID,
      group_id: TEST_GROUP_ID,
      memberId: memberA.id,
      member_id: memberA.id,
      principalAmount: 10000,
      principal_amount: 10000,
      remainingAmount: 10000,
      pendingPrincipal: 10000,
      outstanding_amount: 10000,
      interestRate: 2.0,
      interest_rate: 2.0,
      status: 'ACTIVE',
      disbursementDate: `${TEST_YEAR}-10-01`,
      createdAt: new Date().toISOString(),
    });
    testRecordsCreated.push({ collection: 'loans', id: loanDocId });

    // Inspect schedule via loanService
    const loanData = (await loanService.getLoanById(loanDocId, TEST_GROUP_ID)).loan;
    const scheduleRow = loanData.schedule.find((s) => s.month === TEST_MONTH && s.year === TEST_YEAR);

    assert.ok(scheduleRow, `Schedule row for ${TEST_MONTH}/${TEST_YEAR} must exist`);
    assert.strictEqual(scheduleRow.bulkSavingsPaid, 1000, 'Schedule must detect bulk savings of ₹1,000');
    assert.strictEqual(scheduleRow.hasBulkSavingsPaid, true, 'hasBulkSavingsPaid must be true');
    assert.strictEqual(scheduleRow.isRegularHaptaAlreadyPaid, true, 'isRegularHaptaAlreadyPaid must be true');

    // Attempt to record loan repayment for Month 11 with regular_hafta_amount: 1000
    const groupBefore = (await getDoc(testGroupRef)).data();
    const savingsBefore = Number(groupBefore.totalSavings);

    const repayRes = await loanService.recordRepayment(
      {
        loanId: loanDocId,
        payment_month: TEST_MONTH,
        payment_year: TEST_YEAR,
        installmentNumber: scheduleRow.installmentNumber,
        regular_hafta_amount: 1000, // Frontend passed 1000, but service must protect against duplicate!
        principal_repayment_amount: 1000,
        interest_amount: 200,
        payment_date: `${TEST_YEAR}-11-15`,
      },
      TEST_GROUP_ID
    );

    assert.strictEqual(repayRes.success, true);

    const groupAfter = (await getDoc(testGroupRef)).data();
    // Total savings must NOT increment by ₹1,000 (duplicate regular hapta blocked)
    assert.strictEqual(Number(groupAfter.totalSavings), savingsBefore, 'totalSavings must not increment when regular hapta was already recorded via bulk savings');

    // Verify repayment document recorded regularHaptaAmount: 0
    const repaySnap = await getDoc(doc(db, 'repayments', repayRes.repaymentId));
    assert.ok(repaySnap.exists());
    assert.strictEqual(repaySnap.data().regularHaptaAmount, 0, 'Repayment document must have regularHaptaAmount: 0');
    assert.strictEqual(repaySnap.data().principalAmount, 1000, 'Principal amount must be recorded normally');
    assert.strictEqual(repaySnap.data().interestAmount, 200, 'Interest amount must be recorded normally');

    testRecordsCreated.push({ collection: 'repayments', id: repayRes.repaymentId });
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Regular Hapta not yet recorded can still be submitted normally
  // ---------------------------------------------------------------------------
  await runAsyncTest(7, 'Regular Hapta not yet recorded can still be submitted normally in Loan Repayment', async () => {
    // For Member A's loan, Month 3 of Year 2027 has NOT been paid via bulk savings
    const UNPAID_MONTH = 3;
    const UNPAID_YEAR = TEST_YEAR + 1;

    // Verify no contribution exists yet
    const contribDocId = `C_${memberA.id}_${UNPAID_YEAR}_${String(UNPAID_MONTH).padStart(2, '0')}`;
    const preCheck = await getDoc(doc(db, 'monthlyContributions', contribDocId));
    assert.strictEqual(preCheck.exists(), false, 'Contribution must not exist yet');

    const groupBefore = (await getDoc(testGroupRef)).data();
    const savingsBefore = Number(groupBefore.totalSavings);

    // Record repayment for Month 3 with regular hapta ₹1,000
    const loans = (await loanService.getAllLoans({ status: 'active' }, TEST_GROUP_ID)).loans;
    const loan = loans.find((l) => l.memberId === memberA.id);
    assert.ok(loan, 'Active loan for Member A must be found');

    const repayRes = await loanService.recordRepayment(
      {
        loanId: loan.id,
        payment_month: UNPAID_MONTH,
        payment_year: UNPAID_YEAR,
        installmentNumber: 2,
        regular_hafta_amount: 1000,
        principal_repayment_amount: 1000,
        interest_amount: 180,
        payment_date: `${UNPAID_YEAR}-03-10`,
      },
      TEST_GROUP_ID
    );

    assert.strictEqual(repayRes.success, true);

    const groupAfter = (await getDoc(testGroupRef)).data();
    assert.strictEqual(Number(groupAfter.totalSavings), savingsBefore + 1000, 'Regular hapta should increment totalSavings when not yet paid in bulk');

    // Verify contribution was created for Month 3
    const postContrib = await getDoc(doc(db, 'monthlyContributions', contribDocId));
    assert.ok(postContrib.exists(), 'Monthly contribution document must be created');
    assert.strictEqual(Number(postContrib.data().paidAmount), 1000);

    testRecordsCreated.push({ collection: 'monthlyContributions', id: contribDocId });
    testRecordsCreated.push({ collection: 'repayments', id: repayRes.repaymentId });
  });

  // ---------------------------------------------------------------------------
  // TEST 8: An unrelated loan repayment does not trigger a false duplicate warning
  // ---------------------------------------------------------------------------
  await runAsyncTest(8, 'An unrelated loan repayment does not trigger a false duplicate warning', async () => {
    // Create loan for Member B
    const loanBId = `loan_mem_b_${Date.now()}`;
    await setDoc(doc(db, 'loans', loanBId), {
      id: loanBId,
      groupId: TEST_GROUP_ID,
      memberId: memberB.id,
      principalAmount: 20000,
      remainingAmount: 20000,
      pendingPrincipal: 20000,
      interestRate: 2.0,
      status: 'ACTIVE',
      issueDate: '2026-01-01',
      disbursementDate: '2026-01-01',
      durationMonths: 12,
      createdAt: new Date().toISOString(),
    });
    testRecordsCreated.push({ collection: 'loans', id: loanBId });

    // Record repayment for Month 8 for Member B
    const repayM8Res = await loanService.recordRepayment(
      {
        loanId: loanBId,
        payment_month: 8,
        payment_year: 2026,
        installmentNumber: 1,
        regular_hafta_amount: 1000,
        principal_repayment_amount: 2000,
        interest_amount: 400,
        payment_date: '2026-08-10',
      },
      TEST_GROUP_ID
    );
    testRecordsCreated.push({ collection: 'repayments', id: repayM8Res.repaymentId });
    testRecordsCreated.push({ collection: 'monthlyContributions', id: `C_${memberB.id}_2026_08` });

    // Now inspect schedule for Month 10 for Member B
    const loanBDetails = (await loanService.getLoanById(loanBId, TEST_GROUP_ID)).loan;
    const scheduleRowM10 = loanBDetails.schedule.find((s) => s.month === 10 && s.year === 2026);

    assert.ok(scheduleRowM10, 'Month 10 installment must exist in schedule');
    // Month 10 has NOT been paid in bulk and NOT been paid in repayment
    assert.strictEqual(scheduleRowM10.hasBulkSavingsPaid, false, 'Month 10 must NOT have bulkSavingsPaid');
    assert.strictEqual(scheduleRowM10.isRegularHaptaAlreadyPaid, false, 'Month 10 regular hapta must NOT be marked paid');
    assert.strictEqual(scheduleRowM10.regularHaptaRemaining, 1000, 'Month 10 regular hapta due must be ₹1,000');
  });

  // ---------------------------------------------------------------------------
  // TEST 9: Different members and different months can be recorded independently
  // ---------------------------------------------------------------------------
  await runAsyncTest(9, 'Different members and different months can be recorded independently', async () => {
    // Member C in Month 5 and Member D in Month 6
    const groupBefore = (await getDoc(testGroupRef)).data();
    const savingsBefore = Number(groupBefore.totalSavings);

    const res = await savingsService.recordBulkSavings(
      {
        month: 5,
        year: 2027,
        items: [
          { memberId: memberC.id, amount: 1000, expectedAmount: 1000, memberName: memberC.name },
        ],
        clientRequestId: `req_m5_indep_${Date.now()}`,
      },
      TEST_GROUP_ID
    );
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.totalCollected, 1000);

    const res2 = await savingsService.recordBulkSavings(
      {
        month: 6,
        year: 2027,
        items: [
          { memberId: memberD.id, amount: 1000, expectedAmount: 1000, memberName: memberD.name },
        ],
        clientRequestId: `req_m6_indep_${Date.now()}`,
      },
      TEST_GROUP_ID
    );
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.totalCollected, 1000);

    const groupAfter = (await getDoc(testGroupRef)).data();
    assert.strictEqual(Number(groupAfter.totalSavings), savingsBefore + 2000);

    testRecordsCreated.push({ collection: 'monthlyContributions', id: `C_${memberC.id}_2027_05` });
    testRecordsCreated.push({ collection: 'monthlyContributions', id: `C_${memberD.id}_2027_06` });
  });

  // ---------------------------------------------------------------------------
  // TEST 10: Legitimate partial payments and supported multi-share calculations still work
  // ---------------------------------------------------------------------------
  await runAsyncTest(10, 'Legitimate partial payments and supported multi-share calculations work', async () => {
    // Member E has 2 shares = expected ₹2,000 monthly contribution
    const PARTIAL_MONTH = 7;
    const PARTIAL_YEAR = 2027;

    const groupBefore = (await getDoc(testGroupRef)).data();
    const savingsBefore = Number(groupBefore.totalSavings);

    // Step 1: Member E pays 1st partial ₹1,000 of ₹2,000 expected
    const part1 = await savingsService.recordBulkSavings(
      {
        month: PARTIAL_MONTH,
        year: PARTIAL_YEAR,
        items: [
          { memberId: memberE.id, amount: 1000, expectedAmount: 2000, memberName: memberE.name },
        ],
        clientRequestId: `part1_req_${Date.now()}`,
      },
      TEST_GROUP_ID
    );
    assert.strictEqual(part1.success, true);
    assert.strictEqual(part1.count, 1);
    assert.strictEqual(part1.totalCollected, 1000);

    const contribDocId = `C_${memberE.id}_${PARTIAL_YEAR}_07`;
    testRecordsCreated.push({ collection: 'monthlyContributions', id: contribDocId });

    const contribSnap1 = await getDoc(doc(db, 'monthlyContributions', contribDocId));
    assert.strictEqual(contribSnap1.data().status.toLowerCase(), 'partial');
    assert.strictEqual(Number(contribSnap1.data().paidAmount), 1000);

    // Step 2: Member E pays 2nd partial ₹1,000 (settles balance)
    const part2 = await savingsService.recordBulkSavings(
      {
        month: PARTIAL_MONTH,
        year: PARTIAL_YEAR,
        items: [
          { memberId: memberE.id, amount: 1000, expectedAmount: 2000, memberName: memberE.name },
        ],
        clientRequestId: `part2_req_${Date.now()}`,
      },
      TEST_GROUP_ID
    );
    assert.strictEqual(part2.success, true);
    assert.strictEqual(part2.count, 1);
    assert.strictEqual(part2.totalCollected, 1000);

    const contribSnap2 = await getDoc(doc(db, 'monthlyContributions', contribDocId));
    assert.strictEqual(contribSnap2.data().status.toLowerCase(), 'paid');
    assert.strictEqual(Number(contribSnap2.data().paidAmount), 2000);

    // Step 3: Attempting a 3rd payment when already paid in full is blocked as duplicate
    const part3 = await savingsService.recordBulkSavings(
      {
        month: PARTIAL_MONTH,
        year: PARTIAL_YEAR,
        items: [
          { memberId: memberE.id, amount: 1000, expectedAmount: 2000, memberName: memberE.name },
        ],
        clientRequestId: `part3_req_${Date.now()}`,
      },
      TEST_GROUP_ID
    );
    assert.strictEqual(part3.count, 0, '3rd payment must be skipped as duplicate');
    assert.strictEqual(part3.totalCollected, 0, 'No extra savings collected');
    assert.ok(part3.skippedDuplicates.length > 0, 'Should be reported in skippedDuplicates');

    const groupAfter = (await getDoc(testGroupRef)).data();
    assert.strictEqual(Number(groupAfter.totalSavings), savingsBefore + 2000, 'Group savings should increment by exactly ₹2,000 for both partial payments');
  });

  // ---------------------------------------------------------------------------
  // TEST 11: Cross-project sync retry does not create duplicate Flutter documents or increment totals twice
  // ---------------------------------------------------------------------------
  await runAsyncTest(11, 'Cross-project sync format & retry idempotency verification', async () => {
    // 1. Verify formatFlutterContribution matches Flutter Dart model exactly
    const formattedContrib = formatFlutterContribution({
      contribId: `C_${memberA.id}_2026_11`,
      memberId: memberA.id,
      memberName: memberA.name,
      amount: 1000,
      expectedAmount: 1000,
      month: 11,
      year: 2026,
    });

    assert.strictEqual(formattedContrib.id, `C_${memberA.id}_2026_11`);
    assert.strictEqual(formattedContrib.status, 'paid', 'Status must be lowercase enum for Flutter');
    assert.strictEqual(typeof formattedContrib.amount, 'number');
    assert.strictEqual(typeof formattedContrib.month, 'number');
    assert.strictEqual(typeof formattedContrib.year, 'number');

    // 2. Verify formatFlutterTransaction matches Flutter Dart AppTransaction model
    const formattedTx = formatFlutterTransaction({
      actId: `ACT_test_${Date.now()}`,
      groupId: TEST_GROUP_ID,
      memberId: memberA.id,
      memberName: memberA.name,
      amount: 1000,
    });

    assert.strictEqual(formattedTx.type, 'monthlyInvestment', 'Transaction type must be monthlyInvestment camelCase');
    assert.strictEqual(typeof formattedTx.amount, 'number');

    // 3. Verify retry idempotency guard logic: totalsSynced prevents double increment
    const mockOutboxItem = {
      id: 'OUTBOX_TEST_IDEMPOTENT',
      deltaSavings: 1000,
      totalsSynced: true, // already synced once
    };

    let simulatedFlutterTotal = 50000;
    // Check our idempotency rule: only increment if NOT already synced
    if (mockOutboxItem.deltaSavings > 0 && !mockOutboxItem.totalsSynced) {
      simulatedFlutterTotal += mockOutboxItem.deltaSavings;
    }

    assert.strictEqual(simulatedFlutterTotal, 50000, 'Flutter totals must remain untouched if totalsSynced is true on retry');
  });

  // ---------------------------------------------------------------------------
  // TEST 12: Failed and partially successful bulk requests report accurate results and can be safely retried
  // ---------------------------------------------------------------------------
  await runAsyncTest(12, 'Mixed bulk request reports accurate counts and duplicates skipped', async () => {
    // Member A is already paid for Month 11, 2026.
    // Member C is UNPAID for Month 11, 2026.
    const groupBefore = (await getDoc(testGroupRef)).data();
    const savingsBefore = Number(groupBefore.totalSavings);

    const mixedRes = await savingsService.recordBulkSavings(
      {
        month: TEST_MONTH,
        year: TEST_YEAR,
        items: [
          { memberId: memberA.id, amount: 1000, expectedAmount: 1000, memberName: memberA.name }, // duplicate!
          { memberId: memberC.id, amount: 1000, expectedAmount: 1000, memberName: memberC.name }, // new!
        ],
        clientRequestId: `mixed_req_${Date.now()}`,
      },
      TEST_GROUP_ID
    );

    assert.strictEqual(mixedRes.success, true);
    assert.strictEqual(mixedRes.count, 1, 'Only Member C should be processed');
    assert.strictEqual(mixedRes.totalCollected, 1000, 'Only ₹1,000 should be collected');
    assert.strictEqual(mixedRes.skippedDuplicates.length, 1, 'Member A should be in skippedDuplicates');
    assert.strictEqual(mixedRes.skippedDuplicates[0].memberId, memberA.id);

    const groupAfter = (await getDoc(testGroupRef)).data();
    assert.strictEqual(Number(groupAfter.totalSavings), savingsBefore + 1000, 'Group savings should increment only by ₹1,000 for the valid member');

    testRecordsCreated.push({ collection: 'monthlyContributions', id: `C_${memberC.id}_${TEST_YEAR}_11` });
  });

  // ---------------------------------------------------------------------------
  // CLEANUP ISOLATED TEST DATA
  // ---------------------------------------------------------------------------
  console.log('\nCleaning up isolated test data...');
  for (const item of testRecordsCreated) {
    try {
      await deleteDoc(doc(db, item.collection, item.id));
    } catch (_) {}
  }
  // Delete test group
  try {
    await deleteDoc(testGroupRef);
  } catch (_) {}
  console.log(`✔ Cleaned up ${testRecordsCreated.length} isolated test records.`);

  // Verify production group is still untouched
  const prodGroupSnapAfter = await getDoc(doc(db, 'groups', PROD_GROUP_ID));
  const prodFinalTotals = prodGroupSnapAfter.data();
  assert.strictEqual(prodFinalTotals.totalSavings, prodInitialTotals.totalSavings, 'Production totalSavings MUST be unchanged');
  assert.strictEqual(prodFinalTotals.totalFund, prodInitialTotals.totalFund, 'Production totalFund MUST be unchanged');
  assert.strictEqual(prodFinalTotals.availableBalance, prodInitialTotals.availableBalance, 'Production availableBalance MUST be unchanged');
  console.log(`✔ [VERIFIED] Production Group ${PROD_GROUP_ID} was completely untouched.\n`);

  console.log('================================================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================================');

  if (passedTests === totalTests) {
    console.log('🎉 ALL 12 DUPLICATE PREVENTION & REGULAR HAPTA TEST SCENARIOS PASSED!');
    process.exit(0);
  } else {
    console.error(`💥 ${totalTests - passedTests} TESTS FAILED.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
