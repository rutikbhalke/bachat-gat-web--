import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireClient = createRequire(path.join(__dirname, '../client/package.json'));

const { initializeApp } = requireClient('firebase/app');
const { getAuth, signInWithEmailAndPassword } = requireClient('firebase/auth');
const {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} = requireClient('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBJyKRv81qV_tmnmcYF76Dx0JLxGKvK_7I',
  authDomain: 'bachat-gat-32ffe.firebaseapp.com',
  projectId: 'bachat-gat-32ffe',
  storageBucket: 'bachat-gat-32ffe.firebasestorage.app',
  messagingSenderId: '215206829034',
  appId: '1:215206829034:web:63a0816174e77792427093',
};

const app = initializeApp(firebaseConfig, 'ensure-8-members-app');
const auth = getAuth(app);
const db = getFirestore(app);

const TARGET_GROUP_ID = 'test_isolated_group_999';
const PROD_GROUP_ID = 'shivshahi_group_001';

const REQUIRED_MEMBERS = [
  { id: 'test_mem_001', code: 'TM-001', name: 'Test Member 01', monthlyContribution: 1000 },
  { id: 'test_mem_002', code: 'TM-002', name: 'Test Member 02', monthlyContribution: 1000 },
  { id: 'test_mem_003', code: 'TM-003', name: 'Test Member 03', monthlyContribution: 1000 },
  { id: 'test_mem_004', code: 'TM-004', name: 'Test Member 04', monthlyContribution: 1000 },
  { id: 'test_mem_005', code: 'TM-005', name: 'Test Member 05', monthlyContribution: 1000 },
  { id: 'test_mem_006', code: 'TM-006', name: 'Test Member 06', monthlyContribution: 1000 },
  { id: 'test_mem_007', code: 'TM-007', name: 'Test Member 07', monthlyContribution: 1000 },
  { id: 'test_mem_008', code: 'TM-008', name: 'Test Member 08', monthlyContribution: 1000 },
];

