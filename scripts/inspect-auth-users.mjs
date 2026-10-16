import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check server firebaseAdmin
const { auth: adminAuth } = createRequire(path.join(__dirname, '../server/src/config/firebaseAdmin.js'));

async function checkAuth() {
  console.log('Listing Firebase Auth users via firebase-admin...');
  try {
    const listUsersResult = await adminAuth.listUsers(100);
    console.log(`Found ${listUsersResult.users.length} Firebase Auth user(s):`);
    listUsersResult.users.forEach(u => {
      console.log(`UID: ${u.uid} | Email: ${u.email} | DisplayName: ${u.displayName}`);
    });
  } catch (err) {
    console.error('Error listing Firebase Auth users:', err.message);
  }
}

checkAuth().catch(console.error);
