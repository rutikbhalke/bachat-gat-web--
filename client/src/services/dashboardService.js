import {
  collection,
  onSnapshot,
  doc,
  getDocs,
  getDoc,
  query,
  where,
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
        getDocs(groupQuery('monthlyContributions', targetGroupId)),
        getDocs(groupQuery('loans', targetGroupId)),
        getDocs(groupQuery('users', targetGroupId)),
        getDoc(doc(db, 'groups', targetGroupId)),
        getDocs(groupQuery('repayments', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('transactions', targetGroupId)).catch(() => ({ docs: [] })),
      ]);

      const savings = savingsSnap.docs.map(d => normalizeSavings(d.id, d.data()));
      const loans = loansSnap.docs.map(d => normalizeLoan(d.id, d.data()));
      const repayments = repaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const transactions = (txSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }));
      const members = membersSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => (m.id.startsWith('member_') || m.id.startsWith('test_mem_') || m.memberCode?.startsWith('M-130-') || m.memberCode?.startsWith('TM-') || ((m.role || '').toUpperCase() !== 'ADMIN' && !m.email?.includes('admin'))));
      const groupData = groupSnap.exists() ? groupSnap.data() : {};

      console.log(`[dashboardService] Records found: ${savings.length} savings, ${loans.length} loans, ${repayments.length} repayments, ${transactions.length} transactions, ${members.length} members`);

      const summary = calculateGroupFinancialSummary(savings, loans, repayments, transactions);

      let memberSummary = null;
      if (memberId) {
        memberSummary = calculateMemberFinancialSummary(memberId, savings, loans, repayments);
      }

      const mergedSummary = {
        ...groupData,
        ...summary,
        totalMembers: members.length,
        groupName: groupData.groupName || groupData.name || groupData.group_name || 'श्री सदुबाबा युवा स्वयम सहाय्य बचतगट',
        groupCode: groupData.groupCode || targetGroupId,
      };

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
        getDocs(groupQuery('users', targetGroupId)),
        getDocs(groupQuery('monthlyContributions', targetGroupId)),
        getDoc(doc(db, 'groups', targetGroupId)),
      ]);

      const monthlyShare = Number(groupDocSnap?.data()?.monthlyContribution ?? 1000);
      const allMembers = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const activeMembers = allMembers.filter((mem) => {
        const isNotAdmin = (mem.role || '').toUpperCase() !== 'ADMIN' && !mem.email?.includes('admin');
        const isActive = mem.isActive !== false && (mem.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
        return isNotAdmin && isActive;
      });
      const allContributions = contributionsSnap.docs.map((d) => normalizeSavings(d.id, d.data()));

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
   * OPTIMIZED: Synchronously compute all data without extra network requests.
   */
  subscribeToDashboard: (groupId, memberId, callback, selectedMonth, selectedYear) => {
    const targetGroupId = groupId || DEFAULT_GROUP_ID;

    const cache = {
      groupData: {},
      members: [],
      savings: [],
      loans: [],
      repayments: [],
      transactions: [],
      ready: { group: false, members: false, savings: false, loans: false, repayments: false, transactions: false }
    };

    let debounceTimer = null;
    const triggerUpdate = () => {
      // Ensure all listeners have returned their first snapshot
      if (!cache.ready.group || !cache.ready.members || !cache.ready.savings || 
          !cache.ready.loans || !cache.ready.repayments || !cache.ready.transactions) {
        return;
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          // Calculate Financial Summary
          const summary = calculateGroupFinancialSummary(cache.savings, cache.loans, cache.repayments, cache.transactions);
          let memberSummary = null;
          if (memberId) {
            memberSummary = calculateMemberFinancialSummary(memberId, cache.savings, cache.loans, cache.repayments);
          }

          const mergedSummary = {
            ...cache.groupData,
            ...summary,
            totalMembers: cache.members.length,
            groupName: cache.groupData.groupName || cache.groupData.name || cache.groupData.group_name || 'श्री सदुबाबा युवा स्वयम सहाय्य बचतगट',
            groupCode: cache.groupData.groupCode || targetGroupId,
          };
          
          mergedSummary.totalSavings = mergedSummary.totalGroupSavings || 0;
          mergedSummary.activeLoans = mergedSummary.activeLoansOutstanding || 0;
          mergedSummary.currentMonthlyInterest = summary.currentMonthlyInterest ?? 0;
          mergedSummary.totalInterestPaid = summary.totalInterestPaid ?? 0;
          mergedSummary.totalInterestCollected = summary.totalInterestPaid ?? 0;
          mergedSummary.totalInterest = summary.totalInterestPaid ?? 0;
          mergedSummary.totalBonusDistributed = summary.totalBonusDistributed ?? 0;
          mergedSummary.totalMembers = cache.members.length;

          // Calculate Monthly Progress
          const monthToUse = selectedMonth || new Date().getMonth() + 1;
          const yearToUse = selectedYear || new Date().getFullYear();
          const monthlyShare = Number(cache.groupData?.monthlyContribution ?? 1000);
          const activeMembers = cache.members.filter((mem) => {
            const isNotAdmin = (mem.role || '').toUpperCase() !== 'ADMIN' && !mem.email?.includes('admin');
            const isActive = mem.isActive !== false && (mem.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
            return isNotAdmin && isActive;
          });
          const progressSummary = calculateMonthlyMemberStatuses({
            activeMembers,
            payments: cache.savings,
            selectedMonth: monthToUse,
            selectedYear: yearToUse,
            monthlyShare,
          });

          // Calculate Recent Activities
          let activities = [...cache.transactions].map(d => normalizeActivity(d.id, d));
          if (activities.length < 8) {
            const seenIds = new Set(activities.map((a) => a.id));
            const seenRefs = new Set(activities.map((a) => a.referenceId).filter(Boolean));
            cache.savings.forEach((data) => {
               if (!seenIds.has(data.id) && !seenRefs.has(data.id)) {
                  activities.push(
                    normalizeActivity(`syn_c_${data.id}`, {
                      ...data,
                      type: 'SAVINGS_DEPOSIT',
                      amount: data.paidAmount ?? data.amount ?? 1000,
                      date: data.paymentDate || data.createdAt || `${data.year || 2026}-${String(data.month || 8).padStart(2, '0')}-10T10:00:00Z`,
                    })
                  );
               }
            });
            cache.loans.forEach((data) => {
               if (!seenIds.has(data.id) && !seenRefs.has(data.id)) {
                  activities.push(
                    normalizeActivity(`syn_l_${data.id}`, {
                      ...data,
                      type: 'LOAN_DISBURSEMENT',
                      amount: data.principalAmount ?? data.amount ?? 0,
                      date: data.issueDate || data.createdAt || new Date().toISOString(),
                    })
                  );
               }
            });
            cache.repayments.forEach((data) => {
               if (!seenIds.has(data.id) && !seenRefs.has(data.id)) {
                  const pAmt = Number(data.principalAmount || data.principal_amount || data.principalPaid || 0);
                  const iAmt = Number(data.interestAmount || data.interest_amount || data.interestPaid || 0);
                  const regHafta = Number(data.regularHaftaAmount || data.regular_hafta_amount || data.regularContribution || (data.amount && pAmt + iAmt > 0 && Number(data.amount) > (pAmt + iAmt) ? Math.round((Number(data.amount) - (pAmt + iAmt)) * 100) / 100 : 0));
                  const loanRepayTotal = Number(data.totalAmount || data.totalPaid || data.amount || (pAmt + iAmt + regHafta));
                  const memName = data.memberName || data.member_name || 'Member';
                  const actDesc = regHafta > 0
                    ? `Loan repayment ₹${loanRepayTotal.toLocaleString('en-IN')} (Regular Hapta: ₹${regHafta.toLocaleString('en-IN')}, Principal: ₹${pAmt.toLocaleString('en-IN')}, Interest: ₹${iAmt.toLocaleString('en-IN')}) from ${memName}`
                    : `Loan repayment ₹${loanRepayTotal.toLocaleString('en-IN')} (Principal: ₹${pAmt.toLocaleString('en-IN')}, Interest: ₹${iAmt.toLocaleString('en-IN')}) from ${memName}`;
                  activities.push(
                    normalizeActivity(`syn_r_${data.id}`, {
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
          }
          activities.sort((a, b) => {
            const timeA = new Date(a.date || a.createdAt || a.created_at || 0).getTime();
            const timeB = new Date(b.date || b.createdAt || b.created_at || 0).getTime();
            return timeB - timeA;
          });

          // Invoke callback synchronously with full data
          callback({
            success: true,
            summary: mergedSummary,
            memberSummary,
            progress: { month: monthToUse, year: yearToUse, ...progressSummary },
            activities: activities.slice(0, 8),
          });
        } catch (error) {
          console.error("Error computing dashboard realtime update:", error);
        }
      }, 50);
    };

    const unsubGroup = onSnapshot(doc(db, 'groups', targetGroupId), (snap) => {
      cache.groupData = snap.exists() ? snap.data() : {};
      cache.ready.group = true;
      triggerUpdate();
    });
    const unsubMembers = onSnapshot(groupQuery('users', targetGroupId), (snap) => {
      cache.members = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => (m.id.startsWith('member_') || m.id.startsWith('test_mem_') || m.memberCode?.startsWith('M-130-') || m.memberCode?.startsWith('TM-') || ((m.role || '').toUpperCase() !== 'ADMIN' && !m.email?.includes('admin'))));
      cache.ready.members = true;
      triggerUpdate();
    });
    const unsubContrib = onSnapshot(groupQuery('monthlyContributions', targetGroupId), (snap) => {
      cache.savings = snap.docs.map(d => normalizeSavings(d.id, d.data()));
      cache.ready.savings = true;
      triggerUpdate();
    });
    const unsubLoans = onSnapshot(groupQuery('loans', targetGroupId), (snap) => {
      cache.loans = snap.docs.map(d => normalizeLoan(d.id, d.data()));
      cache.ready.loans = true;
      triggerUpdate();
    });
    const unsubRepay = onSnapshot(groupQuery('repayments', targetGroupId), (snap) => {
      cache.repayments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cache.ready.repayments = true;
      triggerUpdate();
    });
    const unsubTx = onSnapshot(groupQuery('transactions', targetGroupId), (snap) => {
      cache.transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cache.ready.transactions = true;
      triggerUpdate();
    });

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
