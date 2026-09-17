import { initializeApp } from '../client/node_modules/firebase/app/dist/index.cjs.js';
import { getAuth, signInWithEmailAndPassword } from '../client/node_modules/firebase/auth/dist/index.cjs.js';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from '../client/node_modules/firebase/firestore/dist/index.cjs.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBJyKRv81qV_tmnmcYF76Dx0JLxGKvK_7I',
  authDomain: 'bachat-gat-32ffe.firebaseapp.com',
  projectId: 'bachat-gat-32ffe',
  storageBucket: 'bachat-gat-32ffe.firebasestorage.app',
  messagingSenderId: '215206829034',
  appId: '1:215206829034:web:63a0816174e77792427093',
};

const app = initializeApp(firebaseConfig, 'check-test-group');
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  await signInWithEmailAndPassword(auth, 'admin3@bachatgat.com', '123456');

  const snap = await getDocs(query(collection(db, 'users'), where('groupId', '==', 'test_isolated_group_999')));
  console.log('Total documents with groupId == test_isolated_group_999:', snap.size);
  snap.docs.forEach((d, idx) => {
    const data = d.data();
    console.log(`[${idx}] id: ${d.id}, code: ${data.memberCode || data.member_code}, name: ${data.fullName || data.name}, role: ${data.role || data.role_name}, status: ${data.status}, isActive: ${data.isActive}, isDeleted: ${data.isDeleted}`);
  });

  const gDoc = await getDoc(doc(db, 'groups', 'test_isolated_group_999'));
  console.log('Group doc data:', JSON.stringify(gDoc.data(), null, 2));
}

run().catch(console.error);
