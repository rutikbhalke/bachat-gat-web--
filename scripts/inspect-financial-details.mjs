import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function main() {
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth\n');

  // 1. Group info
  const groupSnap = await getDoc(doc(db, 'groups', 'shivshahi_group_001'));
  console.log('=== GROUP SHIVSHAHI_GROUP_001 ===');
  console.log(JSON.stringify(groupSnap.data(), null, 2));

  // 2. Contributions
  const contribSnap = await getDocs(collection(db, 'monthlyContributions'));
  const contributions = contribSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`\n=== CONTRIBUTIONS (${contributions.length}) ===`);
  const contribByMember = {};
  for (const c of contributions) {
    const memId = c.memberId || c.member_id || 'UNKNOWN';
    contribByMember[memId] = (contribByMember[memId] || 0) + (c.paidAmount || c.amount || 0);
  }
  console.log('Contributions by Member ID:');
  console.log(JSON.stringify(contribByMember, null, 2));

  // 3. Transactions
  const txSnap = await getDocs(collection(db, 'transactions'));
  const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`\n=== TRANSACTIONS (${transactions.length}) ===`);
  const txByMember = {};
  for (const t of transactions) {
    const memId = t.memberId || t.member_id || t.userId || 'NO_MEMBER_ID';
    txByMember[memId] = (txByMember[memId] || 0) + 1;
  }
  console.log('Transactions by Member ID:');
  console.log(JSON.stringify(txByMember, null, 2));

  // 4. Loans & Repayments
  const loanSnap = await getDocs(collection(db, 'loans'));
  console.log(`\n=== LOANS (${loanSnap.size}) ===`);
  loanSnap.docs.forEach(d => console.log(d.id, d.data()));

  const repaySnap = await getDocs(collection(db, 'repayments'));
  console.log(`\n=== REPAYMENTS (${repaySnap.size}) ===`);
  repaySnap.docs.forEach(d => console.log(d.id, d.data()));

  // 5. Check Pawase Vaibhav specifics
  const vaibhavSnap = await getDoc(doc(db, 'users', 'gByYVbohdhQ4Gfi1NPltOcikyni2'));
  console.log('\n=== VAIBHAV PAWASE DOC ===');
  if (vaibhavSnap.exists()) {
    console.log(JSON.stringify(vaibhavSnap.data(), null, 2));
  } else {
    console.log('Vaibhav Pawase document not found by id gByYVbohdhQ4Gfi1NPltOcikyni2');
  }

  // 6. Check Test members specifics
  const testIds = ['test_user_share_1', 'test_user_share_2', 'test_user_share_3', 'test_user_share_5'];
  console.log('\n=== TEST MEMBERS (TM-01, TM-02, TM-03, TM-05) ===');
  for (const tid of testIds) {
    const tSnap = await getDoc(doc(db, 'users', tid));
    if (tSnap.exists()) {
      console.log(tid, JSON.stringify(tSnap.data(), null, 2));
    } else {
      console.log(tid, 'NOT FOUND');
    }
  }

  // 7. Check 3 pending members REG_041, REG_042, REG_043
  const pendingIds = ['REG_041', 'REG_042', 'REG_043'];
  console.log('\n=== 3 PENDING MEMBERS (REG_041, REG_042, REG_043) ===');
  for (const pid of pendingIds) {
    const pSnap = await getDoc(doc(db, 'users', pid));
    if (pSnap.exists()) {
      console.log(pid, JSON.stringify(pSnap.data(), null, 2));
    }
  }
}

main().catch(console.error);
