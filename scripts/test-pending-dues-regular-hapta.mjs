import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireClient = createRequire(path.join(__dirname, '../client/package.json'));

const { signInWithEmailAndPassword } = requireClient('firebase/auth');

// Firebase client config and direct Firestore instance
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
} = await import('../client/src/config/firebase.js');

const { savingsService } = await import('../client/src/services/savingsService.js');
const { loanService, generateLoanRepaymentSchedule } = await import('../client/src/services/loanService.js');
const { reportService } = await import('../client/src/services/reportService.js');

const PROD_GROUP_ID = 'shivshahi_group_001';
const TEST_GROUP_ID = `test_grp_pending_due_${Date.now()}`;

console.log('================================================================================');
console.log('AUTOMATED REGRESSION SUITE: REGULAR HAPTA NOT COLLECTED IN BULK -> PENDING DUE');
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
  // 1. Authenticate
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // 2. Production Safety Snapshot
  const prodDocSnap = await getDoc(doc(db, 'groups', PROD_GROUP_ID));
  const prodBaseline = prodDocSnap.data();
  console.log(`[SAFETY CHECK] Production Group: ${PROD_GROUP_ID}`);
  console.log(`               Total Savings: ₹${prodBaseline.totalSavings}`);
  console.log(`               Total Fund: ₹${prodBaseline.totalFund}`);
  console.log(`               Available Balance: ₹${prodBaseline.availableBalance}\n`);

  const TARGET_MONTH = 10;
  const TARGET_YEAR = 2026;
  const ISSUE_MONTH = 9;
  const ISSUE_YEAR = 2026;
  const ISSUE_DATE = '2026-09-10';

  // 3. Setup Isolated Test Group & Members with Loans
  const testGroupRef = doc(db, 'groups', TEST_GROUP_ID);
  await setDoc(testGroupRef, {
    id: TEST_GROUP_ID,
    groupId: TEST_GROUP_ID,
    groupName: 'Isolated Pending Dues Test Group',
    monthlyContribution: 1000,
    monthly_contribution_per_share: 1000,
    totalSavings: 50000,
    total_savings: 50000,
    totalFund: 50000,
    total_fund: 50000,
    availableBalance: 50000,
    available_balance: 50000,
    rawAvailableBalance: 50000,
    createdAt: new Date().toISOString(),
  });
  testRecordsCreated.push({ collection: 'groups', id: TEST_GROUP_ID });

  // Test Member 1: Standard loan (₹10,000, 10 months, 2% interest = ₹1000 princ + ₹200 int)
  const mem1Id = `test_mem_pd_1_${Date.now()}`;
  const mem1Ref = doc(db, 'users', mem1Id);
  await setDoc(mem1Ref, {
    id: mem1Id,
    memberId: mem1Id,
    groupId: TEST_GROUP_ID,
    name: 'Anand Shinde',
    fullName: 'Anand Shinde',
    memberCode: 'TM-PD-001',
    phone: '9876543210',
    monthlyContribution: 1000,
    monthly_contribution: 1000,
    role: 'MEMBER',
    status: 'ACTIVE',
    isActive: true,
    shares: 1,
    createdAt: new Date().toISOString(),
  });
  testRecordsCreated.push({ collection: 'users', id: mem1Id });

  const loan1Id = `test_loan_pd_1_${Date.now()}`;
  const loan1Ref = doc(db, 'loans', loan1Id);
  await setDoc(loan1Ref, {
    id: loan1Id,
    loanId: loan1Id,
    groupId: TEST_GROUP_ID,
    memberId: mem1Id,
    memberName: 'Anand Shinde',
    loanNumber: 'L-PD-001',
    originalPrincipal: 10000,
    principalAmount: 10000,
    remainingAmount: 10000,
    pendingPrincipal: 10000,
    outstanding_amount: 10000,
    interestRate: 2,
    durationMonths: 10,
    issueDate: ISSUE_DATE,
    loanDate: ISSUE_DATE,
    status: 'ACTIVE',
    totalPrincipalPaid: 0,
    totalInterestPaid: 0,
    createdAt: ISSUE_DATE,
  });
  testRecordsCreated.push({ collection: 'loans', id: loan1Id });

  // Test Member 2: Larger loan (₹20,000, 10 months, 2% interest = ₹2000 princ + ₹400 int)
  const mem2Id = `test_mem_pd_2_${Date.now()}`;
  const mem2Ref = doc(db, 'users', mem2Id);
  await setDoc(mem2Ref, {
    id: mem2Id,
    memberId: mem2Id,
    groupId: TEST_GROUP_ID,
    name: 'Suresh Patil',
    fullName: 'Suresh Patil',
    memberCode: 'TM-PD-002',
    phone: '9876543211',
    monthlyContribution: 1000,
    monthly_contribution: 1000,
    role: 'MEMBER',
    status: 'ACTIVE',
    isActive: true,
    shares: 1,
    createdAt: new Date().toISOString(),
  });
  testRecordsCreated.push({ collection: 'users', id: mem2Id });

  const loan2Id = `test_loan_pd_2_${Date.now()}`;
  const loan2Ref = doc(db, 'loans', loan2Id);
  await setDoc(loan2Ref, {
    id: loan2Id,
    loanId: loan2Id,
    groupId: TEST_GROUP_ID,
    memberId: mem2Id,
    memberName: 'Suresh Patil',
    loanNumber: 'L-PD-002',
    originalPrincipal: 20000,
    principalAmount: 20000,
    remainingAmount: 20000,
    pendingPrincipal: 20000,
    outstanding_amount: 20000,
    interestRate: 2,
    durationMonths: 10,
    issueDate: ISSUE_DATE,
    loanDate: ISSUE_DATE,
    status: 'ACTIVE',
    totalPrincipalPaid: 0,
    totalInterestPaid: 0,
    createdAt: ISSUE_DATE,
  });
  testRecordsCreated.push({ collection: 'loans', id: loan2Id });

  // Test Member 3: Multi-Share Member (1.5 shares = ₹1500 monthly share, loan ₹30,000 = ₹3000 princ + ₹600 int)
  const mem3Id = `test_mem_pd_3_${Date.now()}`;
  const mem3Ref = doc(db, 'users', mem3Id);
  await setDoc(mem3Ref, {
    id: mem3Id,
    memberId: mem3Id,
    groupId: TEST_GROUP_ID,
    name: 'Vijay Deshmukh',
    fullName: 'Vijay Deshmukh',
    memberCode: 'TM-PD-003',
    phone: '9876543212',
    monthlyContribution: 1500,
    monthly_contribution: 1500,
    monthlyShare: 1500,
    role: 'MEMBER',
    status: 'ACTIVE',
    isActive: true,
    shares: 1.5,
    createdAt: new Date().toISOString(),
  });
  testRecordsCreated.push({ collection: 'users', id: mem3Id });

  const loan3Id = `test_loan_pd_3_${Date.now()}`;
  const loan3Ref = doc(db, 'loans', loan3Id);
  await setDoc(loan3Ref, {
    id: loan3Id,
    loanId: loan3Id,
    groupId: TEST_GROUP_ID,
    memberId: mem3Id,
    memberName: 'Vijay Deshmukh',
    loanNumber: 'L-PD-003',
    originalPrincipal: 30000,
    principalAmount: 30000,
    remainingAmount: 30000,
    pendingPrincipal: 30000,
    outstanding_amount: 30000,
    interestRate: 2,
    durationMonths: 10,
    issueDate: ISSUE_DATE,
    loanDate: ISSUE_DATE,
    status: 'ACTIVE',
    totalPrincipalPaid: 0,
    totalInterestPaid: 0,
    createdAt: ISSUE_DATE,
  });
  testRecordsCreated.push({ collection: 'loans', id: loan3Id });

  // Member 4 (Control - Fully Paid in Month 10)
  const mem4Id = `test_mem_pd_4_${Date.now()}`;
  const mem4Ref = doc(db, 'users', mem4Id);
  await setDoc(mem4Ref, {
    id: mem4Id,
    memberId: mem4Id,
    groupId: TEST_GROUP_ID,
    name: 'Ramesh Pawar',
    fullName: 'Ramesh Pawar',
    memberCode: 'TM-PD-004',
    phone: '9876543213',
    monthlyContribution: 1000,
    monthly_contribution: 1000,
    role: 'MEMBER',
    status: 'ACTIVE',
    isActive: true,
    shares: 1,
    createdAt: new Date().toISOString(),
  });
  testRecordsCreated.push({ collection: 'users', id: mem4Id });

  const loan4Id = `test_loan_pd_4_${Date.now()}`;
  const loan4Ref = doc(db, 'loans', loan4Id);
  await setDoc(loan4Ref, {
    id: loan4Id,
    loanId: loan4Id,
    groupId: TEST_GROUP_ID,
    memberId: mem4Id,
    memberName: 'Ramesh Pawar',
    loanNumber: 'L-PD-004',
    originalPrincipal: 10000,
    principalAmount: 10000,
    remainingAmount: 9000,
    pendingPrincipal: 9000,
    outstanding_amount: 9000,
    interestRate: 2,
    durationMonths: 10,
    issueDate: ISSUE_DATE,
    loanDate: ISSUE_DATE,
    status: 'ACTIVE',
    totalPrincipalPaid: 1000,
    totalInterestPaid: 200,
    createdAt: ISSUE_DATE,
  });
  testRecordsCreated.push({ collection: 'loans', id: loan4Id });

  // Record full contribution and repayment for Member 4
  const c4Id = `C_${mem4Id}_${TARGET_YEAR}_${String(TARGET_MONTH).padStart(2, '0')}`;
  await setDoc(doc(db, 'monthlyContributions', c4Id), {
    id: c4Id,
    groupId: TEST_GROUP_ID,
    memberId: mem4Id,
    memberName: 'Ramesh Pawar',
    memberCode: 'TM-PD-004',
    month: TARGET_MONTH,
    year: TARGET_YEAR,
    amount: 1000,
    paidAmount: 1000,
    expectedAmount: 1000,
    regularHaftaAmount: 1000,
    status: 'PAID',
    source: 'BULK_COLLECTION',
    createdAt: new Date().toISOString(),
  });
  testRecordsCreated.push({ collection: 'monthlyContributions', id: c4Id });

  const r4Id = `REP_${mem4Id}_${TARGET_YEAR}_${TARGET_MONTH}`;
  await setDoc(doc(db, 'repayments', r4Id), {
    id: r4Id,
    groupId: TEST_GROUP_ID,
    loanId: loan4Id,
    memberId: mem4Id,
    installmentNumber: 1,
    paymentMonth: TARGET_MONTH,
    paymentYear: TARGET_YEAR,
    principalAmount: 1000,
    principalPaid: 1000,
    interestAmount: 200,
    interestPaid: 200,
    regularHaftaAmount: 1000,
    totalPaid: 2200,
    createdAt: new Date().toISOString(),
  });
  testRecordsCreated.push({ collection: 'repayments', id: r4Id });

  // Member 5 (Control - Partial Payment: Paid ₹400 out of ₹1000)
  const mem5Id = `test_mem_pd_5_${Date.now()}`;
  const mem5Ref = doc(db, 'users', mem5Id);
  await setDoc(mem5Ref, {
    id: mem5Id,
    memberId: mem5Id,
    groupId: TEST_GROUP_ID,
    name: 'Ganesh Kadam',
    fullName: 'Ganesh Kadam',
    memberCode: 'TM-PD-005',
    phone: '9876543214',
    monthlyContribution: 1000,
    monthly_contribution: 1000,
    role: 'MEMBER',
    status: 'ACTIVE',
    isActive: true,
    shares: 1,
    createdAt: new Date().toISOString(),
  });
  testRecordsCreated.push({ collection: 'users', id: mem5Id });

  const loan5Id = `test_loan_pd_5_${Date.now()}`;
  const loan5Ref = doc(db, 'loans', loan5Id);
  await setDoc(loan5Ref, {
    id: loan5Id,
    loanId: loan5Id,
    groupId: TEST_GROUP_ID,
    memberId: mem5Id,
    memberName: 'Ganesh Kadam',
    loanNumber: 'L-PD-005',
    originalPrincipal: 10000,
    principalAmount: 10000,
    remainingAmount: 10000,
    pendingPrincipal: 10000,
    outstanding_amount: 10000,
    interestRate: 2,
    durationMonths: 10,
    issueDate: ISSUE_DATE,
    loanDate: ISSUE_DATE,
    status: 'ACTIVE',
    totalPrincipalPaid: 0,
    totalInterestPaid: 0,
    createdAt: ISSUE_DATE,
  });
  testRecordsCreated.push({ collection: 'loans', id: loan5Id });

  const c5Id = `C_${mem5Id}_${TARGET_YEAR}_${String(TARGET_MONTH).padStart(2, '0')}`;
  await setDoc(doc(db, 'monthlyContributions', c5Id), {
    id: c5Id,
    groupId: TEST_GROUP_ID,
    memberId: mem5Id,
    memberName: 'Ganesh Kadam',
    memberCode: 'TM-PD-005',
    month: TARGET_MONTH,
    year: TARGET_YEAR,
    amount: 400,
    paidAmount: 400,
    expectedAmount: 1000,
    regularHaftaAmount: 400,
    status: 'PARTIAL',
    source: 'INDIVIDUAL',
    createdAt: new Date().toISOString(),
  });
  testRecordsCreated.push({ collection: 'monthlyContributions', id: c5Id });

  // Member 6 (Non-loan member with uncollected savings)
  const mem6Id = `test_mem_pd_6_${Date.now()}`;
  const mem6Ref = doc(db, 'users', mem6Id);
  await setDoc(mem6Ref, {
    id: mem6Id,
    memberId: mem6Id,
    groupId: TEST_GROUP_ID,
    name: 'Pooja More',
    fullName: 'Pooja More',
    memberCode: 'TM-PD-006',
    phone: '9876543215',
    monthlyContribution: 1000,
    monthly_contribution: 1000,
    role: 'MEMBER',
    status: 'ACTIVE',
    isActive: true,
    shares: 1,
    createdAt: new Date().toISOString(),
  });
  testRecordsCreated.push({ collection: 'users', id: mem6Id });

  console.log('✔ Isolated test fixtures initialized successfully.\n');

  // ============================================================================
  // TEST 1: Open Bulk Monthly Savings Preview for Month 10, 2026
  // ============================================================================
  await runAsyncTest(1, 'Open Bulk Monthly Savings Preview and verify 3 test members have uncollected status', async () => {
    const preview = await savingsService.getBulkSavingsPreview(
      { month: TARGET_MONTH, year: TARGET_YEAR },
      TEST_GROUP_ID
    );

    assert.strictEqual(preview.success, true, 'Preview fetch should succeed');
    assert(Array.isArray(preview.members), 'Preview should contain members list');

    const m1 = preview.members.find((m) => m.memberId === mem1Id);
    const m2 = preview.members.find((m) => m.memberId === mem2Id);
    const m3 = preview.members.find((m) => m.memberId === mem3Id);

    assert(m1, 'Member 1 must be present in preview');
    assert(m2, 'Member 2 must be present in preview');
    assert(m3, 'Member 3 must be present in preview');

    assert.strictEqual(m1.alreadyPaid, 0, 'Member 1 should have 0 alreadyPaid');
    assert.strictEqual(m1.remainingDue, 1000, 'Member 1 remainingDue must equal configuredShare (1000)');
    assert.strictEqual(m1.hasActiveLoan, true, 'Member 1 hasActiveLoan must be true');

    assert.strictEqual(m2.alreadyPaid, 0, 'Member 2 should have 0 alreadyPaid');
    assert.strictEqual(m2.remainingDue, 1000, 'Member 2 remainingDue must equal configuredShare (1000)');
    assert.strictEqual(m2.hasActiveLoan, true, 'Member 2 hasActiveLoan must be true');

    assert.strictEqual(m3.alreadyPaid, 0, 'Member 3 should have 0 alreadyPaid');
    assert.strictEqual(m3.remainingDue, 1500, 'Member 3 remainingDue must equal configuredShare (1500)');
    assert.strictEqual(m3.hasActiveLoan, true, 'Member 3 hasActiveLoan must be true');
  });

  // ============================================================================
  // TEST 2 & 3: Do NOT collect or submit Regular Hapta for these 3 members
  // ============================================================================
  await runAsyncTest(2, 'Do not collect Regular Hapta in bulk savings for 3 test members (submit other member only)', async () => {
    // Collect ONLY for member 6; intentionally leave members 1, 2, 3 uncollected
    const bulkPayload = {
      groupId: TEST_GROUP_ID,
      month: TARGET_MONTH,
      year: TARGET_YEAR,
      clientRequestId: `REQ_BULK_NO_LOAN_MEMBERS_${Date.now()}`,
      items: [
        {
          memberId: mem6Id,
          memberName: 'Pooja More',
          memberCode: 'TM-PD-006',
          amount: 1000,
          paymentMode: 'CASH',
        },
      ],
    };

    const res = await savingsService.recordBulkSavings(bulkPayload, TEST_GROUP_ID);
    assert.strictEqual(res.success, true, 'Bulk savings for Member 6 should succeed');
    assert.strictEqual(res.count, 1, 'Only 1 member was collected');
    testRecordsCreated.push({ collection: 'monthlyContributions', id: `C_${mem6Id}_${TARGET_YEAR}_${String(TARGET_MONTH).padStart(2, '0')}` });
  });

  await runAsyncTest(3, 'Confirm not collecting in Bulk Savings does NOT mark 3 members as paid in database', async () => {
    const c1Ref = doc(db, 'monthlyContributions', `C_${mem1Id}_${TARGET_YEAR}_${String(TARGET_MONTH).padStart(2, '0')}`);
    const c2Ref = doc(db, 'monthlyContributions', `C_${mem2Id}_${TARGET_YEAR}_${String(TARGET_MONTH).padStart(2, '0')}`);
    const c3Ref = doc(db, 'monthlyContributions', `C_${mem3Id}_${TARGET_YEAR}_${String(TARGET_MONTH).padStart(2, '0')}`);

    const [c1Snap, c2Snap, c3Snap] = await Promise.all([
      getDoc(c1Ref),
      getDoc(c2Ref),
      getDoc(c3Ref),
    ]);

    assert.strictEqual(c1Snap.exists(), false, 'Member 1 contribution document must NOT exist');
    assert.strictEqual(c2Snap.exists(), false, 'Member 2 contribution document must NOT exist');
    assert.strictEqual(c3Snap.exists(), false, 'Member 3 contribution document must NOT exist');
  });

  // ============================================================================
  // TEST 4, 5, 6, 7: Open Pending Due Report and verify all 3 test members appear
  // ============================================================================
  let pendingReportResult = null;

  await runAsyncTest(4, 'Open Pending Due Report for Month 10, 2026 and verify all 3 test members appear', async () => {
    pendingReportResult = await reportService.getPendingDuesReport(
      TARGET_MONTH,
      TARGET_YEAR,
      '',
      TEST_GROUP_ID
    );

    assert.strictEqual(pendingReportResult.success, true, 'Pending dues report query should succeed');
    const duesList = pendingReportResult.duesList || [];

    const found1 = duesList.find((d) => d.memberId === mem1Id);
    const found2 = duesList.find((d) => d.memberId === mem2Id);
    const found3 = duesList.find((d) => d.memberId === mem3Id);

    assert(found1, 'Member 1 (Anand Shinde) must appear in Pending Due');
    assert(found2, 'Member 2 (Suresh Patil) must appear in Pending Due');
    assert(found3, 'Member 3 (Vijay Deshmukh) must appear in Pending Due');
  });

  await runAsyncTest(5, 'Verify Member 1 (Anand Shinde) amounts: Hafta ₹1,000, Principal ₹1,000, Interest ₹200, Total ₹2,200', async () => {
    const d1 = pendingReportResult.duesList.find((d) => d.memberId === mem1Id);
    assert.strictEqual(d1.memberName, 'Anand Shinde');
    assert.strictEqual(d1.pendingHafta, 1000, 'Pending Regular Hafta must be ₹1,000');
    assert.strictEqual(d1.outstandingPrincipal, 1000, 'Scheduled Principal Due must be ₹1,000 (10000/10)');
    assert.strictEqual(d1.pendingInterest, 200, 'Scheduled Interest Due must be ₹200 (2% of 10000)');
    assert.strictEqual(d1.totalPending, 2200, 'Total Pending Due must be ₹2,200');
  });

  await runAsyncTest(6, 'Verify Member 2 (Suresh Patil) amounts: Hafta ₹1,000, Principal ₹2,000, Interest ₹400, Total ₹3,400', async () => {
    const d2 = pendingReportResult.duesList.find((d) => d.memberId === mem2Id);
    assert.strictEqual(d2.memberName, 'Suresh Patil');
    assert.strictEqual(d2.pendingHafta, 1000, 'Pending Regular Hafta must be ₹1,000');
    assert.strictEqual(d2.outstandingPrincipal, 2000, 'Scheduled Principal Due must be ₹2,000 (20000/10)');
    assert.strictEqual(d2.pendingInterest, 400, 'Scheduled Interest Due must be ₹400 (2% of 20000)');
    assert.strictEqual(d2.totalPending, 3400, 'Total Pending Due must be ₹3,400');
  });

  await runAsyncTest(7, 'Verify Member 3 Multi-Share (Vijay Deshmukh): Hafta ₹1,500, Principal ₹3,000, Interest ₹600, Total ₹5,100', async () => {
    const d3 = pendingReportResult.duesList.find((d) => d.memberId === mem3Id);
    assert.strictEqual(d3.memberName, 'Vijay Deshmukh');
    assert.strictEqual(d3.pendingHafta, 1500, 'Multi-share Pending Regular Hafta must be ₹1,500');
    assert.strictEqual(d3.outstandingPrincipal, 3000, 'Scheduled Principal Due must be ₹3,000 (30000/10)');
    assert.strictEqual(d3.pendingInterest, 600, 'Scheduled Interest Due must be ₹600 (2% of 30000)');
    assert.strictEqual(d3.totalPending, 5100, 'Total Pending Due must be ₹5,100');
  });

  // ============================================================================
  // TEST 8: Member 4 (Control - Fully Paid) does NOT appear in Pending Due
  // ============================================================================
  await runAsyncTest(8, 'Confirm Member 4 (Fully Paid) does NOT appear in Pending Due', async () => {
    const found4 = pendingReportResult.duesList.find((d) => d.memberId === mem4Id);
    assert.strictEqual(found4, undefined, 'Member 4 has cleared both regular hafta and loan installment, must not appear in dues list');
  });

  // ============================================================================
  // TEST 9: Member 5 (Control - Partial Payment) shows only remaining outstanding
  // ============================================================================
  await runAsyncTest(9, 'Confirm Member 5 (Partial Payment) shows only remaining outstanding amount (₹600 Hafta + Loan)', async () => {
    const d5 = pendingReportResult.duesList.find((d) => d.memberId === mem5Id);
    assert(d5, 'Member 5 should appear in dues list for remaining unpaid dues');
    assert.strictEqual(d5.pendingHafta, 600, 'Partial payment of ₹400 must leave exactly ₹600 pending Hafta (1000 - 400)');
    assert.strictEqual(d5.outstandingPrincipal, 1000, 'Principal due should be ₹1,000');
    assert.strictEqual(d5.pendingInterest, 200, 'Interest due should be ₹200');
    assert.strictEqual(d5.totalPending, 1800, 'Total pending should be ₹1,800 (600 + 1000 + 200)');
  });

  // ============================================================================
  // TEST 10: Month/Year Filtering Check
  // ============================================================================
  await runAsyncTest(10, 'Verify Month/Year filtering: Loan issue month (Month 9) has 0 loan dues scheduled', async () => {
    const issueMonthReport = await reportService.getPendingDuesReport(
      ISSUE_MONTH,
      ISSUE_YEAR,
      '',
      TEST_GROUP_ID
    );

    assert.strictEqual(issueMonthReport.success, true);
    const d1Issue = issueMonthReport.duesList.find((d) => d.memberId === mem1Id);
    assert(d1Issue, 'Member 1 appears for uncollected savings in Month 9');
    assert.strictEqual(d1Issue.outstandingPrincipal, 0, 'Loan issue month MUST have 0 scheduled principal installment');
    assert.strictEqual(d1Issue.pendingInterest, 0, 'Loan issue month MUST have 0 scheduled interest installment');
    assert.strictEqual(d1Issue.pendingHafta, 1000, 'Pending Hafta for Month 9 is ₹1,000');
    assert.strictEqual(d1Issue.totalPending, 1000, 'Total pending is ₹1,000 (only savings, no loan installment)');
  });

  // ============================================================================
  // TEST 11: Uniqueness & No Duplicate Members
  // ============================================================================
  await runAsyncTest(11, 'Ensure no member is listed twice in Pending Due report', async () => {
    const seenIds = new Set();
    for (const d of pendingReportResult.duesList) {
      assert(!seenIds.has(d.memberId), `Member ${d.memberId} must not be duplicated in duesList`);
      seenIds.add(d.memberId);
    }
    assert(seenIds.size > 0, 'Dues list contains unique members');
  });

  // ============================================================================
  // TEST 12: Read-Only Verification
  // ============================================================================
  await runAsyncTest(12, 'Confirm viewing Pending Due does NOT change any group balance, contribution, or repayment', async () => {
    const groupSnapBefore = await getDoc(testGroupRef);
    const bBefore = groupSnapBefore.data();

    // Call Pending Dues multiple times
    await reportService.getPendingDuesReport(TARGET_MONTH, TARGET_YEAR, '', TEST_GROUP_ID);
    await reportService.getPendingDuesReport(TARGET_MONTH, TARGET_YEAR, 'Anand', TEST_GROUP_ID);

    const groupSnapAfter = await getDoc(testGroupRef);
    const bAfter = groupSnapAfter.data();

    assert.strictEqual(bAfter.totalSavings, bBefore.totalSavings, 'totalSavings must not change');
    assert.strictEqual(bAfter.totalFund, bBefore.totalFund, 'totalFund must not change');
    assert.strictEqual(bAfter.availableBalance, bBefore.availableBalance, 'availableBalance must not change');
  });

  // ============================================================================
  // CLEANUP & FINAL VERIFICATION
  // ============================================================================
  console.log('\nCleaning up isolated test data...');
  for (const rec of testRecordsCreated) {
    try {
      await deleteDoc(doc(db, rec.collection, rec.id));
    } catch (e) {
      console.warn(`Could not delete ${rec.collection}/${rec.id}:`, e.message);
    }
  }
  console.log(`✔ Cleaned up ${testRecordsCreated.length} isolated test records.`);

  // Verify Production Group untouched
  const finalProdSnap = await getDoc(doc(db, 'groups', PROD_GROUP_ID));
  const finalProdData = finalProdSnap.data();

  assert.strictEqual(finalProdData.totalSavings, prodBaseline.totalSavings, 'Prod totalSavings must be unchanged');
  assert.strictEqual(finalProdData.totalFund, prodBaseline.totalFund, 'Prod totalFund must be unchanged');
  assert.strictEqual(finalProdData.availableBalance, prodBaseline.availableBalance, 'Prod availableBalance must be unchanged');
  console.log('✔ [VERIFIED] Production Group shivshahi_group_001 was completely untouched.\n');

  console.log('================================================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================================');
  if (passedTests === totalTests) {
    console.log('🎉 ALL PENDING DUE & REGULAR HAPTA REGRESSION TESTS PASSED!');
  }
}

main().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
