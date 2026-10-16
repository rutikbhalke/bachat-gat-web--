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
  console.log('✔ Authenticated successfully as admin@bachatgat.com\n');

  const collections = ['groups', 'users', 'monthlyContributions', 'loans', 'repayments', 'transactions', 'notifications'];
  const summary = {};

  for (const colName of collections) {
    try {
      const snap = await getDocs(collection(db, colName));
      summary[colName] = {
        count: snap.size,
        docs: snap.docs.map(d => ({ id: d.id, ...d.data() })),
      };
      console.log(`Collection [${colName}]: ${snap.size} documents`);
    } catch (err) {
      console.error(`Collection [${colName}] error:`, err.message);
    }
  }

  console.log('\n--- GROUPS DETAILS ---');
  (summary.groups?.docs || []).forEach(g => {
    console.log(`Group ID: ${g.id}`);
    console.log(`  groupName: ${g.groupName || g.name}`);
    console.log(`  totalSavings: ${g.totalSavings}`);
    console.log(`  totalFund: ${g.totalFund}`);
    console.log(`  availableBalance: ${g.availableBalance}`);
    console.log(`  totalOutstandingLoans: ${g.totalOutstandingLoans}`);
    console.log(`  monthlyContribution: ${g.monthlyContribution || g.monthly_contribution_per_share}`);
    console.log(`  fullDoc:`, JSON.stringify(g, null, 2));
  });

  console.log('\n--- USERS (MEMBERS) SUMMARY ---');
  const users = summary.users?.docs || [];
  const roles = {};
  const groupsInUsers = new Set();
  users.forEach(u => {
    const r = u.role || u.role_name || 'UNKNOWN';
    roles[r] = (roles[r] || 0) + 1;
    if (u.groupId) groupsInUsers.add(u.groupId);
  });
  console.log(`Total Users: ${users.length}`);
  console.log('Roles breakdown:', roles);
  console.log('Group IDs in users:', Array.from(groupsInUsers));

  console.log('\n--- CONTRIBUTIONS GROUP BREAKDOWN ---');
  const contribGroups = {};
  (summary.monthlyContributions?.docs || []).forEach(c => {
    const gid = c.groupId || c.group_id || 'UNKNOWN';
    contribGroups[gid] = (contribGroups[gid] || 0) + 1;
  });
  console.log('Contributions by group:', contribGroups);

  console.log('\n--- LOANS GROUP BREAKDOWN ---');
  const loanGroups = {};
  (summary.loans?.docs || []).forEach(l => {
    const gid = l.groupId || l.group_id || 'UNKNOWN';
    loanGroups[gid] = (loanGroups[gid] || 0) + 1;
  });
  console.log('Loans by group:', loanGroups);

  console.log('\n--- REPAYMENTS GROUP BREAKDOWN ---');
  const repayGroups = {};
  (summary.repayments?.docs || []).forEach(r => {
    const gid = r.groupId || r.group_id || 'UNKNOWN';
    repayGroups[gid] = (repayGroups[gid] || 0) + 1;
  });
  console.log('Repayments by group:', repayGroups);

  console.log('\n--- TRANSACTIONS GROUP BREAKDOWN ---');
  const txGroups = {};
  (summary.transactions?.docs || []).forEach(t => {
    const gid = t.groupId || t.group_id || 'UNKNOWN';
    txGroups[gid] = (txGroups[gid] || 0) + 1;
  });
  console.log('Transactions by group:', txGroups);
}

main().catch(console.error);
