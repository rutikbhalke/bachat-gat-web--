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
  serverTimestamp,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { groupQuery } from './dataContract.js';
import {
  normalizeLoan,
  normalizeMember,
  normalizeSavings,
  formatNumber,
  formatDate,
  formatCurrency,
  DEFAULT_GROUP_ID,
} from '../utils/formatters.js';
import { calculateInterest } from '../utils/calculations.js';
import { calculateGroupFinancialSummary, LOAN_INTEREST_RATE } from './financialService.js';
import api from './api.js';

/**
 * Calculate dynamic installment Month and Year using zero-based modular arithmetic.
 * Invariant: Loan issue month does NOT contain an installment.
 * Installment #1 starts in the month AFTER the loan issue date (issue month + 1).
 * Handles month and year rollover (e.g. Dec 2026 -> Jan 2027) reliably across year boundaries.
 */
export const calculateInstallmentMonthYear = (issueDateStr, installmentNumber = 1) => {
  const issueDate = new Date(issueDateStr);
  const issueMonth = !isNaN(issueDate.getTime()) ? (issueDate.getMonth() + 1) : 3;
  const issueYear = !isNaN(issueDate.getTime()) ? issueDate.getFullYear() : new Date().getFullYear();

  // Installment #1 is the month following issue month: (issueMonth - 1) + installmentNumber
  const absoluteMonthIndex = issueYear * 12 + (issueMonth - 1) + installmentNumber;
  const instYear = Math.floor(absoluteMonthIndex / 12);
  const instMonth = (absoluteMonthIndex % 12) + 1;
  return { month: instMonth, year: instYear };
};

/**
 * Canonical helper to determine expected Regular Hapta for loan repayment.
 * Enforced business rule: Regular Hapta is FIXED at ₹1,000.
 */
export const resolveRegularHapta = (loan = null, member = null, group = null) => {
  return 1000;
};

export const getMemberExpectedRegularHapta = (member = null, loan = null, group = null) => {
  if (member) {
    const val = Number(member.monthlyContribution ?? member.monthly_contribution ?? member.monthlyShare ?? member.monthly_share);
    if (!isNaN(val) && val > 0) return val;
  }
  if (loan) {
    const val = Number(loan.monthlyContribution ?? loan.monthly_contribution ?? loan.monthlyShare ?? loan.monthly_share);
    if (!isNaN(val) && val > 0) return val;
  }
  if (group) {
    const val = Number(group.monthlyContribution ?? group.monthly_contribution_per_share ?? group.monthly_contribution);
    if (!isNaN(val) && val > 0) return val;
  }
  return 1000;
};

/**
 * Dynamically generates an authoritative month-wise loan repayment schedule.
 * Strictly adheres to Bachat Gat business rules:
 * 1. Loan issue month does NOT contain an installment. Installment #1 starts in (issue month + 1).
 * 2. Loan duration is FIXED at 10 installments / months.
 * 3. Regular Hapta is FIXED at ₹1,000.
 * 4. Reducing-Balance Interest = Actual Opening Outstanding Principal × (interestRate / 100).
 * 5. Sum of all expected principal installments === Original Principal (adjusting final installment if needed).
 * 6. Aggregates all matching repayments per installment using SUM (handles multiple/split payments).
 */
export const generateLoanRepaymentSchedule = ({
  loan,
  repayments = [],
  contributions = [],
  member = null,
  group = null,
}) => {
  if (!loan) return [];

  const originalPrincipal = Number(loan.originalPrincipal || loan.principalAmount || loan.principal_amount || 0);
  const tenure = Number(loan.durationMonths || loan.duration_months || loan.tenureMonths || loan.tenure_months || 10) || 10;
  const interestRate = Number(loan.interestRate || loan.interest_rate || LOAN_INTEREST_RATE);
  const regularHaptaExpected = 1000;

  // Exact equal-principal distribution ensuring sum(expected) === originalPrincipal
  const baseMonthlyPrincipal = tenure > 0 ? Math.round(originalPrincipal / tenure) : 0;
  const lastInstallmentPrincipal = tenure > 0 ? Math.max(0, originalPrincipal - (baseMonthlyPrincipal * (tenure - 1))) : 0;

  const issueDateStr = loan.issueDate || loan.loanDate || loan.disbursementDate || loan.createdAt || new Date().toISOString();

  // Current calendar month for DUE vs UPCOMING determination
  const today = new Date();
  const currentCalMonth = today.getMonth() + 1;
  const currentCalYear = today.getFullYear();
  const currentCalKey = currentCalYear * 100 + currentCalMonth;

  let currentOpening = originalPrincipal;
  let cumulativePrincipalPaid = 0;
  const schedule = [];

  for (let i = 1; i <= tenure; i++) {
    const { month: instMonth, year: instYear } = calculateInstallmentMonthYear(issueDateStr, i);
    const instCalKey = instYear * 100 + instMonth;
    const monthKeyStr = `${instYear}-${String(instMonth).padStart(2, '0')}`;
    const dateObj = new Date(instYear, instMonth - 1, 1);
    const monthLabel = dateObj.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    const periodLabel = monthLabel;

    // 1. Reducing-Balance Opening Principal for this installment
    const scheduledOpening = Math.max(0, Math.round((originalPrincipal - (i - 1) * baseMonthlyPrincipal) * 100) / 100);

    // Expected principal for installment i (final installment absorbs rounding remainder)
    const nominalExpected = i === tenure
      ? lastInstallmentPrincipal
      : baseMonthlyPrincipal;

    let principalExpected = 0;
    if (scheduledOpening > 0) {
      principalExpected = Math.min(scheduledOpening, nominalExpected);
    }

    // Reducing-balance interest: 2% of actual Opening Outstanding Principal (2 decimal places)
    const interestExpected = scheduledOpening > 0
      ? Math.round(((scheduledOpening * interestRate) / 100) * 100) / 100
      : 0;

    const totalExpected = regularHaptaExpected + principalExpected + interestExpected;

    // 2. Actual payments made for this installment (SUM of all matching transactions)
    const matchingRepayments = repayments.filter((r) => {
      const rLoanId = r.loanId || r.loan_id;
      if (rLoanId && loan.id && rLoanId.toString() !== loan.id.toString()) return false;

      const rInst = Number(r.installmentNumber || r.installment_number || 0);
      const rMonth = Number(r.paymentMonth || r.payment_month || r.month || 0);
      const rYear = Number(r.paymentYear || r.payment_year || r.year || 0);
      const rDateStr = (r.paymentDate || r.payment_date || '').toString().substring(0, 7);

      if (rInst > 0) {
        return rInst === i;
      }
      if (rMonth > 0 && rYear > 0) {
        return rMonth === instMonth && rYear === instYear;
      }
      if (rDateStr) {
        return rDateStr === monthKeyStr;
      }
      return false;
    });

    const principalPaid = matchingRepayments.reduce((sum, r) =>
      sum + Number(r.principalAmount || r.principal_amount || r.principalPaid || r.principal_repayment_amount || r.loanPrincipalPaid || 0), 0);

    const interestPaid = matchingRepayments.reduce((sum, r) =>
      sum + Number(r.interestAmount || r.interest_amount || r.interestPaid || 0), 0);

    const matchingContributions = contributions.filter((c) => {
      const cMonth = Number(c.month || c.payment_month || c.paymentMonth || 0);
      const cYear = Number(c.year || c.payment_year || c.paymentYear || 0);
      const cDateStr = (c.paymentDate || c.payment_date || c.date || '').toString().substring(0, 7);
      if (cMonth > 0 && cYear > 0) {
        return cMonth === instMonth && cYear === instYear;
      }
      if (cDateStr) {
        return cDateStr === monthKeyStr;
      }
      return false;
    });

    const contribPaid = matchingContributions.reduce((sum, c) =>
      sum + Number(c.paidAmount || c.paid_amount || c.amount || 0), 0);

    const repayRegPaid = matchingRepayments.reduce((sum, r) =>
      sum + Number(r.regularHaftaAmount || r.regular_hafta_amount || r.regularHaptaAmount || r.regular_hapta_amount || r.regularContribution || 0), 0);

    // Regular savings already recorded via Bulk Monthly Savings or general monthly contributions
    const bulkSavingsPaid = matchingContributions.reduce((sum, c) => {
      const isRepayDoc = (c.source === 'LOAN_REPAYMENT' || Number(c.loanPrincipalPaid || 0) > 0);
      return sum + (isRepayDoc ? 0 : Number(c.paidAmount || c.paid_amount || c.amount || 0));
    }, 0);

    const hasBulkSavingsPaid = bulkSavingsPaid >= regularHaptaExpected || matchingContributions.some((c) =>
      c.source === 'BULK_COLLECTION' || (!c.loanPrincipalPaid && Number(c.paidAmount || c.amount || 0) > 0 && (c.status || '').toLowerCase() === 'paid')
    );

    // Regular Hapta paid strictly tracks repayments made towards this loan installment
    const regularHaptaPaid = Math.min(regularHaptaExpected, repayRegPaid);

    // Total regular savings recorded across all sources (Bulk Savings, individual, or loan repayment)
    const totalRegularSavingsPaidAllSources = Math.min(regularHaptaExpected, Math.max(repayRegPaid, contribPaid));
    const isRegularHaptaAlreadyPaid = hasBulkSavingsPaid || (totalRegularSavingsPaidAllSources >= regularHaptaExpected);

    const totalPaid = principalPaid + interestPaid + regularHaptaPaid;

    // Cumulative principal paid across repayments up to this installment
    cumulativePrincipalPaid += principalPaid;
    const remainingPrincipal = Math.max(0, Math.round((originalPrincipal - cumulativePrincipalPaid) * 100) / 100);

    // 3. Remaining dues for this installment
    const regularHaptaRemaining = Math.max(0, regularHaptaExpected - regularHaptaPaid);
    const principalRemaining = Math.max(0, principalExpected - principalPaid);
    const rawInterestRemaining = Math.max(0, Math.round((interestExpected - interestPaid) * 100) / 100);
    const interestRemaining = rawInterestRemaining < 0.01 ? 0 : rawInterestRemaining;
    const totalRemaining = regularHaptaRemaining + principalRemaining + interestRemaining;

    // Next installment's opening:
    // If actual payment was made: reduce opening by actual principal paid
    // If past installment with 0 payment: debt remains scheduledOpening
    // If future installment with 0 payment: planned amortization reduces by principalExpected
    let nextOpening;
    let actualClosing;
    let scheduledClosing;

    if (principalPaid > 0) {
      actualClosing = Math.max(0, Math.round((scheduledOpening - principalPaid) * 100) / 100);
      scheduledClosing = actualClosing;
      nextOpening = actualClosing;
    } else if (repayments && repayments.length > 0 && instCalKey < currentCalKey) {
      actualClosing = scheduledOpening;
      scheduledClosing = scheduledOpening;
      nextOpening = scheduledOpening;
    } else {
      actualClosing = scheduledOpening;
      scheduledClosing = Math.max(0, Math.round((scheduledOpening - principalExpected) * 100) / 100);
      nextOpening = scheduledClosing;
    }

    const displayRemainingPrincipal = remainingPrincipal;

    // 4. Status: PAID / PARTIAL / DUE / UPCOMING
    let status = 'UPCOMING';
    const isFullyPaid = (regularHaptaRemaining === 0 && principalRemaining === 0 && interestRemaining === 0);
    const hasAnyPayment = (totalPaid > 0);

    if (scheduledOpening <= 0 && totalExpected === 0) {
      status = 'PAID';
    } else if (isFullyPaid) {
      status = 'PAID';
    } else if (hasAnyPayment) {
      status = 'PARTIAL';
    } else if (instCalKey <= currentCalKey) {
      status = 'DUE';
    } else {
      status = 'UPCOMING';
    }

    const monthName = dateObj.toLocaleString('en-US', { month: 'long' });

    schedule.push({
      installmentNumber: i,
      month: instMonth,
      year: instYear,
      monthName,
      monthLabel,
      periodLabel,
      scheduledOpeningPrincipal: scheduledOpening,
      openingPrincipal: scheduledOpening,
      openingBalance: scheduledOpening,
      scheduledClosingPrincipal: scheduledClosing,
      closingPrincipal: actualClosing,
      regularHaptaExpected,
      regularHaptaPaid,
      regularHaptaRemaining,
      principalExpected,
      expectedPrincipal: principalExpected,
      loanHaptaExpected: principalExpected,
      principalPaid,
      loanHaptaPaid: principalPaid,
      principalRemaining,
      loanHaptaRemaining: principalRemaining,
      interestExpected,
      expectedInterest: interestExpected,
      interestPaid,
      interestRemaining,
      loanTotalExpected: principalExpected + interestExpected,
      loanTotalPaid: principalPaid + interestPaid,
      loanTotalRemaining: principalRemaining + interestRemaining,
      totalMemberExpected: regularHaptaExpected + principalExpected + interestExpected,
      totalMemberPaid: regularHaptaPaid + principalPaid + interestPaid,
      totalMemberRemaining: regularHaptaRemaining + principalRemaining + interestRemaining,
      totalExpected,
      totalPaid,
      totalRemaining,
      remainingPrincipal: displayRemainingPrincipal,
      actualOpeningPrincipal: scheduledOpening,
      actualClosingPrincipal: actualClosing,
      status,
      isFullyPaid,
      matchingRepayments,
      bulkSavingsPaid,
      hasBulkSavingsPaid,
      totalRegularSavingsPaidAllSources,
      isRegularHaptaAlreadyPaid,
      matchingContributions,
    });

    currentOpening = nextOpening;
  }

  return schedule;
};

