import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { groupQuery } from './dataContract.js';
import { DEFAULT_GROUP_ID } from '../config/sharedData.js';

export const userService = {
  /**
   * Get user by UID
   */
  getUserById: async (uid) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        return { success: false, message: 'User not found' };
      }
      return { success: true, user: { id: userDoc.id, ...userDoc.data() } };
    } catch (err) {
      console.error('Failed to get user by UID:', err);
      return { success: false, message: err.message };
    }
  },

  /**
   * Get all users
   */
  getAllUsers: async (groupId = DEFAULT_GROUP_ID) => {
    try {
      const snap = await getDocs(groupQuery('members', groupId || DEFAULT_GROUP_ID));
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return { success: true, users };
    } catch (err) {
      console.error('Failed to get all users:', err);
      return { success: false, users: [] };
    }
  },

  /**
   * Update user profile
   */
  updateUserProfile: async (uid, data) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      return { success: true, message: 'Profile updated successfully' };
    } catch (err) {
      console.error('Failed to update user:', err);
      throw new Error(err.message || 'Failed to update profile.');
    }
  },

  /**
   * Real-time subscription to user profile
   */
  subscribeToUser: (uid, callback) => {
    const userDocRef = doc(db, 'users', uid);
    return onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        callback({ id: docSnap.id, ...docSnap.data() });
      }
    });
  },
};
