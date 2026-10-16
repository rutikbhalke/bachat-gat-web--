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
} = await import('../client/src/config/firebase.js');

const { savingsService } = await import('../client/src/services/savingsService.js');
const { reportService } = await import('../client/src/services/reportService.js');
const { groupService } = await import('../client/src/services/groupService.js');

const PROD_GROUP_ID = 'shivshahi_group_001';
const TARGET_MONTH = 10;
const TARGET_YEAR = 2026;

console.log('================================================================================');
console.log('E2E TEST: COLLECT SAVINGS FOR 45 MEMBERS AND LEAVE 3 MEMBERS PENDING');
console.log('Group: ' + PROD_GROUP_ID + ' | Period: ' + TARGET_MONTH + '/' + TARGET_YEAR);
console.log('================================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function runAsyncTest(testNum, testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✔ [PASS] Test ${testNum}: ${testName}`);
  } catch (err) {
    console.error(`❌ [FAIL] Test ${testNum}: ${testName}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  // Step 1: Authentication
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // Step 2: Safety Backup of Current Demo State
  const preTestBackup = {
    timestamp: new Date().toISOString(),
    groupId: PROD_GROUP_ID,
    group: (await getDoc(doc(db, 'groups', PROD_GROUP_ID))).data(),
    usersCount: (await getDocs(collection(db, 'users'))).size,
    contributionsCount: (await getDocs(collection(db, 'monthlyContributions'))).size,
  };
  const backupPath = path.join(__dirname, '../database_backup_pre_45_member_collection.json');
  fs.writeFileSync(backupPath, JSON.stringify(preTestBackup, null, 2), 'utf8');
  console.log(`✔ [SAFETY] State snapshot saved to: ${backupPath}\n`);

  // Step 3: Inspect current member list and identify eligible members vs admin/test
  const usersSnap = await getDocs(collection(db, 'users'));
  const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const admins = allUsers.filter((u) => (u.role || u.role_name || '').toUpperCase() === 'ADMIN' || u.email?.includes('admin'));
  const testGroupUsers = allUsers.filter((u) => u.groupId === 'test_isolated_group_999');
  const shivshahiMembers = allUsers.filter((u) => u.groupId === PROD_GROUP_ID && (u.role || u.role_name || '').toUpperCase() !== 'ADMIN' && !u.email?.includes('admin'));

  console.log('================ MEMBER LIST INSPECTION ================');
  console.log(`Total records in 'users': ${allUsers.length}`);
  console.log(`Administrators identified: ${admins.length} (ID: ${admins[0]?.id}, Name: ${admins[0]?.name}, Email: ${admins[0]?.email})`);
  console.log(`Test users in test_isolated_group_999: ${testGroupUsers.length}`);
  console.log(`Eligible registered members in ${PROD_GROUP_ID}: ${shivshahiMembers.length}`);

  // To test collecting 45 members and leaving exactly 3 members pending (45 + 3 = 48 members):
  // We incorporate 4 test members (TM-01, TM-02, TM-03, TM-05) into shivshahi_group_001 with ₹1,000 share
  console.log('\nConfiguring 4 additional eligible test members in shivshahi_group_001 (total eligible = 48 members)...');
  const testMembersToAssign = [
    { id: 'test_user_share_1', code: 'TM-01', name: 'Member 1-Share' },
    { id: 'test_user_share_2', code: 'TM-02', name: 'Member 2-Shares' },
    { id: 'test_user_share_3', code: 'TM-03', name: 'Member 3-Shares' },
    { id: 'test_user_share_5', code: 'TM-05', name: 'Member 5-Shares' },
  ];

  for (const tm of testMembersToAssign) {
    await setDoc(doc(db, 'users', tm.id), {
      id: tm.id,
      memberId: tm.id,
      groupId: PROD_GROUP_ID,
      name: tm.name,
      fullName: tm.name,
      memberCode: tm.code,
      role: 'MEMBER',
      status: 'ACTIVE',
      isActive: true,
      monthlyContribution: 1000,
      monthly_contribution: 1000,
      createdAt: new Date().toISOString(),
    }, { merge: true });
  }

  // Fetch updated Bulk Savings preview for shivshahi_group_001
  const preview = await savingsService.getBulkSavingsPreview({ month: TARGET_MONTH, year: TARGET_YEAR }, PROD_GROUP_ID);
  assert.strictEqual(preview.success, true, 'Preview must succeed');
  const eligibleMembers = preview.members || [];
  console.log(`✔ Verified eligible members in Bulk Savings Preview: ${eligibleMembers.length} members`);
  assert(eligibleMembers.length >= 48, `Expected at least 48 eligible members, found ${eligibleMembers.length}`);

  // Select exactly 3 members to leave UNCOLLECTED
  // We select the 3 members with highest registration codes: REG_041, REG_042, REG_043
  const excludedMemberCodes = ['041', '042', '043'];
  const excludedMembers = eligibleMembers.filter((m) => excludedMemberCodes.includes(String(m.memberCode)));
  assert.strictEqual(excludedMembers.length, 3, 'Must identify exactly 3 excluded members');

  const excludedIds = new Set(excludedMembers.map((m) => m.memberId));

  // The 45 collected members are all other eligible members (up to 45 members)
  const collectedMembers = eligibleMembers.filter((m) => !excludedIds.has(m.memberId)).slice(0, 45);
  assert.strictEqual(collectedMembers.length, 45, 'Must have exactly 45 collected members');

  console.log('\n================ TEST SETUP SUMMARY ================');
  console.log('EXCLUDED (3 UNCOLLECTED MEMBERS):');
  excludedMembers.forEach((m, idx) => {
    console.log(`  ${idx + 1}. ID: ${m.memberId.padEnd(10)} | Code: ${m.memberCode.padEnd(5)} | Name: ${m.memberName.padEnd(25)} | Expected Due: ₹${m.remainingDue}`);
  });

  console.log(`\nCOLLECTED (45 MEMBERS): 45 members selected (₹1,000 each)`);
  console.log(`  First 3: ${collectedMembers.slice(0, 3).map(m => `#${m.memberCode} ${m.memberName}`).join(', ')}`);
  console.log(`  Last 3:  ${collectedMembers.slice(-3).map(m => `#${m.memberCode} ${m.memberName}`).join(', ')}`);

  // Verify group initial balance before collection
  const preGroupSnap = await getDoc(doc(db, 'groups', PROD_GROUP_ID));
  const preGroupData = preGroupSnap.data();
  const preTotalSavings = Number(preGroupData.totalSavings || 0);
  const preAvailableBalance = Number(preGroupData.availableBalance || 0);

  // ============================================================================
  // TEST 1: Verification before submission
  // ============================================================================
  await runAsyncTest(1, 'Verify that 3 excluded members are NOT included in the bulk collection request payload', async () => {
    const payloadItems = collectedMembers.map((m) => ({
      memberId: m.memberId,
      memberName: m.memberName,
      memberCode: m.memberCode,
      amount: 1000,
      paymentMode: 'UPI',
    }));

    assert.strictEqual(payloadItems.length, 45, 'Payload must contain exactly 45 items');
    for (const exId of excludedIds) {
      assert(!payloadItems.some((item) => item.memberId === exId), `Excluded member ${exId} must not be in payload`);
    }
  });

  // ============================================================================
  // TEST 2: Submit Bulk Collection
  // ============================================================================
  let bulkResult = null;
  await runAsyncTest(2, 'Submit bulk monthly savings for 45 members (₹45,000 total)', async () => {
    const bulkPayload = {
      groupId: PROD_GROUP_ID,
      month: TARGET_MONTH,
      year: TARGET_YEAR,
      clientRequestId: `E2E_BULK_45_MEMBERS_${Date.now()}`,
      items: collectedMembers.map((m) => ({
        memberId: m.memberId,
        memberName: m.memberName,
        memberCode: m.memberCode,
        amount: 1000,
        paymentMode: 'UPI',
      })),
    };

    bulkResult = await savingsService.recordBulkSavings(bulkPayload, PROD_GROUP_ID);
    assert.strictEqual(bulkResult.success, true, 'Bulk savings submission must succeed');
    assert.strictEqual(bulkResult.count, 45, 'Bulk savings must report 45 members collected');
    assert.strictEqual(bulkResult.totalCollected, 45000, 'Total collected must equal ₹45,000');
  });

  // ============================================================================
  // TEST 3: Verify Database Contribution Records
  // ============================================================================
  await runAsyncTest(3, 'Verify all 45 collected members have contribution records and 3 excluded have NONE', async () => {
    // Check 45 collected members
    for (const cm of collectedMembers) {
      const docId = `C_${cm.memberId}_${TARGET_YEAR}_${String(TARGET_MONTH).padStart(2, '0')}`;
      const snap = await getDoc(doc(db, 'monthlyContributions', docId));
      assert(snap.exists(), `Contribution record ${docId} must exist for collected member ${cm.memberName}`);
      const data = snap.data();
      assert.strictEqual(Number(data.paidAmount), 1000, `Paid amount for ${cm.memberName} must be 1000`);
      assert.strictEqual(Number(data.month), TARGET_MONTH);
      assert.strictEqual(Number(data.year), TARGET_YEAR);
    }

    // Check 3 excluded members
    for (const ex of excludedMembers) {
      const docId = `C_${ex.memberId}_${TARGET_YEAR}_${String(TARGET_MONTH).padStart(2, '0')}`;
      const snap = await getDoc(doc(db, 'monthlyContributions', docId));
      assert(!snap.exists(), `Contribution record ${docId} must NOT exist for excluded member ${ex.memberName}`);
    }
  });

  // ============================================================================
  // TEST 4: Verify Group Totals Increase Only by Collected Amount
  // ============================================================================
  await runAsyncTest(4, 'Verify group totals increase by exactly ₹45,000 (pre: ₹0 -> post: ₹45,000)', async () => {
    const postGroupSnap = await getDoc(doc(db, 'groups', PROD_GROUP_ID));
    const postGroupData = postGroupSnap.data();

    const expectedSavings = preTotalSavings + 45000;
    const expectedAvailable = preAvailableBalance + 45000;

    assert.strictEqual(Number(postGroupData.totalSavings), expectedSavings, `totalSavings must equal ₹${expectedSavings}`);
    assert.strictEqual(Number(postGroupData.totalFund), expectedSavings, `totalFund must equal ₹${expectedSavings}`);
    assert.strictEqual(Number(postGroupData.availableBalance), expectedAvailable, `availableBalance must equal ₹${expectedAvailable}`);
  });

  // ============================================================================
  // TEST 5: Open Pending Due Report for Month 10, 2026
  // ============================================================================
  let pendingReport = null;
  await runAsyncTest(5, 'Open Pending Due Report and verify all 3 excluded members appear', async () => {
    pendingReport = await reportService.getPendingDuesReport(TARGET_MONTH, TARGET_YEAR, '', PROD_GROUP_ID);
    assert.strictEqual(pendingReport.success, true, 'Pending dues query must succeed');

    const duesList = pendingReport.duesList || [];
    for (const ex of excludedMembers) {
      const found = duesList.find((d) => d.memberId === ex.memberId);
      assert(found, `Excluded member ${ex.memberName} (#${ex.memberCode}) MUST appear in Pending Due`);
    }
  });

  // ============================================================================
  // TEST 6: Verify Exact Pending Amounts for the 3 Excluded Members
  // ============================================================================
  await runAsyncTest(6, 'Verify each excluded member has exact expected pending monthly savings (₹1,000 each)', async () => {
    const duesList = pendingReport.duesList || [];
    for (const ex of excludedMembers) {
      const item = duesList.find((d) => d.memberId === ex.memberId);
      assert.strictEqual(item.pendingHafta, 1000, `Pending Hafta for ${item.memberName} must be ₹1,000`);
      assert.strictEqual(item.outstandingPrincipal, 0, `Loan principal due must be 0`);
      assert.strictEqual(item.pendingInterest, 0, `Loan interest due must be 0`);
      assert.strictEqual(item.totalPending, 1000, `Total pending for ${item.memberName} must be ₹1,000`);
    }
  });

  // ============================================================================
  // TEST 7: Verify NONE of the 45 Paid Members Appear in Pending Due
  // ============================================================================
  await runAsyncTest(7, 'Verify that none of the 45 fully paid members appear in Pending Due for Month 10, 2026', async () => {
    const duesList = pendingReport.duesList || [];
    for (const cm of collectedMembers) {
      const found = duesList.find((d) => d.memberId === cm.memberId);
      assert(!found, `Fully paid member ${cm.memberName} (#${cm.memberCode}) must NOT appear in Pending Due`);
    }
  });

  // ============================================================================
  // TEST 8: Verify No Duplicate Members in Dues List
  // ============================================================================
  await runAsyncTest(8, 'Ensure no member is listed twice in Pending Due', async () => {
    const seen = new Set();
    const duesList = pendingReport.duesList || [];
    for (const d of duesList) {
      assert(!seen.has(d.memberId), `Member ${d.memberName} must not appear more than once in Pending Due`);
      seen.add(d.memberId);
    }
  });

  // ============================================================================
  // TEST 9: Verify Reading Pending Due is Purely Non-Mutating
  // ============================================================================
  await runAsyncTest(9, 'Confirm simply viewing Pending Due does not create or modify any financial records', async () => {
    const snapBefore = await getDoc(doc(db, 'groups', PROD_GROUP_ID));
    const bBefore = snapBefore.data();

    // Call report multiple times with various parameters
    await reportService.getPendingDuesReport(TARGET_MONTH, TARGET_YEAR, '', PROD_GROUP_ID);
    await reportService.getPendingDuesReport(TARGET_MONTH, TARGET_YEAR, 'मनोहर', PROD_GROUP_ID);

    const snapAfter = await getDoc(doc(db, 'groups', PROD_GROUP_ID));
    const bAfter = snapAfter.data();

    assert.strictEqual(bAfter.totalSavings, bBefore.totalSavings, 'totalSavings must remain unchanged');
    assert.strictEqual(bAfter.availableBalance, bBefore.availableBalance, 'availableBalance must remain unchanged');
  });

  // ============================================================================
  // TEST 10: Retain 45 New Entries (Do not delete automatically as requested)
  // ============================================================================
  await runAsyncTest(10, 'Confirm 45 new savings entries are retained in demo group for subsequent testing', async () => {
    const countSnap = await getDocs(collection(db, 'monthlyContributions'));
    assert.strictEqual(countSnap.size, 45, 'All 45 new contribution records must remain saved in database');
  });

  console.log('\n================================================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================================');
  if (passedTests === totalTests) {
    console.log('🎉 ALL 10 E2E BULK COLLECTION & PENDING DUE VERIFICATION TESTS PASSED!');
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
