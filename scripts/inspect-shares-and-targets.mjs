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
  getDocs,
} = await import('../client/src/config/firebase.js');

async function main() {
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  // Fetch users, loans, repayments, contributions, transactions
  const [usersSnap, loansSnap, repaySnap, contribSnap, txSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'loans')),
    getDocs(collection(db, 'repayments')),
    getDocs(collection(db, 'monthlyContributions')),
    getDocs(collection(db, 'transactions')),
  ]);

  const allUsers = usersSnap.docs.map(d => ({ _id: d.id, ...d.data() }));
  const allLoans = loansSnap.docs.map(d => ({ _id: d.id, ...d.data() }));
  const allRepayments = repaySnap.docs.map(d => ({ _id: d.id, ...d.data() }));
  const allContributions = contribSnap.docs.map(d => ({ _id: d.id, ...d.data() }));
  const allTransactions = txSnap.docs.map(d => ({ _id: d.id, ...d.data() }));

  console.log(`=== DATABASE OVERVIEW ===`);
  console.log(`Total users: ${allUsers.length}`);
  console.log(`Total loans: ${allLoans.length}`);
  console.log(`Total repayments: ${allRepayments.length}`);
  console.log(`Total monthly contributions: ${allContributions.length}`);
  console.log(`Total transactions: ${allTransactions.length}`);

  // Let's print all users belonging to shivshahi_group_001 or all users generally
  console.log(`\n=== ALL USERS DETAILS ===`);
  for (const u of allUsers) {
    const name = u.name || u.fullName || u.full_name || '';
    const code = u.memberCode || u.member_code || '';
    const role = u.role || u.role_name || '';
    const shares = u.shares !== undefined ? u.shares : (u.shareCount !== undefined ? u.shareCount : 'UNSET');
    const monthlyContribution = u.monthlyContribution || u.monthly_contribution || '';
    const monthlyHafta = u.monthlyHaftaAmount || u.monthly_hafta_amount || '';
    const groupId = u.groupId || u.group_id || 'NO_GROUP';

    console.log(JSON.stringify({
      id: u._id,
      name,
      code,
      role,
      shares,
      rawShares: u.shares,
      rawShareCount: u.shareCount,
      monthlyContribution,
      monthlyHafta,
      groupId,
      email: u.email || '',
      phone: u.phone || '',
      authUid: u.authUid || u.userId || u.firebaseUid || '',
    }));
  }

  // Specifically check for Vaibhav Pawase
  console.log(`\n=== SEARCHING FOR VAIBHAV PAWASE ===`);
  const vaibhavUsers = allUsers.filter(u => {
    const full = `${u.name || ''} ${u.fullName || ''} ${u.email || ''}`.toLowerCase();
    return full.includes('vaibhav') || full.includes('pawase');
  });
  console.log(`Found ${vaibhavUsers.length} user record(s) matching Vaibhav Pawase:`);
  console.log(JSON.stringify(vaibhavUsers, null, 2));

  // Check 1-5 shares
  console.log(`\n=== MEMBERS WITH 1 TO 5 SHARES IN shivshahi_group_001 ===`);
  const groupUsers = allUsers.filter(u => (u.groupId || u.group_id) === 'shivshahi_group_001');
  console.log(`Total users in shivshahi_group_001: ${groupUsers.length}`);

  for (const u of groupUsers) {
    // Determine shares
    let shareNum = null;
    if (typeof u.shares === 'number') shareNum = u.shares;
    else if (typeof u.shareCount === 'number') shareNum = u.shareCount;
    else if (u.shares && !isNaN(Number(u.shares))) shareNum = Number(u.shares);
    else if (u.shareCount && !isNaN(Number(u.shareCount))) shareNum = Number(u.shareCount);

    console.log(`Member: ${u.name || u.fullName} (ID: ${u._id}, Code: ${u.memberCode || u.member_code}) => Detected Shares: ${shareNum}, Raw: shares=${u.shares}, shareCount=${u.shareCount}, monthlyContribution=${u.monthlyContribution}`);
  }
}

main().catch(console.error);