/**
 * Find the first unpaid or partially paid installment in the schedule.
 * Returns null if all installments are fully paid.
 */
export const getNextUnpaidInstallment = (schedule = []) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return null;
  return schedule.find((s) => s.status !== 'PAID' || s.regularHaptaRemaining > 0 || s.principalRemaining > 0 || s.interestRemaining > 0) || null;
};

/**
 * Check if the loan is completely settled / fully paid.
 */
export const isLoanFullyPaid = (loan, schedule = []) => {
  if (!loan) return false;
  if ((loan.status || '').toUpperCase() === 'CLOSED') return true;
  const outstanding = Number(loan.pendingPrincipal ?? loan.remainingAmount ?? loan.outstanding_amount ?? 0);
  if (outstanding <= 0) return true;
  const original = Number(loan.originalPrincipal ?? loan.principalAmount ?? 0);
  const paid = Number(loan.totalPrincipalPaid ?? loan.total_principal_paid ?? 0);
  if (original > 0 && paid >= original) return true;
  if (schedule.length > 0 && schedule.every((inst) => inst.status === 'PAID')) return true;
  return false;
};

/**
 * Calculate expected and remaining dues for a given installment.
 */
export const getInstallmentPaymentStatus = (loan, installmentNumber, repayments = [], contributions = []) => {
  const schedule = generateLoanRepaymentSchedule({ loan, repayments, contributions });
  const inst = schedule.find((s) => s.installmentNumber === Number(installmentNumber));
  if (!inst) {
    return null;
  }
  return {
    installmentNumber: inst.installmentNumber,
    month: inst.month,
    year: inst.year,
    monthLabel: inst.monthLabel,
    periodLabel: inst.periodLabel,
    expectedRegular: inst.regularHaptaExpected,
    expectedPrincipal: inst.principalExpected,
    expectedInterest: inst.interestExpected,
    expectedTotal: inst.totalExpected,
    actualRegularPaid: inst.regularHaptaPaid,
    actualPrincipalPaid: inst.principalPaid,
    actualInterestPaid: inst.interestPaid,
    actualTotalPaid: inst.totalPaid,
    remainingRegular: inst.regularHaptaRemaining,
    remainingPrincipal: inst.principalRemaining,
    remainingInterest: inst.interestRemaining,
    remainingTotal: inst.totalRemaining,
    status: inst.status,
    isFullyPaid: inst.isFullyPaid,
  };
};

