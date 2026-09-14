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
  DEFAULT_GROUP_ID,
} from '../utils/formatters.js';
import { calculateInterest } from '../utils/calculations.js';
import { calculateGroupFinancialSummary } from './financialService.js';

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
  const tenure = 10; // Enforced Bachat Gat rule: loan duration is fixed at 10 installments
  const interestRate = Number(loan.interestRate || loan.interest_rate || 2.0);
  const regularHaptaExpected = 1000;

  // Exact equal-principal distribution ensuring sum(expected) === originalPrincipal
  const baseMonthlyPrincipal = tenure > 0 ? Math.floor(originalPrincipal / tenure) : 0;
  const principalRemainder = tenure > 0 ? (originalPrincipal - (baseMonthlyPrincipal * tenure)) : 0;

  const issueDateStr = loan.issueDate || loan.loanDate || loan.createdAt || new Date().toISOString();

  // Current calendar month for DUE vs UPCOMING determination
  const today = new Date();
  const currentCalMonth = today.getMonth() + 1;
  const currentCalYear = today.getFullYear();
  const currentCalKey = currentCalYear * 100 + currentCalMonth;

  let currentOpening = originalPrincipal;
  const schedule = [];

  for (let i = 1; i <= tenure; i++) {
    const { month: instMonth, year: instYear } = calculateInstallmentMonthYear(issueDateStr, i);
    const instCalKey = instYear * 100 + instMonth;
    const monthKeyStr = `${instYear}-${String(instMonth).padStart(2, '0')}`;
    const dateObj = new Date(instYear, instMonth - 1, 1);
    const monthLabel = dateObj.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    const periodLabel = monthLabel;

    // 1. Reducing-Balance Opening Principal for this installment
    const scheduledOpening = Math.max(0, Math.round(currentOpening * 100) / 100);

    // Expected principal for installment i (final installment absorbs rounding remainder)
    const nominalExpected = i === tenure
      ? (baseMonthlyPrincipal + principalRemainder)
      : baseMonthlyPrincipal;

    let principalExpected = 0;
    if (scheduledOpening > 0) {
      principalExpected = Math.min(scheduledOpening, nominalExpected);
    }

    // Reducing-balance interest: 2% of actual Opening Outstanding Principal
    const interestExpected = scheduledOpening > 0
      ? Math.round((scheduledOpening * interestRate) / 100)
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

    // Regular Hapta paid is whatever was paid for that month (either via monthly contribution or loan repayment) capped at regularHaptaExpected
    const regularHaptaPaid = Math.min(regularHaptaExpected, Math.max(contribPaid, repayRegPaid));

    const totalPaid = principalPaid + interestPaid + regularHaptaPaid;

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
    } else if (instCalKey < currentCalKey) {
      // Past installment with 0 principal paid
      actualClosing = scheduledOpening;
      scheduledClosing = scheduledOpening;
      nextOpening = scheduledOpening;
    } else {
      // Future or current planned installment
      actualClosing = scheduledOpening;
      scheduledClosing = Math.max(0, Math.round((scheduledOpening - principalExpected) * 100) / 100);
      nextOpening = scheduledClosing;
    }

    const displayRemainingPrincipal = (principalPaid > 0 || instCalKey < currentCalKey)
      ? actualClosing
      : scheduledClosing;

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
      const interestRate = parseFloat(loanData.interest_rate || loanData.interestRate) || 2.0;
      const purpose = (loanData.purpose || 'General').trim();
      const dateStr = loanData.loan_date || loanData.loanDate || new Date().toISOString();
      const durationMonths = parseInt(loanData.duration_months || loanData.durationMonths, 10) || 10;

      if (!memberId || !Number.isFinite(principal) || principal <= 0) {
        throw new Error('A valid member and principal amount are required.');
      }
      const selectedMemberSnap = await getDoc(doc(db, 'users', memberId));
      if (!selectedMemberSnap.exists() || selectedMemberSnap.data().isActive === false || (selectedMemberSnap.data().status || 'active').toLowerCase() === 'inactive') {
        throw new Error('The selected member is not active or no longer exists.');
      }

      // Authoritative Business Rule: A new loan disbursement must not exceed Available Cash
      const [savingsSnap, repaymentsSnap, loansSnap] = await Promise.all([
        getDocs(groupQuery('monthlyContributions', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('repayments', targetGroupId)).catch(() => ({ docs: [] })),
        getDocs(groupQuery('loans', targetGroupId)).catch(() => ({ docs: [] })),
      ]);

      const groupSavings = savingsSnap.docs.map(d => normalizeSavings(d.id, d.data())).filter(s => (s.groupId || '').toLowerCase() === targetGroupId.toLowerCase());
      const groupLoans = loansSnap.docs.map(d => normalizeLoan(d.id, d.data())).filter(l => (l.groupId || '').toLowerCase() === targetGroupId.toLowerCase());
      const groupRepayments = repaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => (r.groupId || '').toLowerCase() === targetGroupId.toLowerCase());

      const groupSummary = calculateGroupFinancialSummary(groupSavings, groupLoans, groupRepayments);
      const rawAvailableCash = groupSummary.rawAvailableBalance !== undefined ? groupSummary.rawAvailableBalance : groupSummary.availableBalance;
      const currentAvailableCash = Math.round(Number(rawAvailableCash) * 100) / 100;

      if (principal > currentAvailableCash || currentAvailableCash <= 0) {
        throw new Error(`Insufficient available balance. Available: ₹${formatNumber(Math.max(0, currentAvailableCash))}. Requested loan: ₹${formatNumber(principal)}.`);
      }

      const loanId = `L_${Date.now()}`;
      const loanDocRef = doc(db, 'loans', loanId);

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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(loanDocRef, loanPayload);

      // Fetch member name for logging
      let memberName = 'Member';
      try {
        const memSnap = await getDoc(doc(db, 'users', memberId));
        if (memSnap.exists()) memberName = memSnap.data().name || memSnap.data().fullName || 'Member';
      } catch (e) {
        // fallback
      }

      // Log activity
      const actId = `ACT_${Date.now()}_loan`;
      await setDoc(doc(db, 'transactions', actId), {
        id: actId,
        groupId: targetGroupId,
        type: 'loan',
        amount: principal,
        description: `Loan of ₹${principal} approved for ${memberName}`,
        memberId,
        memberName,
        referenceId: loanId,
        date: new Date().toISOString(),
      });

      // Update Group summary metrics in Firestore
      try {
        const groupRef = doc(db, 'groups', targetGroupId);
        const groupSnap = await getDoc(groupRef);
        if (groupSnap.exists()) {
          const gData = groupSnap.data();
          const currentTotalSavings = Number(gData.totalSavings || gData.total_savings || 0);
          const newOutstandingTotal = Number(gData.activeLoans || gData.totalOutstandingLoans || 0) + principal;

          // Current Monthly Interest is 2% of Current Outstanding
          const newCurrentMonthlyInterest = Math.round(newOutstandingTotal * 0.02 * 100) / 100;
          const existingTotalInterestPaid = Number(gData.totalInterestPaid || gData.totalInterestCollected || 0);

          // Rule 4: Fund = Savings + Current Monthly Interest
          const newTotalFund = Math.round((currentTotalSavings + newCurrentMonthlyInterest) * 100) / 100;

          // Rule 5: Available Balance = Fund - Loans (Zero-floored)
          const newRawAvailableBalance = Math.round((newTotalFund - newOutstandingTotal) * 100) / 100;
          const newAvailableBalance = Math.max(0, newRawAvailableBalance);

          await updateDoc(groupRef, {
            activeLoans: newOutstandingTotal,
            totalOutstandingLoans: newOutstandingTotal,
            currentMonthlyInterest: newCurrentMonthlyInterest,
            current_monthly_interest: newCurrentMonthlyInterest,
            totalInterestPaid: existingTotalInterestPaid,
            total_interest_paid: existingTotalInterestPaid,
            totalInterestCollected: existingTotalInterestPaid,
            totalInterest: existingTotalInterestPaid,
            total_interest: existingTotalInterestPaid,
            totalFund: newTotalFund,
            availableBalance: newAvailableBalance,
            rawAvailableBalance: newRawAvailableBalance,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.warn('Notice: Group summary update on loan creation:', e);
      }

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
        const existingContrib = await getDoc(contribDocRef);
        
        if (existingContrib.exists()) {
          const data = existingContrib.data();
          existingPaidSavings = Number(data.paidAmount || data.paid_amount || data.amount || 0);
          expectedShare = Number(data.expectedAmount || data.expected_amount || 1000);
          contribCreatedAt = data.createdAt || contribCreatedAt;
        }
      }

      // Calculate actual additional savings to add (capped so total does not exceed expectedShare)
      const actualSavingsToAdd = Math.max(0, Math.min(regularHafta, expectedShare - existingPaidSavings));
      const totalPaidSavings = existingPaidSavings + actualSavingsToAdd;
      isPaidFull = totalPaidSavings >= expectedShare;

      const memRef = doc(db, 'users', memberId);
      const memSnap = await getDoc(memRef);
      const memberName = memSnap.exists() ? (memSnap.data().name || memSnap.data().fullName || 'Member') : 'Member';

      const groupRef = doc(db, 'groups', targetGroupId);
      const groupSnap = await getDoc(groupRef);
      let groupData = {};
      if (groupSnap.exists()) groupData = groupSnap.data();

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
      const repaymentId = `REP_${loanId}_${targetInstallmentNumber}_${Date.now()}`;
      const repayRef = doc(db, 'repayments', repaymentId);
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
          status: isPaidFull ? 'PAID' : 'PENDING',
          status_lower: isPaidFull ? 'paid' : 'pending',
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
        message: 'Repayment recorded successfully in Bachat Gat',
        newOutstanding: newPending,
        loanStatus: newStatus,
        repaymentId,
      };
    } catch (err) {
      console.error('Failed to record repayment in Firestore:', err);
      throw new Error(err.message || 'Failed to record repayment.');
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
