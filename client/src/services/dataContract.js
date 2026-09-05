import { collection, doc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

// Shared Firestore contract used by the Flutter app and this web client.
export const ROOT_COLLECTIONS = Object.freeze({
  members: 'users',
  contributions: 'monthlyContributions',
  loans: 'loans',
  repayments: 'repayments',
  activities: 'transactions',
});

export const groupQuery = (collectionName, groupId) =>
  query(collection(db, collectionName), where('groupId', '==', groupId));

export const rootDoc = (collectionName, documentId) =>
  doc(db, collectionName, documentId);
