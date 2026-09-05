import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Firebase Web Configuration
 * Connected to Shared Project: bachat-gat-32ffe (Used by Flutter Android & React Web)
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBJyKRv81qV_tmnmcYF76Dx0JLxGKvK_7I',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'bachat-gat-32ffe.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'bachat-gat-32ffe',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'bachat-gat-32ffe.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '215206829034',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:215206829034:web:63a0816174e77792427093',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-NP2QYVL1XK',
};

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Log active connection for development verification
if (typeof window !== 'undefined') {
  console.log(`Connected Firebase Project: ${firebaseConfig.projectId}`);
}

export default app;
