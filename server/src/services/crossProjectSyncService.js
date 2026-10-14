const fs = require('fs');
const path = require('path');
const { db, flutterDb, hasFlutterAdmin, hasServiceAccount, FLUTTER_PROJECT_ID } = require('../config/firebaseAdmin');

const LOCAL_OUTBOX_FILE = path.join(__dirname, '../../data/sync_outbox.json');

function ensureDataDir() {
  const dir = path.dirname(LOCAL_OUTBOX_FILE);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
  }
}

function readLocalOutbox() {
  try {
    ensureDataDir();
    if (fs.existsSync(LOCAL_OUTBOX_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_OUTBOX_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[CrossProjectSync] Local outbox read notice:', e.message);
  }
  return [];
}

function saveLocalOutboxRecord(record) {
  try {
    ensureDataDir();
    const existing = readLocalOutbox();
    const idx = existing.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...record };
    } else {
      existing.unshift(record);
    }
    fs.writeFileSync(LOCAL_OUTBOX_FILE, JSON.stringify(existing.slice(0, 1000), null, 2), 'utf8');
  } catch (e) {
    console.warn('[CrossProjectSync] Local outbox write notice:', e.message);
  }
}

/**
 * Format Monthly Contribution record strictly compatible with Flutter's MonthlyContribution model:
 * - Flutter subcollection: /groups/{groupId}/monthly_contributions/{id}
 * - Flutter enum: ContributionStatus.values.byName(json['status']) -> requires lowercase 'paid' / 'partial' / 'pending'
 */
