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
  query,
  where,
  firebaseConfig,
} = await import('../client/src/config/firebase.js');

const { memberService } = await import('../client/src/services/memberService.js');

const TARGET_PROJECT_ID = 'bachat-gat-32ffe';
const TARGET_GROUP_ID = 'shivshahi_group_001';

async function main() {
  console.log('Project ID:', firebaseConfig.projectId);
  assert.strictEqual(firebaseConfig.projectId, TARGET_PROJECT_ID);

  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated as admin');

  const targetIds = ['REG_007', 'REG_020'];

  for (const docId of targetIds) {
    console.log(`\n=================== INSPECTING ${docId} ===================`);
    const userDocRef = doc(db, 'users', docId);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      console.log(`User doc ${docId} does NOT exist!`);
    } else {
      console.log(`User doc ${docId} data:`, JSON.stringify(userSnap.data(), null, 2));
    }
  }

  // Check if any other doc in 'users' matches or contains these names
  const allUsersSnap = await getDocs(collection(db, 'users'));
  console.log(`\nTotal users in 'users' collection: ${allUsersSnap.docs.length}`);
  for (const d of allUsersSnap.docs) {
    const data = d.data();
    const str = JSON.stringify(data);
    if (str.includes('होशीराम') || str.includes('हर्षीराम') || str.includes('कुऱ्हे') || str.includes('कुन्हे') || str.includes('007') || str.includes('020')) {
      console.log(`User match [${d.id}]:`, JSON.stringify(data, null, 2));
    }
  }

  // Check 'loans' collection
  const allLoansSnap = await getDocs(collection(db, 'loans'));
  console.log(`\nTotal loans in 'loans' collection: ${allLoansSnap.docs.length}`);
  for (const d of allLoansSnap.docs) {
    const data = d.data();
    const str = JSON.stringify(data);
    if (str.includes('होशीराम') || str.includes('हर्षीराम') || str.includes('कुऱ्हे') || str.includes('कुन्हे') || str.includes('REG_007') || str.includes('REG_020') || data.memberId === 'REG_007' || data.memberId === 'REG_020') {
      console.log(`Loan match [${d.id}]:`, JSON.stringify(data, null, 2));
    }
  }

  // Check 'transactions' collection
  const allTxSnap = await getDocs(collection(db, 'transactions'));
  console.log(`\nTotal txs in 'transactions' collection: ${allTxSnap.docs.length}`);
  for (const d of allTxSnap.docs) {
    const data = d.data();
    const str = JSON.stringify(data);
    if (str.includes('होशीराम') || str.includes('हर्षीराम') || str.includes('कुऱ्हे') || str.includes('कुन्हे') || str.includes('REG_007') || str.includes('REG_020') || data.memberId === 'REG_007' || data.memberId === 'REG_020') {
      console.log(`Tx match [${d.id}]:`, JSON.stringify(data, null, 2));
    }
  }

  // Check 'monthlyContributions' collection
  const allContribSnap = await getDocs(collection(db, 'monthlyContributions'));
  console.log(`\nTotal monthlyContributions: ${allContribSnap.docs.length}`);
  for (const d of allContribSnap.docs) {
    const data = d.data();
    const str = JSON.stringify(data);
    if (str.includes('होशीराम') || str.includes('हर्षीराम') || str.includes('कुऱ्हे') || str.includes('कुन्हे') || str.includes('REG_007') || str.includes('REG_020') || data.memberId === 'REG_007' || data.memberId === 'REG_020') {
      console.log(`Contrib match [${d.id}]:`, JSON.stringify(data, null, 2));
    }
  }

  // Check memberService
  const memRes = await memberService.getAllMembers({ month: 10, year: 2026 }, TARGET_GROUP_ID);
  const mem007 = memRes.members.find(m => m.id === 'REG_007');
  const mem020 = memRes.members.find(m => m.id === 'REG_020');
  console.log('\nmemberService mem007:', mem007 ? { id: mem007.id, name: mem007.name, fullName: mem007.fullName, memberCode: mem007.memberCode } : 'Not found');
  console.log('memberService mem020:', mem020 ? { id: mem020.id, name: mem020.name, fullName: mem020.fullName, memberCode: mem020.memberCode } : 'Not found');
}

main().catch(console.error);
