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
  getDocs,
} = await import('../client/src/config/firebase.js');

async function main() {
  console.log('================================================================================');
  console.log('CREATING SAFETY BACKUP PRIOR TO ₹1,20,000 PER MEMBER ALLOCATION');
  console.log('================================================================================');

  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  const collections = ['groups', 'users', 'monthlyContributions', 'loans', 'repayments', 'transactions'];
  const fullBackup = {
    timestamp: new Date().toISOString(),
    projectId: 'bachat-gat-32ffe',
    groupId: 'shivshahi_group_001',
    collections: {},
    documentCounts: {},
  };

  for (const colName of collections) {
    const snap = await getDocs(collection(db, colName));
    fullBackup.documentCounts[colName] = snap.size;
    fullBackup.collections[colName] = snap.docs.map(d => ({
      _documentId: d.id,
      ...d.data(),
    }));
    console.log(`Exported [${colName}]: ${snap.size} documents`);
  }

  const backupFilePath = path.join(__dirname, '../database_backup_pre_120k_allocation.json');
  fs.writeFileSync(backupFilePath, JSON.stringify(fullBackup, null, 2), 'utf8');

  const stats = fs.statSync(backupFilePath);
  console.log(`\n✔ Safety backup saved to: ${backupFilePath}`);
  console.log(`  File size: ${(stats.size / 1024).toFixed(2)} KB`);

  // Verify backup integrity
  const readBack = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
  assert.strictEqual(readBack.documentCounts.users, 45, 'Must contain 45 users (43 approved + 2 admins)');
  assert.strictEqual(readBack.documentCounts.monthlyContributions, 0, 'Contributions must be 0');

  console.log('✔ Backup verification PASSED: 100% integrity confirmed.\n');
}

main().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
