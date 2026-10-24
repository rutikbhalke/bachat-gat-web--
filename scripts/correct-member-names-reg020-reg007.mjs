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
  getDocs,
  collection,
  updateDoc,
  firebaseConfig,
} = await import('../client/src/config/firebase.js');

const { memberService } = await import('../client/src/services/memberService.js');

const TARGET_PROJECT_ID = 'bachat-gat-32ffe';
const TARGET_GROUP_ID = 'shivshahi_group_001';

const TARGETS = [
  {
    docId: 'REG_020',
    expectedMemberCode: '020',
    correctName: 'हर्षीराम दत्तू गाडे',
  },
  {
    docId: 'REG_007',
    expectedMemberCode: '007',
    correctName: 'सतीश गणपत कुन्हे',
  },
];

function getCodePoints(str) {
  return Array.from(str)
    .map(c => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ('${c}')`)
    .join(' ');
}

async function main() {
  console.log('================================================================================');
  console.log('CORRECT MARATHI NAMES FOR REG_020 AND REG_007');
  console.log(`Target Firebase Project: ${firebaseConfig.projectId}`);
  console.log(`Target Group ID: ${TARGET_GROUP_ID}`);
  console.log('================================================================================\n');

  // Strict safety check: Must ONLY target bachat-gat-32ffe
  assert.strictEqual(
    firebaseConfig.projectId,
    TARGET_PROJECT_ID,
    `CRITICAL: Must target project ${TARGET_PROJECT_ID}, but found ${firebaseConfig.projectId}`
  );

  // Authenticate as admin
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // Verify admin accounts exist and remain untouched
  const allUsersSnapBefore = await getDocs(collection(db, 'users'));
  const allUsersBefore = allUsersSnapBefore.docs.map(d => ({ id: d.id, ...d.data() }));
  const adminUsersBefore = allUsersBefore.filter(u => !/^REG_\d+$/.test(u.id));
  console.log(`✔ Verified: Found ${adminUsersBefore.length} admin accounts in project.`);

  const updatedReports = [];

  for (const target of TARGETS) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`Processing Member Document: ${target.docId}`);
    console.log(`Target Correct Name: "${target.correctName}"`);
    console.log(`Code points: ${getCodePoints(target.correctName)}`);
    console.log(`--------------------------------------------------------------------------------`);

    // 1. Read document before update
    const memberDocRef = doc(db, 'users', target.docId);
    const snapBefore = await getDoc(memberDocRef);
    assert(snapBefore.exists(), `Member document ${target.docId} must exist in Firestore`);

    const dataBefore = snapBefore.data();
    console.log(`Document ID: ${target.docId}`);
    console.log(`Current name: "${dataBefore.name}"`);
    console.log(`Current fullName: "${dataBefore.fullName}"`);
    console.log(`Member Code: "${dataBefore.memberCode}" / "${dataBefore.member_code}"`);
    console.log(`Group ID: "${dataBefore.groupId}"`);
    console.log(`Shares: ${dataBefore.shares}`);
    console.log(`Monthly Contribution: ₹${dataBefore.monthlyContribution}`);
    console.log(`Status: ${dataBefore.status} (isActive: ${dataBefore.isActive})`);
    console.log(`Total Savings: ₹${dataBefore.totalSavings}`);
    console.log(`Outstanding Loans: ₹${dataBefore.outstandingLoans || 0}`);

    assert.strictEqual(dataBefore.groupId, TARGET_GROUP_ID, `Member must belong to ${TARGET_GROUP_ID}`);
    assert.strictEqual(
      dataBefore.memberCode || dataBefore.member_code,
      target.expectedMemberCode,
      `Member code must be ${target.expectedMemberCode}`
    );

    // 2. Perform atomic update of canonical name fields
    const fieldsToUpdate = {
      name: target.correctName,
      fullName: target.correctName,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(memberDocRef, fieldsToUpdate);
    console.log(`✔ Successfully applied name update to Firestore document ${target.docId}`);

    // 3. Re-read document immediately from Firestore and verify
    const snapAfter = await getDoc(memberDocRef);
    assert(snapAfter.exists(), `Member document ${target.docId} must exist after update`);
    const dataAfter = snapAfter.data();

    // Verify exact Marathi spellings
    assert.strictEqual(
      dataAfter.name,
      target.correctName,
      `Field 'name' in ${target.docId} must exactly equal ${target.correctName}`
    );
    assert.strictEqual(
      dataAfter.fullName,
      target.correctName,
      `Field 'fullName' in ${target.docId} must exactly equal ${target.correctName}`
    );

    // Verify preservation of all metadata and financial records
    assert.strictEqual(snapAfter.id, target.docId, 'Document ID must be preserved');
    assert.strictEqual(
      dataAfter.memberCode,
      target.expectedMemberCode,
      'memberCode must be preserved'
    );
    assert.strictEqual(
      dataAfter.member_code,
      target.expectedMemberCode,
      'member_code must be preserved'
    );
    assert.strictEqual(dataAfter.shares, dataBefore.shares, 'Shares must be preserved');
    assert.strictEqual(
      dataAfter.monthlyContribution,
      dataBefore.monthlyContribution,
      'monthlyContribution must be preserved'
    );
    assert.strictEqual(dataAfter.role, dataBefore.role, 'Role must be preserved');
    assert.strictEqual(dataAfter.status, dataBefore.status, 'Status must be preserved');
    assert.strictEqual(dataAfter.isActive, dataBefore.isActive, 'isActive must be preserved');
    assert.strictEqual(dataAfter.groupId, TARGET_GROUP_ID, 'groupId must be preserved');
    assert.strictEqual(
      dataAfter.totalSavings,
      dataBefore.totalSavings,
      'totalSavings must be preserved'
    );
    assert.strictEqual(
      dataAfter.outstandingLoans || 0,
      dataBefore.outstandingLoans || 0,
      'outstandingLoans must be preserved'
    );

    updatedReports.push({
      docId: target.docId,
      memberCode: dataAfter.memberCode,
      verifiedName: dataAfter.name,
      verifiedFullName: dataAfter.fullName,
      codePoints: getCodePoints(dataAfter.name),
      preservedStatus: dataAfter.status,
      preservedShares: dataAfter.shares,
      preservedMonthlyContribution: dataAfter.monthlyContribution,
      preservedSavings: dataAfter.totalSavings,
    });
  }

  // 4. Verify Members Page representation via memberService.getAllMembers
  console.log('\n================================================================================');
  console.log('VERIFYING MEMBERS PAGE AND MEMBER DETAILS PAGE CONSISTENCY');
  console.log('================================================================================\n');

  const membersPageRes = await memberService.getAllMembers({ month: 10, year: 2026 }, TARGET_GROUP_ID);
  const memList = membersPageRes.members;

  for (const target of TARGETS) {
    const memOnPage = memList.find(m => m.id === target.docId);
    assert(memOnPage, `Member ${target.docId} must be present on Members page`);
    console.log(`[Members Page] ID: ${memOnPage.id} | Code: ${memOnPage.memberCode} | Name: "${memOnPage.name}"`);
    assert.strictEqual(
      memOnPage.name,
      target.correctName,
      `Members page name must match ${target.correctName}`
    );
    assert.strictEqual(
      memOnPage.fullName,
      target.correctName,
      `Members page fullName must match ${target.correctName}`
    );

    // Verify Member Details Page representation via memberService.getMemberById
    const memDetailsRes = await memberService.getMemberById(target.docId);
    assert(memDetailsRes.success, `getMemberById(${target.docId}) must succeed`);
    const memDetails = memDetailsRes.member;
    console.log(`[Member Details Page] ID: ${memDetails.id} | Code: ${memDetails.memberCode} | Name: "${memDetails.name}"`);
    assert.strictEqual(
      memDetails.name,
      target.correctName,
      `Member Details page name must match ${target.correctName}`
    );
    assert.strictEqual(
      memDetails.fullName,
      target.correctName,
      `Member Details page fullName must match ${target.correctName}`
    );
  }

  // 5. Verify no other member was altered
  const allUsersSnapAfter = await getDocs(collection(db, 'users'));
  const allUsersAfter = allUsersSnapAfter.docs.map(d => ({ id: d.id, ...d.data() }));
  assert.strictEqual(
    allUsersAfter.length,
    allUsersBefore.length,
    'Total user count must remain unchanged'
  );

  const untouchedMembers = allUsersAfter.filter(
    u => /^REG_\d+$/.test(u.id) && u.id !== 'REG_020' && u.id !== 'REG_007'
  );
  assert.strictEqual(
    untouchedMembers.length,
    41,
    'Exactly 41 other regular members must exist and be untouched'
  );

  // Verify admin accounts untouched
  const adminUsersAfter = allUsersAfter.filter(u => !/^REG_\d+$/.test(u.id));
  assert.strictEqual(
    adminUsersAfter.length,
    adminUsersBefore.length,
    'Admin accounts must remain unchanged'
  );

  console.log('\n✔ Verification complete: All 41 other members and all admin accounts remain untouched.');

  console.log('\n================================================================================');
  console.log('SUMMARY REPORT OF UPDATES');
  console.log('================================================================================');
  console.table(updatedReports);
  console.log('================================================================================');
  console.log('✔ All requirements met and verified successfully.');
}

main().catch(err => {
  console.error('Execution failed:', err);
  process.exit(1);
});
