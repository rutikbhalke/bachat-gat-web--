import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { groupQuery } from './dataContract.js';
import { groupService } from './groupService.js';
import { DEFAULT_GROUP_ID, normalizeMember, normalizeLoan, normalizeSavings } from '../utils/formatters.js';
import { calculateLoanOutstanding, calculateLoanInterest, calculateGroupFinancialSummary, LOAN_INTEREST_RATE } from './financialService.js';

const number = (item) => Number(item) || 0;

export const DEFAULT_TAALEBAND_ROWS = [];

export const normalizeToYYYYMMDD = (val, defaultVal = '') => {
  if (!val) return defaultVal;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const matchYMD = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (matchYMD) {
      return `${matchYMD[1]}-${String(matchYMD[2]).padStart(2, '0')}-${String(matchYMD[3]).padStart(2, '0')}`;
    }
    const matchDMY = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (matchDMY) {
      return `${matchDMY[3]}-${String(matchDMY[2]).padStart(2, '0')}-${String(matchDMY[1]).padStart(2, '0')}`;
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  }
  if (val.seconds) {
    const d = new Date(val.seconds * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return defaultVal;
};

export const getMonthEndDay = (year, month) => {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!y || !m || m < 1 || m > 12) return 31;
  return new Date(y, m, 0).getDate();
};

export const formatMonthEndDate = (year, month) => {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const lastDay = getMonthEndDay(y, m);
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
};

export const resolveRecordDateString = (rec, defaultDay = 10) => {
  const rawDate = rec.paymentDate || rec.payment_date || rec.loanDate || rec.issueDate || rec.date || rec.createdAt;
  const recMonth = Number(rec.paymentMonth || rec.payment_month || rec.month);
  const recYear = Number(rec.paymentYear || rec.payment_year || rec.year);

  let parsedDay = null;
  let parsedMonth = null;
  let parsedYear = null;

  if (rawDate) {
    if (typeof rawDate === 'string') {
      const trimmed = rawDate.trim();
      const matchYMD = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (matchYMD) {
        parsedYear = parseInt(matchYMD[1], 10);
        parsedMonth = parseInt(matchYMD[2], 10);
        parsedDay = parseInt(matchYMD[3], 10);
      } else {
        const matchDMY = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
        if (matchDMY) {
          parsedYear = parseInt(matchDMY[3], 10);
          parsedMonth = parseInt(matchDMY[2], 10);
          parsedDay = parseInt(matchDMY[1], 10);
        } else {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) {
            parsedYear = d.getFullYear();
            parsedMonth = d.getMonth() + 1;
            parsedDay = d.getDate();
          }
        }
      }
    } else if (rawDate.seconds) {
      const d = new Date(rawDate.seconds * 1000);
      parsedYear = d.getFullYear();
      parsedMonth = d.getMonth() + 1;
      parsedDay = d.getDate();
    } else if (rawDate instanceof Date) {
      parsedYear = rawDate.getFullYear();
      parsedMonth = rawDate.getMonth() + 1;
      parsedDay = rawDate.getDate();
    }
  }

  const finalYear = (recYear && !isNaN(recYear) && recYear > 0) ? recYear : (parsedYear || new Date().getFullYear());
  const finalMonth = (recMonth && !isNaN(recMonth) && recMonth > 0) ? recMonth : (parsedMonth || 1);
  const rawDay = parsedDay || defaultDay;
  const maxDaysInMonth = new Date(finalYear, finalMonth, 0).getDate();
  const finalDay = Math.min(Math.max(1, rawDay), maxDaysInMonth);

  return `${finalYear}-${String(finalMonth).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`;
};

export const parseFirestoreDate = (dateVal, fallbackMonth, fallbackYear) => {
  if (!dateVal) {
    if (fallbackMonth && fallbackYear) {
      return new Date(Number(fallbackYear), Number(fallbackMonth) - 1, 15);
    }
    return null;
  }
  if (typeof dateVal.toDate === 'function') {
    return dateVal.toDate();
  }
  if (dateVal.seconds) {
    return new Date(dateVal.seconds * 1000);
  }
  if (dateVal instanceof Date) {
    return dateVal;
  }
  if (typeof dateVal === 'string') {
    const ymd = dateVal.trim().split('-');
    if (ymd.length === 3 && ymd[0].length === 4) {
      return new Date(parseInt(ymd[0], 10), parseInt(ymd[1], 10) - 1, parseInt(ymd[2], 10), 12, 0, 0);
    }
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) return d;
  }
  if (fallbackMonth && fallbackYear) {
    return new Date(Number(fallbackYear), Number(fallbackMonth) - 1, 15);
  }
  return null;
};