export const loanService = {
  calculateInstallmentMonthYear,
  getMemberExpectedRegularHapta,
  generateLoanRepaymentSchedule,
  getNextUnpaidInstallment,
  isLoanFullyPaid,
  getInstallmentPaymentStatus,
  /**
   * Get all loans with member info and progress metrics from the shared root collections.
   */
  getAllLoans: async (params = {}, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;

      const [loansSnap, membersSnap] = await Promise.all([
        getDocs(groupQuery('loans', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('users', targetGroupId)).catch(() => ({ docs: [] })),
      ]);

      const membersMap = {};
      membersSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const memberName = d.name || d.fullName || 'Member';
        const memberCode = d.memberCode || d.member_code || docSnap.id;
        membersMap[docSnap.id] = { name: memberName, code: memberCode };
        if (d.userId) membersMap[d.userId] = { name: memberName, code: memberCode };
        if (d.authUid) membersMap[d.authUid] = { name: memberName, code: memberCode };
      });

      const allLoans = loansSnap.docs.map((docSnap) => {
        const raw = docSnap.data();
        const normalized = normalizeLoan(docSnap.id, raw);
        const memInfo = membersMap[normalized.memberId] || { name: normalized.memberName, code: normalized.memberCode };

        return {
          ...normalized,
          member_name: memInfo.name || normalized.memberName,
          memberName: memInfo.name || normalized.memberName,
          member_code: memInfo.code || normalized.memberCode,
          memberCode: memInfo.code || normalized.memberCode,
        };
      });

      const totalActiveLoansCount = allLoans.filter((l) => l.status === 'ACTIVE').length;
      const totalClosedLoansCount = allLoans.filter((l) => l.status === 'CLOSED').length;
      const totalOutstanding = allLoans
        .filter((l) => l.status === 'ACTIVE')
        .reduce((sum, l) => sum + (l.pendingPrincipal || 0), 0);
      const totalDisbursed = allLoans.reduce((sum, l) => sum + (l.originalPrincipal || 0), 0);

      let filtered = allLoans;
      if (params.memberId) {
        filtered = filtered.filter((l) => l.memberId === params.memberId || l.member_id === params.memberId);
      }
      if (params.status) {
        filtered = filtered.filter((l) => l.status === params.status.toUpperCase());
      }
      if (params.search) {
        const s = params.search.toLowerCase();
        filtered = filtered.filter(
          (l) =>
            (l.member_name && l.member_name.toLowerCase().includes(s)) ||
            (l.member_code && l.member_code.toLowerCase().includes(s)) ||
            (l.loan_number && l.loan_number.toLowerCase().includes(s)) ||
            (l.purpose && l.purpose.toLowerCase().includes(s))
        );
      }

      // Sort by issue date descending
      filtered.sort((a, b) => new Date(b.issueDate || b.loanDate || 0) - new Date(a.issueDate || a.loanDate || 0));

      return {
        success: true,
        count: filtered.length,
        totalLoansCount: allLoans.length,
        activeLoansCount: totalActiveLoansCount,
        closedLoansCount: totalClosedLoansCount,
        totalOutstanding,
        totalDisbursed,
        loans: filtered,
        allLoans,
      };
    } catch (err) {
      console.error('Failed to get loans from Firestore:', err);
      return {
        success: true,
        count: 0,
        totalLoansCount: 0,
        activeLoansCount: 0,
        closedLoansCount: 0,
        totalOutstanding: 0,
        totalDisbursed: 0,
        loans: [],
        allLoans: [],
      };
    }
  },

  /**
   * Get loans specifically for a member
   */
  getLoansByMember: async (memberId, groupId = DEFAULT_GROUP_ID) => {
    return loanService.getAllLoans({ memberId }, groupId);
  },

  /**
   * Get only active loans
   */
  getActiveLoans: async (groupId = DEFAULT_GROUP_ID) => {
    return loanService.getAllLoans({ status: 'ACTIVE' }, groupId);
  },

  /**
   * Get only closed loans
   */
  getClosedLoans: async (groupId = DEFAULT_GROUP_ID) => {
    return loanService.getAllLoans({ status: 'CLOSED' }, groupId);
  },

  /**
   * Get single loan details by ID
   */
  getLoanById: async (loanId, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
      const loanDocRef = doc(db, 'loans', loanId);
      const loanSnap = await getDoc(loanDocRef);

      if (!loanSnap.exists()) {
        throw new Error('Loan profile not found in active Bachat Gat.');
      }

      const raw = loanSnap.data();
      const normalized = normalizeLoan(loanSnap.id, raw);

      // Fetch member info
      let memberName = normalized.memberName;
      let memberCode = normalized.memberCode;
      let memberData = null;
      try {
        const memSnap = await getDoc(doc(db, 'users', normalized.memberId));
        if (memSnap.exists()) {
          memberData = memSnap.data();
          memberName = memberData.name || memberData.fullName || memberName;
          memberCode = memberData.memberCode || memberData.member_code || normalized.memberId;
        }
      } catch (e) {
        // fallback
      }

      // Fetch group details for defaults
      let groupData = null;
      try {
        const groupSnap = await getDoc(doc(db, 'groups', targetGroupId));
        if (groupSnap.exists()) groupData = groupSnap.data();
      } catch (e) {
        // fallback
      }

      // Fetch repayments from repayments collection AND monthlyContributions
      const [repSnap1, repSnap2, contributionsSnap] = await Promise.all([
        getDocs(query(collection(db, 'repayments'), where('loanId', '==', loanId))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'repayments'), where('loan_id', '==', loanId))).catch(() => ({ docs: [] })),
        getDocs(groupQuery('monthlyContributions', targetGroupId)).catch(() => ({ docs: [] })),
      ]);

      const seenRepayIds = new Set();
      const allDirectRepayments = [];

      [...repSnap1.docs, ...repSnap2.docs].forEach((d) => {
        if (!seenRepayIds.has(d.id)) {
          seenRepayIds.add(d.id);
          const rData = d.data();
          const rPrincipal = Number(rData.principalAmount || rData.principal_amount || rData.principalPaid || rData.principal_repayment_amount || 0);
          const rInterest = Number(rData.interestAmount || rData.interest_amount || rData.interestPaid || 0);
          const rRegular = Number(rData.regularHaftaAmount || rData.regular_hafta_amount || rData.regularContribution || 0);
          const rTotal = Number(rData.totalPaid || rData.amount || (rPrincipal + rInterest + rRegular));
          const rInstNum = Number(rData.installmentNumber || rData.installment_number || 0);
          const rMonth = Number(rData.paymentMonth || rData.payment_month || rData.month || 0);
          const rYear = Number(rData.paymentYear || rData.payment_year || rData.year || 0);

          allDirectRepayments.push({
            id: d.id,
            repayment_id: d.id,
            loan_id: loanId,
            loanId,
            loan_number: normalized.loanNumber,
            ...rData,
            installmentNumber: rInstNum,
            installment_number: rInstNum,
            principal_repayment_amount: rPrincipal,
            principalAmount: rPrincipal,
            interest_amount: rInterest,
            interestAmount: rInterest,
            regular_hafta_amount: rRegular,
            regularHaftaAmount: rRegular,
            regularContribution: rRegular,
            total_payment: rTotal,
            totalPaid: rTotal,
            payment_date: rData.paymentDate || rData.payment_date,
            paymentDate: rData.paymentDate || rData.payment_date,
            payment_mode: rData.paymentMode || rData.payment_mode || 'UPI',
            paymentMode: rData.paymentMode || rData.payment_mode || 'UPI',
            payment_month: rMonth,
            paymentMonth: rMonth,
            payment_year: rYear,
            paymentYear: rYear,
            remarks: rData.remarks || '',
          });
        }
      });

      // Also map contributions that have loan repayments ONLY if not already in direct repayments
      const memberContribs = contributionsSnap.docs
        .map((d) => normalizeSavings(d.id, d.data()))
        .filter((s) => s.memberId === normalized.memberId);

      memberContribs.forEach((c) => {
        const cMonth = Number(c.month);
        const cYear = Number(c.year);
        const hasLoanRepayment = (c.loanPrincipalPaid > 0 || c.interestAmount > 0);
        if (hasLoanRepayment) {
          const alreadyExistsInRepayments = allDirectRepayments.some((r) => {
            const rMonth = Number(r.paymentMonth || r.payment_month || r.month || 0);
            const rYear = Number(r.paymentYear || r.payment_year || r.year || 0);
            return rMonth === cMonth && rYear === cYear;
          });

          if (!alreadyExistsInRepayments && !seenRepayIds.has(c.id)) {
            seenRepayIds.add(c.id);
            allDirectRepayments.push({
              id: c.id,
              repayment_id: c.id,
              loan_id: loanId,
              loanId,
              loan_number: normalized.loanNumber,
              principal_repayment_amount: c.loanPrincipalPaid,
              principalAmount: c.loanPrincipalPaid,
              interest_amount: c.interestAmount,
              interestAmount: c.interestAmount,
              regular_hafta_amount: c.paidAmount,
              regularHaftaAmount: c.paidAmount,
              regularContribution: c.paidAmount,
              total_payment: c.loanPrincipalPaid + c.interestAmount + c.paidAmount,
              totalPaid: c.loanPrincipalPaid + c.interestAmount + c.paidAmount,
              payment_date: c.paymentDate,
              paymentDate: c.paymentDate,
              payment_mode: c.paymentMode,
              paymentMode: c.paymentMode,
              payment_month: cMonth,
              paymentMonth: cMonth,
              payment_year: cYear,
              paymentYear: cYear,
              remarks: c.remarks || '',
            });
          }
        }
      });

      // Sort repayments by date ascending for schedule and history
      allDirectRepayments.sort((a, b) => new Date(a.payment_date || a.paymentDate || 0) - new Date(b.payment_date || b.paymentDate || 0));

      const origPrincipal = Number(normalized.originalPrincipal || normalized.principalAmount || 0);
      const totalPrincipalRepaid = allDirectRepayments.reduce((acc, r) => acc + (r.principalAmount || 0), 0);
      const totalInterestPaid = allDirectRepayments.reduce((acc, r) => acc + (r.interestAmount || 0), 0);
      
      const actualPrincipalRepaid = totalPrincipalRepaid > 0 ? totalPrincipalRepaid : Number(normalized.totalPrincipalPaid || 0);
      const calculatedOutstanding = Math.max(0, Math.round((origPrincipal - actualPrincipalRepaid) * 100) / 100);

      // Generate complete month-wise repayment schedule
      const schedule = generateLoanRepaymentSchedule({
        loan: {
          ...normalized,
          pendingPrincipal: calculatedOutstanding,
          outstanding_amount: calculatedOutstanding,
        },
        repayments: allDirectRepayments,
        contributions: memberContribs,
        member: memberData,
        group: groupData,
      });

      const nextDueInstallment = getNextUnpaidInstallment(schedule);
      const fullyPaid = calculatedOutstanding <= 0 || isLoanFullyPaid(normalized, schedule);
      const repaidPercent = origPrincipal > 0 ? Math.min(100, Math.round((actualPrincipalRepaid / origPrincipal) * 100)) : 0;
      const finalStatus = fullyPaid ? 'CLOSED' : 'ACTIVE';

      return {
        success: true,
        loan: {
          ...normalized,
          pendingPrincipal: calculatedOutstanding,
          remainingAmount: calculatedOutstanding,
          outstandingAmount: calculatedOutstanding,
          outstanding_amount: calculatedOutstanding,
          status: finalStatus,
          isClosed: fullyPaid,
          isFullyPaid: fullyPaid,
          member_name: memberName,
          memberName: memberName,
          member_code: memberCode,
          memberCode: memberCode,
          member: memberData,
          total_principal_repaid: actualPrincipalRepaid,
          total_principal_paid: actualPrincipalRepaid,
          totalPrincipalPaid: actualPrincipalRepaid,
          total_interest_paid: totalInterestPaid,
          totalInterestPaid: totalInterestPaid,
          repaid_percent: repaidPercent,
          repaidPercent: repaidPercent,
          repayments: allDirectRepayments,
          schedule,
          nextDueInstallment,
        },
      };
    } catch (err) {
      console.error('Failed to get loan by ID:', err);
      throw err;
    }
  },

  /**
   * Create & disburse new loan in Firestore (compatible with Flutter schema)
   */
  createLoan: async (loanData, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
      const memberId = loanData.member_id || loanData.memberId;
      const principal = parseFloat(loanData.principal_amount || loanData.principalAmount || loanData.originalPrincipal);
      const interestRate = parseFloat(loanData.interest_rate || loanData.interestRate) || LOAN_INTEREST_RATE;
      const purpose = (loanData.purpose || 'General').trim();
      const dateStr = loanData.loan_date || loanData.loanDate || new Date().toISOString();
      const durationMonths = parseInt(loanData.duration_months || loanData.durationMonths, 10) || 10;

      if (!memberId || !Number.isFinite(principal) || principal <= 0) {
        throw new Error('A valid member and principal amount are required.');
      }
      // Concurrently fetch member, group, contributions, repayments, loans, and transactions
      const [selectedMemberSnap, groupSnap, savingsSnap, repaymentsSnap, loansSnap, txSnap] = await Promise.all([
        getDoc(doc(db, 'users', memberId)),
        getDoc(doc(db, 'groups', targetGroupId)),
        getDocs(groupQuery('monthlyContributions', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('repayments', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('loans', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('transactions', targetGroupId)).catch(() => ({ docs: [] })),
      ]);

      if (!selectedMemberSnap.exists() || selectedMemberSnap.data().isActive === false || (selectedMemberSnap.data().status || 'active').toLowerCase() === 'inactive') {
        throw new Error('The selected member is not active or no longer exists.');
      }

      const memData = selectedMemberSnap.data();
      const memberName = memData.name || memData.fullName || 'Member';

      const groupSavings = savingsSnap.docs.map(d => normalizeSavings(d.id, d.data())).filter(s => (s.groupId || '').toLowerCase() === targetGroupId.toLowerCase());
      const groupLoans = loansSnap.docs.map(d => normalizeLoan(d.id, d.data())).filter(l => (l.groupId || '').toLowerCase() === targetGroupId.toLowerCase());
      const groupRepayments = repaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => (r.groupId || '').toLowerCase() === targetGroupId.toLowerCase());
      const groupTransactions = (txSnap?.docs || []).map(d => ({ id: d.id, ...d.data() })).filter(t => (t.groupId || '').toLowerCase() === targetGroupId.toLowerCase());

      const groupSummary = calculateGroupFinancialSummary(groupSavings, groupLoans, groupRepayments, groupTransactions);
      const rawAvailableCash = groupSummary.rawAvailableBalance !== undefined ? groupSummary.rawAvailableBalance : groupSummary.availableBalance;
      const currentAvailableCash = Math.round(Number(rawAvailableCash) * 100) / 100;

      if (principal > currentAvailableCash || currentAvailableCash <= 0) {
        throw new Error(`Insufficient available balance. Available: ₹${formatNumber(Math.max(0, currentAvailableCash))}. Requested loan: ₹${formatNumber(principal)}.`);
      }

      const loanId = `L_${Date.now()}`;
      const loanDocRef = doc(db, 'loans', loanId);
      const nowIso = new Date().toISOString();

      const loanPayload = {
        id: loanId,
        loanId: loanId,
        groupId: targetGroupId,
        group_id: targetGroupId,
        memberId,
        member_id: memberId,
        originalPrincipal: principal,
        principalAmount: principal,
        principal_amount: principal,
        pendingPrincipal: principal,
        remainingAmount: principal,
        outstanding_amount: principal,
        interestRate,
        interest_rate: interestRate,
        durationMonths,
        duration_months: durationMonths,
        purpose,
        status: 'active',
        issueDate: dateStr,
        loanDate: dateStr,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const actId = `ACT_${Date.now()}_loan`;
      const actRef = doc(db, 'transactions', actId);
      const actPayload = {
        id: actId,
        groupId: targetGroupId,
        type: 'loan',
        amount: principal,
        description: `Loan of ₹${principal} approved for ${memberName}`,
        memberId,
        memberName,
        referenceId: loanId,
        date: nowIso,
        createdAt: nowIso,
      };

      // Atomic Batch Write for Loan, Activity, and Group updates in ONE network roundtrip
      const batch = writeBatch(db);
      batch.set(loanDocRef, loanPayload);
      batch.set(actRef, actPayload);

      if (groupSnap.exists()) {
        const newAvailableBalance = Math.max(0, Math.round((currentAvailableCash - principal) * 100) / 100);
        const newOutstandingTotal = Math.round(((groupSummary.activeLoansOutstanding || 0) + principal) * 100) / 100;
        const newTotalFund = Math.round((newAvailableBalance + newOutstandingTotal) * 100) / 100;
        const newCurrentMonthlyInterest = Math.round(newOutstandingTotal * 0.02 * 100) / 100;
        const totalInterestPaid = groupSummary.totalInterestPaid || 0;
        const totalSavings = groupSummary.totalGroupSavings || 0;

        batch.update(doc(db, 'groups', targetGroupId), {
          activeLoans: newOutstandingTotal,
          active_loans: newOutstandingTotal,
          totalOutstandingLoans: newOutstandingTotal,
          currentMonthlyInterest: newCurrentMonthlyInterest,
          current_monthly_interest: newCurrentMonthlyInterest,
          totalInterestPaid,
          total_interest_paid: totalInterestPaid,
          totalInterestCollected: totalInterestPaid,
          totalInterest: totalInterestPaid,
          total_interest: totalInterestPaid,
          totalSavings,
          total_savings: totalSavings,
          totalFund: newTotalFund,
          total_fund: newTotalFund,
          availableBalance: newAvailableBalance,
          available_balance: newAvailableBalance,
          rawAvailableBalance: newAvailableBalance,
          updatedAt: nowIso,
        });
      }

      await batch.commit();

      return {
        success: true,
        message: 'Loan disbursed successfully in Bachat Gat',
        loanId,
        loanNumber: loanId,
      };
    } catch (err) {
      console.error('Failed to create loan in Firestore:', err);
      throw new Error(err.message || 'Failed to create loan.');
    }
  },

  /**
   * Record loan repayment installment in Firestore
   */
  recordRepayment: async (repayData, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
      const loanId = repayData.loan_id || repayData.loanId;
      const principalRepay = Math.round(parseFloat(repayData.principal_repayment_amount || repayData.principalAmount || 0));
      const regularHafta = Math.round(parseFloat(repayData.regular_hafta_amount || 0));
      const paymentDate = repayData.payment_date || repayData.paymentDate || new Date().toISOString().split('T')[0];
      
      // Preserve explicit scheduled installment month/year
      let month = parseInt(repayData.payment_month ?? repayData.month, 10);
      let year = parseInt(repayData.payment_year ?? repayData.year, 10);
      if (!month || isNaN(month)) {
        if (paymentDate) {
          const d = new Date(paymentDate);
          if (!isNaN(d.getTime())) {
            month = d.getMonth() + 1;
            year = (isNaN(year) || !year) ? d.getFullYear() : year;
          }
        }
      }
      if (!month || isNaN(month)) month = new Date().getMonth() + 1;
      if (!year || isNaN(year)) year = new Date().getFullYear();

      const mode = repayData.payment_mode || repayData.paymentMode || 'UPI';
      const remarks = (repayData.remarks || '').trim();
      const uiInstallmentNumber = parseInt(repayData.installmentNumber ?? repayData.installment_number, 10) || 0;

      if (!loanId) {
        throw new Error('Loan ID is required to record repayment.');
      }
      if (isNaN(principalRepay) || principalRepay < 0) {
        throw new Error('Valid principal repayment amount is required.');
      }

      const loanDocRef = doc(db, 'loans', loanId);
      const loanSnap = await getDoc(loanDocRef);
      if (!loanSnap.exists()) throw new Error('Loan document not found.');
      
      const loanData = loanSnap.data();
      const memberId = loanData.memberId;
      
      const currentPending = Number(loanData.pendingPrincipal || loanData.remainingAmount || 0);
      if ((loanData.status || 'active').toLowerCase() !== 'active') throw new Error('This loan is already closed.');
      if (principalRepay < 0 || principalRepay > currentPending) {
        throw new Error(`Principal repayment (${principalRepay}) cannot exceed outstanding balance (${currentPending}).`);
      }
      
      const interestRate = Number(loanData.interestRate || 2.0);
      const passedInterest = parseFloat(repayData.interest_amount ?? repayData.interestAmount);
      const calculatedInterest = Number.isFinite(passedInterest) && passedInterest >= 0
        ? Math.round(passedInterest * 100) / 100
        : calculateInterest(currentPending, interestRate);
      const totalPayment = principalRepay + calculatedInterest + regularHafta;

      if (totalPayment <= 0) {
        throw new Error('Total payment must be greater than zero.');
      }

      const targetInstallmentNumber = uiInstallmentNumber > 0
        ? uiInstallmentNumber
        : ((Number(loanData.lastInstallmentPaid) || 0) + 1);

      // Regular hapta duplicate check
      let contribDocRef = null;
      let existingPaidSavings = 0;
      let expectedShare = 1000;
      let isPaidFull = false;
      let contribCreatedAt = new Date().toISOString();

      if (regularHafta > 0) {
        const contribDocId = `C_${memberId}_${year}_${String(month).padStart(2, '0')}`;
        contribDocRef = doc(db, 'monthlyContributions', contribDocId);
      }

      const memRef = doc(db, 'users', memberId);
      const groupRef = doc(db, 'groups', targetGroupId);

      // Fetch contrib, member, and group concurrently
      const [existingContrib, memSnap, groupSnap] = await Promise.all([
        contribDocRef ? getDoc(contribDocRef).catch(() => null) : Promise.resolve(null),
        getDoc(memRef).catch(() => null),
        getDoc(groupRef).catch(() => null),
      ]);

      if (existingContrib && existingContrib.exists()) {
        const data = existingContrib.data();
        existingPaidSavings = Number(data.paidAmount || data.paid_amount || data.amount || 0);
        expectedShare = Number(data.expectedAmount || data.expected_amount || 1000);
        contribCreatedAt = data.createdAt || contribCreatedAt;
      }

      // Calculate actual additional savings to add (capped so total does not exceed expectedShare)
      const actualSavingsToAdd = Math.max(0, Math.min(regularHafta, expectedShare - existingPaidSavings));
      const totalPaidSavings = existingPaidSavings + actualSavingsToAdd;
      isPaidFull = totalPaidSavings >= expectedShare;

      const memberName = memSnap && memSnap.exists() ? (memSnap.data().name || memSnap.data().fullName || 'Member') : 'Member';

      let groupData = {};
      if (groupSnap && groupSnap.exists()) groupData = groupSnap.data();

      // All reads done. Now atomic writes with writeBatch!
      const newPending = Math.max(0, currentPending - principalRepay);
      const newStatus = newPending === 0 ? 'CLOSED' : 'ACTIVE';
      const currentPrincipalPaid = Number(loanData.totalPrincipalPaid || loanData.total_principal_paid || 0);
      const currentInterestPaid = Number(loanData.totalInterestPaid || loanData.total_interest_paid || 0);

      const batch = writeBatch(db);

      batch.update(loanDocRef, {
        pendingPrincipal: newPending,
        remainingAmount: newPending,
        outstanding_amount: newPending,
        totalPrincipalPaid: currentPrincipalPaid + principalRepay,
        total_principal_paid: currentPrincipalPaid + principalRepay,
        totalInterestPaid: currentInterestPaid + calculatedInterest,
        total_interest_paid: currentInterestPaid + calculatedInterest,
        lastInstallmentPaid: targetInstallmentNumber,
        status: newStatus.toUpperCase(),
        updatedAt: new Date().toISOString(),
      });

      const actualRepayTotalAmount = principalRepay + calculatedInterest + actualSavingsToAdd;
      const clientRequestId = repayData.clientRequestId || repayData.idempotencyKey || null;
      const repaymentId = clientRequestId
        ? `REP_${loanId}_${targetInstallmentNumber}_${clientRequestId}`
        : `REP_${loanId}_${targetInstallmentNumber}_${Date.now()}`;
      const repayRef = doc(db, 'repayments', repaymentId);

      // Idempotency check: if repayment document already exists, return early without double counting
      const existingRepaySnap = await getDoc(repayRef);
      if (existingRepaySnap.exists()) {
        console.warn(`[loanService] Repayment ${repaymentId} already processed. Preventing duplicate write.`);
        return {
          success: true,
          isIdempotentReplay: true,
          message: 'Repayment already recorded.',
          repaymentId,
        };
      }

      batch.set(repayRef, {
        id: repaymentId,
        repaymentId: repaymentId,
        repayment_id: repaymentId,
        groupId: targetGroupId,
        group_id: targetGroupId,
        loanId,
        loan_id: loanId,
        memberId,
        member_id: memberId,
        type: 'LOAN_REPAYMENT',
        transactionType: 'LOAN_REPAYMENT',
        installmentNumber: targetInstallmentNumber,
        principalAmount: principalRepay,
        principal_amount: principalRepay,
        principalRepaid: principalRepay,
        interestAmount: calculatedInterest,
        interest_amount: calculatedInterest,
        regularHaptaAmount: actualSavingsToAdd,
        regular_hafta_amount: actualSavingsToAdd,
        regularContribution: actualSavingsToAdd,
        amount: principalRepay + calculatedInterest,
        loanRepaymentAmount: principalRepay + calculatedInterest,
        totalAmount: actualRepayTotalAmount,
        total_amount: actualRepayTotalAmount,
        totalPaid: actualRepayTotalAmount,
        total_payment: actualRepayTotalAmount,
        openingPrincipal: currentPending,
        closingPrincipal: newPending,
        interestRate,
        month,
        year,
        paymentMonth: month,
        payment_month: month,
        paymentYear: year,
        payment_year: year,
        scheduledPaymentMonth: month,
        scheduledPaymentYear: year,
        paymentDate,
        payment_date: paymentDate,
        paymentMode: mode,
        payment_mode: mode,
        remarks,
        createdAt: serverTimestamp(),
      });

      if (contribDocRef && (actualSavingsToAdd > 0 || existingPaidSavings === 0)) {
        batch.set(contribDocRef, {
          id: contribDocRef.id,
          contribId: contribDocRef.id,
          contrib_id: contribDocRef.id,
          groupId: targetGroupId,
          group_id: targetGroupId,
          memberId,
          member_id: memberId,
          month,
          year,
          expectedAmount: expectedShare,
          expected_amount: expectedShare,
          paidAmount: totalPaidSavings,
          paid_amount: totalPaidSavings,
          amount: totalPaidSavings,
          regularHaftaAmount: totalPaidSavings,
          regular_hafta_amount: totalPaidSavings,
          totalPaid: totalPaidSavings,
          interestAmount: 0,
          loanPrincipalPaid: 0,
          status: isPaidFull ? 'paid' : 'pending',
          status_lower: isPaidFull ? 'paid' : 'pending',
          status_upper: isPaidFull ? 'PAID' : 'PENDING',
          paymentDate,
          payment_date: paymentDate,
          paymentMode: mode,
          payment_mode: mode,
          updatedAt: new Date().toISOString(),
          createdAt: contribCreatedAt,
        }, { merge: true });
      }

      // 1. Log Loan Repayment Activity (Loan Repayment Amount = Principal + Interest)
      const loanRepayTotal = principalRepay + calculatedInterest;
      const actId = `ACT_${Date.now()}_repay`;
      const actRef = doc(db, 'transactions', actId);
      const actDescription = `Loan repayment ₹${loanRepayTotal.toLocaleString('en-IN')} (Principal: ₹${principalRepay.toLocaleString('en-IN')}, Interest: ₹${calculatedInterest.toLocaleString('en-IN')}) from ${memberName}`;

      batch.set(actRef, {
        id: actId,
        groupId: targetGroupId,
        type: 'repayment',
        type_flutter: 'loanRepayment',
        amount: loanRepayTotal,
        regularHaptaAmount: actualSavingsToAdd,
        regular_hafta_amount: actualSavingsToAdd,
        principalAmount: principalRepay,
        principal_amount: principalRepay,
        interestAmount: calculatedInterest,
        interest_amount: calculatedInterest,
        totalAmount: actualRepayTotalAmount,
        description: actDescription,
        memberId,
        memberName,
        referenceId: repaymentId,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      // 2. If new regular hafta is also collected, log SEPARATE regular savings activity
      if (actualSavingsToAdd > 0) {
        const savingActId = `ACT_${Date.now()}_saving`;
        const savingActRef = doc(db, 'transactions', savingActId);
        batch.set(savingActRef, {
          id: savingActId,
          groupId: targetGroupId,
          type: 'SAVINGS_DEPOSIT',
          type_flutter: 'monthlyInvestment',
          amount: actualSavingsToAdd,
          description: `Regular savings of ₹${actualSavingsToAdd.toLocaleString('en-IN')} collected from ${memberName}`,
          memberId,
          memberName,
          referenceId: contribDocRef?.id || repaymentId,
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      }

      if (groupSnap.exists()) {
        const currentTotalSavings = Number(groupData.totalSavings || groupData.total_savings || 0) + actualSavingsToAdd;
        const newTotalInterestPaid = Number(groupData.totalInterestPaid || groupData.totalInterestCollected || 0) + calculatedInterest;
        const currentActiveLoans = Number(groupData.activeLoans || groupData.totalOutstandingLoans || 0);
        const newOutstandingTotal = Math.max(0, currentActiveLoans - principalRepay);
        const newCurrentMonthlyInterest = Math.round(newOutstandingTotal * 0.02 * 100) / 100;
        const totalCashPaid = actualSavingsToAdd + principalRepay + calculatedInterest;
        const newAvailableBalance = Number(groupData.availableBalance || 0) + totalCashPaid;
        const newTotalFund = Math.round((newAvailableBalance + newOutstandingTotal) * 100) / 100;

        batch.update(groupRef, {
          totalSavings: currentTotalSavings,
          total_savings: currentTotalSavings,
          activeLoans: newOutstandingTotal,
          active_loans: newOutstandingTotal,
          totalOutstandingLoans: newOutstandingTotal,
          currentMonthlyInterest: newCurrentMonthlyInterest,
          current_monthly_interest: newCurrentMonthlyInterest,
          totalInterestPaid: newTotalInterestPaid,
          total_interest_paid: newTotalInterestPaid,
          totalInterestCollected: newTotalInterestPaid,
          totalInterest: newTotalInterestPaid,
          total_interest: newTotalInterestPaid,
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
        message: (existingPaidSavings >= expectedShare && expectedShare > 0)
          ? 'Repayment recorded successfully. Regular Hapta for this month was already recorded through Bulk Monthly Savings (duplicate entry prevented).'
          : 'Repayment recorded successfully in Bachat Gat',
        newOutstanding: newPending,
        loanStatus: newStatus,
        repaymentId,
        wasRegularHaptaAlreadyPaid: (existingPaidSavings >= expectedShare && expectedShare > 0),
        actualSavingsAdded: actualSavingsToAdd,
      };
    } catch (err) {
      console.error('Failed to record repayment in Firestore:', err);
      throw new Error(err.message || 'Failed to record repayment.');
    }
  },

  /**
   * Get Bulk Monthly Loan Principal preview for a selected month and year
   */
  getBulkLoanPrincipalPreview: async ({ month, year }, groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
      const targetMonth = parseInt(month, 10);
      const targetYear = parseInt(year, 10);

      // Authoritative client-side Firestore query matching getAllLoans
      const [loansSnap, repaymentsSnap, membersSnap, groupSnap] = await Promise.all([
        getDocs(groupQuery('loans', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('repayments', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('users', targetGroupId)).catch(() => ({ docs: [] })),
        getDoc(doc(db, 'groups', targetGroupId)).catch(() => ({ exists: () => false })),
      ]);

      const groupData = groupSnap.exists() ? groupSnap.data() : {};
      const membersMap = {};
      membersSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const memberName = d.name || d.fullName || 'Member';
        const memberCode = d.memberCode || d.member_code || docSnap.id;
        membersMap[docSnap.id] = { name: memberName, code: memberCode, phone: d.phone || '' };
        if (d.userId) membersMap[d.userId] = { name: memberName, code: memberCode, phone: d.phone || '' };
        if (d.authUid) membersMap[d.authUid] = { name: memberName, code: memberCode, phone: d.phone || '' };
      });

      const allRepayments = repaymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Match exact active loan criteria from Loans page:
      const activeLoans = loansSnap.docs
        .map((d) => {
          const raw = d.data();
          const normalized = normalizeLoan(d.id, raw);
          const memInfo = membersMap[normalized.memberId] || { name: normalized.memberName, code: normalized.memberCode, phone: '' };
          return {
            ...normalized,
            member_name: memInfo.name || normalized.memberName,
            memberName: memInfo.name || normalized.memberName,
            member_code: memInfo.code || normalized.memberCode,
            memberCode: memInfo.code || normalized.memberCode,
            phone: memInfo.phone || '',
          };
        })
        .filter((l) => {
          const rawStatus = (l.status || '').toUpperCase();
          const outstanding = Number(l.pendingPrincipal ?? l.remainingAmount ?? l.outstanding_amount ?? 0);
          return rawStatus === 'ACTIVE' && outstanding > 0 && !l.isDeleted;
        });

      let totalMonthlyPrincipalExpected = 0;
      let totalAlreadyCollected = 0;
      let totalRemainingPrincipalDue = 0;
      let totalMonthlyInterestExpected = 0;
      let totalInterestAlreadyCollected = 0;
      let totalRemainingInterestDue = 0;
      let totalPreviousPendingInterest = 0;
      let paidLoansCount = 0;
      let partialLoansCount = 0;
      let pendingLoansCount = 0;

      const previewLoans = [];
      const excludedLoans = [];

      for (const loan of activeLoans) {
        const originalPrincipal = Number(loan.originalPrincipal || loan.principalAmount || loan.principal_amount || 0);
        const tenure = Number(loan.durationMonths || loan.duration_months || loan.tenureMonths || loan.tenure_months || 10) || 10;
        const interestRate = Number(loan.interestRate || loan.interest_rate || LOAN_INTEREST_RATE);
        const baseMonthlyPrincipal = tenure > 0 ? Math.round(originalPrincipal / tenure) : 0;
        const currentOutstanding = Number(loan.pendingPrincipal ?? loan.remainingAmount ?? loan.outstanding_amount ?? originalPrincipal);
        const totalPrincipalPaidSoFar = Number(loan.totalPrincipalPaid ?? loan.total_principal_paid ?? loan.total_principal_repaid ?? 0);

        const member = membersMap[loan.memberId || loan.member_id] || { name: loan.memberName, code: loan.memberCode };
        const loanRepayments = allRepayments.filter((r) => String(r.loanId || r.loan_id || '') === String(loan.id));

        const schedule = generateLoanRepaymentSchedule({
          loan,
          repayments: loanRepayments,
          contributions: [],
          member,
          group: groupData,
        });

        const targetRow = schedule.find((s) => s.month === targetMonth && s.year === targetYear);

        let installmentNumber;
        let scheduledMonthlyPrincipal;
        let alreadyPaidForPeriod;
        let monthlyPrincipalDue;
        let openingPrincipal;
        let scheduledMonthlyInterest;
        let interestPaidForPeriod;
        let monthlyInterestDue;
        let totalDue;
        let isEligible = true;

        if (targetRow) {
          installmentNumber = targetRow.installmentNumber;
          scheduledMonthlyPrincipal = targetRow.principalExpected;
          alreadyPaidForPeriod = targetRow.principalPaid;
          monthlyPrincipalDue = Math.min(currentOutstanding, targetRow.principalRemaining);
          openingPrincipal = targetRow.scheduledOpening;
          scheduledMonthlyInterest = targetRow.interestExpected;
          interestPaidForPeriod = targetRow.interestPaid;
          monthlyInterestDue = Math.max(0, Math.round((scheduledMonthlyInterest - interestPaidForPeriod) * 100) / 100);
          totalDue = Math.round((monthlyPrincipalDue + monthlyInterestDue) * 100) / 100;
        } else {
          // Check issue date against target month
          const issueDate = new Date(loan.issueDate || loan.loanDate || loan.createdAt || new Date());
          const issueMonth = issueDate.getMonth() + 1;
          const issueYear = issueDate.getFullYear();
          const issueCalIndex = issueYear * 12 + (issueMonth - 1);
          const selectedCalIndex = targetYear * 12 + (targetMonth - 1);

          if (selectedCalIndex <= issueCalIndex) {
            isEligible = false;
            const firstInstDate = calculateInstallmentMonthYear(issueDate.toISOString(), 1);
            const firstInstDateObj = new Date(firstInstDate.year, firstInstDate.month - 1, 1);
            const firstInstLabel = firstInstDateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
            const issueLabel = issueDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

            excludedLoans.push({
              loanId: loan.id,
              loanNumber: loan.loanNumber || loan.loan_number || loan.id,
              memberName: loan.memberName || member.name || 'Member',
              memberCode: loan.memberCode || member.code || '',
              issueDate: loan.issueDate,
              reason: `Issued on ${formatDate(loan.issueDate)}. Loan issue month (${issueLabel}) contains no installment. Installment #1 starts in ${firstInstLabel} (${formatCurrency(Math.round(originalPrincipal / tenure))} due).`,
              nextEligibleMonth: firstInstDate.month,
              nextEligibleYear: firstInstDate.year,
              nextEligibleLabel: firstInstLabel,
            });
          } else if (currentOutstanding > 0) {
            // Overdue loan past scheduled tenure with remaining balance
            const firstUnpaid = schedule.find((s) => s.principalRemaining > 0);
            installmentNumber = firstUnpaid ? firstUnpaid.installmentNumber : tenure;
            scheduledMonthlyPrincipal = firstUnpaid ? firstUnpaid.principalExpected : Math.min(currentOutstanding, baseMonthlyPrincipal);

            const matchingRepayments = loanRepayments.filter((r) => {
              const rMonth = Number(r.paymentMonth ?? r.payment_month ?? r.month);
              const rYear = Number(r.paymentYear ?? r.payment_year ?? r.year);
              return rMonth === targetMonth && rYear === targetYear;
            });

            alreadyPaidForPeriod = matchingRepayments.reduce(
              (sum, r) => sum + Number(r.principalAmount ?? r.principal_amount ?? r.principalPaid ?? r.principal_repayment_amount ?? 0),
              0
            );
            monthlyPrincipalDue = Math.min(currentOutstanding, Math.max(0, scheduledMonthlyPrincipal - alreadyPaidForPeriod));
            openingPrincipal = currentOutstanding;
            scheduledMonthlyInterest = Math.round(((openingPrincipal * interestRate) / 100) * 100) / 100;
            interestPaidForPeriod = matchingRepayments.reduce(
              (sum, r) => sum + Number(r.interestAmount ?? r.interest_amount ?? r.interestPaid ?? 0),
              0
            );
            monthlyInterestDue = Math.max(0, Math.round((scheduledMonthlyInterest - interestPaidForPeriod) * 100) / 100);
            totalDue = Math.round((monthlyPrincipalDue + monthlyInterestDue) * 100) / 100;
          } else {
            isEligible = false;
          }
        }

        if (!isEligible) continue;

        // Calculate genuinely unpaid historical interest from prior installments
        const priorInstallments = schedule.filter((s) => {
          const instCalIndex = s.year * 12 + (s.month - 1);
          const targetCalIndex = targetYear * 12 + (targetMonth - 1);
          return instCalIndex < targetCalIndex;
        });

        const previousPendingInterest = Math.round(
          priorInstallments.reduce((sum, s) => sum + Math.max(0, Number(s.interestRemaining || 0)), 0) * 100
        ) / 100;

        const currentInterestDue = monthlyInterestDue;
        const totalInterestDue = Math.round((currentInterestDue + previousPendingInterest) * 100) / 100;
        totalDue = Math.round((monthlyPrincipalDue + totalInterestDue) * 100) / 100;

        const isPaidFull = monthlyPrincipalDue === 0 && currentInterestDue === 0 && previousPendingInterest === 0 && (alreadyPaidForPeriod >= scheduledMonthlyPrincipal || currentOutstanding === 0);
        const isPartial = (alreadyPaidForPeriod > 0 || interestPaidForPeriod > 0) && (monthlyPrincipalDue > 0 || currentInterestDue > 0 || previousPendingInterest > 0);
        const status = isPaidFull ? 'PAID' : (isPartial ? 'PARTIAL' : 'PENDING');

        if (isPaidFull) paidLoansCount++;
        else if (isPartial) partialLoansCount++;
        else pendingLoansCount++;

        totalMonthlyPrincipalExpected += scheduledMonthlyPrincipal;
        totalAlreadyCollected += alreadyPaidForPeriod;
        totalRemainingPrincipalDue += monthlyPrincipalDue;
        totalMonthlyInterestExpected += scheduledMonthlyInterest;
        totalInterestAlreadyCollected += interestPaidForPeriod;
        totalRemainingInterestDue += currentInterestDue;
        totalPreviousPendingInterest += previousPendingInterest;

        previewLoans.push({
          loanId: loan.id,
          loanNumber: loan.loanNumber || loan.loan_number || loan.id,
          memberId: loan.memberId || loan.member_id,
          memberName: loan.memberName || member.name || 'Member',
          memberCode: loan.memberCode || member.code || loan.id.slice(-4),
          phone: loan.phone || '',
          totalLoanPrincipal: originalPrincipal,
          totalPrincipalPaidSoFar,
          remainingPrincipal: currentOutstanding,
          installmentNumber,
          openingPrincipal,
          scheduledMonthlyPrincipal,
          alreadyPaidForPeriod,
          monthlyPrincipalDue,
          scheduledMonthlyInterest,
          interestPaidForPeriod,
          currentInterestDue,
          monthlyInterestDue: currentInterestDue,
          previousPendingInterest,
          totalInterestDue,
          totalDue,
          suggestedPrincipal: monthlyPrincipalDue,
          suggestedCurrentInterest: currentInterestDue,
          suggestedPendingInterest: previousPendingInterest,
          suggestedTotalInterest: totalInterestDue,
          suggestedAmount: monthlyPrincipalDue,
          suggestedTotal: totalDue,
          isPaidFull,
          isPartial,
          status,
        });
      }

      previewLoans.sort((a, b) => {
        if (a.isPaidFull !== b.isPaidFull) return a.isPaidFull ? 1 : -1;
        return a.memberName.localeCompare(b.memberName);
      });

      return {
        success: true,
        groupId: targetGroupId,
        month: targetMonth,
        year: targetYear,
        totalActiveLoans: previewLoans.length,
        totalMonthlyPrincipalExpected,
        totalAlreadyCollected,
        totalRemainingPrincipalDue,
        totalMonthlyInterestExpected,
        totalInterestAlreadyCollected,
        totalRemainingInterestDue,
        totalCurrentInterestDue: totalRemainingInterestDue,
        totalPreviousPendingInterest: Math.round(totalPreviousPendingInterest * 100) / 100,
        totalInterestDue: Math.round((totalRemainingInterestDue + totalPreviousPendingInterest) * 100) / 100,
        totalCollectionExpected: Math.round((totalRemainingPrincipalDue + totalRemainingInterestDue + totalPreviousPendingInterest) * 100) / 100,
        paidLoansCount,
        partialLoansCount,
        pendingLoansCount,
        loans: previewLoans,
        excludedLoans,
      };
    } catch (err) {
      console.error('Failed to get bulk loan principal preview:', err);
      throw err;
    }
  },

  /**
   * Record Bulk Monthly Loan Principal collection atomically with duplicate prevention
   */
  recordBulkLoanPrincipal: async (
    { month: rawMonth, year: rawYear, items, clientRequestId, paymentMode = 'UPI', remarks = '', paymentDate },
    groupId = DEFAULT_GROUP_ID
  ) => {
    const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
    const month = parseInt(rawMonth, 10);
    const year = parseInt(rawYear, 10);

    if (!month || !year || month < 1 || month > 12) {
      throw new Error('Valid month (1-12) and year are required.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Items array cannot be empty.');
    }

    const validItems = items.filter((item) => item && (item.loanId || item.loan_id) && Number(item.amount) > 0);
    if (validItems.length === 0) {
      throw new Error('No items with principal collection amount greater than ₹0 selected.');
    }

    // Direct Firestore runTransaction implementation matching recordRepayment
    try {
      const effectiveDate = paymentDate || new Date().toISOString().split('T')[0];
      const requestId = clientRequestId || `BULK_LOAN_REQ_${Date.now()}`;
      const idempotencyRef = doc(db, 'transactions', `IDEM_${requestId}`);

      const result = await runTransaction(db, async (transaction) => {
        // 1. Idempotency Check
        const idempotencySnap = await transaction.get(idempotencyRef);
        if (idempotencySnap.exists()) {
          return {
            isDuplicate: true,
            message: 'Bulk loan principal collection already recorded.',
            data: idempotencySnap.data(),
          };
        }

        // 2. Read Group Document
        const groupRef = doc(db, 'groups', targetGroupId);
        const groupSnap = await transaction.get(groupRef);
        const groupData = groupSnap.exists() ? groupSnap.data() : {};

        // 3. Read All Target Loan Documents
        const loanPlan = [];
        for (const item of validItems) {
          const loanId = item.loanId || item.loan_id;
          const loanRef = doc(db, 'loans', loanId);
          const loanSnap = await transaction.get(loanRef);
          loanPlan.push({
            item,
            loanId,
            loanRef,
            loanSnap,
          });
        }

        let totalPrincipalCollected = 0;
        let totalInterestCollected = 0;
        const skippedDuplicates = [];
        const processedItems = [];

        // 4. Stage Loan updates, Repayments, and Activities
        for (const plan of loanPlan) {
          const { item, loanId, loanRef, loanSnap } = plan;
          if (!loanSnap.exists()) {
            skippedDuplicates.push({ loanId, reason: 'Loan document not found' });
            continue;
          }

          const loanData = loanSnap.data();
          const currentPending = Number(loanData.pendingPrincipal ?? loanData.remainingAmount ?? loanData.outstanding_amount ?? 0);
          const memberId = loanData.memberId || loanData.member_id || item.memberId;
          const memberName = item.memberName || loanData.memberName || loanData.member_name || 'Member';
          const loanNumber = loanData.loanNumber || loanData.loan_number || loanId;

          if ((loanData.status || '').toUpperCase() === 'CLOSED' && currentPending <= 0 && Number(item.interestAmount || 0) <= 0) {
            skippedDuplicates.push({
              loanId,
              loanNumber,
              memberName,
              reason: 'Loan is already closed or has 0 outstanding balance',
            });
            continue;
          }

          const requestedPrincipal = Number(item.principalAmount ?? item.amount ?? 0);
          const currentIntPart = Number(item.currentInterestAmount !== undefined ? item.currentInterestAmount : (item.interestAmount ?? 0));
          const prevPendingIntPart = Number(item.previousPendingInterestAmount ?? 0);
          const requestedInterest = Number(item.interestAmount !== undefined ? item.interestAmount : (currentIntPart + prevPendingIntPart));

          const monthlyPrincipalDue = Number(item.monthlyPrincipalDue ?? item.suggestedAmount ?? currentPending);
          const allowedPrincipal = Math.min(requestedPrincipal, monthlyPrincipalDue, currentPending);
          const allowedInterest = Math.max(0, requestedInterest);
          const totalItemAmount = Math.round((allowedPrincipal + allowedInterest) * 100) / 100;

          if (totalItemAmount <= 0) {
            skippedDuplicates.push({
              loanId,
              loanNumber,
              memberName,
              reason: 'Principal and interest collection amounts are both zero or already settled',
            });
            continue;
          }

          const targetInstallmentNumber = Number(item.installmentNumber ?? item.installment_number) || ((Number(loanData.lastInstallmentPaid) || 0) + 1);
          const repaymentId = `REP_${loanId}_${targetInstallmentNumber}_${year}_${String(month).padStart(2, '0')}_${requestId}`;
          const repayRef = doc(db, 'repayments', repaymentId);

          const newPending = Math.max(0, Math.round((currentPending - allowedPrincipal) * 100) / 100);
          const newStatus = newPending === 0 ? 'CLOSED' : 'ACTIVE';
          const currentTotalPrincipalPaid = Number(loanData.totalPrincipalPaid ?? loanData.total_principal_paid ?? loanData.total_principal_repaid ?? 0);
          const newTotalPrincipalPaid = currentTotalPrincipalPaid + allowedPrincipal;
          const currentTotalInterestPaid = Number(loanData.totalInterestPaid ?? loanData.total_interest_paid ?? 0);
          const newTotalInterestPaid = currentTotalInterestPaid + allowedInterest;

          totalPrincipalCollected += allowedPrincipal;
          totalInterestCollected += allowedInterest;

          const itemMode = item.paymentMode || paymentMode;
          const itemRemarks = (item.remarks || remarks || `Bulk Monthly Collection (${month}/${year})`).trim();

          // 1. Update Loan Document
          transaction.update(loanRef, {
            pendingPrincipal: newPending,
            remainingAmount: newPending,
            outstanding_amount: newPending,
            totalPrincipalPaid: newTotalPrincipalPaid,
            total_principal_paid: newTotalPrincipalPaid,
            total_principal_repaid: newTotalPrincipalPaid,
            totalInterestPaid: newTotalInterestPaid,
            total_interest_paid: newTotalInterestPaid,
            lastInstallmentPaid: targetInstallmentNumber,
            status: newStatus,
            updatedAt: effectiveDate,
          });

          // 2. Create Repayment Record (Principal + 1% reducing interest)
          transaction.set(repayRef, {
            id: repaymentId,
            repaymentId,
            repayment_id: repaymentId,
            groupId: targetGroupId,
            group_id: targetGroupId,
            loanId,
            loan_id: loanId,
            loanNumber,
            memberId,
            member_id: memberId,
            memberName,
            installmentNumber: targetInstallmentNumber,
            installment_number: targetInstallmentNumber,
            type: 'LOAN_REPAYMENT',
            transactionType: 'LOAN_REPAYMENT',
            principalAmount: allowedPrincipal,
            principal_amount: allowedPrincipal,
            principalRepaid: allowedPrincipal,
            principal_repayment_amount: allowedPrincipal,
            interestAmount: allowedInterest,
            interest_amount: allowedInterest,
            currentInterestAmount: currentIntPart,
            previousPendingInterestAmount: prevPendingIntPart,
            regularHaptaAmount: 0,
            regular_hafta_amount: 0,
            regularContribution: 0,
            amount: totalItemAmount,
            loanRepaymentAmount: totalItemAmount,
            totalAmount: totalItemAmount,
            total_amount: totalItemAmount,
            totalPaid: totalItemAmount,
            total_payment: totalItemAmount,
            openingPrincipal: currentPending,
            closingPrincipal: newPending,
            month,
            paymentMonth: month,
            payment_month: month,
            year,
            paymentYear: year,
            payment_year: year,
            paymentDate: effectiveDate,
            payment_date: effectiveDate,
            paymentMode: itemMode,
            payment_mode: itemMode,
            remarks: itemRemarks,
            source: 'BULK_LOAN_COLLECTION',
            createdAt: effectiveDate,
          });

          // 3. Create Transaction Record
          const actId = `ACT_${Date.now()}_${loanId}_bulk_collection`;
          const actRef = doc(db, 'transactions', actId);
          transaction.set(actRef, {
            id: actId,
            groupId: targetGroupId,
            type: 'repayment',
            type_flutter: 'loanRepayment',
            amount: totalItemAmount,
            principalAmount: allowedPrincipal,
            principal_amount: allowedPrincipal,
            interestAmount: allowedInterest,
            interest_amount: allowedInterest,
            currentInterestAmount: currentIntPart,
            previousPendingInterestAmount: prevPendingIntPart,
            regularHaptaAmount: 0,
            regular_hafta_amount: 0,
            totalAmount: totalItemAmount,
            description: `Bulk monthly collection ₹${totalItemAmount.toLocaleString('en-IN')} (Prin: ₹${allowedPrincipal.toLocaleString('en-IN')}, 1% Int: ₹${currentIntPart.toLocaleString('en-IN')}${prevPendingIntPart > 0 ? `, Prev Int: ₹${prevPendingIntPart.toLocaleString('en-IN')}` : ''}) from ${memberName} (${loanNumber})`,
            memberId,
            memberName,
            referenceId: repaymentId,
            source: 'BULK_LOAN_COLLECTION',
            date: effectiveDate,
            createdAt: effectiveDate,
          });

          processedItems.push({
            loanId,
            loanNumber,
            memberId,
            memberName,
            amountCollected: totalItemAmount,
            principalCollected: allowedPrincipal,
            interestCollected: allowedInterest,
            newPending,
            newStatus,
          });
        }

        // 5. Update Group Financial Totals (Available Balance increases by Prin + Int, Active Loans decreases by Prin, Total Fund increases by Int)
        const currentActiveLoans = Number(groupData.activeLoans || groupData.active_loans || groupData.totalOutstandingLoans || 0);
        const newActiveLoans = Math.max(0, currentActiveLoans - totalPrincipalCollected);
        const currentAvailable = Number(groupData.availableBalance ?? groupData.available_balance ?? 0);
        const newAvailableBalance = Math.round((currentAvailable + totalPrincipalCollected + totalInterestCollected) * 100) / 100;
        const newTotalFund = Math.round((newAvailableBalance + newActiveLoans) * 100) / 100;
        const currentGroupInterest = Number(groupData.totalInterestPaid ?? groupData.total_interest_paid ?? 0);
        const newGroupInterest = Math.round((currentGroupInterest + totalInterestCollected) * 100) / 100;
        const newMonthlyInterest = Math.round(newActiveLoans * 0.02 * 100) / 100;

        if ((totalPrincipalCollected > 0 || totalInterestCollected > 0) && groupSnap.exists()) {
          transaction.update(groupRef, {
            activeLoans: newActiveLoans,
            active_loans: newActiveLoans,
            totalOutstandingLoans: newActiveLoans,
            availableBalance: newAvailableBalance,
            available_balance: newAvailableBalance,
            rawAvailableBalance: newAvailableBalance,
            totalFund: newTotalFund,
            total_fund: newTotalFund,
            totalInterestPaid: newGroupInterest,
            total_interest_paid: newGroupInterest,
            currentMonthlyInterest: newMonthlyInterest,
            current_monthly_interest: newMonthlyInterest,
            updatedAt: effectiveDate,
          });
        }

        // 6. Record Idempotency Marker
        transaction.set(idempotencyRef, {
          id: `IDEM_${requestId}`,
          type: 'IDEMPOTENCY_MARKER',
          feature: 'BULK_LOAN_PRINCIPAL_COLLECTION',
          requestId,
          groupId: targetGroupId,
          month,
          year,
          count: processedItems.length,
          skippedCount: skippedDuplicates.length,
          totalCollected: totalPrincipalCollected + totalInterestCollected,
          totalPrincipalCollected,
          totalInterestCollected,
          skippedDuplicates,
          createdAt: effectiveDate,
        });

        return {
          isDuplicate: false,
          count: processedItems.length,
          totalCollected: totalPrincipalCollected + totalInterestCollected,
          totalPrincipalCollected,
          totalInterestCollected,
          skippedDuplicates,
          processedItems,
          newActiveLoans,
          newAvailableBalance,
          newTotalFund,
          newGroupInterest,
        };
      });

      return {
        success: true,
        isIdempotentReplay: Boolean(result.isDuplicate),
        message: result.isDuplicate
          ? 'Bulk loan collection already recorded.'
          : (result.count > 0
              ? `Bulk monthly loan collection of ₹${result.totalCollected.toLocaleString('en-IN')} (Principal: ₹${result.totalPrincipalCollected.toLocaleString('en-IN')}, Interest: ₹${result.totalInterestCollected.toLocaleString('en-IN')}) recorded for ${result.count} loan(s).`
              : 'All selected loans already have collection recorded for this period. Duplicate writes prevented.'),
        count: result.count,
        totalCollected: result.totalCollected,
        totalPrincipalCollected: result.totalPrincipalCollected,
        totalInterestCollected: result.totalInterestCollected,
        skippedDuplicates: result.skippedDuplicates || [],
        groupBalances: {
          activeLoans: result.newActiveLoans,
          availableBalance: result.newAvailableBalance,
          totalFund: result.newTotalFund,
        },
      };
    } catch (err) {
      console.error('Failed to record bulk loan principal in Firestore:', err);
      throw new Error(err.message || 'Failed to record bulk loan principal.');
    }
  },

  /**
   * Get Pending Loan Interest Recovery preview across all loans (both active and closed)
   * Evaluates unpaid/underpaid 1% monthly reducing-balance interest on past installments
   */
  getPendingInterestRecoveryPreview: async (groupId = DEFAULT_GROUP_ID) => {
    try {
      const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;

      const [loansSnap, repaymentsSnap, membersSnap] = await Promise.all([
        getDocs(groupQuery('loans', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('repayments', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('users', targetGroupId)).catch(() => ({ docs: [] })),
      ]);

      const membersMap = {};
      membersSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const memberName = d.name || d.fullName || 'Member';
        const memberCode = d.memberCode || d.member_code || docSnap.id;
        membersMap[docSnap.id] = { name: memberName, code: memberCode, phone: d.phone || '' };
        if (d.userId) membersMap[d.userId] = { name: memberName, code: memberCode, phone: d.phone || '' };
        if (d.authUid) membersMap[d.authUid] = { name: memberName, code: memberCode, phone: d.phone || '' };
      });

      const allRepayments = repaymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const allLoans = loansSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const recoveryItems = [];
      let totalPendingInterest = 0;

      for (const loan of allLoans) {
        if (loan.isDeleted) continue;
        const mem = membersMap[loan.memberId || loan.member_id] || { name: loan.memberName || 'Member', code: loan.memberCode || '' };
        const loanReps = allRepayments.filter((r) => String(r.loanId || r.loan_id) === String(loan.id));
        const orig = Number(loan.originalPrincipal || loan.principalAmount || 0);
        const pend = Number(loan.pendingPrincipal ?? loan.remainingAmount ?? 0);
        const interestRate = Number(loan.interestRate || loan.interest_rate || LOAN_INTEREST_RATE);

        let uncollectedForLoan = 0;
        const unpaidInstallments = [];

        loanReps.forEach((r) => {
          const p = Number(r.principalAmount ?? r.principal_amount ?? 0);
          const i = Number(r.interestAmount ?? r.interest_amount ?? 0);
          const opening = Number(r.openingPrincipal ?? orig);
          const expectedI = Math.round(((opening * interestRate) / 100) * 100) / 100;
          const diff = Math.max(0, expectedI - i);
          if (diff > 0 && p > 0) {
            uncollectedForLoan += diff;
            unpaidInstallments.push({
              installmentNumber: r.installmentNumber || r.installment_number || 'N/A',
              month: r.paymentMonth || r.month,
              year: r.paymentYear || r.year,
              principalPaid: p,
              interestPaid: i,
              interestDue: expectedI,
              uncollectedInterest: diff,
              source: r.source || 'REPAYMENT',
            });
          }
        });

        if (uncollectedForLoan > 0) {
          totalPendingInterest += uncollectedForLoan;
          recoveryItems.push({
            loanId: loan.id,
            loanNumber: loan.loanNumber || loan.id,
            memberId: loan.memberId,
            memberName: mem.name,
            memberCode: mem.code,
            phone: mem.phone || '',
            status: (loan.status || '').toUpperCase(),
            originalPrincipal: orig,
            pendingPrincipal: pend,
            uncollectedInterest: uncollectedForLoan,
            suggestedAmount: uncollectedForLoan,
            unpaidInstallments,
          });
        }
      }

      recoveryItems.sort((a, b) => a.memberName.localeCompare(b.memberName));

      return {
        success: true,
        groupId: targetGroupId,
        totalItems: recoveryItems.length,
        totalPendingInterest: Math.round(totalPendingInterest * 100) / 100,
        items: recoveryItems,
      };
    } catch (err) {
      console.error('Failed to get pending interest recovery preview:', err);
      throw err;
    }
  },

  /**
   * Record Pending Loan Interest Recovery atomically with strict financial safety
   * - Credits Interest Income
   * - Updates group.availableBalance and group.totalFund
   * - Leaves loan pending principal and group active loans untouched
   */
  recordPendingInterestRecovery: async (
    { items, paymentDate, paymentMode = 'UPI', remarks = '', clientRequestId },
    groupId = DEFAULT_GROUP_ID
  ) => {
    const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Items array cannot be empty.');
    }
    const validItems = items.filter((item) => item && (item.loanId || item.loan_id) && Number(item.amount) > 0);
    if (validItems.length === 0) {
      throw new Error('No items with interest recovery amount greater than ₹0 selected.');
    }

    try {
      const effectiveDate = paymentDate || new Date().toISOString().split('T')[0];
      const requestId = clientRequestId || `INT_RECOV_REQ_${Date.now()}`;
      const idempotencyRef = doc(db, 'transactions', `IDEM_${requestId}`);

      const result = await runTransaction(db, async (transaction) => {
        const idempotencySnap = await transaction.get(idempotencyRef);
        if (idempotencySnap.exists()) {
          return {
            isDuplicate: true,
            message: 'Interest recovery already recorded.',
            data: idempotencySnap.data(),
          };
        }

        const groupRef = doc(db, 'groups', targetGroupId);
        const groupSnap = await transaction.get(groupRef);
        const groupData = groupSnap.exists() ? groupSnap.data() : {};

        const loanPlan = [];
        for (const item of validItems) {
          const loanId = item.loanId || item.loan_id;
          const loanRef = doc(db, 'loans', loanId);
          const loanSnap = await transaction.get(loanRef);
          loanPlan.push({ item, loanId, loanRef, loanSnap });
        }

        let totalInterestRecovered = 0;
        const processedItems = [];

        for (const plan of loanPlan) {
          const { item, loanId, loanRef, loanSnap } = plan;
          if (!loanSnap.exists()) continue;

          const loanData = loanSnap.data();
          const memberId = loanData.memberId || item.memberId;
          const memberName = item.memberName || loanData.memberName || 'Member';
          const loanNumber = loanData.loanNumber || loanId;
          const recoverAmount = Number(item.amount);

          if (recoverAmount <= 0) continue;

          const repaymentId = `REP_${loanId}_INT_RECOV_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const repayRef = doc(db, 'repayments', repaymentId);

          const currentTotalInterestPaid = Number(loanData.totalInterestPaid ?? loanData.total_interest_paid ?? 0);
          const newTotalInterestPaid = currentTotalInterestPaid + recoverAmount;

          totalInterestRecovered += recoverAmount;
          const itemMode = item.paymentMode || paymentMode;
          const itemRemarks = (item.remarks || remarks || 'Pending Interest Recovery').trim();

          // 1. Update Loan Document (interest paid updated; principal untouched)
          transaction.update(loanRef, {
            totalInterestPaid: newTotalInterestPaid,
            total_interest_paid: newTotalInterestPaid,
            updatedAt: effectiveDate,
          });

          // 2. Create Repayment Document (type: INTEREST_REPAYMENT, principal: 0, interest: recoverAmount)
          transaction.set(repayRef, {
            id: repaymentId,
            repaymentId,
            groupId: targetGroupId,
            loanId,
            loanNumber,
            memberId,
            memberName,
            type: 'INTEREST_REPAYMENT',
            transactionType: 'INTEREST_REPAYMENT',
            principalAmount: 0,
            interestAmount: recoverAmount,
            totalAmount: recoverAmount,
            amount: recoverAmount,
            paymentDate: effectiveDate,
            paymentMode: itemMode,
            remarks: itemRemarks,
            source: 'PENDING_INTEREST_RECOVERY',
            createdAt: effectiveDate,
          });

          // 3. Create Transaction Document (type: interestIncome)
          const actId = `ACT_${Date.now()}_${loanId}_int_recov`;
          const actRef = doc(db, 'transactions', actId);
          transaction.set(actRef, {
            id: actId,
            groupId: targetGroupId,
            type: 'interestIncome',
            type_flutter: 'interestIncome',
            amount: recoverAmount,
            principalAmount: 0,
            interestAmount: recoverAmount,
            totalAmount: recoverAmount,
            description: `Pending interest ₹${recoverAmount.toLocaleString('en-IN')} recovered from ${memberName} (${loanNumber})`,
            memberId,
            memberName,
            referenceId: repaymentId,
            source: 'PENDING_INTEREST_RECOVERY',
            date: effectiveDate,
            createdAt: effectiveDate,
          });

          processedItems.push({
            loanId,
            loanNumber,
            memberId,
            memberName,
            amountRecovered: recoverAmount,
          });
        }

        // 4. Update Group Financials (Available Balance increases, Total Fund increases, Active Loans untouched)
        const currentAvailable = Number(groupData.availableBalance ?? groupData.available_balance ?? 0);
        const newAvailableBalance = Math.round((currentAvailable + totalInterestRecovered) * 100) / 100;
        const currentActiveLoans = Number(groupData.activeLoans || groupData.active_loans || 0);
        const newTotalFund = Math.round((newAvailableBalance + currentActiveLoans) * 100) / 100;
        const currentGroupTotalInterest = Number(groupData.totalInterestPaid ?? groupData.total_interest_paid ?? 0);
        const newGroupTotalInterest = Math.round((currentGroupTotalInterest + totalInterestRecovered) * 100) / 100;

        if (totalInterestRecovered > 0 && groupSnap.exists()) {
          transaction.update(groupRef, {
            availableBalance: newAvailableBalance,
            available_balance: newAvailableBalance,
            rawAvailableBalance: newAvailableBalance,
            totalFund: newTotalFund,
            total_fund: newTotalFund,
            totalInterestPaid: newGroupTotalInterest,
            total_interest_paid: newGroupTotalInterest,
            updatedAt: effectiveDate,
          });
        }

        // 5. Idempotency Marker
        transaction.set(idempotencyRef, {
          id: `IDEM_${requestId}`,
          type: 'IDEMPOTENCY_MARKER',
          feature: 'PENDING_INTEREST_RECOVERY',
          requestId,
          groupId: targetGroupId,
          count: processedItems.length,
          totalRecovered: totalInterestRecovered,
          processedItems,
          createdAt: effectiveDate,
        });

        return {
          isDuplicate: false,
          count: processedItems.length,
          totalRecovered: totalInterestRecovered,
          processedItems,
          newAvailableBalance,
          newTotalFund,
          newGroupTotalInterest,
        };
      });

      return {
        success: true,
        isIdempotentReplay: Boolean(result.isDuplicate),
        message: result.isDuplicate
          ? 'Pending interest recovery already recorded.'
          : `Pending interest of ₹${result.totalRecovered.toLocaleString('en-IN')} recovered for ${result.count} loan(s).`,
        count: result.count,
        totalRecovered: result.totalRecovered,
        processedItems: result.processedItems || [],
      };
    } catch (err) {
      console.error('Failed to record pending interest recovery in Firestore:', err);
      throw new Error(err.message || 'Failed to record pending interest recovery.');
    }
  },

  /**
   * Subscribe to real-time loans
   */
  subscribeToLoans: (callback, groupId = DEFAULT_GROUP_ID) => {
    const targetGroupId = (groupId === 'group_001' || !groupId) ? DEFAULT_GROUP_ID : groupId;
    return onSnapshot(groupQuery('loans', targetGroupId), () => {
      loanService.getAllLoans({}, targetGroupId).then((res) => {
        if (res.success) callback(res);
      });
    });
  },
};
