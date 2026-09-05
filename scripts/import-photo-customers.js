import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(new URL('../client/package.json', import.meta.url));
const { initializeApp } = require('firebase/app');
const {
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  where,
  writeBatch,
} = require('firebase/firestore');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(scriptDir, '../client/.env');
const env = {};

for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
  const [key, ...value] = trimmed.split('=');
  env[key] = value.join('=').trim();
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const GROUP_ID = 'shivshahi_group_001';
const customers = [
  'रविंद्र भागवत गुंजाळ',
  'भारत सोमनाथ गुंजाळ',
  'धृव भारत गुंजाळ',
  'संदीप जयराम गुंजाळ',
  'सचिन काशिनाथ गुंजाळ',
  'रमेश सुखदेव गुंजाळ',
  'सतीश गणपत कुऱ्हे',
  'अशोक खंडेराव दिघे',
  'विजय विठ्ठल गुंजाळ',
  'नारायण जयवंत गुंजाळ',
  'मनोज रामभाऊ गुंजाळ',
  'रामनाथ ज्ञानदेव खुळे',
  'निवृत्ती सुभाष शिंदे',
  'विजय विठ्ठल दरेकर',
  'वाल्मिक दत्तात्रय गुंजाळ',
  'अजित दत्तात्रय गुंजाळ',
  'साई रामनाथ खुळे',
  'रामनाथ सुखदेव खुळे',
  'बाळासाहेब सुखदेव खुळे',
  'होशीराम दत्तू गाडे',
  'संजय दत्तू गाडे',
  'संतोष दत्तू गाडे',
  'शिव पूजा',
  'यश बाळासाहेब पर्वत',
];

const normalizeName = (value) =>
  String(value || '')
    .replace(/^श्री\.?\s*/u, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('mr-IN');

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const existingSnapshot = await getDocs(
    query(collection(db, 'users'), where('groupId', '==', GROUP_ID)),
  );
  const existingNames = new Set(
    existingSnapshot.docs.map((item) =>
      normalizeName(item.data().name || item.data().fullName),
    ),
  );

  const missing = customers
    .map((name, index) => ({ name, index: index + 1 }))
    .filter(({ name }) => !existingNames.has(normalizeName(name)));

  if (missing.length === 0) {
    console.log('No customers added; all 24 names already exist.');
    return;
  }

  const batch = writeBatch(db);
  for (const { name, index } of missing) {
    const memberCode = `PHOTO-${String(index).padStart(2, '0')}`;
    const documentId = `PHOTO_CUSTOMER_${String(index).padStart(2, '0')}`;
    batch.set(doc(db, 'users', documentId), {
      id: documentId,
      name,
      fullName: name,
      groupId: GROUP_ID,
      memberCode,
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`Added ${missing.length} customer names. No prices or financial records were written.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
