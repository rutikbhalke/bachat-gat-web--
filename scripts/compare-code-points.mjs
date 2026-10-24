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
  firebaseConfig,
} = await import('../client/src/config/firebase.js');

const TARGET_PROJECT_ID = 'bachat-gat-32ffe';

const EXPECTED_020 = 'हर्षीराम दत्तू गाडे';
const EXPECTED_007 = 'सतीश गणपत कुन्हे';

function printCodePoints(label, str) {
  if (typeof str !== 'string') {
    console.log(`${label}: [NOT A STRING: ${str}]`);
    return;
  }
  const points = Array.from(str).map(c => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ('${c}')`).join(' ');
  console.log(`${label}: "${str}"`);
  console.log(`  Code points: ${points}`);
  console.log(`  Length: ${str.length}`);
}

async function main() {
  await signInWithEmailAndPassword(auth, 'admin@bachatgat.com', 'Admin@123');

  console.log('--- PROMPT TARGETS ---');
  printCodePoints('Expected REG_020', EXPECTED_020);
  printCodePoints('Expected REG_007', EXPECTED_007);

  console.log('\n--- FIRESTORE REG_020 ---');
  const snap020 = await getDoc(doc(db, 'users', 'REG_020'));
  const d020 = snap020.data();
  printCodePoints('REG_020 name', d020.name);
  printCodePoints('REG_020 fullName', d020.fullName);
  console.log('REG_020 name === Expected:', d020.name === EXPECTED_020);
  console.log('REG_020 fullName === Expected:', d020.fullName === EXPECTED_020);

  console.log('\n--- FIRESTORE REG_007 ---');
  const snap007 = await getDoc(doc(db, 'users', 'REG_007'));
  const d007 = snap007.data();
  printCodePoints('REG_007 name', d007.name);
  printCodePoints('REG_007 fullName', d007.fullName);
  console.log('REG_007 name === Expected:', d007.name === EXPECTED_007);
  console.log('REG_007 fullName === Expected:', d007.fullName === EXPECTED_007);
}

main().catch(console.error);
