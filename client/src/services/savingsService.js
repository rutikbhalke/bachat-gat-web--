import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { groupQuery } from './dataContract.js';
import {
  normalizeSavings,
  normalizeMember,
  DEFAULT_GROUP_ID,
} from '../utils/formatters.js';

/**
 * Calculate the next unpaid savings period for a member based on their recorded savings.
 * If the member has paid up to month M of year Y:
 *   - next month is M + 1 (or 1 if M === 12, with year Y + 1)
 * If no paid savings are recorded:
 *   - returns current month and year
 */
export const calculateNextUnpaidSavingsPeriod = (memberSavings = []) => {
  const currentDate = new Date();
  const defaultMonth = currentDate.getMonth() + 1;
  const defaultYear = currentDate.getFullYear();

  if (!Array.isArray(memberSavings) || memberSavings.length === 0) {
    return { month: defaultMonth, year: defaultYear };
  }

  const paidList = memberSavings
    .filter((s) => {
      const paidAmt = Number(s.paidAmount ?? s.amount ?? s.paid_amount ?? 0);
      const status = (s.status || '').toLowerCase();
      return paidAmt > 0 || status === 'paid';
    })
    .map((s) => {
      const month = Number(s.month);
      const year = Number(s.year);
      return {
        month,
        year,
        key: year * 12 + month,
      };
    })
    .filter((p) => !isNaN(p.month) && !isNaN(p.year) && p.month >= 1 && p.month <= 12 && p.year > 2000);

  if (paidList.length === 0) {
    return { month: defaultMonth, year: defaultYear };
  }

  // Sort chronologically ascending
  paidList.sort((a, b) => a.key - b.key);
  const latest = paidList[paidList.length - 1];

  let nextMonth = latest.month + 1;
  let nextYear = latest.year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  return { month: nextMonth, year: nextYear };
};

