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
} = await import('../client/src/config/firebase.js');

const PROD_GROUP_ID = 'shivshahi_group_001';
const BACKUP_FILE = path.join(__dirname, '../database_backup_pre_reset_2026_10_14.json');
const OUTBOX_FILE = path.join(__dirname, '../server/data/sync_outbox.json');

async function main() {
  console.log('================================================================================');
  console.log('SAFE DATA CLEANUP: RESET DEMO DATA WHILE PRESERVING MEMBER LIST');
  console.log('================================================================================');

  // Step 1: Authentication
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // Step 2: Ensure backup file exists and is valid
  if (!fs.existsSync(BACKUP_FILE) || fs.statSync(BACKUP_FILE).size < 1000) {
    console.error('❌ ABORT: Backup file missing or invalid at:', BACKUP_FILE);
    process.exit(1);
  }
  const backupData = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
  console.log(`✔ Verified pre-cleanup backup exists at: ${BACKUP_FILE}`);
  console.log(`  Backup timestamp: ${backupData.timestamp}`);
  console.log(`  Backed up users: ${backupData.documentCounts.users}`);
  console.log(`  Backed up contributions: ${backupData.documentCounts.monthlyContributions}`);
  console.log(`  Backed up loans: ${backupData.documentCounts.loans}`);
  console.log(`  Backed up repayments: ${backupData.documentCounts.repayments}`);
  console.log(`  Backed up transactions: ${backupData.documentCounts.transactions}\n`);

  // Step 3: Inspect current state before cleanup
  const [usersSnap, contribSnap, loansSnap, repaySnap, txSnap, groupSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'monthlyContributions')),
    getDocs(collection(db, 'loans')),
    getDocs(collection(db, 'repayments')),
    getDocs(collection(db, 'transactions')),
    getDoc(doc(db, 'groups', PROD_GROUP_ID)),
  ]);

  const initialUsersCount = usersSnap.size;
  console.log('--- PRE-CLEANUP DOCUMENT COUNTS ---');
  console.log(`users (MUST BE 100% PRESERVED): ${usersSnap.size}`);
  console.log(`monthlyContributions (to clean): ${contribSnap.size}`);
  console.log(`loans (to clean):                ${loansSnap.size}`);
  console.log(`repayments (to clean):           ${repaySnap.size}`);
  console.log(`transactions (to clean):         ${txSnap.size}`);
  console.log(`group document exists:           ${groupSnap.exists()}\n`);

  assert(groupSnap.exists(), 'Production group document must exist');
  assert(initialUsersCount >= 40, 'Member list must be intact before cleanup');

  // Step 4: Delete financial demo records
  console.log('Cleaning monthlyContributions...');
  let deletedContributions = 0;
  for (const d of contribSnap.docs) {
    await deleteDoc(doc(db, 'monthlyContributions', d.id));
    deletedContributions++;
  }
  console.log(`✔ Deleted ${deletedContributions} monthly contribution documents.`);

  console.log('Cleaning loans...');
  let deletedLoans = 0;
  for (const d of loansSnap.docs) {
    await deleteDoc(doc(db, 'loans', d.id));
    deletedLoans++;
  }
  console.log(`✔ Deleted ${deletedLoans} loan documents.`);

  console.log('Cleaning repayments...');
  let deletedRepayments = 0;
  for (const d of repaySnap.docs) {
    await deleteDoc(doc(db, 'repayments', d.id));
    deletedRepayments++;
  }
  console.log(`✔ Deleted ${deletedRepayments} repayment documents.`);

  console.log('Cleaning transactions / activity logs...');
  let deletedTransactions = 0;
  for (const d of txSnap.docs) {
    await deleteDoc(doc(db, 'transactions', d.id));
    deletedTransactions++;
  }
  console.log(`✔ Deleted ${deletedTransactions} transaction documents.`);

  // Clean test group document test_isolated_group_999 if present
  try {
    const testGrpSnap = await getDoc(doc(db, 'groups', 'test_isolated_group_999'));
    if (testGrpSnap.exists()) {
      await deleteDoc(doc(db, 'groups', 'test_isolated_group_999'));
      console.log('✔ Cleaned test group document: test_isolated_group_999');
    }
  } catch (e) {
    console.warn('Notice cleaning test group:', e.message);
  }

  // Step 5: Reset group financial totals on shivshahi_group_001
  console.log('\nResetting financial summary fields on group document...');
  const currentGroupData = groupSnap.data();
  const resetGroupPayload = {
    // Financial Totals reset to clean fresh-state:
    totalSavings: 0,
    total_savings: 0,
    totalFund: 0,
    total_fund: 0,
    availableBalance: 0,
    available_balance: 0,
    rawAvailableBalance: 0,
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
    updatedAt: new Date().toISOString(),
  };

  await updateDoc(doc(db, 'groups', PROD_GROUP_ID), resetGroupPayload);
  console.log('✔ Group financial totals reset to exact zero / clean-state.');

  // Step 6: Reset local sync outbox file
  if (fs.existsSync(OUTBOX_FILE)) {
    fs.writeFileSync(OUTBOX_FILE, JSON.stringify([], null, 2), 'utf8');
    console.log('✔ Cleaned sync outbox queue (server/data/sync_outbox.json reset to []).');
  }

  // Step 7: Post-Cleanup Verification
  console.log('\n================================================================================');
  console.log('POST-CLEANUP VERIFICATION');
  console.log('================================================================================');

  const [postUsersSnap, postContribSnap, postLoansSnap, postRepaySnap, postTxSnap, postGroupSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'monthlyContributions')),
    getDocs(collection(db, 'loans')),
    getDocs(collection(db, 'repayments')),
    getDocs(collection(db, 'transactions')),
    getDoc(doc(db, 'groups', PROD_GROUP_ID)),
  ]);

  console.log(`Users count after cleanup:        ${postUsersSnap.size} (Initial: ${initialUsersCount})`);
  console.log(`Contributions count after cleanup: ${postContribSnap.size}`);
  console.log(`Loans count after cleanup:         ${postLoansSnap.size}`);
  console.log(`Repayments count after cleanup:    ${postRepaySnap.size}`);
  console.log(`Transactions count after cleanup:  ${postTxSnap.size}`);

  assert.strictEqual(postUsersSnap.size, initialUsersCount, 'ALL user documents must be preserved 100%!');
  assert.strictEqual(postContribSnap.size, 0, 'Contributions must be 0');
  assert.strictEqual(postLoansSnap.size, 0, 'Loans must be 0');
  assert.strictEqual(postRepaySnap.size, 0, 'Repayments must be 0');
  assert.strictEqual(postTxSnap.size, 0, 'Transactions must be 0');

  const postGroupData = postGroupSnap.data();
  assert.strictEqual(postGroupData.totalSavings, 0, 'Group totalSavings must be 0');
  assert.strictEqual(postGroupData.totalFund, 0, 'Group totalFund must be 0');
  assert.strictEqual(postGroupData.availableBalance, 0, 'Group availableBalance must be 0');
  assert.strictEqual(postGroupData.activeLoans, 0, 'Group activeLoans must be 0');

  // Verify group configuration preserved
  assert(postGroupData.groupName || postGroupData.name, 'Group name must be preserved');
  assert(postGroupData.monthlyContribution, 'Monthly contribution config must be preserved');

  console.log('\n✔ All verifications PASSED:');
  console.log(`  - 100% of existing members preserved (${postUsersSnap.size} users intact)`);
  console.log('  - All demo financial records cleared');
  console.log('  - Group totals safely reset to fresh-state');
  console.log('  - Group configuration and master data preserved');
  console.log('================================================================================\n');
}

main().catch(err => {
  console.error('Cleanup execution failed:', err);
  process.exit(1);
});
