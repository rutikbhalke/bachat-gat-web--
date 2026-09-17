import api from './api';
import { db } from '../config/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
      // Primary: backend authoritative calculation
      const res = await api.get('/bonus/summary', {
        params: { year: targetYear, groupId: targetGroupId },
      });
      if (res.data && res.data.success) {
        return res.data;
      }
    } catch (err) {
      console.warn('Backend bonus summary unavailable, using Firestore client read fallback:', err.message);
    }

    // Fallback: direct Firestore read
    try {
      const repaymentsSnap = await getDocs(
        query(collection(db, 'repayments'), where('groupId', '==', targetGroupId))
      ).catch(() => ({ docs: [] }));

      let repayments = repaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (repayments.length === 0) {
        const fallbackSnap = await getDocs(
          query(collection(db, 'repayments'), where('group_id', '==', targetGroupId))
        ).catch(() => ({ docs: [] }));
        repayments = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      const yearRepayments = repayments.filter(r => getRepaymentYear(r) === targetYear);
      const totalInterestCollected = Math.round(
        yearRepayments.reduce((sum, r) => sum + number(r.interestAmount ?? r.interest_amount ?? r.interestPaid ?? 0), 0) * 100
      ) / 100;

      const bonusSnap = await getDocs(
        query(collection(db, 'diwaliBonuses'), where('groupId', '==', targetGroupId))
      ).catch(() => ({ docs: [] }));

      let allBonuses = bonusSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (allBonuses.length === 0) {
        const fallbackBonusSnap = await getDocs(
          query(collection(db, 'diwaliBonuses'), where('group_id', '==', targetGroupId))
        ).catch(() => ({ docs: [] }));
        allBonuses = fallbackBonusSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      // Check transactions collection for DIWALI_BONUS_DISTRIBUTED
      if (allBonuses.length === 0) {
        const txSnap = await getDocs(
          query(collection(db, 'transactions'), where('groupId', '==', targetGroupId))
        ).catch(() => ({ docs: [] }));
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
   * MUST execute strictly via authorized backend API; never bypasses backend security.
   */
  distributeDiwaliBonus: async ({ year, distributionDate, distributions, remarks }, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
      const response = await api.post('/bonus/distribute', {
        groupId: targetGroupId,
        year: parseInt(year, 10) || new Date().getFullYear(),
        distributionDate: distributionDate || new Date().toISOString().split('T')[0],
        distributions,
        remarks: (remarks || '').trim(),
      });
      return response.data;
    } catch (err) {
      console.error('Diwali bonus distribution failed:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Failed to distribute Diwali bonus.';
      throw new Error(errorMsg);
    }
  },
};

export default bonusService;
