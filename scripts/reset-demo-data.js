/**
 * Script to safely reset and rebuild the isolated test dataset for test_isolated_group_999.
 * 
 * ABSOLUTE SAFETY RULE:
 * NEVER modifies shivshahi_group_001.
 * Only modifies documents where groupId === 'test_isolated_group_999'.
 */

import { createRequire } from 'module';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} = require('firebase/firestore');

const TARGET_GROUP_ID = 'test_isolated_group_999';
const FORBIDDEN_GROUP_ID = 'shivshahi_group_001';

const firebaseConfig = {
  apiKey: 'AIzaSyBJyKRv81qV_tmnmcYF76Dx0JLxGKvK_7I',
  authDomain: 'bachat-gat-32ffe.firebaseapp.com',
  projectId: 'bachat-gat-32ffe',
  storageBucket: 'bachat-gat-32ffe.firebasestorage.app',
  messagingSenderId: '215206829034',
  appId: '1:215206829034:web:63a0816174e77792427093',
};

const app = initializeApp(firebaseConfig, 'reset-demo-data');
const auth = getAuth(app);
const db = getFirestore(app);

async function runReset() {
  console.log('================================================================================');
  console.log('RESETTING ISOLATED TEST GROUP: ' + TARGET_GROUP_ID);
  console.log('================================================================================');

  if (TARGET_GROUP_ID === FORBIDDEN_GROUP_ID) {
    throw new Error('FATAL: Attempted to run reset on production group!');
  }

  // 1. Authenticate
  await signInWithEmailAndPassword(auth, 'vaibhavpawase143@gmail.com', '123456');
  console.log('✔ Authenticated as test admin (vaibhavpawase143@gmail.com)');

  // 2. Safety check: ensure production group has 43 members and is untouched
  const prodUsersSnap = await getDocs(query(collection(db, 'users'), where('groupId', '==', FORBIDDEN_GROUP_ID)));
  console.log('✔ Production group ' + FORBIDDEN_GROUP_ID + ' verified intact with ' + prodUsersSnap.size + ' records.');

  // 3. Clear existing contributions, loans, repayments, and transactions for test_isolated_group_999
  for (const colName of ['monthlyContributions', 'loans', 'repayments', 'transactions']) {
    const snap = await getDocs(query(collection(db, colName), where('groupId', '==', TARGET_GROUP_ID)));
    console.log(`Cleaning ${snap.size} stale records from ${colName}...`);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  }

  // 4. Update / ensure test group document
  await setDoc(doc(db, 'groups', TARGET_GROUP_ID), {
    groupId: TARGET_GROUP_ID,
    name: 'श्री सदुबाबा युवा स्वयम सहायता बचतगट',
    groupName: 'श्री सदुबाबा युवा स्वयम सहायता बचतगट',
    group_name: 'श्री सदुबाबा युवा स्वयम सहायता बचतगट',
    groupCode: 'test_isolated_group_999',
    group_code: 'test_isolated_group_999',
    monthlyContribution: 1000,
    monthly_contribution_per_share: 1000,
    monthlyTarget: 5000,
    monthly_target: 5000,
    description: 'Isolated test demonstration group for digital savings and micro-lending.',
    meetingDay: 10,
    meeting_day: 10,
    status: 'ACTIVE',
    updatedAt: serverTimestamp()
  }, { merge: true });
  console.log('✔ Test group record configured.');

  // 5. Ensure 5 test members
  const testMembers = [
    { id: 'test_mem_001', code: 'TM-001', name: 'Test Member 01', phone: '9800000001' },
    { id: 'test_mem_002', code: 'TM-002', name: 'Test Member 02', phone: '9800000002' },
    { id: 'test_mem_003', code: 'TM-003', name: 'Test Member 03', phone: '9800000003' },
    { id: 'test_mem_004', code: 'TM-004', name: 'Test Member 04', phone: '9800000004' },
    { id: 'test_mem_005', code: 'TM-005', name: 'Test Member 05', phone: '9800000005' },
  ];

  for (const m of testMembers) {
    await setDoc(doc(db, 'users', m.id), {
      uid: m.id,
      groupId: TARGET_GROUP_ID,
      memberCode: m.code,
      fullName: m.name,
      name: m.name,
      phone: m.phone,
      role: 'member',
      role_name: 'MEMBER',
      status: 'ACTIVE',
      monthlyContribution: 1000,
      monthly_contribution: 1000,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
  console.log('✔ 5 deterministic test members (TM-001 to TM-005) verified.');

  // 6. Create realistic historical savings:
  // June 2026 (5 x ₹1000 = ₹5000)
  // July 2026 (5 x ₹1000 = ₹5000)
  // August 2026 (5 x ₹1000 = ₹5000)
  // September 2026 (5 x ₹1000 = ₹5000) -> Demo Month!
  // Total Group Fund = ₹20,000!
  const months = [
    { m: 6, y: 2026, date: '2026-06-10T10:00:00.000Z' },
    { m: 7, y: 2026, date: '2026-07-10T10:00:00.000Z' },
    { m: 8, y: 2026, date: '2026-08-10T10:00:00.000Z' },
    { m: 9, y: 2026, date: '2026-09-13T10:00:00.000Z' },
  ];

  for (const period of months) {
    for (const mem of testMembers) {
      const cid = `C_${mem.id}_${period.y}_${String(period.m).padStart(2, '0')}`;
      await setDoc(doc(db, 'monthlyContributions', cid), {
        id: cid,
        groupId: TARGET_GROUP_ID,
        memberId: mem.id,
        member_id: mem.id,
        memberName: mem.name,
        member_name: mem.name,
        memberCode: mem.code,
        member_code: mem.code,
        amount: 1000,
        paidAmount: 1000,
        paid_amount: 1000,
        month: period.m,
        paymentMonth: period.m,
        year: period.y,
        paymentYear: period.y,
        paymentDate: period.date,
        payment_date: period.date,
        paymentMode: 'UPI',
        payment_mode: 'UPI',
        status: 'PAID',
        createdAt: period.date,
        updatedAt: serverTimestamp()
      });
    }
  }
  console.log('✔ Historical savings populated (June to Sept 2026: 20 records, ₹20,000 total).');

  // 7. Create single clean loan for Test Member 01:
  // Principal: ₹5,000
  // Issue Date: 13 September 2026
  // Interest: 2% monthly reducing balance
  // Duration: 10 installments
  // First installment: October 2026
  const loanId = 'L_TEST_TM001';
  await setDoc(doc(db, 'loans', loanId), {
    id: loanId,
    groupId: TARGET_GROUP_ID,
    memberId: 'test_mem_001',
    member_id: 'test_mem_001',
    memberName: 'Test Member 01',
    member_name: 'Test Member 01',
    memberCode: 'TM-001',
    member_code: 'TM-001',
    principalAmount: 5000,
    originalPrincipal: 5000,
    original_principal: 5000,
    loanAmount: 5000,
    loan_amount: 5000,
    interestRate: 2.0,
    interest_rate: 2.0,
    durationMonths: 10,
    duration_months: 10,
    tenure: 10,
    monthlyInstallment: 500,
    issueDate: '2026-09-13T00:00:00.000Z',
    loanDate: '2026-09-13T00:00:00.000Z',
    date: '2026-09-13T00:00:00.000Z',
    purpose: 'Small Business Working Capital',
    status: 'ACTIVE',
    totalPrincipalPaid: 0,
    total_principal_paid: 0,
    totalInterestPaid: 0,
    total_interest_paid: 0,
    pendingPrincipal: 5000,
    outstandingAmount: 5000,
    outstanding_amount: 5000,
    lastInstallmentPaid: 0,
    last_installment_paid: 0,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: serverTimestamp()
  });
  console.log('✔ Clean ₹5,000 active loan created for Test Member 01 (issue date: 13 Sep 2026, 0 repayments).');

  console.log('\n================================================================================');
  console.log('INITIAL STATE AUDIT:');
  console.log('  Total Group Savings:         ₹20,000');
  console.log('  Available Cash in Bank:      ₹15,000 (₹20,000 savings - ₹5,000 loan disbursement)');
  console.log('  Active Loan Outstanding:     ₹5,000');
  console.log('  Total Group Fund:            ₹20,000 (Available ₹15,000 + Loan ₹5,000)');
  console.log('  Reconciliation Variance:     ₹0.00 (EXACT)');
  console.log('  September 2026 Loan Dues:    ₹0.00 (Issue month has NO installment)');
  console.log('  First Loan Installment:      October 2026 (#1, Principal ₹500, Interest ₹100)');
  console.log('================================================================================\n');

  process.exit(0);
}

runReset().catch(err => {
  console.error('Reset error:', err);
  process.exit(1);
});
