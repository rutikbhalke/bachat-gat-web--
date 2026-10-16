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

  const usersSnap = await getDocs(collection(db, 'users'));
  const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const collections = ['monthlyContributions', 'loans', 'repayments', 'transactions'];
  const allColData = {};

  for (const c of collections) {
    const snap = await getDocs(collection(db, c));
    allColData[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Analyze every user
  console.log('ID | Name | MemberCode | Role | Shares | ShareCount | MonthlyShare | MonthlyContrib | LinkedContribs | LinkedLoans | LinkedRepays | LinkedTxs');
  console.log('-----------------------------------------------------------------------------------------------------------------------------------------');

  for (const u of allUsers) {
    const uid = u.id;
    const name = u.name || u.fullName || '';
    const code = u.memberCode || u.member_code || '';
    const role = u.role || u.role_name || '';
    const shares = u.shares;
    const shareCount = u.shareCount;
    const monthlyShare = u.monthlyShare;
    const monthlyContrib = u.monthlyContribution;

    const contribs = allColData.monthlyContributions.filter(c => c.memberId === uid || c.member_id === uid);
    const loans = allColData.loans.filter(l => l.memberId === uid || l.member_id === uid);
    const repays = allColData.repayments.filter(r => r.memberId === uid || r.member_id === uid);
    const txs = allColData.transactions.filter(t => t.memberId === uid || t.member_id === uid || t.userId === uid);

    console.log(`${uid.padEnd(28)} | ${name.padEnd(24)} | ${String(code).padEnd(8)} | ${role.padEnd(8)} | ${String(shares).padEnd(6)} | ${String(shareCount).padEnd(10)} | ${String(monthlyShare).padEnd(12)} | ${String(monthlyContrib).padEnd(14)} | ${contribs.length} (₹${contribs.reduce((s, c) => s + (c.paidAmount || 0), 0)}) | ${loans.length} | ${repays.length} | ${txs.length}`);
  }
}

main().catch(console.error);
