import { collection, doc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { ROOT_COLLECTIONS, resolveCollectionName } from '../config/sharedData.js';

// Shared Firestore contract used by the Flutter app and this web client.
export { ROOT_COLLECTIONS };

export const groupQuery = (collectionName, groupId) =>
  query(collection(db, resolveCollectionName(collectionName)), where('groupId', '==', groupId));

export const rootDoc = (collectionName, documentId) =>
  doc(db, resolveCollectionName(collectionName), documentId);
