import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBJyKRv81qV_tmnmcYF76Dx0JLxGKvK_7I",
  authDomain: "bachat-gat-32ffe.firebaseapp.com",
  projectId: "bachat-gat-32ffe",
  storageBucket: "bachat-gat-32ffe.firebasestorage.app",
  messagingSenderId: "215206829034",
  appId: "1:215206829034:web:63a0816174e77792427093",
  measurementId: "G-NP2QYVL1XK"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
