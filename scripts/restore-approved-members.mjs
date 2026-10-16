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

const GROUP_ID = 'shivshahi_group_001';
const BACKUP_FILE = path.join(__dirname, '../database_backup_pre_delete_1_5_shares_vaibhav.json');

async function main() {
  console.log('================================================================================');
  console.log('RESTORE APPROVED MEMBERS (REG_001 TO REG_043)');
  console.log('Target Group: ' + GROUP_ID);
  console.log('Target Project: ' + firebaseConfig.projectId);
  console.log('================================================================================\n');

  assert.strictEqual(firebaseConfig.projectId, 'bachat-gat-32ffe', 'Must target Demo Web Firebase project bachat-gat-32ffe');

  // 1. Read and verify backup
  assert(fs.existsSync(BACKUP_FILE), `Backup file must exist at ${BACKUP_FILE}`);
  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));

  const regMembers = backup.collections.users
    .filter(u => /^REG_\d+$/.test(u._documentId || u.id))
    .sort((a, b) => (a._documentId || a.id).localeCompare(b._documentId || b.id));

  assert.strictEqual(regMembers.length, 43, `Backup must contain exactly 43 REG members, found ${regMembers.length}`);
  console.log(`✔ Verified backup: 43 approved members found in backup.`);

  // 2. Authenticate
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // 3. Conflict Detection
  const existingUsersSnap = await getDocs(collection(db, 'users'));
  const existingUserMap = new Map();
  existingUsersSnap.docs.forEach(d => existingUserMap.set(d.id, d.data()));

  const conflicts = [];
  for (const m of regMembers) {
    const docId = m._documentId || m.id;
    if (existingUserMap.has(docId)) {
      conflicts.push({ id: docId, existing: existingUserMap.get(docId) });
    }
  }

  if (conflicts.length > 0) {
    console.error(`❌ CONFLICT DETECTED: ${conflicts.length} documents already exist:`, conflicts);
    throw new Error('Conflict detected. Aborting to avoid overwrite.');
  }
  console.log('✔ Conflict check passed: 0 existing document conflicts found.\n');

  // 4. Batch restoration of 43 members
  const batch = writeBatch(db);

  for (const m of regMembers) {
    const docId = m._documentId || m.id;
    const { _documentId, ...memberData } = m;

    // Ensure member data preserves all original fields and clean financial balance
    const cleanDoc = {
      ...memberData,
      id: docId,
      uid: docId,
      groupId: GROUP_ID,
      group_id: GROUP_ID,
      totalSavings: 0,
      total_savings: 0,
      activeLoanAmount: 0,
      outstandingLoans: 0,
      totalInterestPaid: 0,
      total_interest_paid: 0,
      updatedAt: new Date().toISOString(),
    };

    batch.set(doc(db, 'users', docId), cleanDoc);
  }

  // 5. Update group metadata
  batch.update(doc(db, 'groups', GROUP_ID), {
    activeMembers: 43,
    active_members: 43,
    membersCount: 45, // 43 approved members + 2 preserved admins
    lastMemberNumber: 43,
    updatedAt: new Date().toISOString(),
  });

  await batch.commit();
  console.log('✔ Successfully restored all 43 approved members to Firestore users collection!');
  console.log('✔ Group shivshahi_group_001 active members updated to 43.\n');

  // 6. Post-Restoration Verification
  const postUsersSnap = await getDocs(collection(db, 'users'));
  const postGroupSnap = await getDoc(doc(db, 'groups', GROUP_ID));
  const postGroupData = postGroupSnap.data();

  console.log('================ POST-RESTORATION VERIFICATION ================');
  console.log(`Total users in Firestore 'users': ${postUsersSnap.size}`);
  console.log(`Group members count: ${postGroupData.membersCount}`);
  console.log(`Group active members: ${postGroupData.activeMembers}`);
  console.log(`Group total savings: ₹${postGroupData.totalSavings} (Clean Demo State)`);

  assert.strictEqual(postUsersSnap.size, 45, 'Total users must be 45 (43 approved members + 2 admin/system accounts)');
  assert.strictEqual(postGroupData.activeMembers, 43, 'Active members must be 43');

  // Verify Vaibhav Pawase and test members are absent
  const excludedIds = ['gByYVbohdhQ4Gfi1NPltOcikyni2', 'test_user_share_1', 'test_user_share_2', 'test_user_share_3', 'test_user_share_5'];
  for (const exId of excludedIds) {
    const found = postUsersSnap.docs.some(d => d.id === exId);
    assert(!found, `Excluded member ${exId} must NOT be restored!`);
  }
  console.log('✔ Verified: Vaibhav Pawase and 4 test members are NOT restored.');

  // Verify all 43 REG_xxx exist
  for (let i = 1; i <= 43; i++) {
    const expectedId = 'REG_' + String(i).padStart(3, '0');
    const docExists = postUsersSnap.docs.some(d => d.id === expectedId);
    assert(docExists, `Member ${expectedId} must exist!`);
  }
  console.log('✔ Verified: All 43 approved members (REG_001 to REG_043) are verified present.');
  console.log('\n✔ RESTORATION COMPLETED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Restoration failed:', err);
  process.exit(1);
});