export const savingsService = {
  calculateNextUnpaidSavingsPeriod,
  
  /**
   * Get savings specifically for a single member
   */
  getMemberSavings: async (memberId, groupId = DEFAULT_GROUP_ID) => {
    try {
      const res = await savingsService.getAllSavings({ memberId, includePending: false }, groupId);
      return res.savings || [];
    } catch (err) {
      console.error('Failed to get member savings:', err);
      return [];
    }
  },
  /**
   * Fast targeted check if savings for a specific month/year are already recorded
   */
  isMonthPaid: async (memberId, month, year) => {
    try {
      const docId = `C_${memberId}_${year}_${String(month).padStart(2, '0')}`;
      const snap = await getDoc(doc(db, 'monthlyContributions', docId));
      if (snap.exists()) {
        const d = snap.data();
        const paid = Number(d.paidAmount || d.paid_amount || d.amount || 0);
        return paid > 0 || (d.status || '').toLowerCase() === 'paid';
      }
      return false;
    } catch {
      return false;
    }
  },
  /**
   * Get all recorded savings / monthly contributions with member information
   */
  getAllSavings: async (params = {}, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;

      const [contributionsSnap, membersSnap] = await Promise.all([
        getDocs(groupQuery('monthlyContributions', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('users', targetGroupId)).catch(() => ({ docs: [] })),
      ]);

      const membersMap = {};
      membersSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        membersMap[docSnap.id] = d.name || d.fullName || 'Member';
        if (d.userId) membersMap[d.userId] = d.name || d.fullName || 'Member';
        if (d.authUid) membersMap[d.authUid] = d.name || d.fullName || 'Member';
      });

      const savings = contributionsSnap.docs
        .map((docSnap) => {
          const raw = docSnap.data();
          const normalized = normalizeSavings(docSnap.id, raw);
          const memberName = membersMap[normalized.memberId] || normalized.memberName;

          return {
            ...normalized,
            member_name: memberName,
            memberName: memberName,
          };
        })
        .filter((s) => s.paidAmount > 0 || s.status === 'paid' || params.includePending);

      // Filter by month, year, search if provided
      let filtered = savings;
      if (params.month) {
        filtered = filtered.filter((s) => s.month === parseInt(params.month, 10));
      }
      if (params.year) {
        filtered = filtered.filter((s) => s.year === parseInt(params.year, 10));
      }
      if (params.memberId) {
        filtered = filtered.filter((s) => s.memberId === params.memberId || s.member_id === params.memberId);
      }
      if (params.search) {
        const s = params.search.toLowerCase();
        filtered = filtered.filter(
          (item) => item.member_name.toLowerCase().includes(s) || item.member_code.toLowerCase().includes(s)
        );
      }

      // Sort by Year desc, Month desc, Date desc
      filtered.sort((a, b) => b.year - a.year || b.month - a.month);

      const totalAmount = filtered.reduce((acc, curr) => acc + (curr.paidAmount || curr.amount || 0), 0);

      return {
        success: true,
        count: filtered.length,
        totalAmount,
        total_amount: totalAmount,
        savings: filtered,
      };
    } catch (err) {
      console.error('Failed to get savings from Firestore:', err);
      return { success: true, count: 0, totalAmount: 0, savings: [] };
    }
  },

  recordSavings: async (data, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
      const memberId = data.member_id || data.memberId;
      const month = parseInt(data.month, 10);
      const year = parseInt(data.year, 10);
      const amount = parseFloat(data.amount);
      const mode = data.payment_mode || data.paymentMode || 'UPI';
      const notes = data.remarks || data.notes || '';

      if (!memberId) {
        throw new Error('Member ID is required to record savings.');
      }
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Please enter a valid contribution amount greater than 0.');
      }
      if (!month || !year || month < 1 || month > 12) {
        throw new Error('Valid month and year are required.');
      }

      const docId = `C_${memberId}_${year}_${String(month).padStart(2, '0')}`;
      
      const docRef = doc(db, 'monthlyContributions', docId);
      const memRef = doc(db, 'users', memberId);
      const groupRef = doc(db, 'groups', targetGroupId);

      // Concurrent reads for lightning-fast performance
      const [existingContribution, memSnap, groupSnap] = await Promise.all([
        getDoc(docRef),
        getDoc(memRef),
        getDoc(groupRef),
      ]);
      
      if (existingContribution.exists()) {
        const existingData = existingContribution.data();
        const alreadyPaid = Number(existingData.paidAmount || existingData.regularHaftaAmount || 0);
        if (alreadyPaid > 0) {
          throw new Error(`Savings for ${month}/${year} are already recorded for this member.`);
        }
      }

      const memberName = memSnap.exists() ? (memSnap.data().name || memSnap.data().fullName || 'Member') : 'Member';
      let groupData = groupSnap.exists() ? groupSnap.data() : {};

      const contributionPayload = {
        id: docId,
        contribId: docId,
        contrib_id: docId,
        groupId: targetGroupId,
        group_id: targetGroupId,
        memberId,
        member_id: memberId,
        month,
        year,
        expectedAmount: amount,
        expected_amount: amount,
        regularHaftaAmount: amount,
        regular_hafta_amount: amount,
        paidAmount: amount,
        paid_amount: amount,
        amount,
        totalPaid: amount,
        total_paid: amount,
        loanPrincipalPaid: 0,
        loan_principal_paid: 0,
        interestAmount: 0,
        interest_amount: 0,
        interest: 0,
        status: 'PAID',
        status_lower: 'paid',
        paymentDate: data.payment_date || new Date().toISOString(),
        payment_date: data.payment_date || new Date().toISOString(),
        paymentMode: mode,
        payment_mode: mode,
        notes: notes.trim(),
        remarks: notes.trim(),
        createdAt: existingContribution.exists() ? existingContribution.data().createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const batch = writeBatch(db);
      batch.set(docRef, contributionPayload, { merge: true });

      const actId = `ACT_${Date.now()}_saving`;
      const actRef = doc(db, 'transactions', actId);
      batch.set(actRef, {
        id: actId,
        groupId: targetGroupId,
        type: 'saving',
        amount,
        description: `Monthly savings ₹${amount} received from ${memberName}`,
        memberId,
        memberName,
        referenceId: docId,
        date: new Date().toISOString(),
      });

      if (groupSnap.exists()) {
        const newTotalSavings = Number(groupData.totalSavings || 0) + amount;
        const currentOutstanding = Number(groupData.activeLoans || 0);
        const currentInterest = Number(groupData.currentMonthlyInterest ?? groupData.current_monthly_interest ?? (currentOutstanding * 0.02) ?? 0);

        const newTotalFund = Math.round((newTotalSavings + currentInterest) * 100) / 100;
        const newRawAvailableBalance = Math.round((newTotalFund - currentOutstanding) * 100) / 100;
        const newAvailableBalance = Math.max(0, newRawAvailableBalance);

        batch.update(groupRef, {
          totalSavings: newTotalSavings,
          total_savings: newTotalSavings,
          totalFund: newTotalFund,
          total_fund: newTotalFund,
          availableBalance: newAvailableBalance,
          available_balance: newAvailableBalance,
          rawAvailableBalance: newRawAvailableBalance,
          updatedAt: new Date().toISOString(),
        });
      }

      await batch.commit();

      return {
        success: true,
        message: 'Monthly savings recorded successfully in Bachat Gat',
        savingsId: docId,
      };
    } catch (err) {
      console.error('Failed to record savings in Firestore:', err);
      throw new Error(err.message || 'Failed to record savings.');
    }
  },

  /**
   * Update savings entry
   */
  updateSavings: async (id, data, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
      const docRef = doc(db, 'monthlyContributions', id);
      const payload = {
        updatedAt: new Date().toISOString(),
      };
      if (data.amount !== undefined) {
        const amt = parseFloat(data.amount);
        payload.paidAmount = amt;
        payload.totalPaid = amt;
        payload.status = amt > 0 ? 'paid' : 'pending';
      }
      if (data.payment_date) payload.paymentDate = data.payment_date;
      if (data.payment_mode) payload.paymentMode = data.payment_mode;
      if (data.remarks !== undefined) payload.notes = data.remarks.trim();

      await updateDoc(docRef, payload);
      return { success: true, message: 'Savings entry updated successfully' };
    } catch (err) {
      console.error('Failed to update savings in Firestore:', err);
      throw new Error(err.message || 'Failed to update savings.');
    }
  },

  /**
   * Subscribe to real-time savings
   */
  subscribeToSavings: (callback, groupId = DEFAULT_GROUP_ID) => {
    const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
    return onSnapshot(groupQuery('monthlyContributions', targetGroupId), () => {
      savingsService.getAllSavings({}, targetGroupId).then((res) => {
        if (res.success) callback(res);
      });
    });
  },
};
