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

const { savingsService } = await import('../client/src/services/savingsService.js');
const { memberService } = await import('../client/src/services/memberService.js');

async function main() {
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated as admin@bachatgat.com\n');

  const snap = await getDocs(collection(db, 'users'));
  const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Total documents in 'users' collection: ${allUsers.length}`);

  const byGroup = {};
  allUsers.forEach(u => {
    const g = u.groupId || 'NO_GROUP';
    byGroup[g] = byGroup[g] || [];
    byGroup[g].push(u);
  });

  for (const [grp, users] of Object.entries(byGroup)) {
    console.log(`\n================ Group: ${grp} (${users.length} records) ================`);
    users.forEach((u, i) => {
      const role = (u.role || u.role_name || 'MEMBER').toUpperCase();
      const code = u.memberCode || u.member_code || u.id;
      const name = u.name || u.fullName || 'No Name';
      const status = u.status || 'ACTIVE';
      const share = u.monthlyContribution || u.monthly_contribution || 1000;
      console.log(`${String(i+1).padStart(2, '0')}. ID: ${u.id.padEnd(28)} | Code: ${String(code).padEnd(8)} | Role: ${role.padEnd(8)} | Status: ${status.padEnd(8)} | Share: ₹${share} | Name: ${name}`);
    });
  }

  // Check Bulk Savings Preview for shivshahi_group_001
  const preview = await savingsService.getBulkSavingsPreview({ month: 10, year: 2026 }, 'shivshahi_group_001');
  console.log(`\n================ Bulk Savings Preview for shivshahi_group_001 ================`);
  console.log(`Total eligible members returned by preview: ${preview.members?.length || 0}`);
  (preview.members || []).forEach((m, i) => {
    console.log(`${String(i+1).padStart(2, '0')}. ID: ${m.memberId.padEnd(28)} | Code: ${String(m.memberCode).padEnd(8)} | Due: ₹${m.remainingDue} | Name: ${m.memberName}`);
  });
}

main().catch(console.error);
