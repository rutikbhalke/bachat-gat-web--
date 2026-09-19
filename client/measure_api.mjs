import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBJyKRv81qV_tmnmcYF76Dx0JLxGKvK_7I",
  authDomain: "bachat-gat-32ffe.firebaseapp.com",
  projectId: "bachat-gat-32ffe",
  storageBucket: "bachat-gat-32ffe.firebasestorage.app",
  messagingSenderId: "215206829034",
  appId: "1:215206829034:web:63a0816174e77792427093"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Use emulator if VITE_USE_FIREBASE_EMULATOR=true
// But since verify_production failed, let's assume we connect to live db.

async function testFetch() {
  await signInWithEmailAndPassword(auth, 'admin@example.com', 'admin123');

  // Load dashboardService
  const { dashboardService } = await import('./src/services/dashboardService.js');
  const { memberService } = await import('./src/services/memberService.js');
  const { loanService } = await import('./src/services/loanService.js');
  
  console.log("Measuring Dashboard...");
  const t0 = performance.now();
  await dashboardService.getSummary('shivshahi_group_001', '');
  const t1 = performance.now();
  console.log(`Dashboard Summary Fetch: ${(t1 - t0).toFixed(2)} ms`);

  const t2 = performance.now();
  await memberService.getAllMembers({}, 'shivshahi_group_001');
  const t3 = performance.now();
  console.log(`Members Fetch: ${(t3 - t2).toFixed(2)} ms`);

  const t4 = performance.now();
  await loanService.getAllLoans('shivshahi_group_001');
  const t5 = performance.now();
  console.log(`Loans Fetch: ${(t5 - t4).toFixed(2)} ms`);

  process.exit(0);
}

testFetch().catch(console.error);
