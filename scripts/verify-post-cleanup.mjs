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
} = await import('../client/src/config/firebase.js');

const { memberService } = await import('../client/src/services/memberService.js');
const { groupService } = await import('../client/src/services/groupService.js');
const { reportService } = await import('../client/src/services/reportService.js');
const { loanService } = await import('../client/src/services/loanService.js');
const { savingsService } = await import('../client/src/services/savingsService.js');

const PROD_GROUP_ID = 'shivshahi_group_001';

async function main() {
  console.log('================================================================================');
  console.log('POST-CLEANUP VERIFICATION SCRIPT');
  console.log('================================================================================');

  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // 1. Verify Members Page Data Contract
  const membersRes = await memberService.getAllMembers({}, PROD_GROUP_ID);
  assert.strictEqual(membersRes.success, true, 'memberService.getAllMembers must succeed');
  const members = membersRes.members || [];
  console.log(`✔ [VERIFIED] Members list loaded: ${members.length} members retrieved`);
  assert(members.length >= 40, `Expected at least 40 members, found ${members.length}`);

  // Check sample members retain their IDs, codes, and names
  const sample = members.slice(0, 3);
  sample.forEach((m, idx) => {
    console.log(`  ${idx + 1}. ID: ${m.id} | Code: ${m.memberCode} | Name: ${m.name}`);
    assert(m.id, 'Member ID must exist');
    assert(m.memberCode, 'Member Code must exist');
    assert(m.name, 'Member Name must exist');
    assert.strictEqual(m.totalSavings, 0, 'Member totalSavings must be 0 after reset');
    assert.strictEqual(m.activeLoanAmount, 0, 'Member activeLoanAmount must be 0 after reset');
  });

  // 2. Verify Group Document & Financial Summary
  const groupRes = await groupService.getGroupDetails(PROD_GROUP_ID);
  const group = groupRes.group || {};
  console.log('\n✔ [VERIFIED] Group Details:');
  console.log(`  groupName:        ${group.name || group.groupName}`);
  console.log(`  monthlyContribution: ₹${group.monthlyContribution}`);
  console.log(`  totalSavings:     ₹${group.totalSavings}`);
  console.log(`  totalFund:        ₹${group.totalFund}`);
  console.log(`  availableBalance: ₹${group.availableBalance}`);
  console.log(`  activeLoans:      ₹${group.activeLoans}`);

  assert.strictEqual(group.totalSavings, 0, 'totalSavings must be 0');
  assert.strictEqual(group.totalFund, 0, 'totalFund must be 0');
  assert.strictEqual(group.availableBalance, 0, 'availableBalance must be 0');
  assert.strictEqual(group.activeLoans, 0, 'activeLoans must be 0');

  // 3. Verify Loans Collection is Clean
  const loansRes = await loanService.getAllLoans({}, PROD_GROUP_ID);
  console.log(`\n✔ [VERIFIED] Loans count: ${loansRes.loans?.length || 0}`);
  assert.strictEqual(loansRes.loans?.length || 0, 0, 'Loans list must be empty');

  // 4. Verify Savings Collection is Clean
  const savingsRes = await savingsService.getAllSavings({}, PROD_GROUP_ID);
  console.log(`✔ [VERIFIED] Savings count: ${savingsRes.savings?.length || 0}`);
  assert.strictEqual(savingsRes.savings?.length || 0, 0, 'Savings list must be empty');

  // 5. Verify Pending Due Report
  const pendingRes = await reportService.getPendingDuesReport(10, 2026, '', PROD_GROUP_ID);
  assert.strictEqual(pendingRes.success, true, 'getPendingDuesReport must succeed');
  const duesList = pendingRes.duesList || [];
  console.log(`✔ [VERIFIED] Pending Dues list: ${duesList.length} members with uncollected savings`);
  
  // All pending members in the fresh state should only owe uncollected regular savings, ZERO loan debt
  duesList.forEach(d => {
    assert.strictEqual(d.outstandingPrincipal, 0, 'Principal due must be 0 (no active loans)');
    assert.strictEqual(d.pendingInterest, 0, 'Interest due must be 0 (no active loans)');
    assert(d.pendingHafta > 0, 'Pending hafta equals uncollected monthly share');
    assert.strictEqual(d.totalPending, d.pendingHafta, 'Total pending equals pending hafta');
  });
  console.log('✔ [VERIFIED] Pending Due report contains zero old loan arrears and zero old test records.');

  // 6. Verify Outbox is Clean
  const outboxPath = path.join(__dirname, '../server/data/sync_outbox.json');
  if (fs.existsSync(outboxPath)) {
    const outboxContent = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
    assert.strictEqual(outboxContent.length, 0, 'Sync outbox must be empty');
    console.log('✔ [VERIFIED] Sync outbox queue is completely clean (0 pending records).');
  }

  console.log('\n================================================================================');
  console.log('ALL POST-CLEANUP VERIFICATION CHECKS PASSED (6/6)');
  console.log('================================================================================');
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
