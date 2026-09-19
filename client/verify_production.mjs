import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBJyKRv81qV_tmnmcYF76Dx0JLxGKvK_7I",
  authDomain: "bachat-gat-32ffe.firebaseapp.com",
  projectId: "bachat-gat-32ffe",
  storageBucket: "bachat-gat-32ffe.firebasestorage.app",
  messagingSenderId: "215206829034",
  appId: "1:215206829034:web:63a0816174e77792427093"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const GROUP_ID = 'shivshahi_group_001';

async function verify() {
  try {
    const groupDoc = await getDoc(doc(db, 'groups', GROUP_ID));
    console.log(`Group exists: ${groupDoc.exists()}`);
    if (groupDoc.exists()) {
      console.log(`Group Data:`, groupDoc.data());
    }

    try {
      const membersSnap = await getDocs(query(collection(db, 'users'), where('groupId', '==', GROUP_ID)));
      console.log(`Total Members: ${membersSnap.size}`);
    } catch(e) { console.log('Total Members: PERMISSION_DENIED'); }

    try {
      const loansSnap = await getDocs(query(collection(db, 'loans'), where('groupId', '==', GROUP_ID)));
      console.log(`Total Loans: ${loansSnap.size}`);
    } catch(e) { console.log('Total Loans: PERMISSION_DENIED'); }

    try {
      const savingsSnap = await getDocs(query(collection(db, 'monthlyContributions'), where('groupId', '==', GROUP_ID)));
      console.log(`Total Savings: ${savingsSnap.size}`);
    } catch(e) { console.log('Total Savings: PERMISSION_DENIED'); }
    
    try {
      const transactionsSnap = await getDocs(query(collection(db, 'transactions'), where('groupId', '==', GROUP_ID)));
      console.log(`Total Transactions: ${transactionsSnap.size}`);
    } catch(e) { console.log('Total Transactions: PERMISSION_DENIED'); }
    
    try {
      const repaymentsSnap = await getDocs(query(collection(db, 'repayments'), where('groupId', '==', GROUP_ID)));
      console.log(`Total Repayments: ${repaymentsSnap.size}`);
    } catch(e) { console.log('Total Repayments: PERMISSION_DENIED'); }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

verify();