export const reportService = {
  /**
   * Helper to fetch shared baseline data directly from Firestore
   */
  _getBaselineData: async (groupId) => {
    const targetGroupId = groupId || DEFAULT_GROUP_ID;
    const [contributionsSnap, loansSnap, membersSnap, repaymentsSnap, groupRes] = await Promise.all([
      getDocs(groupQuery('monthlyContributions', targetGroupId)).catch(() => ({ docs: [] })),
      getDocs(groupQuery('loans', targetGroupId)).catch(() => ({ docs: [] })),
      getDocs(groupQuery('users', targetGroupId)).catch(() => ({ docs: [] })),
      getDocs(groupQuery('repayments', targetGroupId)).catch(() => ({ docs: [] })),
      groupService.getGroupDetails(targetGroupId).catch(() => ({ group: {} })),
    ]);

    const members = membersSnap.docs.map(d => normalizeMember(d.id, d.data()));
    const activeMembers = members
      .filter(m => m.isActive !== false && (m.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && (m.id.startsWith('member_') || m.id.startsWith('test_mem_') || m.memberCode?.startsWith('M-130-') || m.memberCode?.startsWith('TM-') || ((m.role || '').toUpperCase() !== 'ADMIN' && !m.email?.includes('admin'))))
      .sort((a, b) => (a.memberCode || a.id).localeCompare(b.memberCode || b.id, undefined, { numeric: true }));
    const loans = loansSnap.docs.map(d => normalizeLoan(d.id, d.data()));
    const contributions = contributionsSnap.docs.map(d => normalizeSavings(d.id, d.data()));
    const repayments = repaymentsSnap.docs.map(d => {
      const data = d.data();
      const pDate = data.paymentDate || data.payment_date || data.createdAt || data.date;
      let pMonth = Number(data.paymentMonth || data.payment_month || data.month || 0);
      let pYear = Number(data.paymentYear || data.payment_year || data.year || 0);
      if ((!pMonth || !pYear) && pDate) {
        const dObj = parseFirestoreDate(pDate);
        if (dObj) {
          pMonth = pMonth || (dObj.getMonth() + 1);
          pYear = pYear || dObj.getFullYear();
        }
      }
      return {
        id: d.id,
        ...data,
        paymentMonth: pMonth,
        payment_month: pMonth,
        month: pMonth,
        paymentYear: pYear,
        payment_year: pYear,
        year: pYear,
        principalPaid: Number(data.principalAmount || data.principal_amount || data.principalRepaid || data.loanPrincipalPaid || data.loan_principal_paid || 0),
        interestPaid: Number(data.interestAmount || data.interest_amount || data.interestPaid || data.interest_paid || data.interest || 0),
        regularHaptaPaid: Number(data.regularHaftaAmount || data.regular_hafta_amount || data.regularContribution || data.regular_contribution || 0),
        installmentNumber: Number(data.installmentNumber || 0),
        paymentDate: pDate,
        payment_date: pDate,
      };
    });

    const membersMap = {};
    members.forEach(m => { membersMap[m.id] = m; });

    return { members, activeMembers, loans, contributions, repayments, group: groupRes.group || {}, membersMap };
  },

  /**
   * Month-wise Financial Report (Calculated on Frontend)
   */
  getMonthlyReport: async (month, year, groupId = DEFAULT_GROUP_ID) => {
    try {
      const { activeMembers, loans, contributions, repayments } = await reportService._getBaselineData(groupId);

      const m = parseInt(month, 10);
      const y = parseInt(year, 10);

      const monthSavings = contributions.filter((s) => number(s.month) === m && number(s.year) === y);
      const monthRepayments = repayments.filter((r) => {
        const rMonth = number(r.paymentMonth || r.payment_month || r.month);
        const rYear = number(r.paymentYear || r.payment_year || r.year);
        const dateStr = resolveRecordDateString(r);
        const dateMatches = dateStr.startsWith(`${y}-${String(m).padStart(2, '0')}`);
        return (rMonth === m && rYear === y) || dateMatches;
      });

      // Authoritative Reconciled Metrics from Central Financial Service
      const groupFinancials = calculateGroupFinancialSummary(contributions, loans, repayments);

      // Member collections breakdown
      const collections = activeMembers.map(mem => {
        const memberId = mem.id;
        const memberLoans = loans.filter(l => l.memberId === memberId || l.member_id === memberId);
        const memberActiveLoan = memberLoans.find(l => {
          const out = calculateLoanOutstanding(l, repayments);
          const rawStatus = (l.status || '').toUpperCase();
          return rawStatus !== 'CLOSED' && rawStatus !== 'REJECTED' && out > 0;
        }) || memberLoans.find(l => (l.status || '').toUpperCase() === 'ACTIVE') || null;

        const memberContrib = monthSavings.find(s => s.memberId === memberId || s.member_id === memberId);

        // Sum all non-deposit repayments made by this member in this period
        const memberRepayList = monthRepayments.filter(r => (r.memberId === memberId || r.member_id === memberId) && !r.isDeposit);
        const totalPrincipalPaid = memberRepayList.reduce((sum, r) => sum + number(r.principalPaid), 0);
        const totalInterestPaid = memberRepayList.reduce((sum, r) => sum + number(r.interestPaid), 0);
        const totalHaptaPaid = memberRepayList.reduce((sum, r) => sum + number(r.regularHaptaPaid), 0);

        let loanHafta = totalPrincipalPaid;
        let interestAmount = totalInterestPaid;
        let fundAmount = totalHaptaPaid > 0 ? totalHaptaPaid : number(memberContrib?.paidAmount || mem.monthlyContribution || 1000);

        const hasRepaid = totalPrincipalPaid > 0 || totalInterestPaid > 0;
        const hasSavings = Boolean(memberContrib && number(memberContrib.paidAmount) > 0);

        const currentOut = memberActiveLoan ? calculateLoanOutstanding(memberActiveLoan, repayments) : 0;
        const originalLoanAmount = memberActiveLoan ? number(memberActiveLoan.originalPrincipal ?? memberActiveLoan.principalAmount ?? memberActiveLoan.loanAmount ?? 0) : 0;

        // If no loan repayment was made for this month but the member has an active loan with outstanding balance,
        // show expected monthly installment demand (हप्ता) and interest demand (व्याज)
        if (!hasRepaid && memberActiveLoan && currentOut > 0) {
          const tenure = parseInt(memberActiveLoan.durationMonths || memberActiveLoan.duration_months || 10, 10) || 10;
          loanHafta = Math.round(originalLoanAmount / tenure);
          interestAmount = calculateLoanInterest(currentOut, memberActiveLoan.interestRate || memberActiveLoan.interest_rate || 2.0);
        }

        let status = 'PENDING';
        if (hasRepaid && hasSavings) {
          status = 'PAID';
        } else if (hasRepaid || hasSavings) {
          status = (memberActiveLoan && currentOut > 0) ? 'PARTIAL' : 'PAID';
        }

        const lastRepay = memberRepayList[memberRepayList.length - 1];
        let inst = 0;
        if (lastRepay && (lastRepay.installmentNumber || lastRepay.installment_number)) {
          inst = Number(lastRepay.installmentNumber || lastRepay.installment_number);
        } else if (memberActiveLoan && currentOut > 0) {
          inst = (Number(memberActiveLoan.lastInstallmentPaid || memberActiveLoan.last_installment_paid || 0)) + 1;
        }

        return {
          id: memberId,
          memberId,
          name: mem.name || mem.fullName,
          memberName: mem.name || mem.fullName,
          memberCode: mem.memberCode,
          loan: originalLoanAmount,
          inst,
          loanHafta,
          haptaPaid: loanHafta,
          principalPaid: loanHafta,
          principalRepaid: loanHafta,
          loanPrincipalPaid: loanHafta,
          interest: interestAmount,
          interestPaid: interestAmount,
          fund: fundAmount,
          fundDeposit: fundAmount,
          regularHapta: fundAmount,
          regularHaptaPaid: totalHaptaPaid,
          loanDeposit: 0,
          total: loanHafta + interestAmount + fundAmount,
          status
        };
      });

      return {
        success: true,
        summary: {
          monthSavings: monthSavings.reduce((sum, s) => sum + number(s.paidAmount || s.amount), 0),
          monthPrincipalPaid: monthRepayments.filter(r => !r.isDeposit).reduce((sum, r) => sum + r.principalPaid, 0),
          monthInterestPaid: monthRepayments.filter(r => !r.isDeposit).reduce((sum, r) => sum + r.interestPaid, 0),
          monthInterest: monthRepayments.filter(r => !r.isDeposit).reduce((sum, r) => sum + r.interestPaid, 0),
          ...groupFinancials,
          totalSavings: groupFinancials.totalGroupSavings,
          totalSavingsCollected: groupFinancials.totalGroupSavings,
          totalPrincipalRepaid: groupFinancials.totalPrincipalRepaid,
          totalInterestPaid: groupFinancials.totalInterestPaid,
          totalInterestCollected: groupFinancials.totalInterestPaid,
          currentMonthlyInterest: groupFinancials.currentMonthlyInterest,
          outstandingPrincipal: groupFinancials.activeLoansOutstanding,
          activeLoans: groupFinancials.activeLoansOutstanding,
          totalGroupFund: groupFinancials.totalGroupFund,
          availableBalance: groupFinancials.availableBalance,
          availableGroupBalance: groupFinancials.availableBalance,
          totalPaidMembers: collections.filter(c => c.status === 'PAID').length,
          totalPendingMembers: collections.filter(c => c.status === 'PENDING').length
        },
        collections,
        savingsTransactions: monthSavings
      };
    } catch (err) {
      console.error('Failed to generate monthly report from Firestore:', err);
      return { success: false };
    }
  },

  /**
   * Pending Dues Report (Calculated on Frontend)
   */
  getPendingDuesReport: async (month, year, search = '', groupId = DEFAULT_GROUP_ID) => {
    try {
      const { activeMembers, contributions, loans } = await reportService._getBaselineData(groupId);
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);

      const duesList = activeMembers.map(mem => {
        const paid = contributions.some(s => s.memberId === mem.id && number(s.month) === m && number(s.year) === y);
        const loan = loans.find(l => l.memberId === mem.id && l.status === 'ACTIVE');

        const outstandingPrincipal = loan ? loan.pendingPrincipal : 0;
        const pendingHafta = paid ? 0 : number(mem.monthlyContribution || 1000);
        const pendingInterest = Math.round(outstandingPrincipal * 0.02 * 100) / 100;

        return {
          memberId: mem.id,
          memberName: mem.name,
          memberCode: mem.memberCode,
          pendingHafta,
          outstandingPrincipal,
          pendingInterest,
          totalPending: pendingHafta + outstandingPrincipal + pendingInterest,
          isPending: pendingHafta > 0 || outstandingPrincipal > 0
        };
      }).filter(m => m.isPending);

      let filtered = duesList;
      if (search) {
        const s = search.toLowerCase();
        filtered = duesList.filter(d => d.memberName.toLowerCase().includes(s) || d.memberCode.toLowerCase().includes(s));
      }

      return {
        success: true,
        duesList: filtered,
        summary: {
          totalPendingMembers: filtered.length,
          totalPendingAmount: filtered.reduce((sum, d) => sum + d.totalPending, 0)
        }
      };
    } catch (err) {
      console.error('Failed to fetch pending dues from Firestore:', err);
      return { success: false };
    }
  },

  /**
   * Loans Overview Report (Direct Read)
   */
  getLoansOverviewReport: async (groupId = DEFAULT_GROUP_ID) => {
    try {
      const { loans, repayments } = await reportService._getBaselineData(groupId);
      const totalPrincipalDisbursed = loans.reduce((sum, l) => sum + number(l.originalPrincipal ?? l.principalAmount), 0);
      const totalPrincipalCollected = repayments.reduce((sum, r) => sum + number(r.principalPaid), 0);
      const totalInterestCollected = repayments.reduce((sum, r) => sum + number(r.interestPaid), 0);
      const totalOutstanding = Math.max(0, totalPrincipalDisbursed - totalPrincipalCollected);
      const currentMonthlyInterest = Math.round(totalOutstanding * 0.02 * 100) / 100;

      const enrichedLoans = loans.map(l => {
        const loanRepayments = repayments.filter(r => r.loanId === l.id || r.loan_id === l.id);
        const princPaid = loanRepayments.reduce((sum, r) => sum + r.principalPaid, 0);
        const intPaid = loanRepayments.reduce((sum, r) => sum + r.interestPaid, 0);
        const totalPrincipalPaid = princPaid > 0 ? princPaid : (l.totalPrincipalPaid || 0);
        const totalInterestPaid = intPaid > 0 ? intPaid : (l.totalInterestPaid || 0);
        const outstanding = Math.max(0, (l.originalPrincipal || l.principalAmount) - totalPrincipalPaid);
        return {
          ...l,
          total_principal_paid: totalPrincipalPaid,
          totalPrincipalPaid,
          total_interest_paid: totalInterestPaid,
          totalInterestPaid,
          outstanding_amount: outstanding,
          outstandingAmount: outstanding,
          pendingPrincipal: outstanding,
          repayments_count: loanRepayments.length > 0 ? loanRepayments.length : (l.repayments?.length || 0),
          status: outstanding <= 0 ? 'CLOSED' : 'ACTIVE'
        };
      });

      return {
        success: true,
        loans: enrichedLoans,
        summary: {
          totalLoans: loans.length,
          totalLoansCount: loans.length,
          totalPrincipalDisbursed,
          totalPrincipalCollected,
          totalPrincipalRecovered: totalPrincipalCollected,
          totalInterestCollected,
          totalInterestPaid: totalInterestCollected,
          totalInterestEarned: totalInterestCollected,
          totalOutstanding,
          activeLoans: totalOutstanding,
          currentMonthlyInterest,
        }
      };
    } catch (err) {
      console.error('Failed to fetch loans overview from Firestore:', err);
      return { success: false };
    }
  },

  /**
   * Monthly Balance Report (Taaleband) - Dynamic from Live Firestore Records
   * Strictly matches the 8-column Bachat Gat Physical Register format.
   * Inclusive Date-Range Filtering with Partial-Month and Running Available Balance support.
   */
  getDateWiseBachatGatTaalebandReport: async (fromDate, toDate, groupId = DEFAULT_GROUP_ID) => {
    try {
      const { contributions, loans, repayments, group } = await reportService._getBaselineData(groupId);

      const currentYear = new Date().getFullYear();
      const startStr = normalizeToYYYYMMDD(fromDate, `${currentYear}-01-01`);
      const endStr = normalizeToYYYYMMDD(toDate, `${currentYear}-12-31`);

      // Classify and normalize transaction records with timezone-immune YYYY-MM-DD strings
      const datedSavings = contributions.map(s => ({
        ...s,
        dateStr: resolveRecordDateString(s, 10),
        amount: number(s.paidAmount || s.amount),
      }));

      const isBaselineLoan = (l) => Boolean(
        (l.id && l.id.startsWith('L_REG_')) ||
        l.isOpeningLoan ||
        l.isBaseline ||
        l.isImported
      );

      const datedLoans = loans.filter(l => (l.status || '').toUpperCase() !== 'REJECTED').map(l => ({
        ...l,
        dateStr: resolveRecordDateString(l, 10),
        principal: number(l.originalPrincipal || l.principalAmount),
      }));

      const datedRepayments = repayments.map(r => {
        // Genuine loan capital deposits / lump-sum closures / bank loans vs regular monthly installments
        const isDeposit = Boolean(
          r.isLumpSum ||
          r.isPrepayment ||
          r.transactionType === 'LOAN_DEPOSIT' ||
          r.type === 'LOAN_DEPOSIT' ||
          r.transactionType === 'BANK_LOAN' ||
          r.type === 'BANK_LOAN' ||
          r.type === 'LUMP_SUM_LOAN_PAYMENT' ||
          r.type === 'LOAN_PREPAYMENT'
        );
        return {
          ...r,
          dateStr: resolveRecordDateString(r, 10),
          principal: number(r.principalPaid || r.principalAmount),
          interest: number(r.interestPaid || r.interestAmount),
          isDeposit,
        };
      });

      // Inclusive date filtering: only records whose actual transaction date falls within [startStr, endStr]
      const filteredSavings = datedSavings.filter(s => s.dateStr >= startStr && s.dateStr <= endStr);
      const filteredLoans = datedLoans.filter(l => l.dateStr >= startStr && l.dateStr <= endStr && !isBaselineLoan(l));
      const filteredRepayments = datedRepayments.filter(r => r.dateStr >= startStr && r.dateStr <= endStr);

      // Collect all distinct active month keys (YYYY-MM) present within the selected date range
      const activeMonthKeysSet = new Set();
      filteredSavings.forEach(s => activeMonthKeysSet.add(s.dateStr.substring(0, 7)));
      filteredLoans.forEach(l => activeMonthKeysSet.add(l.dateStr.substring(0, 7)));
      filteredRepayments.forEach(r => activeMonthKeysSet.add(r.dateStr.substring(0, 7)));

      const activeMonthKeys = Array.from(activeMonthKeysSet).sort();

      // Prior cash balance before startStr (Opening Balance for range)
      const priorSavings = datedSavings.filter(s => s.dateStr < startStr).reduce((sum, s) => sum + s.amount, 0);
      const priorRepayments = datedRepayments.filter(r => r.dateStr < startStr);
      const priorPrincipalRepaid = priorRepayments.filter(r => !r.isDeposit).reduce((sum, r) => sum + r.principal, 0);
      const priorLoanDeposits = priorRepayments.filter(r => r.isDeposit).reduce((sum, r) => sum + r.principal, 0);
      const priorInterestPaid = priorRepayments.reduce((sum, r) => sum + r.interest, 0);
      const priorDisbursed = datedLoans.filter(l => l.dateStr < startStr && !isBaselineLoan(l)).reduce((sum, l) => sum + l.principal, 0);

      let runningBalance = Math.round((priorSavings + priorLoanDeposits + priorPrincipalRepaid + priorInterestPaid - priorDisbursed) * 100) / 100;

      // Build report rows month-wise chronologically
      const reportRows = activeMonthKeys.map((mKey, idx) => {
        const [yearStr, monthStr] = mKey.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);

        // 1. Column: निधी जमा (Savings contributions in this month and in selected date range)
        const fundDeposit = filteredSavings
          .filter(s => s.dateStr.startsWith(mKey))
          .reduce((sum, s) => sum + s.amount, 0);

        // 2. Column: कर्ज जमा (Genuine loan deposit / lump-sum prepayment / bank loan)
        const rawLoanDeposit = filteredRepayments
          .filter(r => r.dateStr.startsWith(mKey) && r.isDeposit)
          .reduce((sum, r) => sum + r.principal, 0);
        const loanDeposit = Number.isFinite(Number(rawLoanDeposit)) ? Number(rawLoanDeposit) : 0;

        // 3. Column: हप्ता जमा (Regular installment principal repayment)
        const haptaPaid = filteredRepayments
          .filter(r => r.dateStr.startsWith(mKey) && !r.isDeposit)
          .reduce((sum, r) => sum + r.principal, 0);

        // 4. Column: व्याज जमा (Actual interest collected)
        const interestPaid = filteredRepayments
          .filter(r => r.dateStr.startsWith(mKey))
          .reduce((sum, r) => sum + r.interest, 0);

        // 5. Column: कर्ज वाटप (Genuine new loan principal disbursed)
        const loanDisbursed = filteredLoans
          .filter(l => l.dateStr.startsWith(mKey))
          .reduce((sum, l) => sum + l.principal, 0);

        // 6. Column: एकूण शिल्लक (Running Available Balance at end of this period)
        // Exact cash accounting formula:
        // Closing Balance = Opening Balance + Total Inflow - Total Outflow
        // Opening Balance of Month N+1 = Closing Balance of Month N
        const monthNetCash = fundDeposit + loanDeposit + haptaPaid + interestPaid - loanDisbursed;
        runningBalance = Math.round((runningBalance + monthNetCash) * 100) / 100;

        // 7. Column: तारीख (Actual transaction/meeting date in DD/MM/YYYY)
        const monthTxDates = [
          ...filteredSavings.filter(s => s.dateStr.startsWith(mKey)).map(s => s.dateStr),
          ...filteredLoans.filter(l => l.dateStr.startsWith(mKey)).map(l => l.dateStr),
          ...filteredRepayments.filter(r => r.dateStr.startsWith(mKey)).map(r => r.dateStr),
        ].sort();

        const latestTxDate = monthTxDates.length > 0 ? monthTxDates[monthTxDates.length - 1] : `${yearStr}-${monthStr}-20`;
        const [dY, dM, dD] = latestTxDate.split('-');
        const dateLabel = `${dD}/${dM}/${dY}`;

        return {
          sr: idx + 1,
          month,
          year,
          dateLabel,
          fundDeposit,
          regularSavings: fundDeposit,
          regularHapta: fundDeposit,
          loanDeposit,
          haptaPaid,
          principalRepaid: haptaPaid,
          loanPrincipalRepaid: haptaPaid,
          loanPrincipalPaid: haptaPaid,
          interestPaid,
          loanDisbursed,
          totalBalance: runningBalance,
          availableBalance: runningBalance,
        };
      });

      // Period Transaction Totals (Sum of rows for the selected range)
      const totalFundDeposit = reportRows.reduce((sum, r) => sum + r.fundDeposit, 0);
      const totalLoanDeposit = reportRows.reduce((sum, r) => sum + r.loanDeposit, 0);
      const totalHaptaPaid = reportRows.reduce((sum, r) => sum + r.haptaPaid, 0);
      const totalInterestPaid = reportRows.reduce((sum, r) => sum + r.interestPaid, 0);
      const totalLoanDisbursed = reportRows.reduce((sum, r) => sum + r.loanDisbursed, 0);

      // Financial Position at the closing date of the selected range (up to endStr)
      const cumulativeSavingsAtEnd = datedSavings
        .filter(s => s.dateStr <= endStr)
        .reduce((sum, s) => sum + s.amount, 0);

      // Outstanding loan principal across all active loans as of the closing date (up to endStr)
      const repaymentsTillEnd = datedRepayments.filter(r => r.dateStr <= endStr);
      const activeLoansList = datedLoans.filter(l => {
        const isRejected = (l.status || '').toUpperCase() === 'REJECTED';
        const isDisbursedAfter = l.dateStr > endStr;
        return !isRejected && !isDisbursedAfter;
      });
      const closingOutstanding = activeLoansList.reduce((sum, l) => sum + calculateLoanOutstanding(l, repaymentsTillEnd), 0);
      const closingMonthlyInterest = Math.round(closingOutstanding * 0.02 * 100) / 100;
      const closingAvailableBalance = reportRows.length > 0 ? reportRows[reportRows.length - 1].totalBalance : runningBalance;
      const closingGroupFund = Math.round((closingAvailableBalance + closingOutstanding) * 100) / 100;

      // Footer ending balance reconciles to closing Available Balance
      const grandTotalBalance = closingAvailableBalance;

      return {
        success: true,
        groupName: group.name || 'श्री सदुबाबा युवा स्वयम सहाय्य बचतगट',
        address: group.address || 'कोल्हेवाडी रोड ,समनापूर,ता. संगमनेर,जि. अहमदनगर',
        phone: group.phone || '7020825028',
        email: group.email || 'sadubaba@gmail.com',
        reportRows,
        summary: {
          totalSavings: totalFundDeposit,
          allTimeSavings: cumulativeSavingsAtEnd,
          periodSavings: totalFundDeposit,
          totalFundDeposit,
          loanDisbursed: totalLoanDisbursed,
          totalLoanDisbursed,
          loanDeposit: totalLoanDeposit,
          totalLoanDeposit,
          principalRepaid: totalHaptaPaid,
          totalHaptaPaid,
          totalInterestPaid,
          currentMonthlyInterest: closingMonthlyInterest,
          outstandingPrincipal: closingOutstanding,
          activeLoans: closingOutstanding,
          totalGroupFund: closingGroupFund,
          availableBalance: closingAvailableBalance,
          finalAvailableBalance: closingAvailableBalance,
          grandTotalBalance,
        }
      };
    } catch (err) {
      console.error('Failed to generate Taaleband from Firestore:', err);
      return { success: false };
    }
  },

  getPrintableRegisterReport: async (month, year, groupId = DEFAULT_GROUP_ID) => {
    const res = await reportService.getMonthlyReport(month, year, groupId);
    return res.collections || [];
  },

  getMonthWiseBachatGatRegisterReport: async (month, year, memberId = '', loanId = '', groupId = DEFAULT_GROUP_ID) => {
    const res = await reportService.getMonthlyReport(month, year, groupId);
    let rows = res.collections || [];
    if (memberId) rows = rows.filter(r => r.memberId === memberId);
    return rows;
  },

  getNewBachatGatRegisterReport: async (month, year, memberFilter = '', groupId = DEFAULT_GROUP_ID) => {
    const res = await reportService.getMonthlyReport(month, year, groupId);
    let rows = res.collections || [];
    if (memberFilter) {
      const f = memberFilter.toLowerCase();
      rows = rows.filter(r => (r.memberName || '').toLowerCase().includes(f) || (r.memberId || '').toLowerCase().includes(f) || (r.memberCode || '').toLowerCase().includes(f));
    }
    return rows;
  },
};
