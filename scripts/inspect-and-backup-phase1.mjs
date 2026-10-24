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
  firebaseConfig,
} = await import('../client/src/config/firebase.js');

const GROUP_ID = 'shivshahi_group_001';
const EXPECTED_PROJECT_ID = 'bachat-gat-32ffe';

async function main() {
  console.log('================================================================================');
  console.log('PHASE 1: INSPECT CURRENT FIRESTORE SCHEMA & CREATE SAFETY BACKUP');
  console.log('Target Project: ' + firebaseConfig.projectId);
  console.log('Target Group:   ' + GROUP_ID);
  console.log('================================================================================\n');

  // 1. Confirm target project
  assert.strictEqual(
    firebaseConfig.projectId,
    EXPECTED_PROJECT_ID,
    `FATAL: Target project must be ${EXPECTED_PROJECT_ID}, found ${firebaseConfig.projectId}`
  );
  console.log(`✔ Verified: Target project is exactly '${EXPECTED_PROJECT_ID}'.`);
  console.log(`✔ Safety check: Flutter project bachatgatapp-5158 will NOT be touched.\n`);

  // 2. Sign in as admin
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // 3. Inspect Group
  const groupDocRef = doc(db, 'groups', GROUP_ID);
  const groupSnap = await getDoc(groupDocRef);
  assert(groupSnap.exists(), `Group document ${GROUP_ID} does not exist in 'groups' collection!`);
  const groupData = groupSnap.data();

  console.log('--- Current Group Information ---');
  console.log(`Name:                ${groupData.groupName || groupData.name}`);
  console.log(`Monthly Contribution:₹${groupData.monthlyContribution}`);
  console.log(`Total Savings:       ₹${groupData.totalSavings || 0}`);
  console.log(`Available Balance:   ₹${groupData.availableBalance || 0}`);
  console.log(`Total Fund:          ₹${groupData.totalFund || 0}`);
  console.log(`Active Loans:        ${groupData.activeLoans || 0}`);
  console.log(`Outstanding Loans:   ₹${groupData.totalOutstandingLoans || groupData.activeLoansOutstanding || 0}`);
  console.log(`Total Interest Paid: ₹${groupData.totalInterestPaid || groupData.totalInterest || 0}\n`);

  // 4. Inspect Collections
  const collectionNames = ['groups', 'users', 'monthlyContributions', 'loans', 'repayments', 'transactions', 'notifications'];
  const fullBackup = {
    timestamp: new Date().toISOString(),
    projectId: firebaseConfig.projectId,
    groupId: GROUP_ID,
    collections: {},
    documentCounts: {},
  };

  for (const colName of collectionNames) {
    try {
      const snap = await getDocs(collection(db, colName));
      fullBackup.documentCounts[colName] = snap.size;
      fullBackup.collections[colName] = snap.docs.map(d => ({
        _documentId: d.id,
        ...d.data(),
      }));
      console.log(`Collection [${colName}]: ${snap.size} documents found.`);
    } catch (e) {
      console.warn(`Collection [${colName}] fetch notice:`, e.message);
    }
  }

  // 5. Inspect Users (Members + Admins)
  const users = fullBackup.collections.users || [];
  const approvedMembers = users
    .filter(u => /^REG_\d+$/.test(u._documentId))
    .sort((a, b) => a._documentId.localeCompare(b._documentId));
  const adminUsers = users.filter(u => !/^REG_\d+$/.test(u._documentId));

  console.log(`\n--- Member & User Breakdown ---`);
  console.log(`Total users in collection: ${users.length}`);
  console.log(`Approved members (REG_xxx): ${approvedMembers.length}`);
  console.log(`Admin / Other accounts:     ${adminUsers.length}`);

  assert.strictEqual(
    approvedMembers.length,
    43,
    `Expected 43 approved members (REG_001 - REG_043), but found ${approvedMembers.length}`
  );

  // Validate exact REG_001 to REG_043 sequence
  for (let i = 1; i <= 43; i++) {
    const expectedId = `REG_${String(i).padStart(3, '0')}`;
    const found = approvedMembers.find(m => m._documentId === expectedId);
    assert(found, `Missing expected member ID: ${expectedId}`);
  }
  console.log(`✔ Verified: Approved members are strictly REG_001 through REG_043.`);

  // 6. Write safety backup to disk
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `database_backup_fresh_before_zero_reset.json`;
  const backupFilePath = path.join(__dirname, '..', backupFilename);
  fs.writeFileSync(backupFilePath, JSON.stringify(fullBackup, null, 2), 'utf8');

  // Also write a timestamped copy for permanent archive
  const archiveFilename = `database_backup_${timestamp}.json`;
  const archiveFilePath = path.join(__dirname, '..', archiveFilename);
  fs.writeFileSync(archiveFilePath, JSON.stringify(fullBackup, null, 2), 'utf8');

  const stats = fs.statSync(backupFilePath);
  console.log(`\n✔ Full safety backup written to: ${backupFilePath}`);
  console.log(`✔ Timestamped archive written to: ${archiveFilePath}`);
  console.log(`  File size: ${(stats.size / 1024).toFixed(2)} KB`);

  // 7. Validate backup integrity
  const readBack = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
  assert.strictEqual(readBack.documentCounts.users, users.length, 'Users backup count mismatch');
  assert.strictEqual(readBack.collections.users.length, users.length, 'Users document array length mismatch');
  console.log(`✔ Backup integrity verified 100%: Re-read ${readBack.collections.users.length} users successfully.`);

  // 8. Output Member Details JSON for Preview
  const previewData = {
    projectId: firebaseConfig.projectId,
    groupId: GROUP_ID,
    memberCount: approvedMembers.length,
    allocationPerMember: 120000,
    totalExpectedAllocation: approvedMembers.length * 120000,
    currentFinancialCounts: {
      monthlyContributions: fullBackup.documentCounts.monthlyContributions || 0,
      loans: fullBackup.documentCounts.loans || 0,
      repayments: fullBackup.documentCounts.repayments || 0,
      transactions: fullBackup.documentCounts.transactions || 0,
    },
    members: approvedMembers.map(m => ({
      id: m._documentId,
      name: m.name || m.fullName || '',
      marathiName: m.marathiName || m.name_mr || m.nameMarathi || '',
      memberCode: m.memberCode || m.member_code || '',
      role: m.role || 'member',
      status: m.status || 'active',
      currentSavings: m.totalSavings || 0,
    })),
    admins: adminUsers.map(a => ({
      id: a._documentId,
      email: a.email || '',
      role: a.role || 'admin',
    })),
    currentGroupTotals: {
      totalSavings: groupData.totalSavings || 0,
      availableBalance: groupData.availableBalance || 0,
      totalFund: groupData.totalFund || 0,
      activeLoans: groupData.activeLoans || 0,
      totalOutstandingLoans: groupData.totalOutstandingLoans || groupData.activeLoansOutstanding || 0,
    },
  };

  const previewOutputPath = path.join(__dirname, '../scratch/phase1_inspection_results.json');
  fs.mkdirSync(path.dirname(previewOutputPath), { recursive: true });
  fs.writeFileSync(previewOutputPath, JSON.stringify(previewData, null, 2), 'utf8');
  console.log(`✔ Inspection results saved to: ${previewOutputPath}`);

  console.log('\n================================================================================');
  console.log('PHASE 1 COMPLETE: INSPECTION & BACKUP COMPLETED SAFELY.');
  console.log('NO DELETIONS OR WRITES HAVE BEEN PERFORMED.');
  console.log('================================================================================\n');
}

main().catch(err => {
  console.error('Phase 1 inspection failed:', err);
  process.exit(1);
});
