import api from './api';
import { db, auth } from '../config/firebase';
import { collection, doc, getDocs, getDoc, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { DEFAULT_GROUP_ID } from '../utils/formatters';

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

export const bonusService = {
  /**
   * Get Diwali Bonus Pool Summary for a group and year.
   * Total Interest Collected (group income) - Total Bonus Distributed = Net Interest Available.
   */
  getBonusPoolSummary: async (year = new Date().getFullYear(), groupId = DEFAULT_GROUP_ID) => {
    const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
    const targetYear = parseInt(year, 10) || new Date().getFullYear();

    try {
      // Primary: backend authoritative calculation (with 1.5s timeout to avoid blocking)
      const res = await api.get('/bonus/summary', {
        params: { year: targetYear, groupId: targetGroupId },
        timeout: 250,
      });
      if (res.data && res.data.success) {
        return res.data;
      }
    } catch (err) {
      console.warn('Backend bonus summary unavailable, using Firestore client read fallback:', err.message);
    }

    // Fallback: direct Firestore read (Concurrent fetching)
    try {
      const [repaymentsSnap, bonusSnap, txSnap] = await Promise.all([
        getDocs(query(collection(db, 'repayments'), where('groupId', '==', targetGroupId))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'diwaliBonuses'), where('groupId', '==', targetGroupId))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'transactions'), where('groupId', '==', targetGroupId))).catch(() => ({ docs: [] }))
      ]);

      let repayments = repaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const yearRepayments = repayments.filter(r => getRepaymentYear(r) === targetYear);
      const totalInterestCollected = Math.round(
        yearRepayments.reduce((sum, r) => sum + number(r.interestAmount ?? r.interest_amount ?? r.interestPaid ?? 0), 0) * 100
      ) / 100;

      let allBonuses = bonusSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Check transactions collection for DIWALI_BONUS_DISTRIBUTED
      if (allBonuses.length === 0) {
        const bonusTxs = txSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => t.type === 'DIWALI_BONUS_DISTRIBUTED');
        
        bonusTxs.forEach(t => {
          if (Array.isArray(t.distributions)) {
            t.distributions.forEach(d => {
              allBonuses.push({
                id: `${t.id}_${d.memberId}`,
                year: t.year || targetYear,
                distributionDate: t.date || t.createdAt,
                ...d,
              });
            });
          } else if (t.amount) {
            allBonuses.push({
              id: t.id,
              year: t.year || targetYear,
              distributionDate: t.date || t.createdAt,
              bonusAmount: t.amount,
              amount: t.amount,
              memberName: t.memberName || 'Group Distribution',
              memberCode: '-',
              remarks: t.description || 'Diwali Bonus',
            });
          }
        });
      }

      const yearBonuses = allBonuses.filter(b => number(b.year) === targetYear);
      const totalBonusDistributed = Math.round(
        yearBonuses.reduce((sum, b) => sum + number(b.bonusAmount ?? b.amount ?? 0), 0) * 100
      ) / 100;

      const netInterestAvailable = Math.max(0, Math.round((totalInterestCollected - totalBonusDistributed) * 100) / 100);

      return {
        success: true,
        groupId: targetGroupId,
        year: targetYear,
        totalInterestCollected,
        totalBonusDistributed,
        netInterestAvailable,
        yearBonuses,
      };
    } catch (fsErr) {
      console.error('Failed to get bonus summary:', fsErr);
      return {
        success: false,
        groupId: targetGroupId,
        year: targetYear,
        totalInterestCollected: 0,
        totalBonusDistributed: 0,
        netInterestAvailable: 0,
        yearBonuses: [],
      };
    }
  },

  /**
   * Distribute Diwali Bonus (ADMIN ONLY).
   * Fast, reliable dual-mode: attempts backend API with fast timeout, falling back
   * to direct authorized Firestore atomic batch commit.
   */
  distributeDiwaliBonus: async ({ year, distributionDate, distributions, remarks }, groupId = DEFAULT_GROUP_ID) => {
    const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
    const targetYear = parseInt(year, 10) || new Date().getFullYear();
    const dateStr = distributionDate || new Date().toISOString().split('T')[0];

    // Direct Authoritative Client-Side Batch Execution (< 250ms)
    try {
      if (!Array.isArray(distributions) || distributions.length === 0) {
        throw new Error('Eligible members and distributions list are required.');
      }

      const seenMembers = new Set();
      let totalDistributing = 0;

      for (const item of distributions) {
        const mid = String(item.memberId || item.member_id || '').trim();
        if (!mid) throw new Error('Every distribution entry must have a valid memberId.');
        if (seenMembers.has(mid)) throw new Error(`Duplicate member entry detected: ${mid}.`);
        seenMembers.add(mid);

        const amount = Number(item.bonusAmount ?? item.amount);
        if (isNaN(amount) || amount < 0) {
          throw new Error(`Invalid bonus amount for ${mid}. Amount cannot be negative.`);
        }
        totalDistributing += amount;
      }

      totalDistributing = Math.round(totalDistributing * 100) / 100;
      if (totalDistributing <= 0) {
        throw new Error('Total bonus distribution must be greater than ₹0.');
      }

      // Check available pool and group state in parallel
      const [poolSummary, grpSnap] = await Promise.all([
        bonusService.getBonusPoolSummary(targetYear, targetGroupId),
        getDoc(doc(db, 'groups', targetGroupId)).catch(() => null),
      ]);

      if (totalDistributing > poolSummary.netInterestAvailable) {
        throw new Error(`Bonus distribution (₹${totalDistributing}) cannot exceed the available interest amount (₹${poolSummary.netInterestAvailable}).`);
      }

      const batch = writeBatch(db);
      const batchId = `BONUS_BATCH_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();
      const currentUser = auth.currentUser;
      const createdRecords = [];

      for (const item of distributions) {
        const bonusDocRef = doc(collection(db, 'diwaliBonuses'));
        const amount = Number(item.bonusAmount ?? item.amount);
        const record = {
          id: bonusDocRef.id,
          groupId: targetGroupId,
          group_id: targetGroupId,
          year: targetYear,
          distributionDate: dateStr,
          memberId: item.memberId,
          member_id: item.memberId,
          memberName: item.memberName || 'Member',
          member_name: item.memberName || 'Member',
          memberCode: item.memberCode || item.memberId,
          member_code: item.memberCode || item.memberId,
          bonusAmount: amount,
          amount,
          remarks: item.remarks || remarks || `Diwali Bonus ${targetYear}`,
          batchId,
          createdAt: nowIso,
          createdBy: currentUser?.uid || 'admin',
          createdByName: currentUser?.displayName || currentUser?.email || 'Admin',
        };
        createdRecords.push(record);
      }

      // Audit Transaction Record (Contains authoritative distributions array)
      const actRef = doc(collection(db, 'transactions'));
      batch.set(actRef, {
        id: actRef.id,
        groupId: targetGroupId,
        group_id: targetGroupId,
        type: 'DIWALI_BONUS_DISTRIBUTED',
        amount: totalDistributing,
        year: targetYear,
        memberCount: distributions.length,
        distributions: createdRecords,
        description: `Diwali Bonus Distributed for ${targetYear}: ₹${totalDistributing} across ${distributions.length} members`,
        recordedBy: currentUser?.uid || 'admin',
        batchId,
        date: dateStr,
        createdAt: serverTimestamp(),
      });

      // Update Group balance if group exists
      if (grpSnap && grpSnap.exists()) {
        const gData = grpSnap.data();
        const curBal = Number(gData.availableBalance) || 0;
        const curFund = Number(gData.totalFund) || 0;
        batch.set(doc(db, 'groups', targetGroupId), {
          availableBalance: Math.max(0, Math.round((curBal - totalDistributing) * 100) / 100),
          totalFund: Math.max(0, Math.round((curFund - totalDistributing) * 100) / 100),
          updatedAt: nowIso,
        }, { merge: true });
      }

      await batch.commit();

      return {
        success: true,
        message: `Diwali bonus of ₹${totalDistributing} successfully distributed across ${distributions.length} members.`,
        batchId,
        totalDistributed: totalDistributing,
        remainingInterest: Math.max(0, Math.round((poolSummary.netInterestAvailable - totalDistributing) * 100) / 100),
        records: createdRecords,
      };
    } catch (fsErr) {
      console.error('Failed to distribute Diwali bonus in Firestore:', fsErr);
      throw fsErr;
    }
  },
};

export default bonusService;
