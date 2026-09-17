import {
  collection,
  onSnapshot,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit as limitDocs,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { groupQuery } from './dataContract';
import { groupService } from './groupService';
import { reportService } from './reportService';
import { notificationService } from './notificationService';
import {
  DEFAULT_GROUP_ID,
  normalizeSavings,
  normalizeLoan,
  normalizeActivity,
  calculateMonthlyMemberStatuses,
} from '../utils/formatters';

import {
  calculateGroupFinancialSummary,
  calculateMemberFinancialSummary,
} from './financialService';

export { groupService, reportService, notificationService };

export const dashboardService = {
  /**
   * Calculate all real-time summary financial metrics directly from Firestore.
   */
  getSummary: async (groupId = DEFAULT_GROUP_ID, memberId = null) => {
    try {
      const targetGroupId = groupId || DEFAULT_GROUP_ID;
      console.log(`[dashboardService] Fetching summary for: ${targetGroupId}`);

      const [savingsSnap, loansSnap, membersSnap, groupSnap, repaymentsSnap, txSnap] = await Promise.all([
        getDocs(collection(db, 'monthlyContributions')),
        getDocs(collection(db, 'loans')),
        getDocs(collection(db, 'users')),
        getDoc(doc(db, 'groups', targetGroupId)),
        getDocs(collection(db, 'repayments')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'transactions')).catch(() => ({ docs: [] })),
      ]);

      const savings = savingsSnap.docs.map(d => normalizeSavings(d.id, d.data())).filter(s => (s.groupId || '').toLowerCase() === targetGroupId.toLowerCase());
      const loans = loansSnap.docs.map(d => normalizeLoan(d.id, d.data())).filter(l => (l.groupId || '').toLowerCase() === targetGroupId.toLowerCase());
      const repayments = repaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => (r.groupId || '').toLowerCase() === targetGroupId.toLowerCase());
      const transactions = (txSnap?.docs || []).map(d => ({ id: d.id, ...d.data() })).filter(t => (t.groupId || t.group_id || '').toLowerCase() === targetGroupId.toLowerCase());
      const members = membersSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => (m.groupId || '').toLowerCase() === targetGroupId.toLowerCase() && (m.id.startsWith('member_') || m.id.startsWith('test_mem_') || m.memberCode?.startsWith('M-130-') || m.memberCode?.startsWith('TM-') || ((m.role || '').toUpperCase() !== 'ADMIN' && !m.email?.includes('admin'))));
      const groupData = groupSnap.exists() ? groupSnap.data() : {};

      console.log(`[dashboardService] Records found: ${savings.length} savings, ${loans.length} loans, ${repayments.length} repayments, ${transactions.length} transactions, ${members.length} members`);

      const summary = calculateGroupFinancialSummary(savings, loans, repayments, transactions);

      let memberSummary = null;
      if (memberId) {
        memberSummary = calculateMemberFinancialSummary(memberId, savings, loans, repayments);
      }

      // Live calculations take authoritative precedence
      const mergedSummary = {
        ...groupData,
        ...summary,
        totalMembers: members.length,
        groupName: groupData.groupName || groupData.name || groupData.group_name || 'श्री सदुबाबा युवा स्वयम सहाय्य बचतगट',
        groupCode: groupData.groupCode || targetGroupId,
      };

      // Ensure naming consistency
      mergedSummary.totalSavings = mergedSummary.totalGroupSavings || 0;
      mergedSummary.activeLoans = mergedSummary.activeLoansOutstanding || 0;
      mergedSummary.currentMonthlyInterest = summary.currentMonthlyInterest ?? 0;
      mergedSummary.totalInterestPaid = summary.totalInterestPaid ?? 0;
      mergedSummary.totalInterestCollected = summary.totalInterestPaid ?? 0;
      mergedSummary.totalInterest = summary.totalInterestPaid ?? 0;
      mergedSummary.totalBonusDistributed = summary.totalBonusDistributed ?? 0;
      mergedSummary.totalMembers = members.length;

      return {
        success: true,
        debug: {
          savingsCount: savings.length,
          loansCount: loans.length,
          membersCount: members.length
        },
        summary: mergedSummary,
        memberSummary
      };
    } catch (err) {
      console.error('Failed to fetch dashboard summary from Firestore:', err);
      return { success: false };
    }
  },

  /**
   * Get Monthly collection progress against target (Calculated on Frontend)
   */
  getMonthlyProgress: async (
    month = new Date().getMonth() + 1,
    year = new Date().getFullYear(),
    groupId = DEFAULT_GROUP_ID
  ) => {
    try {
      const targetGroupId = groupId || DEFAULT_GROUP_ID;
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);

      const [membersSnap, contributionsSnap, groupDocSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'monthlyContributions')),
        getDoc(doc(db, 'groups', targetGroupId)),
      ]);

      const monthlyShare = Number(groupDocSnap?.data()?.monthlyContribution ?? 1000);
      const allMembers = membersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(m => (m.groupId || '').toLowerCase() === targetGroupId.toLowerCase());
      const activeMembers = allMembers.filter((mem) => {
        const isNotAdmin = (mem.role || '').toUpperCase() !== 'ADMIN' && !mem.email?.includes('admin');
        const isActive = mem.isActive !== false && (mem.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
        return isNotAdmin && isActive;
      });
      const allContributions = contributionsSnap.docs.map((d) => normalizeSavings(d.id, d.data())).filter(s => (s.groupId || '').toLowerCase() === targetGroupId.toLowerCase());

      const summary = calculateMonthlyMemberStatuses({
        activeMembers,
        payments: allContributions,
        selectedMonth: m,
        selectedYear: y,
        monthlyShare,
      });

      return {
        success: true,
        progress: {
          month: m,
          year: y,
          ...summary
        },
      };
    } catch (err) {
      console.error('Failed to get monthly progress from Firestore:', err);
      return { success: false };
    }
  },

  /**
   * Get recent activities from Firestore directly.
   */
  getRecentActivities: async (limitCount = 8, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = groupId || DEFAULT_GROUP_ID;
      let activities = [];

      // 1. Fetch transactions for this group
      try {
        const txSnap = await getDocs(groupQuery('transactions', targetGroupId));
        activities = txSnap.docs.map((d) => normalizeActivity(d.id, d.data()));
      } catch (txErr) {
        console.warn('Direct transactions query fallback:', txErr);
        const txSnapAll = await getDocs(collection(db, 'transactions'));
        activities = txSnapAll.docs
          .map((d) => normalizeActivity(d.id, d.data()))
          .filter((a) => (a.groupId || '').toLowerCase() === targetGroupId.toLowerCase());
      }

      // 2. Synthesize from contributions, loans, and repayments if fewer than limitCount
      if (activities.length < limitCount) {
        try {
          const [contribSnap, loansSnap, repaySnap] = await Promise.all([
            getDocs(groupQuery('monthlyContributions', targetGroupId)).catch(() => ({ docs: [] })),
            getDocs(groupQuery('loans', targetGroupId)).catch(() => ({ docs: [] })),
            getDocs(groupQuery('repayments', targetGroupId)).catch(() => ({ docs: [] })),
          ]);

          const seenIds = new Set(activities.map((a) => a.id));
          const seenRefs = new Set(activities.map((a) => a.referenceId).filter(Boolean));

          contribSnap.docs.forEach((d) => {
            const data = d.data();
            if (!seenIds.has(d.id) && !seenRefs.has(d.id)) {
              activities.push(
                normalizeActivity(`syn_c_${d.id}`, {
                  ...data,
                  type: 'SAVINGS_DEPOSIT',
                  amount: data.paidAmount ?? data.amount ?? 1000,
                  date: data.paymentDate || data.createdAt || `${data.year || 2026}-${String(data.month || 8).padStart(2, '0')}-10T10:00:00Z`,
                })
              );
            }
          });

          loansSnap.docs.forEach((d) => {
            const data = d.data();
            if (!seenIds.has(d.id) && !seenRefs.has(d.id)) {
              activities.push(
                normalizeActivity(`syn_l_${d.id}`, {
                  ...data,
                  type: 'LOAN_DISBURSEMENT',
                  amount: data.principalAmount ?? data.amount ?? 0,
                  date: data.issueDate || data.createdAt || new Date().toISOString(),
                })
              );
            }
          });

          repaySnap.docs.forEach((d) => {
            const data = d.data();
            if (!seenIds.has(d.id) && !seenRefs.has(d.id)) {
              const pAmt = Number(data.principalAmount || data.principal_amount || data.principalPaid || 0);
              const iAmt = Number(data.interestAmount || data.interest_amount || data.interestPaid || 0);
              const regHafta = Number(data.regularHaftaAmount || data.regular_hafta_amount || data.regularContribution || (data.amount && pAmt + iAmt > 0 && Number(data.amount) > (pAmt + iAmt) ? Math.round((Number(data.amount) - (pAmt + iAmt)) * 100) / 100 : 0));
              const loanRepayTotal = Number(data.totalAmount || data.totalPaid || data.amount || (pAmt + iAmt + regHafta));
              const memName = data.memberName || data.member_name || 'Member';
              const actDesc = regHafta > 0
                ? `Loan repayment ₹${loanRepayTotal.toLocaleString('en-IN')} (Regular Hapta: ₹${regHafta.toLocaleString('en-IN')}, Principal: ₹${pAmt.toLocaleString('en-IN')}, Interest: ₹${iAmt.toLocaleString('en-IN')}) from ${memName}`
                : `Loan repayment ₹${loanRepayTotal.toLocaleString('en-IN')} (Principal: ₹${pAmt.toLocaleString('en-IN')}, Interest: ₹${iAmt.toLocaleString('en-IN')}) from ${memName}`;
              
              activities.push(
                normalizeActivity(`syn_r_${d.id}`, {
                  ...data,
                  type: 'LOAN_REPAYMENT',
                  amount: loanRepayTotal,
                  regularHaptaAmount: regHafta,
                  principalAmount: pAmt,
                  interestAmount: iAmt,
                  description: actDesc,
                  date: data.paymentDate || data.createdAt || new Date().toISOString(),
                })
              );
            }
          });
        } catch (synthErr) {
          console.warn('Activity synthesis notice:', synthErr);
        }
      }

      // Sort by date descending
      activities.sort((a, b) => {
        const timeA = new Date(a.date || a.createdAt || a.created_at || 0).getTime();
        const timeB = new Date(b.date || b.createdAt || b.created_at || 0).getTime();
        return timeB - timeA;
      });

      return {
        success: true,
        activities: activities.slice(0, limitCount),
      };
    } catch (err) {
      console.error('Failed to get recent activities from Firestore:', err);
      return { success: true, activities: [] };
    }
  },

  /**
   * Subscribe to Real-Time Dashboard Updates across all collections
   */
  subscribeToDashboard: (groupId, memberId, callback) => {
    const targetGroupId = groupId || DEFAULT_GROUP_ID;

    let debounceTimer = null;
    const triggerUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        dashboardService.getSummary(targetGroupId, memberId).then((res) => {
          if (res.success) callback(res);
        });
      }, 100);
    };

    // Listen for changes
    const unsubGroup = onSnapshot(doc(db, 'groups', targetGroupId), triggerUpdate);
    const unsubMembers = onSnapshot(groupQuery('users', targetGroupId), triggerUpdate);
    const unsubContrib = onSnapshot(groupQuery('monthlyContributions', targetGroupId), triggerUpdate);
    const unsubLoans = onSnapshot(groupQuery('loans', targetGroupId), triggerUpdate);
    const unsubRepay = onSnapshot(groupQuery('repayments', targetGroupId), triggerUpdate);
    const unsubTx = onSnapshot(groupQuery('transactions', targetGroupId), triggerUpdate);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubGroup();
      unsubMembers();
      unsubContrib();
      unsubLoans();
      unsubRepay();
      unsubTx();
    };
  },
};
