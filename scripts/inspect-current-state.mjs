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
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');
  const snap = await getDocs(collection(db, 'users'));
  console.log(`Current documents in 'users' collection: ${snap.size}`);
  snap.docs.forEach((d, idx) => {
    const data = d.data();
    console.log(`${idx + 1}. ID: ${d.id.padEnd(28)} | Role: ${(data.role || data.role_name || '').padEnd(8)} | Name: ${data.name || data.fullName}`);
  });
}

main().catch(console.error);
