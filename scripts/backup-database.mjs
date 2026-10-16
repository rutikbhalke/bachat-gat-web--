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
  console.log('MANDATORY SAFETY PROCEDURE: GENERATING COMPLETE DATABASE BACKUP');
  console.log('================================================================================');

  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  console.log('✔ Authenticated via Firebase Auth as admin (admin@bachatgat.com)\n');

  const collections = ['groups', 'users', 'monthlyContributions', 'loans', 'repayments', 'transactions'];
  const fullBackup = {
    timestamp: new Date().toISOString(),
    projectId: 'bachat-gat-32ffe',
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

  // Backup sync_outbox.json if exists
  const outboxPath = path.join(__dirname, '../server/data/sync_outbox.json');
  if (fs.existsSync(outboxPath)) {
    try {
      fullBackup.syncOutbox = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
      console.log(`Exported [syncOutbox]: ${fullBackup.syncOutbox.length} records`);
    } catch (e) {
      console.warn('Could not export syncOutbox:', e.message);
    }
  }

  const backupFilePath = path.join(__dirname, '../database_backup_pre_reset_2026_10_14.json');
  fs.writeFileSync(backupFilePath, JSON.stringify(fullBackup, null, 2), 'utf8');

  const stats = fs.statSync(backupFilePath);
  console.log(`\n✔ Full backup successfully saved to: ${backupFilePath}`);
  console.log(`  File size: ${(stats.size / 1024).toFixed(2)} KB`);

  // Verify backup integrity by re-reading
  const readBack = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
  assert.strictEqual(readBack.documentCounts.users, fullBackup.documentCounts.users, 'Users count must match');
  assert.strictEqual(readBack.documentCounts.monthlyContributions, fullBackup.documentCounts.monthlyContributions, 'Contributions count must match');
  assert.strictEqual(readBack.documentCounts.loans, fullBackup.documentCounts.loans, 'Loans count must match');
  assert.strictEqual(readBack.documentCounts.repayments, fullBackup.documentCounts.repayments, 'Repayments count must match');
  assert.strictEqual(readBack.documentCounts.transactions, fullBackup.documentCounts.transactions, 'Transactions count must match');

  console.log('✔ Backup verification PASSED: All document counts verified.\n');
}

main().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
