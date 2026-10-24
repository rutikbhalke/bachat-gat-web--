import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireClient = createRequire(path.join(__dirname, '../client/package.json'));
const { signInWithEmailAndPassword } = requireClient('firebase/auth');

const {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  firebaseConfig,
} = await import('../client/src/config/firebase.js');

const { memberService } = await import('../client/src/services/memberService.js');
const { groupService } = await import('../client/src/services/groupService.js');
const { savingsService } = await import('../client/src/services/savingsService.js');
const { calculateGroupFinancialSummary, calculateMemberFinancialSummary } = await import('../client/src/services/financialService.js');

const GROUP_ID = 'shivshahi_group_001';
const EXPECTED_PROJECT_ID = 'bachat-gat-32ffe';
const ALLOCATION_PER_MEMBER = 120000;
const EXPECTED_TOTAL_ALLOCATION = 5160000;
const OUTBOX_FILE = path.join(__dirname, '../server/data/sync_outbox.json');

async function signInWithRetry(auth, email, password, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`Sign in attempt ${attempt} failed: ${err.message}. Retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function getDocsWithRetry(colRef, minExpected = 0, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const snap = await getDocs(colRef);
      if (snap.size >= minExpected) return snap;
      console.warn(`Attempt ${attempt}: fetched ${snap.size} docs (expected at least ${minExpected}), retrying in 2s...`);
    } catch (e) {
      console.warn(`Attempt ${attempt} error: ${e.message}, retrying in 2s...`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return await getDocs(colRef);
}

async function batchDeleteDocs(docs, label) {
  if (!docs || docs.length === 0) return 0;
  const CHUNK_SIZE = 400;
  let deleted = 0;
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const d of chunk) {
      batch.delete(d.ref);
    }
    await batch.commit();
    deleted += chunk.length;
    console.log(`  ✔ Batch deleted ${deleted}/${docs.length} from [${label}]`);
  }
  return deleted;
}

async function main() {
  console.log('================================================================================');
  console.log('PHASE 3: EXECUTING RESET AND ₹1,20,000 PER MEMBER BASE-SAVINGS ALLOCATION');
  console.log('Project: ' + firebaseConfig.projectId + ' | Group: ' + GROUP_ID);
  console.log('================================================================================\n');

  // Guard 1: Verify target project
  assert.strictEqual(
    firebaseConfig.projectId,
    EXPECTED_PROJECT_ID,
    `FATAL: Target project must be ${EXPECTED_PROJECT_ID}, found ${firebaseConfig.projectId}`
  );
  console.log(`✔ Guard passed: Target project strictly verified as '${EXPECTED_PROJECT_ID}'.`);
  console.log(`✔ Guard passed: Flutter project bachatgatapp-5158 will NOT be touched.\n`);

  // Guard 2: Authenticate as admin
  await signInWithRetry(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // Guard 3: Confirm pre-execution backup exists
  const backupFile = path.join(__dirname, '../database_backup_fresh_before_zero_reset.json');
  assert(fs.existsSync(backupFile), 'FATAL: Safety backup file database_backup_fresh_before_zero_reset.json must exist');
  const backupStat = fs.statSync(backupFile);
  assert(backupStat.size > 10000, 'FATAL: Backup file must be valid (>10KB)');
  console.log(`✔ Guard passed: Verified pre-execution safety backup exists (${(backupStat.size / 1024).toFixed(2)} KB).\n`);

  // ---------------------------------------------------------------------------
  // STEP 1: Fetch and validate all members and users prior to allocation
  // ---------------------------------------------------------------------------
  const preUsersSnap = await getDocsWithRetry(collection(db, 'users'), 43, 4);
  const regMembers = preUsersSnap.docs
    .filter(d => /^REG_\d+$/.test(d.id))
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  assert.strictEqual(regMembers.length, 43, `Expected exactly 43 approved members, found ${regMembers.length}`);
  for (let i = 1; i <= 43; i++) {
    const expectedId = `REG_${String(i).padStart(3, '0')}`;
    const found = regMembers.find(m => m.id === expectedId);
    assert(found, `Target member ${expectedId} must exist`);
    assert(found.name, `Member ${expectedId} must have Marathi name`);
  }
  console.log(`✔ Verified: Exactly 43 approved members (REG_001 to REG_043) present with Marathi names.`);

  // ---------------------------------------------------------------------------
  // STEP 2: Clear any remaining demo financial records
  // ---------------------------------------------------------------------------
  console.log('\n--- Clearing Any Remaining Demo Financial Records (Atomic Batches) ---');
  const [contribSnap, loansSnap, repaySnap, txSnap] = await Promise.all([
    getDocs(collection(db, 'monthlyContributions')),
    getDocs(collection(db, 'loans')),
    getDocs(collection(db, 'repayments')),
    getDocs(collection(db, 'transactions')),
  ]);

  console.log(`Remaining demo docs: ${contribSnap.size} contributions, ${loansSnap.size} loans, ${repaySnap.size} repayments, ${txSnap.size} transactions.`);

  await batchDeleteDocs(contribSnap.docs, 'monthlyContributions');
  await batchDeleteDocs(loansSnap.docs, 'loans');
  await batchDeleteDocs(repaySnap.docs, 'repayments');
  await batchDeleteDocs(txSnap.docs, 'transactions');
  console.log('✔ All demo financial records successfully cleared.');

  // Clean sync outbox queue if present
  if (fs.existsSync(OUTBOX_FILE)) {
    fs.writeFileSync(OUTBOX_FILE, JSON.stringify([], null, 2), 'utf8');
    console.log('✔ Reset server sync outbox file (server/data/sync_outbox.json).');
  }

  // ---------------------------------------------------------------------------
  // STEP 3: Record ₹1,20,000 for each of the 43 members as opening base capital
  // ---------------------------------------------------------------------------
  console.log('\n--- Allocating ₹1,20,000 Base Savings for Each Approved Member ---');
  const nowIso = new Date().toISOString();
  const writeOps = [];

  for (const m of regMembers) {
    const memberId = m.id;
    const memberName = m.name || m.fullName || 'Member';
    const contribDocId = `C_${memberId}_BASE_SAVINGS`;
    const txDocId = `ACT_${memberId}_base_savings`;

    // 1. Base Contribution document
    const contribPayload = {
      id: contribDocId,
      contribId: contribDocId,
      contrib_id: contribDocId,
      groupId: GROUP_ID,
      group_id: GROUP_ID,
      memberId,
      member_id: memberId,
      memberName,
      member_name: memberName,
      memberCode: m.memberCode || m.member_code || '',
      member_code: m.memberCode || m.member_code || '',
      amount: ALLOCATION_PER_MEMBER,
      paidAmount: ALLOCATION_PER_MEMBER,
      paid_amount: ALLOCATION_PER_MEMBER,
      expectedAmount: ALLOCATION_PER_MEMBER,
      expected_amount: ALLOCATION_PER_MEMBER,
      regularHaftaAmount: ALLOCATION_PER_MEMBER,
      regular_hafta_amount: ALLOCATION_PER_MEMBER,
      totalPaid: ALLOCATION_PER_MEMBER,
      total_paid: ALLOCATION_PER_MEMBER,
      loanPrincipalPaid: 0,
      interestAmount: 0,
      month: 0, // Canonical base month
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
    writeOps.push({ type: 'set', ref: doc(db, 'monthlyContributions', contribDocId), data: contribPayload });

    // 2. Activity transaction document
    const txPayload = {
      id: txDocId,
      groupId: GROUP_ID,
      type: 'SAVINGS_DEPOSIT',
      type_flutter: 'monthlyInvestment',
      amount: ALLOCATION_PER_MEMBER,
      description: `Opening savings capital of ₹1,20,000 allocated for ${memberName}`,
      memberId,
      memberName,
      referenceId: contribDocId,
      date: nowIso,
      createdAt: nowIso,
    };
    writeOps.push({ type: 'set', ref: doc(db, 'transactions', txDocId), data: txPayload });

    // 3. Update member document (ONLY update savings fields, preserving all profile data!)
    writeOps.push({
      type: 'update',
      ref: doc(db, 'users', memberId),
      data: {
        totalSavings: ALLOCATION_PER_MEMBER,
        total_savings: ALLOCATION_PER_MEMBER,
        updatedAt: nowIso,
      },
    });
  }

  // 4. Update group totals on shivshahi_group_001
  writeOps.push({
    type: 'update',
    ref: doc(db, 'groups', GROUP_ID),
    data: {
      totalSavings: EXPECTED_TOTAL_ALLOCATION,
      total_savings: EXPECTED_TOTAL_ALLOCATION,
      availableBalance: EXPECTED_TOTAL_ALLOCATION,
      available_balance: EXPECTED_TOTAL_ALLOCATION,
      rawAvailableBalance: EXPECTED_TOTAL_ALLOCATION,
      totalFund: EXPECTED_TOTAL_ALLOCATION,
      total_fund: EXPECTED_TOTAL_ALLOCATION,
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

  console.log(`Executing ${writeOps.length} write operations via batched writes...`);
  const CHUNK_SIZE = 400;
  for (let i = 0; i < writeOps.length; i += CHUNK_SIZE) {
    const chunk = writeOps.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === 'set') batch.set(op.ref, op.data, { merge: true });
      else if (op.type === 'update') batch.update(op.ref, op.data);
    }
    await batch.commit();
    console.log(`✔ Committed batch chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} ops).`);
  }

  console.log('\n✔ PHASE 3 EXECUTION COMPLETED SUCCESSFULLY.');

  // ===========================================================================
  // PHASE 4: DIRECT FIRESTORE READ-BACK VERIFICATION
  // ===========================================================================
  console.log('\n================================================================================');
  console.log('PHASE 4: DIRECT FIRESTORE READ-BACK & COMPREHENSIVE VERIFICATION');
  console.log('================================================================================\n');

  // 1. Verify Users Collection
  console.log('1. Verifying Users Collection...');
  const postUsersSnap = await getDocsWithRetry(collection(db, 'users'), 44, 4);
  assert.strictEqual(postUsersSnap.size, 44, `Users collection must contain exactly 44 documents, found ${postUsersSnap.size}`);

  const postApprovedMembers = postUsersSnap.docs
    .filter(d => /^REG_\d+$/.test(d.id))
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  assert.strictEqual(postApprovedMembers.length, 43, `Must find exactly 43 approved members, found ${postApprovedMembers.length}`);

  for (let i = 1; i <= 43; i++) {
    const expectedId = `REG_${String(i).padStart(3, '0')}`;
    const m = postApprovedMembers.find(mem => mem.id === expectedId);
    assert(m, `Approved member ${expectedId} missing!`);
    assert(m.name, `Member ${expectedId} name missing!`);
    assert.strictEqual(m.totalSavings, ALLOCATION_PER_MEMBER, `Member ${expectedId} totalSavings must be 120000, got ${m.totalSavings}`);
    assert.strictEqual(m.total_savings, ALLOCATION_PER_MEMBER, `Member ${expectedId} total_savings must be 120000, got ${m.total_savings}`);
  }

  const adminUser = postUsersSnap.docs.find(d => !/^REG_\d+$/.test(d.id));
  assert(adminUser, 'Admin user account missing!');
  assert.strictEqual(adminUser.data().email, 'admin@bachatgat.com', 'Admin email must remain admin@bachatgat.com');
  console.log(`✔ Users verified: 44 total accounts (43 approved members with Marathi names + 1 admin account).`);

  // 2. Verify monthlyContributions Collection
  console.log('\n2. Verifying monthlyContributions Collection...');
  const postContribSnap = await getDocsWithRetry(collection(db, 'monthlyContributions'), 43, 4);
  assert.strictEqual(postContribSnap.size, 43, `monthlyContributions must contain exactly 43 documents, found ${postContribSnap.size}`);

  let totalAllocatedSum = 0;
  for (let i = 1; i <= 43; i++) {
    const memberId = `REG_${String(i).padStart(3, '0')}`;
    const expectedDocId = `C_${memberId}_BASE_SAVINGS`;
    const docSnap = postContribSnap.docs.find(d => d.id === expectedDocId);
    assert(docSnap, `Missing contribution document ${expectedDocId}`);
    const data = docSnap.data();
    assert.strictEqual(data.memberId, memberId);
    assert.strictEqual(data.amount, ALLOCATION_PER_MEMBER);
    assert.strictEqual(data.paidAmount, ALLOCATION_PER_MEMBER);
    assert.strictEqual(data.status, 'paid');
    assert.strictEqual(data.isBase, true);
    assert.strictEqual(data.type, 'BASE_SAVINGS');
    assert.strictEqual(data.month, 0);
    assert.strictEqual(data.year, 2026);
    assert.strictEqual(data.paymentMode, 'OPENING_BALANCE');
    totalAllocatedSum += data.paidAmount;
  }
  assert.strictEqual(totalAllocatedSum, EXPECTED_TOTAL_ALLOCATION);
  console.log(`✔ monthlyContributions verified: Exactly 43 base savings records (sum: ₹${totalAllocatedSum.toLocaleString('en-IN')}).`);

  // 3. Verify Loans & Repayments Collections
  console.log('\n3. Verifying Loans & Repayments Collections...');
  const [postLoansSnap, postRepaySnap] = await Promise.all([
    getDocs(collection(db, 'loans')),
    getDocs(collection(db, 'repayments')),
  ]);
  assert.strictEqual(postLoansSnap.size, 0, `Loans collection must be 0, found ${postLoansSnap.size}`);
  assert.strictEqual(postRepaySnap.size, 0, `Repayments collection must be 0, found ${postRepaySnap.size}`);
  console.log(`✔ Loans & Repayments verified: Exactly 0 loans and 0 repayments.`);

  // 4. Verify Transactions Collection
  console.log('\n4. Verifying Transactions Collection...');
  const postTxSnap = await getDocsWithRetry(collection(db, 'transactions'), 43, 4);
  assert.strictEqual(postTxSnap.size, 43, `Transactions must contain exactly 43 records, found ${postTxSnap.size}`);
  
  const txIds = new Set();
  for (const d of postTxSnap.docs) {
    assert(!txIds.has(d.id), `Duplicate transaction ID detected: ${d.id}`);
    txIds.add(d.id);
    const data = d.data();
    assert(d.id.startsWith('ACT_REG_') && d.id.endsWith('_base_savings'), `Unexpected tx ID: ${d.id}`);
    assert.strictEqual(data.amount, ALLOCATION_PER_MEMBER);
    assert.strictEqual(data.type, 'SAVINGS_DEPOSIT');
    assert(data.referenceId.startsWith('C_REG_'));
  }
  console.log(`✔ Transactions verified: Exactly 43 unique opening capital transactions with zero duplicates.`);

  // 5. Verify Group Financial Totals
  console.log('\n5. Verifying Group Document Totals on shivshahi_group_001...');
  const postGroupDoc = await getDoc(doc(db, 'groups', GROUP_ID));
  assert(postGroupDoc.exists(), `Group document ${GROUP_ID} must exist`);
  const gData = postGroupDoc.data();
  assert.strictEqual(gData.totalSavings, EXPECTED_TOTAL_ALLOCATION);
  assert.strictEqual(gData.availableBalance, EXPECTED_TOTAL_ALLOCATION);
  assert.strictEqual(gData.totalFund, EXPECTED_TOTAL_ALLOCATION);
  assert.strictEqual(gData.activeLoans, 0);
  assert.strictEqual(gData.totalOutstandingLoans, 0);
  console.log(` - totalSavings:      ₹${gData.totalSavings.toLocaleString('en-IN')}`);
  console.log(` - availableBalance:  ₹${gData.availableBalance.toLocaleString('en-IN')}`);
  console.log(` - totalFund:          ₹${gData.totalFund.toLocaleString('en-IN')}`);
  console.log(` - activeLoans:        ₹${gData.activeLoans}`);
  console.log(`✔ Group document verified: Reflects exactly ₹51,60,000 savings and available cash.`);

  // 6. Verify October 2026 Monthly Dues
  console.log('\n6. Verifying October 2026 Monthly Dues across all 43 members...');
  const memRes = await memberService.getAllMembers({ month: 10, year: 2026 }, GROUP_ID);
  const nonAdminMembers = memRes.members.filter(m => /^REG_\d+$/.test(m.id));
  assert.strictEqual(nonAdminMembers.length, 43, `Expected 43 members from memberService, got ${nonAdminMembers.length}`);

  let pendingCount = 0;
  for (const m of nonAdminMembers) {
    assert.strictEqual(m.totalSavings, ALLOCATION_PER_MEMBER, `Member ${m.id} totalSavings must be ₹1,20,000`);
    assert.strictEqual(m.monthlyContribution, 1000, `Member ${m.id} monthlyContribution must be 1000`);
    assert.strictEqual(m.isPaid, false, `Member ${m.id} isPaid for October 2026 must be false`);
    assert(m.dueStatus && m.dueStatus.toLowerCase() === 'pending', `Member ${m.id} dueStatus must be pending, got ${m.dueStatus}`);
    assert.strictEqual(m.pendingAmount, 1000, `Member ${m.id} pendingAmount must be 1000`);
    pendingCount++;
  }
  console.log(`✔ October 2026 Dues verified: All 43/43 members have October dues as 'Pending' (₹1,000 unpaid).`);

  // Verify next unpaid savings period
  for (const m of nonAdminMembers) {
    const memberBaseContrib = postContribSnap.docs.map(d => d.data()).filter(c => c.memberId === m.id);
    const nextPeriod = savingsService.calculateNextUnpaidSavingsPeriod(memberBaseContrib);
    assert.strictEqual(nextPeriod.month, 10, `Next unpaid month for ${m.id} must be 10`);
    assert.strictEqual(nextPeriod.year, 2026, `Next unpaid year for ${m.id} must be 2026`);
  }
  console.log(`✔ Next unpaid period verified: October 2026 for all 43 members.`);

  // 7. Verify Application Financial Calculation Aggregation
  console.log('\n7. Verifying Application Financial Calculation Aggregation...');
  const normalizedSavings = postContribSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const normalizedTxs = postTxSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const calcSummary = calculateGroupFinancialSummary(normalizedSavings, [], [], normalizedTxs);
  assert.strictEqual(calcSummary.totalGroupSavings, EXPECTED_TOTAL_ALLOCATION);
  assert.strictEqual(calcSummary.availableBalance, EXPECTED_TOTAL_ALLOCATION);
  assert.strictEqual(calcSummary.totalGroupFund, EXPECTED_TOTAL_ALLOCATION);
  assert.strictEqual(calcSummary.activeLoansOutstanding, 0);
  console.log(`✔ Application financial aggregation verified: Zero double-counting, exact ₹51,60,000.`);

  // Save verification results to JSON
  const verificationReport = {
    timestamp: new Date().toISOString(),
    projectId: firebaseConfig.projectId,
    groupId: GROUP_ID,
    status: 'SUCCESS',
    documentsCount: {
      users: postUsersSnap.size,
      approvedMembers: postApprovedMembers.length,
      monthlyContributions: postContribSnap.size,
      loans: postLoansSnap.size,
      repayments: postRepaySnap.size,
      transactions: postTxSnap.size,
    },
    financialTotals: {
      totalSavings: gData.totalSavings,
      availableBalance: gData.availableBalance,
      totalFund: gData.totalFund,
      activeLoans: gData.activeLoans,
      totalOutstandingLoans: gData.totalOutstandingLoans,
    },
    october2026DuesPendingCount: pendingCount,
  };
  fs.writeFileSync(
    path.join(__dirname, '../scratch/post_execution_verification_report.json'),
    JSON.stringify(verificationReport, null, 2),
    'utf8'
  );

  console.log('\n================================================================================');
  console.log('✔✔ ALL PHASE 3 & PHASE 4 OPERATIONS COMPLETED & VERIFIED WITH 100% SUCCESS!');
  console.log('================================================================================\n');
}

main().catch(err => {
  console.error('\n❌ EXECUTION / VERIFICATION ENCOUNTERED AN ERROR:', err);
  process.exit(1);
});