async function main() {
  console.log('================================================================================');
  console.log('ENSURING ALL 8 TEST MEMBERS (TM-001 TO TM-008) ARE ACTIVE IN: ' + TARGET_GROUP_ID);
  console.log('================================================================================');

  // Safety Assertion
  assert.notStrictEqual(TARGET_GROUP_ID, PROD_GROUP_ID, 'FATAL: Target cannot be production group!');

  // Authenticate as admin
  await signInWithEmailAndPassword(auth, 'admin3@bachatgat.com', '123456');
  console.log('✔ Authenticated via Firebase Auth as admin (admin3@bachatgat.com)');

  // 1. Check production initial state
  const prodUsersSnapBefore = await getDocs(query(collection(db, 'users'), where('groupId', '==', PROD_GROUP_ID)));
  const prodInitialCount = prodUsersSnapBefore.size;
  console.log(`[SAFETY CHECK] Production group ${PROD_GROUP_ID} currently has ${prodInitialCount} members (read-only).\n`);
  assert.strictEqual(prodInitialCount, 44, 'Production group must have exactly 44 members');

  const createdList = [];
  const existingList = [];
  const reactivatedList = [];

  // 2. Iterate through each required member
  for (const item of REQUIRED_MEMBERS) {
    const memRef = doc(db, 'users', item.id);
    const snap = await getDoc(memRef);

    if (!snap.exists()) {
      // Create new member doc
      const newDoc = {
        id: item.id,
        memberCode: item.code,
        member_code: item.code,
        fullName: item.name,
        name: item.name,
        monthlyContribution: item.monthlyContribution,
        monthlyContributionPerShare: item.monthlyContribution,
        monthlyShare: item.monthlyContribution,
        monthlyHaftaAmount: item.monthlyContribution,
        shares: 1,
        shareCount: 1,
        status: 'ACTIVE',
        isActive: true,
        is_active: true,
        isDeleted: false,
        groupId: TARGET_GROUP_ID,
        group_id: TARGET_GROUP_ID,
        role: 'member',
        role_name: 'MEMBER',
        createdAt: new Date().toISOString(),
        joinDate: new Date().toISOString(),
      };
      await setDoc(memRef, newDoc);
      createdList.push(item);
      console.log(`[CREATED] ${item.code} (${item.id}): ${item.name}`);
    } else {
      const data = snap.data();
      const isCurrentlyInactive = data.isActive === false || data.isDeleted === true || (data.status || '').toLowerCase() === 'inactive';

      if (isCurrentlyInactive) {
        // Reactivate existing member preserving historical data
        await updateDoc(memRef, {
          status: 'ACTIVE',
          isActive: true,
          is_active: true,
          isDeleted: false,
          monthlyContribution: item.monthlyContribution,
          monthlyContributionPerShare: item.monthlyContribution,
          updatedAt: new Date().toISOString(),
        });
        reactivatedList.push(item);
        console.log(`[REACTIVATED] ${item.code} (${item.id}): ${item.name} set to ACTIVE (no duplicate created)`);
      } else {
        existingList.push(item);
        console.log(`[ALREADY ACTIVE] ${item.code} (${item.id}): ${item.name}`);
      }
    }
  }

  // 3. Update group active members count
  const allTestGroupSnap = await getDocs(query(collection(db, 'users'), where('groupId', '==', TARGET_GROUP_ID)));
  const allTestMembers = allTestGroupSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const activeMembersInTestGroup = allTestMembers.filter(m => m.isActive && !m.isDeleted && (m.status || '').toUpperCase() === 'ACTIVE' && m.role === 'member');

  const groupDocRef = doc(db, 'groups', TARGET_GROUP_ID);
  await updateDoc(groupDocRef, {
    activeMembers: activeMembersInTestGroup.length,
    active_members: activeMembersInTestGroup.length,
    totalMembers: allTestMembers.length,
    total_members: allTestMembers.length,
  });

  console.log(`\n✔ Group ${TARGET_GROUP_ID} activeMembers count set to: ${activeMembersInTestGroup.length}`);

  // 4. Verification: All 8 members must be active and visible
  console.log('\n--- VERIFYING ALL 8 MEMBERS ---');
  for (const item of REQUIRED_MEMBERS) {
    const verifiedSnap = await getDoc(doc(db, 'users', item.id));
    assert.ok(verifiedSnap.exists(), `${item.id} must exist in users`);
    const d = verifiedSnap.data();
    assert.strictEqual(d.groupId, TARGET_GROUP_ID);
    assert.strictEqual(d.isActive, true, `${item.code} isActive must be true`);
    assert.strictEqual(Boolean(d.isDeleted), false, `${item.code} isDeleted must be false`);
    assert.strictEqual((d.status || '').toUpperCase(), 'ACTIVE', `${item.code} status must be ACTIVE`);
    assert.strictEqual(d.memberCode, item.code);
    assert.strictEqual(d.monthlyContribution, 1000);
    console.log(`✔ Verified ${item.code} (${item.name}): ACTIVE | Monthly: ₹${d.monthlyContribution} | isDeleted: false`);
  }

  // 5. Verification: Production Group Strictly Untouched
  console.log('\n--- PRODUCTION INTEGRITY AUDIT ---');
  const prodUsersSnapAfter = await getDocs(query(collection(db, 'users'), where('groupId', '==', PROD_GROUP_ID)));
  const prodFinalCount = prodUsersSnapAfter.size;
  const prodDeletedCount = prodUsersSnapAfter.docs.filter(d => d.data().isDeleted === true).length;

  assert.strictEqual(prodFinalCount, prodInitialCount, 'Production members count must remain 44');
  assert.strictEqual(prodDeletedCount, 0, 'Production must have 0 deleted members');
  console.log(`✔ Production group ${PROD_GROUP_ID} untouched: ${prodFinalCount} members (initial: ${prodInitialCount}), 0 deleted.`);

  console.log('\n================================================================================');
  console.log('SUMMARY REPORT:');
  console.log(`- Newly Created Members:     ${createdList.length > 0 ? createdList.map(m => m.code).join(', ') : 'None (all existed)'}`);
  console.log(`- Reactivated Existing Members: ${reactivatedList.length > 0 ? reactivatedList.map(m => m.code).join(', ') : 'None'}`);
  console.log(`- Already Active Members:    ${existingList.map(m => m.code).join(', ')}`);
  console.log(`- Total Active Test Members: ${activeMembersInTestGroup.length} (including TM-001 through TM-008)`);
  console.log(`- Production Records Changed: ZERO (44 members untouched)`);
  console.log('================================================================================');
}

main().catch(err => {
  console.error('Fatal error ensuring test members:', err);
  process.exit(1);
});
