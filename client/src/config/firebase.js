import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
export * from 'firebase/firestore';

/**
 * Firebase Web Configuration
 * Connected to Shared Project: bachat-gat-32ffe (Used by Flutter Android & React Web)
 */
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {});

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyBJyKRv81qV_tmnmcYF76Dx0JLxGKvK_7I',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'bachat-gat-32ffe.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'bachat-gat-32ffe',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'bachat-gat-32ffe.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '215206829034',
  appId: env.VITE_FIREBASE_APP_ID || '1:215206829034:web:63a0816174e77792427093',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-NP2QYVL1XK',
};

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Connect to local emulator if enabled
if (env.VITE_USE_FIREBASE_EMULATOR === 'true' || env.VITE_FIRESTORE_EMULATOR_HOST) {
  const host = env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
  const port = Number(env.VITE_FIRESTORE_EMULATOR_PORT || 8080);
  try {
    connectFirestoreEmulator(db, host, port);
    console.log(`[Firebase] Connected Firestore to local emulator at ${host}:${port}`);
  } catch (e) {
    console.warn('[Firebase] Firestore emulator connection notice:', e.message);
  }
}

// Log active connection for development verification
if (typeof window !== 'undefined') {
  window.__db = db;
  window.__auth = auth;
  console.log(`Connected Firebase Project: ${firebaseConfig.projectId}`);
}

export default app;
