import { getDocs, onSnapshot } from 'firebase/firestore';
import { groupQuery } from './dataContract';
import { DEFAULT_GROUP_ID } from '../utils/formatters';

const READ_KEY = 'bachat_read_activity_ids';

function getReadIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveReadIds(ids) {
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
}

async function loadActivities() {
  const snapshot = await getDocs(groupQuery('transactions', DEFAULT_GROUP_ID));
  const readIds = getReadIds();
  const notifications = snapshot.docs.map((documentSnap) => {
    const data = documentSnap.data();
    const rawDate = data.createdAt || data.date || data.updatedAt;
    const createdAt = rawDate?.toDate
      ? rawDate.toDate().toISOString()
      : rawDate || new Date().toISOString();

    return {
      id: documentSnap.id,
      ...data,
      title: data.title || 'Group activity',
      message: data.message || data.description || 'A group record was updated.',
      type: (data.type || 'INFO').toUpperCase(),
      is_read: readIds.has(documentSnap.id) ? 1 : 0,
      created_at: createdAt,
    };
  });

  notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return notifications.slice(0, 30);
}

export const notificationService = {
  getNotifications: async () => {
    try {
      const notifications = await loadActivities();
      return {
        success: true,
        unreadCount: notifications.filter((item) => !item.is_read).length,
        notifications,
      };
    } catch (error) {
      console.error('Failed to load group activity:', error);
      return { success: true, unreadCount: 0, notifications: [] };
    }
  },

  markAsRead: async (id) => {
    const readIds = getReadIds();
    readIds.add(id);
    saveReadIds(readIds);
    return { success: true };
  },

  markAllAsRead: async () => {
    const notifications = await loadActivities();
    saveReadIds(new Set(notifications.map((item) => item.id)));
    return { success: true };
  },

  subscribeToNotifications: (callback) =>
    onSnapshot(groupQuery('transactions', DEFAULT_GROUP_ID), () => {
      notificationService.getNotifications().then(callback);
    }),
};