function formatFlutterContribution({
  contribId,
  memberId,
  memberName = 'Member',
  amount,
  expectedAmount,
  month,
  year,
  paymentMode = 'UPI',
  paymentDate,
  notes = '',
}) {
  const numAmount = Number(amount) || 0;
  const numExpected = Number(expectedAmount || amount) || 0;
  const status = numAmount >= numExpected ? 'paid' : numAmount > 0 ? 'partial' : 'pending';

  return {
    id: contribId,
    memberId: String(memberId),
    memberName: String(memberName),
    amount: numAmount,
    paidAmount: numAmount,
    totalPaid: numAmount,
    expectedAmount: numExpected,
    regularHaftaAmount: numAmount,
    loanPrincipalPaid: 0,
    interestAmount: 0,
    month: Number(month),
    year: Number(year),
    status, // Case-sensitive lowercase enum for Dart
    paymentDate: paymentDate || new Date().toISOString(),
    paymentMode: String(paymentMode),
    notes: String(notes || ''),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Format Transaction record strictly compatible with Flutter's AppTransaction model:
 * - Flutter subcollection: /groups/{groupId}/activities/{id}
 * - Flutter enum: TransactionType.values.byName(json['type']) -> requires camelCase 'monthlyInvestment'
 */
function formatFlutterTransaction({
  actId,
  groupId,
  memberId,
  memberName = 'Member',
  amount,
  description,
  date,
}) {
  return {
    id: actId,
    groupId: String(groupId),
    memberId: String(memberId),
    memberName: String(memberName),
    amount: Number(amount) || 0,
    type: 'monthlyInvestment', // Case-sensitive camelCase enum for Dart TransactionType
    description: description || `Monthly savings ₹${amount} received from ${memberName}`,
    date: date || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Synchronize a single contribution to Flutter app database or queue in syncOutbox
 */
async function syncContributionToFlutter({
  groupId,
  contributionData,
  transactionData,
  deltaSavings = 0,
}) {
  const outboxId = `OUTBOX_${contributionData.id}_${Date.now()}`;

  const outboxRecord = {
    id: outboxId,
    targetProject: FLUTTER_PROJECT_ID,
    groupId,
    operation: 'RECORD_SAVINGS',
    documentId: contributionData.id,
    contributionPayload: contributionData,
    transactionPayload: transactionData,
    deltaSavings: Number(deltaSavings) || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
    status: hasFlutterAdmin ? 'PENDING_SYNC' : 'PENDING_CONFIG',
    lastError: hasFlutterAdmin ? null : 'Flutter Firebase credentials not configured in backend environment.',
  };

  // Persist locally on server disk
  saveLocalOutboxRecord(outboxRecord);

  if (hasServiceAccount) {
    try {
      await db.collection('syncOutbox').doc(outboxId).set(outboxRecord);
    } catch (e) {
      console.warn('[CrossProjectSync] Firestore outbox write notice:', e.message);
    }
  }

  if (!hasFlutterAdmin || !flutterDb) {
    return {
      success: true,
      synced: false,
      status: 'QUEUED_PENDING_CONFIG',
      outboxId,
      message: 'Replication record safely queued in syncOutbox. Secondary Flutter Firebase Admin credentials pending.',
    };
  }

  try {
    const flutterBatch = flutterDb.batch();

    // 1. Flutter Monthly Contribution subcollection
    const flutterContribRef = flutterDb
      .collection('groups')
      .doc(groupId)
      .collection('monthly_contributions')
      .doc(contributionData.id);
    flutterBatch.set(flutterContribRef, contributionData, { merge: true });

    // 2. Flutter Activities subcollection
    if (transactionData) {
      const flutterActRef = flutterDb
        .collection('groups')
        .doc(groupId)
        .collection('activities')
        .doc(transactionData.id);
      flutterBatch.set(flutterActRef, transactionData, { merge: true });
    }

    // 3. Flutter Group Totals in /groups/{groupId}
    if (deltaSavings > 0) {
      const flutterGroupRef = flutterDb.collection('groups').doc(groupId);
      const groupSnap = await flutterGroupRef.get();
      if (groupSnap.exists) {
        const data = groupSnap.data();
        const currentFund = Number(data.totalFund || data.total_fund || 0);
        const currentSavings = Number(data.totalSavings || data.total_savings || 0);
        flutterBatch.update(flutterGroupRef, {
          totalFund: currentFund + deltaSavings,
          total_fund: currentFund + deltaSavings,
          totalSavings: currentSavings + deltaSavings,
          total_savings: currentSavings + deltaSavings,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    await flutterBatch.commit();

    if (hasServiceAccount) {
      try {
        await db.collection('syncOutbox').doc(outboxId).update({
          status: 'SYNCED',
          syncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (_) {}
    }

    return {
      success: true,
      synced: true,
      status: 'SYNCED',
      outboxId,
    };
  } catch (err) {
    console.error(`[CrossProjectSync] Replication error to ${FLUTTER_PROJECT_ID}:`, err.message);
    if (hasServiceAccount) {
      try {
        await db.collection('syncOutbox').doc(outboxId).update({
          status: 'FAILED',
          lastError: err.message,
          retryCount: 1,
          updatedAt: new Date().toISOString(),
        });
      } catch (_) {}
    }
    return {
      success: true,
      synced: false,
      status: 'FAILED',
      outboxId,
      error: err.message,
    };
  }
}

/**
 * Synchronize bulk contributions to Flutter app database or queue in syncOutbox
 */
async function syncBulkContributionsToFlutter({
  groupId,
  contributions,
  transactions,
  totalDeltaSavings = 0,
}) {
  const batchId = `OUTBOX_BULK_${Date.now()}`;

  const outboxRecord = {
    id: batchId,
    targetProject: FLUTTER_PROJECT_ID,
    groupId,
    operation: 'BULK_RECORD_SAVINGS',
    itemCount: contributions.length,
    contributions,
    transactions,
    totalDeltaSavings: Number(totalDeltaSavings) || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
    status: hasFlutterAdmin ? 'PENDING_SYNC' : 'PENDING_CONFIG',
    lastError: hasFlutterAdmin ? null : 'Flutter Firebase credentials not configured in backend environment.',
  };

  // Persist locally on server disk
  saveLocalOutboxRecord(outboxRecord);

  if (hasServiceAccount) {
    try {
      await db.collection('syncOutbox').doc(batchId).set(outboxRecord);
    } catch (e) {
      console.warn('[CrossProjectSync] Firestore outbox write notice:', e.message);
    }
  }

  if (!hasFlutterAdmin || !flutterDb) {
    return {
      success: true,
      synced: false,
      status: 'QUEUED_PENDING_CONFIG',
      batchId,
      message: 'Bulk replication record safely queued in syncOutbox. Secondary Flutter Firebase Admin credentials pending.',
    };
  }

  try {
    const flutterBatch = flutterDb.batch();

    contributions.forEach((contrib) => {
      const ref = flutterDb
        .collection('groups')
        .doc(groupId)
        .collection('monthly_contributions')
        .doc(contrib.id);
      flutterBatch.set(ref, contrib, { merge: true });
    });

    transactions.forEach((tx) => {
      const ref = flutterDb
        .collection('groups')
        .doc(groupId)
        .collection('activities')
        .doc(tx.id);
      flutterBatch.set(ref, tx, { merge: true });
    });

    if (totalDeltaSavings > 0) {
      const flutterGroupRef = flutterDb.collection('groups').doc(groupId);
      const groupSnap = await flutterGroupRef.get();
      if (groupSnap.exists) {
        const data = groupSnap.data();
        const currentFund = Number(data.totalFund || data.total_fund || 0);
        const currentSavings = Number(data.totalSavings || data.total_savings || 0);
        flutterBatch.update(flutterGroupRef, {
          totalFund: currentFund + totalDeltaSavings,
          total_fund: currentFund + totalDeltaSavings,
          totalSavings: currentSavings + totalDeltaSavings,
          total_savings: currentSavings + totalDeltaSavings,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    await flutterBatch.commit();

    if (hasServiceAccount) {
      try {
        await db.collection('syncOutbox').doc(batchId).update({
          status: 'SYNCED',
          syncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (_) {}
    }

    return {
      success: true,
      synced: true,
      status: 'SYNCED',
      batchId,
    };
  } catch (err) {
    console.error(`[CrossProjectSync] Bulk replication error to ${FLUTTER_PROJECT_ID}:`, err.message);
    if (hasServiceAccount) {
      try {
        await db.collection('syncOutbox').doc(batchId).update({
          status: 'FAILED',
          lastError: err.message,
          retryCount: 1,
          updatedAt: new Date().toISOString(),
        });
      } catch (_) {}
    }
    return {
      success: true,
      synced: false,
      status: 'FAILED',
      batchId,
      error: err.message,
    };
  }
}

/**
 * Get replication health status
 */
async function getSyncStatus(groupId) {
  let items = readLocalOutbox();

  if (hasServiceAccount) {
    try {
      const snapshot = await db.collection('syncOutbox').get();
      const firestoreItems = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const seenIds = new Set(items.map((i) => i.id));
      firestoreItems.forEach((f) => {
        if (!seenIds.has(f.id)) {
          items.push(f);
        }
      });
    } catch (err) {
      console.warn('[CrossProjectSync] Firestore outbox query notice:', err.message);
    }
  }

  const groupItems = groupId ? items.filter((i) => !i.groupId || i.groupId === groupId) : items;

  const pendingCount = groupItems.filter((i) => i.status === 'PENDING_SYNC' || i.status === 'PENDING_CONFIG').length;
  const syncedCount = groupItems.filter((i) => i.status === 'SYNCED').length;
  const failedCount = groupItems.filter((i) => i.status === 'FAILED').length;

  return {
    success: true,
    hasServiceAccount,
    hasFlutterAdmin,
    flutterProjectId: FLUTTER_PROJECT_ID,
    totalOutboxRecords: groupItems.length,
    pendingCount,
    syncedCount,
    failedCount,
    lastRecord: groupItems[0] || null,
    status: hasFlutterAdmin ? 'READY_SYNC' : 'PENDING_CONFIG',
    message: hasFlutterAdmin
      ? 'Flutter Firebase Admin connected. Outbox ready for sync.'
      : 'Flutter Firebase credentials unconfigured in backend environment. Tasks safely queued in outbox.',
  };
}

/**
 * Retry all pending or failed outbox sync operations
 */
async function retryPendingSync(req, res) {
  if (!hasFlutterAdmin || !flutterDb) {
    return res.status(503).json({
      success: false,
      message: 'Secondary Flutter Firebase Admin credentials are not configured. Cannot perform cross-project sync.',
      hasFlutterAdmin: false,
      flutterProjectId: FLUTTER_PROJECT_ID,
    });
  }

  try {
    const snapshot = await db
      .collection('syncOutbox')
      .where('status', 'in', ['PENDING_SYNC', 'PENDING_CONFIG', 'FAILED'])
      .limit(25)
      .get();

    if (snapshot.empty) {
      return res.json({ success: true, message: 'No pending records in outbox.', processedCount: 0 });
    }

    let processedCount = 0;
    let successCount = 0;

    for (const docSnap of snapshot.docs) {
      const item = docSnap.data();
      processedCount++;

      try {
        if (item.operation === 'RECORD_SAVINGS' && item.contributionPayload) {
          const flutterBatch = flutterDb.batch();
          const flutterContribRef = flutterDb
            .collection('groups')
            .doc(item.groupId)
            .collection('monthly_contributions')
            .doc(item.documentId);
          flutterBatch.set(flutterContribRef, item.contributionPayload, { merge: true });

          if (item.transactionPayload) {
            const flutterActRef = flutterDb
              .collection('groups')
              .doc(item.groupId)
              .collection('activities')
              .doc(item.transactionPayload.id);
            flutterBatch.set(flutterActRef, item.transactionPayload, { merge: true });
          }

          let incrementedTotals = false;
          let activityAlreadyCommitted = false;
          if (item.transactionPayload?.id) {
            const checkAct = await flutterDb
              .collection('groups')
              .doc(item.groupId)
              .collection('activities')
              .doc(item.transactionPayload.id)
              .get();
            if (checkAct.exists) {
              activityAlreadyCommitted = true;
            }
          }

          // Only increment Flutter totals if not already synced on a previous attempt and not already committed
          if (item.deltaSavings > 0 && !item.totalsSynced && !activityAlreadyCommitted) {
            const flutterGroupRef = flutterDb.collection('groups').doc(item.groupId);
            const groupSnap = await flutterGroupRef.get();
            if (groupSnap.exists) {
              const data = groupSnap.data();
              flutterBatch.update(flutterGroupRef, {
                totalFund: Number(data.totalFund || data.total_fund || 0) + item.deltaSavings,
                total_fund: Number(data.totalFund || data.total_fund || 0) + item.deltaSavings,
                totalSavings: Number(data.totalSavings || data.total_savings || 0) + item.deltaSavings,
                total_savings: Number(data.totalSavings || data.total_savings || 0) + item.deltaSavings,
                updatedAt: new Date().toISOString(),
              });
              incrementedTotals = true;
            }
          }

          await flutterBatch.commit();

          // Verification read: strictly confirm document exists in Flutter Firestore
          const verifySnap = await flutterContribRef.get();
          if (!verifySnap.exists) {
            throw new Error(`Flutter Firestore document verification failed: ${flutterContribRef.path} not found.`);
          }

          await docSnap.ref.update({
            status: 'SYNCED',
            totalsSynced: Boolean(item.totalsSynced || incrementedTotals || activityAlreadyCommitted),
            verifiedAt: new Date().toISOString(),
            syncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          successCount++;
        } else if (item.operation === 'BULK_RECORD_SAVINGS' && Array.isArray(item.contributions)) {
          const flutterBatch = flutterDb.batch();
          item.contributions.forEach((c) => {
            const ref = flutterDb
              .collection('groups')
              .doc(item.groupId)
              .collection('monthly_contributions')
              .doc(c.id);
            flutterBatch.set(ref, c, { merge: true });
          });
          (item.transactions || []).forEach((t) => {
            const ref = flutterDb
              .collection('groups')
              .doc(item.groupId)
              .collection('activities')
              .doc(t.id);
            flutterBatch.set(ref, t, { merge: true });
          });

          let incrementedTotals = false;
          let bulkActivityAlreadyCommitted = false;
          if (item.transactions && item.transactions.length > 0 && item.transactions[0].id) {
            const checkAct = await flutterDb
              .collection('groups')
              .doc(item.groupId)
              .collection('activities')
              .doc(item.transactions[0].id)
              .get();
            if (checkAct.exists) {
              bulkActivityAlreadyCommitted = true;
            }
          }

          // Only increment Flutter totals if not already synced on a previous attempt and not already committed
          if (item.totalDeltaSavings > 0 && !item.totalsSynced && !bulkActivityAlreadyCommitted) {
            const flutterGroupRef = flutterDb.collection('groups').doc(item.groupId);
            const groupSnap = await flutterGroupRef.get();
            if (groupSnap.exists) {
              const data = groupSnap.data();
              flutterBatch.update(flutterGroupRef, {
                totalFund: Number(data.totalFund || data.total_fund || 0) + item.totalDeltaSavings,
                total_fund: Number(data.totalFund || data.total_fund || 0) + item.totalDeltaSavings,
                totalSavings: Number(data.totalSavings || data.total_savings || 0) + item.totalDeltaSavings,
                total_savings: Number(data.totalSavings || data.total_savings || 0) + item.totalDeltaSavings,
                updatedAt: new Date().toISOString(),
              });
              incrementedTotals = true;
            }
          }
          await flutterBatch.commit();

          // Verification read: strictly confirm first contribution exists in Flutter Firestore
          if (item.contributions.length > 0) {
            const verifyRef = flutterDb
              .collection('groups')
              .doc(item.groupId)
              .collection('monthly_contributions')
              .doc(item.contributions[0].id);
            const verifySnap = await verifyRef.get();
            if (!verifySnap.exists) {
              throw new Error(`Flutter Firestore bulk document verification failed: ${verifyRef.path} not found.`);
            }
          }

          await docSnap.ref.update({
            status: 'SYNCED',
            totalsSynced: Boolean(item.totalsSynced || incrementedTotals || bulkActivityAlreadyCommitted),
            verifiedAt: new Date().toISOString(),
            syncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          successCount++;
        }
      } catch (retryErr) {
        await docSnap.ref.update({
          status: 'FAILED',
          lastError: retryErr.message,
          retryCount: (item.retryCount || 0) + 1,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${processedCount} outbox records (${successCount} synced).`,
      processedCount,
      successCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  formatFlutterContribution,
  formatFlutterTransaction,
  syncContributionToFlutter,
  syncBulkContributionsToFlutter,
  getSyncStatus,
  retryPendingSync,
};
