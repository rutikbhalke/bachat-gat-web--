// Canonical Firebase/Firestore contract shared with the Flutter app.
export const SHARED_FIREBASE_PROJECT_ID = 'bachat-gat-32ffe';
export const DEFAULT_GROUP_ID = 'shivshahi_group_001';

export const ROOT_COLLECTIONS = Object.freeze({
  groups: 'groups',
  members: 'users',
  contributions: 'monthlyContributions',
  loans: 'loans',
  repayments: 'repayments',
  activities: 'transactions',
});

export const resolveCollectionName = (name) => ROOT_COLLECTIONS[name] || name;
