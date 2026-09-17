import { initializeApp } from '../client/node_modules/firebase/app/dist/index.cjs.js';
import { getAuth, signInWithEmailAndPassword } from '../client/node_modules/firebase/auth/dist/index.cjs.js';
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs, query, where } from '../client/node_modules/firebase/firestore/dist/index.cjs.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBJyKRv81qV_tmnmcYF76Dx0JLxGKvK_7I',
  authDomain: 'bachat-gat-32ffe.firebaseapp.com',
  projectId: 'bachat-gat-32ffe',
  storageBucket: 'bachat-gat-32ffe.firebasestorage.app',
  messagingSenderId: '215206829034',
  appId: '1:215206829034:web:63a0816174e77792427093',
};

const app = initializeApp(firebaseConfig, 'fix-active-count');
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  await signInWithEmailAndPassword(auth, 'admin3@bachatgat.com', '123456');

  // 1. Audit production group before
  const prodSnapBefore = await getDocs(query(collection(db, 'users'), where('groupId', '==', 'shivshahi_group_001')));
  console.log('[SAFETY AUDIT BEFORE] shivshahi_group_001 count:', prodSnapBefore.size);
  if (prodSnapBefore.size !== 44) {
    throw new Error(`CRITICAL: Expected 44 members in shivshahi_group_001, found ${prodSnapBefore.size}`);
  }

  // 2. Read group doc before
  const groupRef = doc(db, 'groups', 'test_isolated_group_999');
  const groupSnapBefore = await getDoc(groupRef);
  const dataBefore = groupSnapBefore.data();
  console.log('[BEFORE] test_isolated_group_999 activeMembers:', dataBefore.activeMembers);
  console.log('[BEFORE] test_isolated_group_999 active_members:', dataBefore.active_members);

  // 3. Count active members in users using application logic
  const testUsersSnap = await getDocs(query(collection(db, 'users'), where('groupId', '==', 'test_isolated_group_999')));
  const allTestUsers = testUsersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const activeMembers = allTestUsers.filter(mem => {
    const isNotAdmin = (mem.role || '').toUpperCase() !== 'ADMIN' && !mem.email?.includes('admin');
    const isActive = mem.isActive !== false && (mem.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && !mem.isDeleted;
    return isNotAdmin && isActive;
  });

  console.log(`[APP LOGIC FILTER] Found ${activeMembers.length} active members:`, activeMembers.map(m => m.memberCode || m.id));

  if (activeMembers.length !== 8) {
    throw new Error(`Unexpected active member count: expected 8, found ${activeMembers.length}`);
  }

  // 4. Update test group doc only
  await updateDoc(groupRef, {
    activeMembers: 8,
    active_members: 8,
  });
  console.log('✔ Updated groups/test_isolated_group_999 activeMembers to 8.');

  // 5. Verify group doc after
  const groupSnapAfter = await getDoc(groupRef);
  const dataAfter = groupSnapAfter.data();
  console.log('[AFTER] test_isolated_group_999 activeMembers:', dataAfter.activeMembers);
  console.log('[AFTER] test_isolated_group_999 active_members:', dataAfter.active_members);

  // 6. Audit production group after
  const prodSnapAfter = await getDocs(query(collection(db, 'users'), where('groupId', '==', 'shivshahi_group_001')));
  console.log('[SAFETY AUDIT AFTER] shivshahi_group_001 count:', prodSnapAfter.size);
  const prodDeleted = prodSnapAfter.docs.filter(d => Boolean(d.data().isDeleted) === true);
  console.log('[SAFETY AUDIT AFTER] shivshahi_group_001 deleted count:', prodDeleted.length);
  if (prodSnapAfter.size !== 44 || prodDeleted.length !== 0) {
    throw new Error('CRITICAL: Production group integrity violated!');
  }
  console.log('✔ Production group shivshahi_group_001 remains 100% UNTOUCHED.');
}

run().catch(console.error);
