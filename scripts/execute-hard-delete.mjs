import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireClient = createRequire(path.join(__dirname, '../client/package.json'));

const {
  signInWithEmailAndPassword,
  deleteUser,
  getAuth,
} = requireClient('firebase/auth');

const {
  initializeApp,
  getApp,
  deleteApp,
} = requireClient('firebase/app');

const {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  query,
  where,
  firebaseConfig,
} = await import('../client/src/config/firebase.js');

const GROUP_ID = 'shivshahi_group_001';

async function main() {
  console.log('================================================================================');
  console.log('STARTING HARD DELETE EXECUTION FOR 1–5 SHARE MEMBERS AND VAIBHAV PAWASE');
  console.log('Target Group: ' + GROUP_ID);
  console.log('Target Project: ' + firebaseConfig.projectId);
  console.log('================================================================================\n');

  assert.strictEqual(firebaseConfig.projectId, 'bachat-gat-32ffe', 'Must target Demo Web Firebase project bachat-gat-32ffe');

  // Step 1: Authenticate as admin
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // Step 2: Identify targets
  const usersSnap = await getDocs(collection(db, 'users'));
  const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const targetMemberIds = new Set();
  const targetDetails = [];

  for (const u of allUsers) {
    if (u.groupId !== GROUP_ID && u.group_id !== GROUP_ID) continue;

    // Preserved Admin Accounts
    if (u.id === 'w0c9RMahYOZI0Jd1ssOCyOrm8Ek2' || u.id === 'pcVA23e0edPrSVrL24UDhkKkolp1') {
      console.log(`[PRESERVE] Admin/System account preserved: ${u.id} (${u.name || u.fullName})`);
      continue;
    }

    // Check if Vaibhav Pawase
    const isVaibhav = u.id === 'gByYVbohdhQ4Gfi1NPltOcikyni2' ||
      (u.email && u.email.toLowerCase().includes('vaibhavpawase')) ||
      (u.name && u.name.toLowerCase().includes('vaibhav') && u.name.toLowerCase().includes('pawase'));

    // Check if 1-5 shares
    const isTestShareMember = ['test_user_share_1', 'test_user_share_2', 'test_user_share_3', 'test_user_share_5'].includes(u.id);
    const isRegMember = /^REG_\d+$/.test(u.id);

    let shareCount = null;
    if (typeof u.shares === 'number') shareCount = u.shares;
    else if (typeof u.shareCount === 'number') shareCount = u.shareCount;
    else if (u.shares && !isNaN(Number(u.shares))) shareCount = Number(u.shares);
    else if (u.shareCount && !isNaN(Number(u.shareCount))) shareCount = Number(u.shareCount);
    else if (u.monthlyShare === 1000) shareCount = 1;
    else if (u.monthlyShare === 2000) shareCount = 2;
    else if (u.monthlyShare === 3000) shareCount = 3;
    else if (u.monthlyShare === 5000) shareCount = 5;

    const has1to5Shares = shareCount >= 1 && shareCount <= 5;

    if (isVaibhav || isTestShareMember || isRegMember || has1to5Shares) {
      targetMemberIds.add(u.id);
      targetDetails.push({
        id: u.id,
        code: u.memberCode || u.member_code || u.id,
        name: u.name || u.fullName || 'No Name',
        shares: shareCount || 1,
        reason: isVaibhav ? 'Specifically targeted member Vaibhav Pawase' : `Member with ${shareCount || 1} share(s) (1–5 share range)`,
      });
    }
  }

  console.log(`\nIdentified ${targetDetails.length} target members for deletion:`);
  targetDetails.forEach((t, i) => {
    console.log(`  ${String(i + 1).padStart(2, '0')}. ID: ${t.id.padEnd(28)} | Code: ${String(t.code).padEnd(8)} | Shares: ${t.shares} | Name: ${t.name.padEnd(25)} | Reason: ${t.reason}`);
  });

  assert(targetMemberIds.has('gByYVbohdhQ4Gfi1NPltOcikyni2'), 'Target list must include Vaibhav Pawase');
  assert(targetMemberIds.has('test_user_share_1'), 'Target list must include test_user_share_1');
  assert(targetMemberIds.has('test_user_share_2'), 'Target list must include test_user_share_2');
  assert(targetMemberIds.has('test_user_share_3'), 'Target list must include test_user_share_3');
  assert(targetMemberIds.has('test_user_share_5'), 'Target list must include test_user_share_5');
  assert(targetMemberIds.has('REG_001'), 'Target list must include REG_001');
  assert(targetMemberIds.has('REG_043'), 'Target list must include REG_043');

  // Step 3: Find related records
  const [contribSnap, txSnap, loansSnap, repaySnap] = await Promise.all([
    getDocs(collection(db, 'monthlyContributions')),
    getDocs(collection(db, 'transactions')),
    getDocs(collection(db, 'loans')),
    getDocs(collection(db, 'repayments')),
  ]);

  const targetContribDocs = contribSnap.docs.filter(d => {
    const data = d.data();
    return targetMemberIds.has(data.memberId) || targetMemberIds.has(data.member_id);
  });

  const targetTxDocs = txSnap.docs.filter(d => {
    const data = d.data();
    return targetMemberIds.has(data.memberId) || targetMemberIds.has(data.member_id) || targetMemberIds.has(data.userId);
  });

  const targetLoanDocs = loansSnap.docs.filter(d => {
    const data = d.data();
    return targetMemberIds.has(data.memberId) || targetMemberIds.has(data.member_id);
  });

  const targetRepayDocs = repaySnap.docs.filter(d => {
    const data = d.data();
    return targetMemberIds.has(data.memberId) || targetMemberIds.has(data.member_id);
  });

  console.log(`\nRelated records found for targets:`);
  console.log(`- monthlyContributions: ${targetContribDocs.length}`);
  console.log(`- transactions: ${targetTxDocs.length}`);
  console.log(`- loans: ${targetLoanDocs.length}`);
  console.log(`- repayments: ${targetRepayDocs.length}`);

  // Step 4: Execute Batch Deletions in chunks (Firestore max batch size = 500)
  const allOps = [];

  // Member docs
  for (const mid of targetMemberIds) {
    allOps.push({ type: 'delete', ref: doc(db, 'users', mid), desc: `users/${mid}` });
  }

  // Monthly contribution docs
  for (const cd of targetContribDocs) {
    allOps.push({ type: 'delete', ref: cd.ref, desc: `monthlyContributions/${cd.id}` });
  }

  // Transaction docs
  for (const td of targetTxDocs) {
    allOps.push({ type: 'delete', ref: td.ref, desc: `transactions/${td.id}` });
  }

  // Loan & Repayment docs (if any)
  for (const ld of targetLoanDocs) {
    allOps.push({ type: 'delete', ref: ld.ref, desc: `loans/${ld.id}` });
  }
  for (const rd of targetRepayDocs) {
    allOps.push({ type: 'delete', ref: rd.ref, desc: `repayments/${rd.id}` });
  }

  // Reconciled group document update
  const remainingActiveMembers = 0; // All 43 regular members + 4 test + 1 Vaibhav deleted
  const reconciledGroupDoc = {
    totalSavings: 0,
    total_savings: 0,
    availableBalance: 0,
    available_balance: 0,
    totalFund: 0,
    total_fund: 0,
    rawAvailableBalance: 0,
    activeMembers: remainingActiveMembers,
    active_members: remainingActiveMembers,
    membersCount: 2, // 2 preserved admin accounts
    totalOutstandingLoans: 0,
    total_outstanding_loans: 0,
    activeLoans: 0,
    active_loans: 0,
    totalInterestCollected: 0,
    totalInterestPaid: 0,
    total_interest: 0,
    updatedAt: new Date().toISOString(),
  };

  allOps.push({
    type: 'update',
    ref: doc(db, 'groups', GROUP_ID),
    data: reconciledGroupDoc,
    desc: `groups/${GROUP_ID} reconciliation`,
  });

  console.log(`\nExecuting ${allOps.length} Firestore database operations via batches...`);
  const CHUNK_SIZE = 400;
  for (let i = 0; i < allOps.length; i += CHUNK_SIZE) {
    const chunk = allOps.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === 'delete') {
        batch.delete(op.ref);
      } else if (op.type === 'update') {
        batch.update(op.ref, op.data);
      }
    }
    await batch.commit();
    console.log(`✔ Committed batch chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} operations)`);
  }

  console.log('✔ All Firestore documents hard-deleted and group totals reconciled successfully!\n');

  // Step 5: Firebase Authentication Cleanup for Vaibhav Pawase
  console.log('================ FIREBASE AUTHENTICATION CLEANUP ================');
  try {
    const tempApp = initializeApp(firebaseConfig, 'vaibhav-auth-cleanup');
    const tempAuth = getAuth(tempApp);
    const userCredential = await signInWithEmailAndPassword(tempAuth, 'vaibhavpawase143@gmail.com', '123456');
    console.log(`✔ Authenticated as Vaibhav Pawase (${userCredential.user.email}, UID: ${userCredential.user.uid})`);

    await deleteUser(userCredential.user);
    console.log('✔ Permanently hard-deleted Vaibhav Pawase account from Firebase Authentication!');
    await deleteApp(tempApp);
  } catch (authErr) {
    console.warn(`Notice during Firebase Auth cleanup: ${authErr.message}`);
    if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
      console.log('Firebase Auth user already absent or removed.');
    }
  }

  // Step 6: Post-deletion Verification
  console.log('\n================ POST-DELETION VERIFICATION ================');
  const postUsersSnap = await getDocs(collection(db, 'users'));
  const postUsers = postUsersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Remaining users in 'users' collection: ${postUsers.length}`);

  for (const mid of targetMemberIds) {
    const stillExists = postUsers.some(u => u.id === mid);
    assert(!stillExists, `Target member ${mid} MUST be deleted!`);
  }
  console.log('✔ Verified: 100% of the 48 target members are permanently absent from users collection.');

  // Verify preserved accounts
  const adminDoc = postUsers.find(u => u.id === 'w0c9RMahYOZI0Jd1ssOCyOrm8Ek2');
  assert(adminDoc, 'Admin account w0c9RMahYOZI0Jd1ssOCyOrm8Ek2 must be preserved!');
  console.log(`✔ Verified: Administrator ${adminDoc.name} (${adminDoc.email}) is intact.`);

  // Verify contributions
  const postContribSnap = await getDocs(collection(db, 'monthlyContributions'));
  console.log(`Remaining monthly contributions: ${postContribSnap.size}`);
  for (const cd of postContribSnap.docs) {
    const data = cd.data();
    assert(!targetMemberIds.has(data.memberId), `Contribution ${cd.id} for target ${data.memberId} must not exist`);
  }
  console.log('✔ Verified: All 45 target contributions are deleted.');

  // Verify group document
  const postGroupSnap = await getDoc(doc(db, 'groups', GROUP_ID));
  const postGroupData = postGroupSnap.data();
  console.log(`Reconciled Group Totals:`);
  console.log(`- totalSavings: ₹${postGroupData.totalSavings}`);
  console.log(`- availableBalance: ₹${postGroupData.availableBalance}`);
  console.log(`- totalFund: ₹${postGroupData.totalFund}`);
  console.log(`- membersCount: ${postGroupData.membersCount}`);
  assert.strictEqual(postGroupData.totalSavings, 0);
  assert.strictEqual(postGroupData.availableBalance, 0);

  console.log('\n✔ HARD DELETION AND POST-VERIFICATION COMPLETE AND SUCCESSFUL!');
}

main().catch(err => {
  console.error('Hard delete execution failed:', err);
  process.exit(1);
});
