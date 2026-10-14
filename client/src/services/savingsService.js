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
      
      let alreadyPaid = 0;
      let expected = amount;
      if (existingContribution.exists()) {
        const existingData = existingContribution.data();
        alreadyPaid = Number(existingData.paidAmount || existingData.regularHaftaAmount || existingData.amount || 0);
        expected = Number(existingData.expectedAmount || existingData.expected_amount || amount);
        if (alreadyPaid >= expected) {
          throw new Error(`Savings for ${month}/${year} are already recorded for this member.`);
        }
      }

      const actualAmountToAdd = Math.max(0, Math.min(amount, expected - alreadyPaid));
      if (actualAmountToAdd <= 0) {
        throw new Error(`Savings for ${month}/${year} are already recorded for this member.`);
      }
      const totalPaidAmount = alreadyPaid + actualAmountToAdd;
      const isPaidFull = totalPaidAmount >= expected;

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
        expectedAmount: expected,
        expected_amount: expected,
        regularHaftaAmount: totalPaidAmount,
        regular_hafta_amount: totalPaidAmount,
        paidAmount: totalPaidAmount,
        paid_amount: totalPaidAmount,
        amount: totalPaidAmount,
        totalPaid: totalPaidAmount,
        total_paid: totalPaidAmount,
        loanPrincipalPaid: 0,
        loan_principal_paid: 0,
        interestAmount: 0,
        interest_amount: 0,
        interest: 0,
        status: isPaidFull ? 'paid' : 'partial',
        status_lower: isPaidFull ? 'paid' : 'partial',
        status_upper: isPaidFull ? 'PAID' : 'PARTIAL',
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
        type_flutter: 'monthlyInvestment',
        amount: actualAmountToAdd,
        description: `Monthly savings ₹${actualAmountToAdd} received from ${memberName}`,
        memberId,
        memberName,
        referenceId: docId,
        date: new Date().toISOString(),
      });

      if (groupSnap.exists() && actualAmountToAdd > 0) {
        const newTotalSavings = Number(groupData.totalSavings || groupData.total_savings || 0) + actualAmountToAdd;
        const currentOutstanding = Number(groupData.activeLoans || groupData.active_loans || groupData.totalOutstandingLoans || 0);
        const currentAvailable = Number(groupData.availableBalance ?? groupData.available_balance ?? 0);
        const newAvailableBalance = Math.round((currentAvailable + actualAmountToAdd) * 100) / 100;
        const newTotalFund = Math.round((newAvailableBalance + currentOutstanding) * 100) / 100;

        batch.update(groupRef, {
          totalSavings: newTotalSavings,
          total_savings: newTotalSavings,
          totalFund: newTotalFund,
          total_fund: newTotalFund,
          availableBalance: newAvailableBalance,
          available_balance: newAvailableBalance,
          rawAvailableBalance: newAvailableBalance,
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
   * Get Bulk Monthly Savings preview for all active members
   */
  getBulkSavingsPreview: async ({ month, year }, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
      const targetMonth = parseInt(month, 10);
      const targetYear = parseInt(year, 10);

      const [contributionsSnap, membersSnap, groupSnap, loansSnap] = await Promise.all([
        getDocs(groupQuery('monthlyContributions', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('users', targetGroupId)).catch(() => ({ docs: [] })),
        getDoc(doc(db, 'groups', targetGroupId)).catch(() => ({ exists: () => false })),
        getDocs(groupQuery('loans', targetGroupId)).catch(() => ({ docs: [] })),
      ]);

      const groupData = groupSnap.exists() ? groupSnap.data() : {};
      const defaultShare = Number(groupData.monthlyContribution || groupData.monthly_contribution_per_share || 1000);

      const activeLoans = loansSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((l) => l.status === 'ACTIVE');

      const activeMembers = membersSnap.docs
        .map((d) => normalizeMember(d.id, d.data()))
        .filter(
          (m) =>
            m.status !== 'INACTIVE' &&
            (m.status || '').toLowerCase() !== 'inactive' &&
            m.isActive !== false &&
            !m.isDeleted
        );

      const existingContributions = contributionsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => Number(c.month) === targetMonth && Number(c.year) === targetYear);

      let totalExpected = 0;
      let totalAlreadyPaid = 0;
      let totalRemainingDue = 0;
      let paidMembersCount = 0;
      let partialMembersCount = 0;
      let unpaidMembersCount = 0;

      const members = activeMembers.map((m) => {
        const configuredShare = Number(
          m.monthlyContribution ||
          m.monthlyShare ||
          m.monthly_contribution ||
          (m.shares ? m.shares * defaultShare : null) ||
          defaultShare
        );

        const existing = existingContributions.find(
          (c) => c.memberId === m.id || c.member_id === m.id
        );

        const alreadyPaid = existing
          ? Number(existing.paidAmount ?? existing.paid_amount ?? existing.amount ?? 0)
          : 0;

        const remainingDue = Math.max(0, configuredShare - alreadyPaid);
        const isPaidFull = remainingDue === 0 && alreadyPaid > 0;
        const isPartial = alreadyPaid > 0 && remainingDue > 0;

        if (isPaidFull) paidMembersCount++;
        else if (isPartial) partialMembersCount++;
        else unpaidMembersCount++;

        totalExpected += configuredShare;
        totalAlreadyPaid += alreadyPaid;
        totalRemainingDue += remainingDue;

        const memberLoan = activeLoans.find((l) => l.memberId === m.id || l.member_id === m.id);

        return {
          memberId: m.id,
          memberName: m.name || m.fullName || 'Member',
          memberCode: m.member_code || m.memberCode || m.id.slice(-4),
          phone: m.phone || '',
          configuredShare,
          alreadyPaid,
          remainingDue,
          suggestedAmount: remainingDue,
          isPaidFull,
          isPartial,
          status: isPaidFull ? 'paid' : isPartial ? 'partial' : 'unpaid',
          hasActiveLoan: Boolean(memberLoan),
          loanDetails: memberLoan
            ? {
                loanId: memberLoan.id,
                loanNumber: memberLoan.loanNumber || memberLoan.loan_number || memberLoan.id,
                outstanding: Number(memberLoan.remainingAmount || memberLoan.outstanding_amount || 0),
              }
            : null,
          existingContributionId: existing ? existing.id : null,
        };
      });

      members.sort((a, b) => {
        if (a.isPaidFull !== b.isPaidFull) return a.isPaidFull ? 1 : -1;
        return a.memberName.localeCompare(b.memberName);
      });

      return {
        success: true,
        month: targetMonth,
        year: targetYear,
        totalActiveMembers: activeMembers.length,
        paidMembersCount,
        partialMembersCount,
        unpaidMembersCount,
        totalExpected,
        totalAlreadyPaid,
        totalRemainingDue,
        members,
      };
    } catch (err) {
      console.error('Failed to get bulk savings preview:', err);
      throw err;
    }
  },

  /**
   * Record Bulk Monthly Savings collection atomically with duplicate prevention
   */
  recordBulkSavings: async (
    { month: rawMonth, year: rawYear, items, clientRequestId, paymentMode = 'UPI', remarks = '', paymentDate },
    groupId = DEFAULT_GROUP_ID
  ) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
      const month = parseInt(rawMonth, 10);
      const year = parseInt(rawYear, 10);

      if (!month || !year || month < 1 || month > 12) {
        throw new Error('Valid month (1-12) and year are required.');
      }
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Items array cannot be empty.');
      }

      const validItems = items.filter((item) => item && item.memberId && Number(item.amount) > 0);
      if (validItems.length === 0) {
        throw new Error('No items with payment amount greater than ₹0 selected.');
      }

      const effectiveDate = paymentDate || new Date().toISOString();
      const requestId = clientRequestId || `BULK_REQ_${Date.now()}`;
      const idempotencyRef = doc(db, 'transactions', `IDEM_${requestId}`);

      const result = await runTransaction(db, async (transaction) => {
        // 1. Idempotency Check
        const idempotencySnap = await transaction.get(idempotencyRef);
        if (idempotencySnap.exists()) {
          return {
            isDuplicate: true,
            message: 'Bulk savings request already recorded.',
            data: idempotencySnap.data(),
          };
        }

        // 2. Read Group Document
        const groupRef = doc(db, 'groups', targetGroupId);
        const groupSnap = await transaction.get(groupRef);
        const groupData = groupSnap.exists() ? groupSnap.data() : {};

        // 3. Read All Existing Contribution Documents for the period
        const itemPlan = [];
        for (const item of validItems) {
          const docId = `C_${item.memberId}_${year}_${String(month).padStart(2, '0')}`;
          const contribRef = doc(db, 'monthlyContributions', docId);
          const contribSnap = await transaction.get(contribRef);
          const memRef = doc(db, 'users', item.memberId);
          const memSnap = await transaction.get(memRef);
          itemPlan.push({
            item,
            docId,
            contribRef,
            contribSnap,
            memberName: memSnap.exists() ? (memSnap.data().name || memSnap.data().fullName || item.memberName || 'Member') : (item.memberName || 'Member'),
          });
        }

        let totalDeltaSavings = 0;
        const skippedDuplicates = [];
        const processedItems = [];

        // 4. Stage Contribution and Transaction writes
        for (const plan of itemPlan) {
          const { item, docId, contribRef, contribSnap, memberName } = plan;
          const deltaAmount = Number(item.amount);
          const existingData = contribSnap.exists() ? contribSnap.data() : null;
          const existingPaid = existingData ? Number(existingData.paidAmount ?? existingData.paid_amount ?? 0) : 0;
          const expectedAmount = Number(item.expectedAmount || existingData?.expectedAmount || 1000);

          if (existingPaid >= expectedAmount) {
            skippedDuplicates.push({
              memberId: item.memberId,
              memberName,
              alreadyPaid: existingPaid,
              expectedAmount,
              reason: 'Already recorded in full for this period',
            });
            continue;
          }

          const remainingAllowed = Math.max(0, expectedAmount - existingPaid);
          const allowedDelta = Math.min(deltaAmount, remainingAllowed);
          if (allowedDelta <= 0) {
            skippedDuplicates.push({
              memberId: item.memberId,
              memberName,
              alreadyPaid: existingPaid,
              expectedAmount,
              reason: 'No remaining balance due for this period',
            });
            continue;
          }

          const newTotalPaid = existingPaid + allowedDelta;
          const isPaidFull = newTotalPaid >= expectedAmount;
          const itemMode = item.paymentMode || paymentMode;
          const itemNotes = (item.remarks || remarks || '').trim();

          totalDeltaSavings += allowedDelta;

          const contributionPayload = {
            id: docId,
            contribId: docId,
            contrib_id: docId,
            groupId: targetGroupId,
            group_id: targetGroupId,
            memberId: item.memberId,
            member_id: item.memberId,
            month,
            year,
            expectedAmount,
            expected_amount: expectedAmount,
            paidAmount: newTotalPaid,
            paid_amount: newTotalPaid,
            amount: newTotalPaid,
            regularHaftaAmount: newTotalPaid,
            regular_hafta_amount: newTotalPaid,
            totalPaid: newTotalPaid,
            loanPrincipalPaid: Number(existingData?.loanPrincipalPaid || existingData?.loan_principal_paid || 0),
            loan_principal_paid: Number(existingData?.loanPrincipalPaid || existingData?.loan_principal_paid || 0),
            interestAmount: Number(existingData?.interestAmount || existingData?.interest_amount || 0),
            interest_amount: Number(existingData?.interestAmount || existingData?.interest_amount || 0),
            status: isPaidFull ? 'paid' : 'partial',
            status_lower: isPaidFull ? 'paid' : 'partial',
            status_upper: isPaidFull ? 'PAID' : 'PARTIAL',
            source: 'BULK_COLLECTION',
            paymentDate: effectiveDate,
            payment_date: effectiveDate,
            paymentMode: itemMode,
            payment_mode: itemMode,
            notes: itemNotes,
            remarks: itemNotes,
            createdAt: existingData?.createdAt || effectiveDate,
            updatedAt: effectiveDate,
          };

          const actId = `ACT_${Date.now()}_${item.memberId}_bulk_saving`;
          const actRef = doc(db, 'transactions', actId);
          const activityPayload = {
            id: actId,
            groupId: targetGroupId,
            type: 'saving',
            type_flutter: 'monthlyInvestment',
            amount: allowedDelta,
            description: `Bulk monthly savings ₹${allowedDelta} received from ${memberName} (${month}/${year})`,
            memberId: item.memberId,
            memberName,
            referenceId: docId,
            source: 'BULK_COLLECTION',
            date: effectiveDate,
            createdAt: effectiveDate,
          };

          transaction.set(contribRef, contributionPayload, { merge: true });
          transaction.set(actRef, activityPayload);

          processedItems.push({
            memberId: item.memberId,
            memberName,
            amountCollected: allowedDelta,
            newTotalPaid,
          });
        }

        // 5. Update Group Totals ONLY if new savings were collected
        const currentTotalSavings = Number(groupData.totalSavings || groupData.total_savings || 0);
        const currentAvailable = Number(groupData.availableBalance ?? groupData.available_balance ?? 0);
        const currentOutstanding = Number(groupData.activeLoans || groupData.active_loans || groupData.totalOutstandingLoans || 0);

        const newTotalSavings = currentTotalSavings + totalDeltaSavings;
        const newAvailableBalance = Math.round((currentAvailable + totalDeltaSavings) * 100) / 100;
        const newTotalFund = Math.round((newAvailableBalance + currentOutstanding) * 100) / 100;

        if (totalDeltaSavings > 0) {
          transaction.update(groupRef, {
            totalSavings: newTotalSavings,
            total_savings: newTotalSavings,
            availableBalance: newAvailableBalance,
            available_balance: newAvailableBalance,
            rawAvailableBalance: newAvailableBalance,
            totalFund: newTotalFund,
            total_fund: newTotalFund,
            updatedAt: effectiveDate,
          });
        }

        // 6. Record idempotency marker in transactions collection
        transaction.set(idempotencyRef, {
          id: `IDEM_${requestId}`,
          type: 'IDEMPOTENCY_MARKER',
          requestId,
          groupId: targetGroupId,
          month,
          year,
          count: processedItems.length,
          skippedCount: skippedDuplicates.length,
          totalCollected: totalDeltaSavings,
          skippedDuplicates,
          createdAt: effectiveDate,
        });

        return {
          isDuplicate: false,
          count: processedItems.length,
          totalCollected: totalDeltaSavings,
          skippedDuplicates,
          processedItems,
          newTotalSavings,
          newAvailableBalance,
          newTotalFund,
        };
      });

      return {
        success: true,
        isIdempotentReplay: Boolean(result.isDuplicate),
        message: result.isDuplicate
          ? 'Bulk savings request already recorded.'
          : (result.count > 0
              ? `Bulk monthly savings of ₹${result.totalCollected.toLocaleString('en-IN')} recorded for ${result.count} members.`
              : 'All selected members already have savings recorded for this period. Duplicate writes prevented.'),
        count: result.count,
        totalCollected: result.totalCollected,
        skippedDuplicates: result.skippedDuplicates || [],
        groupBalances: {
          totalSavings: result.newTotalSavings,
          availableBalance: result.newAvailableBalance,
          totalFund: result.newTotalFund,
        },
      };
    } catch (err) {
      console.error('Failed to record bulk savings:', err);
      throw new Error(err.message || 'Failed to record bulk savings.');
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
