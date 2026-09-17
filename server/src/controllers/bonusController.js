const { auth, db, admin } = require('../config/firebaseAdmin');
const { DEFAULT_GROUP_ID, getCollection } = require('../utils/firestore');

const number = (val) => Number(val) || 0;

function getRepaymentYear(r) {
  if (r.paymentYear !== undefined && r.paymentYear !== null) return number(r.paymentYear);
  if (r.payment_year !== undefined && r.payment_year !== null) return number(r.payment_year);
  if (r.year !== undefined && r.year !== null) return number(r.year);
  const dateStr = r.paymentDate || r.payment_date || r.createdAt;
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getFullYear();
  }
  return new Date().getFullYear();
}

/**
 * GET /api/bonus/summary?year=2026&groupId=...
 * Calculates total interest collected, total bonus distributed, net interest available.
 */
async function getBonusSummary(req, res, next) {
  try {
    const groupId = req.query.groupId || req.user.groupId || DEFAULT_GROUP_ID;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    // 1. Fetch repayments for this group
    const repaymentsSnap = await db.collection('repayments')
      .where('groupId', '==', groupId)
      .get()
      .catch(() => ({ docs: [] }));

    let repayments = repaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Fallback check for group_id if groupId has 0
    if (repayments.length === 0) {
      const fallbackSnap = await db.collection('repayments')
        .where('group_id', '==', groupId)
        .get()
        .catch(() => ({ docs: [] }));
      repayments = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // Filter interest collected for the selected year
    const yearRepayments = repayments.filter(r => getRepaymentYear(r) === year);
    const totalInterestCollected = Math.round(
      yearRepayments.reduce((sum, r) => sum + number(r.interestAmount ?? r.interest_amount ?? r.interestPaid ?? 0), 0) * 100
    ) / 100;

    // 2. Fetch bonus distributions for this group & year
    const bonusSnap = await db.collection('diwaliBonuses')
      .where('groupId', '==', groupId)
      .get()
      .catch(() => ({ docs: [] }));

    let allBonuses = bonusSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (allBonuses.length === 0) {
      const fallbackBonusSnap = await db.collection('diwaliBonuses')
        .where('group_id', '==', groupId)
        .get()
        .catch(() => ({ docs: [] }));
      allBonuses = fallbackBonusSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const yearBonuses = allBonuses.filter(b => number(b.year) === year);
    const totalBonusDistributed = Math.round(
      yearBonuses.reduce((sum, b) => sum + number(b.bonusAmount ?? b.amount ?? 0), 0) * 100
    ) / 100;

    const netInterestAvailable = Math.max(0, Math.round((totalInterestCollected - totalBonusDistributed) * 100) / 100);

    return res.json({
      success: true,
      groupId,
      year,
      totalInterestCollected,
      totalBonusDistributed,
      netInterestAvailable,
      yearBonuses,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/bonus/distribute (ADMIN ONLY)
 * Atomically distributes Diwali bonus to members from interest pool.
 */
async function distributeBonus(req, res, next) {
  try {
    const groupId = req.body.groupId || req.user.groupId || DEFAULT_GROUP_ID;
    const year = parseInt(req.body.year, 10) || new Date().getFullYear();
    const distributionDate = req.body.distributionDate || new Date().toISOString().split('T')[0];
    const distributions = req.body.distributions;
    const remarks = (req.body.remarks || 'Diwali Bonus Distribution').trim();

    if (!Array.isArray(distributions) || distributions.length === 0) {
      return res.status(400).json({ success: false, message: 'Eligible members and distributions list are required.' });
    }

    // Check duplicate members in distribution list
    const seenMembers = new Set();
    let totalDistributing = 0;

    for (const item of distributions) {
      const mid = String(item.memberId || item.member_id || '').trim();
      if (!mid) {
        return res.status(400).json({ success: false, message: 'Every distribution entry must have a valid memberId.' });
      }
      if (seenMembers.has(mid)) {
        return res.status(400).json({ success: false, message: `Duplicate member entry detected: ${mid}.` });
      }
      seenMembers.add(mid);

      const amount = Number(item.bonusAmount ?? item.amount);
      if (isNaN(amount) || amount < 0) {
        return res.status(400).json({ success: false, message: `Invalid bonus amount for ${mid}. Amount cannot be negative or invalid.` });
      }
      totalDistributing += amount;
    }

    totalDistributing = Math.round(totalDistributing * 100) / 100;
    if (totalDistributing <= 0) {
      return res.status(400).json({ success: false, message: 'Total bonus distribution must be greater than ₹0.' });
    }

    // 1. Authoritative check on Available Interest Pool
    const repaymentsSnap = await db.collection('repayments').where('groupId', '==', groupId).get().catch(() => ({ docs: [] }));
    let repayments = repaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (repayments.length === 0) {
      const fallbackSnap = await db.collection('repayments').where('group_id', '==', groupId).get().catch(() => ({ docs: [] }));
      repayments = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const yearRepayments = repayments.filter(r => getRepaymentYear(r) === year);
    const totalInterestCollected = Math.round(
      yearRepayments.reduce((sum, r) => sum + number(r.interestAmount ?? r.interest_amount ?? r.interestPaid ?? 0), 0) * 100
    ) / 100;

    const bonusSnap = await db.collection('diwaliBonuses').where('groupId', '==', groupId).get().catch(() => ({ docs: [] }));
    let allBonuses = bonusSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (allBonuses.length === 0) {
      const fallbackBonusSnap = await db.collection('diwaliBonuses').where('group_id', '==', groupId).get().catch(() => ({ docs: [] }));
      allBonuses = fallbackBonusSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const yearBonuses = allBonuses.filter(b => number(b.year) === year);
    const existingDistributed = Math.round(
      yearBonuses.reduce((sum, b) => sum + number(b.bonusAmount ?? b.amount ?? 0), 0) * 100
    ) / 100;

    const netInterestAvailable = Math.max(0, Math.round((totalInterestCollected - existingDistributed) * 100) / 100);

    // Strict validation rule
    if (totalDistributing > netInterestAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Bonus distribution cannot exceed the available interest amount.',
        netInterestAvailable,
        totalDistributing,
      });
    }

    // 2. Atomic Batch Commit
    const nowIso = new Date().toISOString();
    const nowServer = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    const batchId = `BONUS_BATCH_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const createdRecords = [];

    for (const item of distributions) {
      const bonusDocRef = db.collection('diwaliBonuses').doc();
      const amount = Number(item.bonusAmount ?? item.amount);
      const record = {
        id: bonusDocRef.id,
        groupId,
        group_id: groupId,
        year,
        distributionDate,
        memberId: item.memberId,
        member_id: item.memberId,
        memberName: item.memberName || 'Member',
        member_name: item.memberName || 'Member',
        memberCode: item.memberCode || item.memberId,
        member_code: item.memberCode || item.memberId,
        bonusAmount: amount,
        amount: amount,
        remarks: item.remarks || remarks,
        batchId,
        createdAt: nowIso,
        createdBy: req.user.uid,
        createdByName: req.user.name || req.user.email || 'Admin',
      };
      batch.set(bonusDocRef, { ...record, timestamp: nowServer });
      createdRecords.push(record);
    }

    // Write Audit Transaction Record
    const actRef = db.collection('transactions').doc();
    batch.set(actRef, {
      id: actRef.id,
      groupId,
      group_id: groupId,
      type: 'DIWALI_BONUS_DISTRIBUTED',
      amount: totalDistributing,
      year,
      memberCount: distributions.length,
      description: `Diwali Bonus Distributed for ${year}: ₹${totalDistributing} across ${distributions.length} members`,
      recordedBy: req.user.uid,
      batchId,
      date: distributionDate,
      createdAt: nowServer,
    });

    // Update group cached available balance and total fund
    const groupRef = db.collection('groups').doc(groupId);
    const grpSnap = await groupRef.get().catch(() => null);
    if (grpSnap && grpSnap.exists) {
      const gData = grpSnap.data();
      const curBal = Number(gData.availableBalance) || 0;
      const curFund = Number(gData.totalFund) || 0;
      batch.set(groupRef, {
        availableBalance: Math.max(0, Math.round((curBal - totalDistributing) * 100) / 100),
        totalFund: Math.max(0, Math.round((curFund - totalDistributing) * 100) / 100),
        updatedAt: nowIso,
      }, { merge: true });
    }

    await batch.commit();

    return res.json({
      success: true,
      message: `Diwali bonus of ₹${totalDistributing} successfully distributed across ${distributions.length} members.`,
      batchId,
      totalDistributed: totalDistributing,
      remainingInterest: Math.max(0, Math.round((netInterestAvailable - totalDistributing) * 100) / 100),
      records: createdRecords,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getBonusSummary,
  distributeBonus,
};
