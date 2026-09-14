const { db } = require('../config/firebaseAdmin');

const DEFAULT_GROUP_ID = 'shivshahi_group_001';

function value(data, ...keys) {
  return keys.map((key) => data[key]).find((item) => item !== undefined && item !== null);
}

function serialize(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

async function getCollection(name, groupId = DEFAULT_GROUP_ID) {
  try {
    const snapshot = await db.collection(name).get();
    const items = snapshot.docs.map(serialize);
    const filtered = items.filter((item) => !groupId || !item.groupId || item.groupId === groupId);
    console.log(`[Firestore] Fetched ${items.length} items from '${name}', filtered to ${filtered.length} for group '${groupId}'`);
    return filtered;
  } catch (err) {
    console.error(`[Firestore] Error fetching collection '${name}':`, err.message);
    return [];
  }
}

async function writeActivity(groupId, userId, action, description) {
  await db.collection('transactions').add({
    groupId: groupId || DEFAULT_GROUP_ID,
    userId: userId || null,
    memberId: userId || null,
    action,
    type: 'activity',
    description,
    message: description,
    date: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
}

async function writeNotification(userId, groupId, title, message, type = 'INFO') {
  await db.collection('notifications').add({
    userId: userId || null,
    groupId: groupId || DEFAULT_GROUP_ID,
    title,
    message,
    type,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

module.exports = { DEFAULT_GROUP_ID, db, getCollection, serialize, value, writeActivity, writeNotification };
