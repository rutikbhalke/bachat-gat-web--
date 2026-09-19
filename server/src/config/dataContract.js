const SHARED_FIREBASE_PROJECT_ID = 'bachat-gat-32ffe';
const DEFAULT_GROUP_ID = 'shivshahi_group_001';

const ROOT_COLLECTIONS = Object.freeze({
  groups: 'groups',
  members: 'users',
  contributions: 'monthlyContributions',
  loans: 'loans',
  repayments: 'repayments',
  activities: 'transactions',
});

const resolveCollectionName = (name) => ROOT_COLLECTIONS[name] || name;

module.exports = {
  SHARED_FIREBASE_PROJECT_ID,
  DEFAULT_GROUP_ID,
  ROOT_COLLECTIONS,
  resolveCollectionName,
};
