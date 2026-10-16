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
  doc,
  getDoc,
  updateDoc,
  firebaseConfig,
} = await import('../client/src/config/firebase.js');

const { memberService } = await import('../client/src/services/memberService.js');

const TARGET_PROJECT_ID = 'bachat-gat-32ffe';
const TARGET_GROUP_ID = 'shivshahi_group_001';
const TARGET_DOC_ID = 'REG_042';
const EXPECTED_OLD_NAME = 'शंकर तात्यासाहेब गुंजाळ';
const NEW_NAME = 'शेखर तात्यासाहेब गुंजाळ';

async function main() {
  console.log('================================================================================');
  console.log(`UPDATE MEMBER NAME FOR ${TARGET_DOC_ID}`);
  console.log(`Project: ${firebaseConfig.projectId} | Group: ${TARGET_GROUP_ID}`);
  console.log('================================================================================\n');

  assert.strictEqual(firebaseConfig.projectId, TARGET_PROJECT_ID, `Project ID must be ${TARGET_PROJECT_ID}`);

  // Step 1: Authenticate as admin
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // Step 2: Read and verify current document
  const docRef = doc(db, 'users', TARGET_DOC_ID);
  const snapBefore = await getDoc(docRef);
  assert(snapBefore.exists(), `Document ${TARGET_DOC_ID} must exist`);

  const dataBefore = snapBefore.data();
  console.log('--- Step 1: Verification Before Update ---');
  console.log(`Document ID: ${TARGET_DOC_ID}`);
  console.log(`Current name: "${dataBefore.name}"`);
  console.log(`Current fullName: "${dataBefore.fullName}"`);
  console.log(`Member Code: "${dataBefore.memberCode}"`);
  console.log(`Group ID: "${dataBefore.groupId}"`);
  console.log(`Monthly Contribution: ₹${dataBefore.monthlyContribution}`);
  console.log(`Shares: ${dataBefore.shares}`);
  console.log(`Status: ${dataBefore.status}`);

  assert.strictEqual(dataBefore.groupId, TARGET_GROUP_ID, `Member must belong to ${TARGET_GROUP_ID}`);
  assert.strictEqual(dataBefore.memberCode, '042', 'Member code must be 042');
  assert.strictEqual(dataBefore.name, EXPECTED_OLD_NAME, `Current name must be ${EXPECTED_OLD_NAME}`);

  // Step 3: Perform Update
  console.log('\n--- Step 2: Executing Name Update ---');
  await updateDoc(docRef, {
    name: NEW_NAME,
    fullName: NEW_NAME,
    updatedAt: new Date().toISOString(),
  });
  console.log(`✔ Successfully updated document ${TARGET_DOC_ID}:`);
  console.log(`  name: "${EXPECTED_OLD_NAME}" -> "${NEW_NAME}"`);
  console.log(`  fullName: "${EXPECTED_OLD_NAME}" -> "${NEW_NAME}"`);

  // Step 4: Verification after update
  console.log('\n--- Step 3: Re-reading and Verification ---');
  const snapAfter = await getDoc(docRef);
  assert(snapAfter.exists(), `Document ${TARGET_DOC_ID} must exist after update`);
  const dataAfter = snapAfter.data();

  console.log(`Verified name in Firestore: "${dataAfter.name}"`);
  console.log(`Verified fullName in Firestore: "${dataAfter.fullName}"`);
  console.log(`Preserved Document ID: ${snapAfter.id}`);
  console.log(`Preserved Member Code: ${dataAfter.memberCode} / ${dataAfter.member_code}`);
  console.log(`Preserved Monthly Contribution: ₹${dataAfter.monthlyContribution}`);
  console.log(`Preserved Shares: ${dataAfter.shares}`);
  console.log(`Preserved Role: ${dataAfter.role}`);
  console.log(`Preserved Status: ${dataAfter.status}`);

  assert.strictEqual(dataAfter.name, NEW_NAME, `Name must equal ${NEW_NAME}`);
  assert.strictEqual(dataAfter.fullName, NEW_NAME, `FullName must equal ${NEW_NAME}`);
  assert.strictEqual(dataAfter.memberCode, '042', 'Member code must remain 042');
  assert.strictEqual(dataAfter.shares, 1, 'Shares must remain 1');
  assert.strictEqual(dataAfter.monthlyContribution, 1000, 'Monthly contribution must remain 1000');
  assert.strictEqual(dataAfter.groupId, TARGET_GROUP_ID, 'Group ID must remain shivshahi_group_001');
  assert.strictEqual(dataAfter.status, 'ACTIVE', 'Status must remain ACTIVE');

  // Step 5: Verify Members Page Service display
  console.log('\n--- Step 4: Checking Members Page Service Display ---');
  const memRes = await memberService.getAllMembers({ month: 10, year: 2026 }, TARGET_GROUP_ID);
  const targetMemberInList = memRes.members.find(m => m.id === TARGET_DOC_ID);
  assert(targetMemberInList, `Member ${TARGET_DOC_ID} must be present in memberService list`);
  console.log(`Members page member: ID: ${targetMemberInList.id} | Code: ${targetMemberInList.memberCode} | Name: "${targetMemberInList.name}"`);
  assert.strictEqual(targetMemberInList.name, NEW_NAME, `Members page display name must be ${NEW_NAME}`);

  console.log('\n================ UPDATE & VERIFICATION COMPLETED SUCCESSFULLY ================');
}

main().catch(err => {
  console.error('Update failed:', err);
  process.exit(1);
});
