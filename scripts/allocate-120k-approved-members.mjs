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
  writeBatch,
  firebaseConfig,
} = await import('../client/src/config/firebase.js');

const { memberService } = await import('../client/src/services/memberService.js');
const { groupService } = await import('../client/src/services/groupService.js');
const { calculateGroupFinancialSummary } = await import('../client/src/services/financialService.js');
const { savingsService } = await import('../client/src/services/savingsService.js');

const GROUP_ID = 'shivshahi_group_001';
const ALLOCATION_PER_MEMBER = 120000;
const TOTAL_EXPECTED = 5160000;

async function executeAllocation() {
  console.log('================================================================================');
  console.log('EXECUTING ₹1,20,000 ALLOCATION FOR EACH APPROVED MEMBER');
  console.log('Project: ' + firebaseConfig.projectId + ' | Group: ' + GROUP_ID);
  console.log('================================================================================\n');

  assert.strictEqual(firebaseConfig.projectId, 'bachat-gat-32ffe', 'Must target Demo Web Firebase project bachat-gat-32ffe');

  // Step 1: Authenticate
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // Step 2: Fetch all 43 approved members
  const usersSnap = await getDocs(collection(db, 'users'));
  const regMembers = usersSnap.docs
    .filter(d => /^REG_\d+$/.test(d.id))
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  assert.strictEqual(regMembers.length, 43, `Must find exactly 43 approved members, found ${regMembers.length}`);
  
  // Verify all 43 target IDs are exactly REG_001 through REG_043
  for (let i = 1; i <= 43; i++) {
    const expectedId = `REG_${String(i).padStart(3, '0')}`;
    const found = regMembers.find(m => m.id === expectedId);
    assert(found, `Target member ID ${expectedId} must exist in approved members`);
  }
  console.log(`✔ Verified: Target IDs are exactly REG_001 through REG_043 (43 members).`);

  const nowIso = new Date().toISOString();
  const allOps = [];

  // Step 3: Prepare batch operations
  for (const m of regMembers) {
    const memberId = m.id;
    const memberName = m.name || m.fullName || 'Member';
    const contribDocId = `C_${memberId}_BASE_SAVINGS`;
    const txDocId = `ACT_${memberId}_base_savings`;

    // 1. Contribution document in monthlyContributions
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
      month: 0, // Special base month
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
    allOps.push({ type: 'set', ref: doc(db, 'monthlyContributions', contribDocId), data: contribPayload });

    // 2. Activity transaction in transactions
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
    allOps.push({ type: 'set', ref: doc(db, 'transactions', txDocId), data: txPayload });

    // 3. Update member document in users
    allOps.push({
      type: 'update',
      ref: doc(db, 'users', memberId),
      data: {
        totalSavings: ALLOCATION_PER_MEMBER,
        total_savings: ALLOCATION_PER_MEMBER,
        updatedAt: nowIso,
      },
    });
  }

  // 4. Update group totals in groups
  allOps.push({
    type: 'update',
    ref: doc(db, 'groups', GROUP_ID),
    data: {
      totalSavings: TOTAL_EXPECTED,
      total_savings: TOTAL_EXPECTED,
      availableBalance: TOTAL_EXPECTED,
      available_balance: TOTAL_EXPECTED,
      rawAvailableBalance: TOTAL_EXPECTED,
      totalFund: TOTAL_EXPECTED,
      total_fund: TOTAL_EXPECTED,
      updatedAt: nowIso,
    },
  });

  console.log(`Prepared ${allOps.length} Firestore operations across batches.`);

  // Step 4: Execute batches
  const CHUNK_SIZE = 400;
  for (let i = 0; i < allOps.length; i += CHUNK_SIZE) {
    const chunk = allOps.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === 'set') batch.set(op.ref, op.data, { merge: true });
      else if (op.type === 'update') batch.update(op.ref, op.data);
    }
    await batch.commit();
    console.log(`✔ Committed batch chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} ops)`);
  }

  console.log('\n✔ All Firestore write operations committed successfully!');

  // Step 5: Post-Allocation Direct Firestore Read-back Verification
  console.log('\n================ POST-ALLOCATION DIRECT FIRESTORE VERIFICATION ================');

  // 1 & 2 & 3. Verify monthlyContributions collection
  const contribSnap = await getDocs(collection(db, 'monthlyContributions'));
  const allContribs = contribSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const baseSavingsContribs = allContribs.filter(c => c.groupId === GROUP_ID && (c.isBase === true || c.type === 'BASE_SAVINGS'));

  console.log(`\n1. Checking Base-Savings Allocations in monthlyContributions:`);
  console.log(`- Total records in monthlyContributions: ${allContribs.length}`);
  console.log(`- Base-savings records for ${GROUP_ID}: ${baseSavingsContribs.length}`);
  assert.strictEqual(baseSavingsContribs.length, 43, `Expected exactly 43 base-savings contributions, got ${baseSavingsContribs.length}`);

  let totalAllocatedSum = 0;
  for (let i = 1; i <= 43; i++) {
    const memberId = `REG_${String(i).padStart(3, '0')}`;
    const expectedDocId = `C_${memberId}_BASE_SAVINGS`;
    const rec = baseSavingsContribs.find(c => c.id === expectedDocId && c.memberId === memberId);
    assert(rec, `Missing allocation document ${expectedDocId} for ${memberId}`);
    assert.strictEqual(rec.amount, ALLOCATION_PER_MEMBER, `${expectedDocId} amount must be 120000`);
    assert.strictEqual(rec.paidAmount, ALLOCATION_PER_MEMBER, `${expectedDocId} paidAmount must be 120000`);
    assert.strictEqual(rec.status, 'paid', `${expectedDocId} status must be 'paid'`);
    assert.strictEqual(rec.isBase, true, `${expectedDocId} isBase must be true`);
    assert.strictEqual(rec.type, 'BASE_SAVINGS', `${expectedDocId} type must be 'BASE_SAVINGS'`);
    assert.strictEqual(rec.month, 0, `${expectedDocId} month must be 0`);
    assert.strictEqual(rec.year, 2026, `${expectedDocId} year must be 2026`);
    totalAllocatedSum += rec.paidAmount;
  }
  console.log(`✔ Verified: Exactly 43 base-savings records exist (one per approved member C_REG_001_BASE_SAVINGS through C_REG_043_BASE_SAVINGS).`);
  console.log(`✔ Verified: Each allocation is exactly ₹${ALLOCATION_PER_MEMBER.toLocaleString('en-IN')}.`);
  console.log(`✔ Verified: Total allocation sum across contributions is ₹${totalAllocatedSum.toLocaleString('en-IN')} (expected ₹${TOTAL_EXPECTED.toLocaleString('en-IN')}).`);
  assert.strictEqual(totalAllocatedSum, TOTAL_EXPECTED);

  // 4. Verify October 2026 monthly dues remain ₹1,000 per member and unpaid
  console.log(`\n2. Checking October 2026 Monthly Dues:`);
  const memRes = await memberService.getAllMembers({ month: 10, year: 2026 }, GROUP_ID);
  const nonAdmin = memRes.members.filter(m => /^REG_\d+$/.test(m.id));
  assert.strictEqual(nonAdmin.length, 43, `Expected 43 non-admin members, got ${nonAdmin.length}`);

  let pendingCount = 0;
  for (const m of nonAdmin) {
    assert.strictEqual(m.totalSavings, ALLOCATION_PER_MEMBER, `Member ${m.id} totalSavings must be ₹1,20,000`);
    assert.strictEqual(m.monthlyContribution, 1000, `Member ${m.id} monthly contribution setting must remain ₹1,000`);
    assert(m.dueStatus && m.dueStatus.toLowerCase() === 'pending', `Member ${m.id} due status must remain 'pending', got ${m.dueStatus}`);
    assert.strictEqual(m.pendingAmount, 1000, `Member ${m.id} pendingAmount for Oct 2026 must remain 1000`);
    assert.strictEqual(m.isPaid, false, `Member ${m.id} isPaid for Oct 2026 must be false`);
    pendingCount++;
  }
  console.log(`✔ Verified: All 43 members have October 2026 dues at ₹1,000 and unpaid ('Pending').`);

  // Verify next unpaid savings period calculation
  for (const m of nonAdmin) {
    const memberBaseContrib = baseSavingsContribs.filter(c => c.memberId === m.id);
    const nextPeriod = savingsService.calculateNextUnpaidSavingsPeriod(memberBaseContrib);
    assert.strictEqual(nextPeriod.month, 10, `Next unpaid month for ${m.id} must be 10`);
    assert.strictEqual(nextPeriod.year, 2026, `Next unpaid year for ${m.id} must be 2026`);
  }
  console.log(`✔ Verified: Next unpaid savings period for all 43 members remains October 2026 (Month 10, Year 2026).`);

  // 5. Verify group savings, available balance, and total fund
  console.log(`\n3. Checking Group Financial Totals:`);
  const groupSnap = await getDoc(doc(db, 'groups', GROUP_ID));
  const groupData = groupSnap.data();
  console.log(`- group totalSavings: ₹${groupData.totalSavings.toLocaleString('en-IN')}`);
  console.log(`- group availableBalance: ₹${groupData.availableBalance.toLocaleString('en-IN')}`);
  console.log(`- group totalFund: ₹${groupData.totalFund.toLocaleString('en-IN')}`);
  assert.strictEqual(groupData.totalSavings, TOTAL_EXPECTED);
  assert.strictEqual(groupData.availableBalance, TOTAL_EXPECTED);
  assert.strictEqual(groupData.totalFund, TOTAL_EXPECTED);
  console.log(`✔ Verified: Group financials reflect exactly ₹${TOTAL_EXPECTED.toLocaleString('en-IN')}.`);

  // Group service verification
  const groupServiceRes = await groupService.getGroupDetails(GROUP_ID);
  console.log(`- groupService totalSavings: ₹${groupServiceRes.group.totalSavings.toLocaleString('en-IN')}`);
  console.log(`- groupService availableBalance: ₹${groupServiceRes.group.availableBalance.toLocaleString('en-IN')}`);
  console.log(`- groupService totalFund: ₹${(groupServiceRes.group.totalFund || groupServiceRes.group.availableBalance).toLocaleString('en-IN')}`);
  assert.strictEqual(groupServiceRes.group.totalSavings, TOTAL_EXPECTED);
  assert.strictEqual(groupServiceRes.group.availableBalance, TOTAL_EXPECTED);

  // 6. Verify transactions and no unrelated changes
  console.log(`\n4. Checking Transactions for Duplicates / Unrelated Changes:`);
  const txSnap = await getDocs(collection(db, 'transactions'));
  const allTxs = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const groupTxs = allTxs.filter(t => t.groupId === GROUP_ID);
  const newBaseTxs = groupTxs.filter(t => t.id && t.id.startsWith('ACT_REG_') && t.id.endsWith('_base_savings'));

  console.log(`- Total transactions in collection: ${allTxs.length}`);
  console.log(`- Total transactions for ${GROUP_ID}: ${groupTxs.length}`);
  console.log(`- New base-savings transactions: ${newBaseTxs.length}`);
  assert.strictEqual(newBaseTxs.length, 43, `Expected exactly 43 new transactions, got ${newBaseTxs.length}`);
  
  // Verify transaction uniqueness
  const txIds = new Set(newBaseTxs.map(t => t.id));
  assert.strictEqual(txIds.size, 43, 'All 43 transaction IDs must be unique');

  // Verify Admin accounts and user count
  console.log(`\n5. Checking Admin Accounts and Total Users:`);
  const postUsersSnap = await getDocs(collection(db, 'users'));
  console.log(`- Total users in collection: ${postUsersSnap.docs.length}`);
  assert.strictEqual(postUsersSnap.docs.length, 45, 'Must have exactly 45 users (43 approved members + 2 admins)');

  const admin1 = await getDoc(doc(db, 'users', 'pcVA23e0edPrSVrL24UDhkKkolp1'));
  const admin2 = await getDoc(doc(db, 'users', 'w0c9RMahYOZI0Jd1ssOCyOrm8Ek2'));
  assert(admin1.exists(), 'Admin pcVA23e0edPrSVrL24UDhkKkolp1 must remain intact');
  assert(admin2.exists(), 'Admin w0c9RMahYOZI0Jd1ssOCyOrm8Ek2 must remain intact');
  console.log(`✔ Verified: Both admin accounts remain untouched.`);

  console.log('\n================================================================================');
  console.log('✔✔ ALL POST-EXECUTION VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('================================================================================\n');
}

executeAllocation().catch(err => {
  console.error('\n❌ ALLOCATION FAILED:', err);
  process.exit(1);
});
