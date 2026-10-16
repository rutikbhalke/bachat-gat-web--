import assert from 'node:assert';
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
  getDocs,
  doc,
  getDoc,
} = await import('../client/src/config/firebase.js');

const { calculateGroupFinancialSummary, calculateMemberFinancialSummary } = await import('../client/src/services/financialService.js');
const { calculateMonthlyMemberStatus, normalizeMember, normalizeSavings } = await import('../client/src/utils/formatters.js');

async function testSimulation() {
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');

  const usersSnap = await getDocs(collection(db, 'users'));
  const regMembers = usersSnap.docs
    .filter(d => /^REG_\d+$/.test(d.id))
    .map(d => ({ id: d.id, ...d.data() }));

  console.log(`Loaded ${regMembers.length} approved members from Firestore.`);
  assert.strictEqual(regMembers.length, 43);

  // Simulate 43 base savings records
  const simulatedSavings = regMembers.map(m => ({
    id: `C_${m.id}_BASE_SAVINGS`,
    contribId: `C_${m.id}_BASE_SAVINGS`,
    groupId: 'shivshahi_group_001',
    memberId: m.id,
    memberName: m.name,
    amount: 120000,
    paidAmount: 120000,
    expectedAmount: 120000,
    month: 0,
    year: 2026,
    isBase: true,
    type: 'BASE_SAVINGS',
    notes: 'Opening accumulated savings balance',
    status: 'paid',
  }));

  const simulatedLoans = [];
  const simulatedRepayments = [];
  const simulatedTransactions = simulatedSavings.map(s => ({
    id: `ACT_${s.memberId}_base_saving`,
    type: 'SAVINGS_DEPOSIT',
    amount: 120000,
    memberId: s.memberId,
    memberName: s.memberName,
    description: `Opening savings deposit of ₹1,20,000 allocated for ${s.memberName}`,
  }));

  // 1. Group Financial Summary Calculation
  const groupSummary = calculateGroupFinancialSummary(
    simulatedSavings,
    simulatedLoans,
    simulatedRepayments,
    simulatedTransactions
  );

  console.log('\n--- Simulated Group Financial Summary ---');
  console.log('Total Group Savings:', groupSummary.totalGroupSavings);
  console.log('Available Balance:', groupSummary.availableBalance);
  console.log('Total Group Fund:', groupSummary.totalGroupFund);
  assert.strictEqual(groupSummary.totalGroupSavings, 5160000);
  assert.strictEqual(groupSummary.availableBalance, 5160000);
  assert.strictEqual(groupSummary.totalGroupFund, 5160000);

  // 2. Member Financial Summary Calculation (for sample member REG_001)
  const memberSummary = calculateMemberFinancialSummary(
    'REG_001',
    simulatedSavings,
    simulatedLoans,
    simulatedRepayments
  );
  console.log('\n--- Simulated Member Financial Summary (REG_001) ---');
  console.log('Member Total Savings:', memberSummary.totalSavings);
  assert.strictEqual(memberSummary.totalSavings, 120000);

  // 3. Monthly Status Calculation (Check that October 2026 dues are NOT corrupted)
  const sampleMember = normalizeMember('REG_001', regMembers[0]);
  const monthlyStatus = calculateMonthlyMemberStatus({
    member: sampleMember,
    payments: simulatedSavings,
    selectedMonth: 10,
    selectedYear: 2026,
    monthlyShare: 1000,
  });

  console.log('\n--- Monthly Dues Calculation for Current Month (10/2026) ---');
  console.log('Required Amount:', monthlyStatus.requiredAmount);
  console.log('Amount Paid for 10/2026:', monthlyStatus.amountPaid);
  console.log('Current Dues:', monthlyStatus.currentDues);
  console.log('Is Pending:', monthlyStatus.isPending);

  assert.strictEqual(monthlyStatus.amountPaid, 0, 'Base savings must NOT count as monthly October contribution');
  assert.strictEqual(monthlyStatus.currentDues, 1000, 'Current October dues must remain ₹1,000');
  assert.strictEqual(monthlyStatus.isPending, true, 'Member should remain pending for regular monthly collection');

  console.log('\n✔ SIMULATION PASSED: All financial accounting rules perfectly satisfied!');
}

testSimulation().catch(console.error);
