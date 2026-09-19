const { db } = require('../config/firebaseAdmin');
const {
  DEFAULT_GROUP_ID,
  ROOT_COLLECTIONS,
  resolveCollectionName,
} = require('../config/dataContract');

function value(data, ...keys) {
  return keys.map((key) => data[key]).find((item) => item !== undefined && item !== null);
}

function serialize(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

async function getCollection(name, groupId = DEFAULT_GROUP_ID) {
  try {
    const collectionName = resolveCollectionName(name);
    if (collectionName === ROOT_COLLECTIONS.groups && groupId) {
      const snapshot = await db.collection(collectionName).doc(groupId).get();
      return snapshot.exists ? [serialize(snapshot)] : [];
    }

    const ref = db.collection(collectionName);
    const snapshot = groupId
      ? await ref.where('groupId', '==', groupId).get()
      : await ref.get();
    const items = snapshot.docs.map(serialize);
    console.log(`[Firestore] Fetched ${items.length} '${collectionName}' records for group '${groupId}'`);
    return items;
  } catch (err) {
    console.error(`[Firestore] Error fetching collection '${name}':`, err.message);
    return [];
  }
}

async function writeActivity(groupId, userId, action, description) {
  await db.collection(ROOT_COLLECTIONS.activities).add({
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

module.exports = { DEFAULT_GROUP_ID, ROOT_COLLECTIONS, db, getCollection, serialize, value, writeActivity, writeNotification };
