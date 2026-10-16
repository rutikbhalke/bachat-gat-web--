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
  collection,
  doc,
  getDoc,
  getDocs,
  firebaseConfig,
} = await import('../client/src/config/firebase.js');

const { memberService } = await import('../client/src/services/memberService.js');
const { groupService } = await import('../client/src/services/groupService.js');

const GROUP_ID = 'shivshahi_group_001';

async function verifyLiveFirestore() {
  console.log('Connecting to Firebase Project:', firebaseConfig.projectId);
  assert.strictEqual(firebaseConfig.projectId, 'bachat-gat-32ffe');

  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');

  // 1. Direct read from 'groups'
  const groupSnap = await getDoc(doc(db, 'groups', GROUP_ID));
  const group = groupSnap.data();

  // 2. Direct read from 'users'
  const usersSnap = await getDocs(collection(db, 'users'));
  const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const regMembers = allUsers
    .filter(u => /^REG_\d+$/.test(u.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const adminUsers = allUsers.filter(u => !/^REG_\d+$/.test(u.id));

  // 3. Direct read from 'monthlyContributions'
  const contribSnap = await getDocs(collection(db, 'monthlyContributions'));
  const allContribs = contribSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const baseContribs = allContribs.filter(c => c.groupId === GROUP_ID && c.isBase === true);

  // 4. Direct read from 'transactions'
  const txSnap = await getDocs(collection(db, 'transactions'));
  const allTxs = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const baseTxs = allTxs.filter(t => t.id && t.id.startsWith('ACT_REG_') && t.id.endsWith('_base_savings'));

  // 5. Read memberService for Oct 2026 dues
  const memRes = await memberService.getAllMembers({ month: 10, year: 2026 }, GROUP_ID);
  const memMap = new Map(memRes.members.map(m => [m.id, m]));

  const summary = {
    projectId: firebaseConfig.projectId,
    groupId: GROUP_ID,
    groupDoc: {
      name: group.name,
      totalSavings: group.totalSavings,
      availableBalance: group.availableBalance,
      totalFund: group.totalFund,
      activeMembers: group.activeMembers,
      membersCount: group.membersCount,
    },
    counts: {
      totalUsers: allUsers.length,
      regMembers: regMembers.length,
      admins: adminUsers.length,
      totalContributions: allContribs.length,
      baseContributions: baseContribs.length,
      totalTransactions: allTxs.length,
      baseTransactions: baseTxs.length,
    },
    adminAccounts: adminUsers.map(a => ({
      id: a.id,
      email: a.email,
      role: a.role || a.role_name,
    })),
    allocations: regMembers.map(m => {
      const contrib = baseContribs.find(c => c.memberId === m.id);
      const tx = baseTxs.find(t => t.memberId === m.id);
      const svcMem = memMap.get(m.id);
      return {
        memberId: m.id,
        memberCode: m.memberCode || m.member_code,
        name: m.name,
        userTotalSavings: m.totalSavings,
        contribDocId: contrib ? contrib.id : null,
        contribAmount: contrib ? contrib.paidAmount : null,
        contribStatus: contrib ? contrib.status : null,
        txDocId: tx ? tx.id : null,
        txAmount: tx ? tx.amount : null,
        octMonthlyContribution: svcMem ? svcMem.monthlyContribution : null,
        octDueStatus: svcMem ? svcMem.dueStatus : null,
        octPendingAmount: svcMem ? svcMem.pendingAmount : null,
        octIsPaid: svcMem ? svcMem.isPaid : null,
      };
    }),
  };

  console.log(JSON.stringify(summary, null, 2));
}

verifyLiveFirestore().catch(err => {
  console.error(err);
  process.exit(1);
});
