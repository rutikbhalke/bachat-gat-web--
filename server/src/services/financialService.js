/**
 * Centralized Financial Calculation Service
 *
 * AUTHORITATIVE BUSINESS RULES:
 * 1. TOTAL GROUP SAVINGS = Sum of all regular member contributions (Savings).
 * 2. ACTIVE LOANS = Sum of OUTSTANDING PRINCIPAL of all ACTIVE loans (Outstanding > 0).
 * 3. INTEREST = 2% per month of the CURRENT TOTAL OUTSTANDING ACTIVE LOAN PRINCIPAL (Reducing Balance).
 * 4. TOTAL GROUP FUND = Cash Available + Active Loan Receivables (or Total Savings + Total Interest).
 * 5. AVAILABLE BALANCE = Total Inflows - Cash Disbursed.
 */

const LOAN_INTEREST_RATE = 2.0;

const number = (item) => Number(item) || 0;

/**
 * Calculates loan outstanding principal.
 */
function calculateLoanOutstanding(loan, repayments = []) {
  if (!loan) return 0;
  const original = number(loan.originalPrincipal ?? loan.principalAmount ?? loan.principal_amount);

  if (Array.isArray(repayments) && repayments.length > 0) {
    const loanIdStr = String(loan.id || loan.loanId || loan.loan_id || '');
    const loanRepayments = repayments.filter(r => {
      const rLoanId = String(r.loanId || r.loan_id || '');
      return loanIdStr && rLoanId === loanIdStr;
    });
    if (loanRepayments.length > 0) {
      const repaid = loanRepayments.reduce((sum, r) => sum + number(r.principalAmount ?? r.principalPaid ?? r.principal_amount ?? r.principal_repayment_amount ?? r.loanPrincipalPaid ?? 0), 0);
      return Math.max(0, Math.round((original - repaid) * 100) / 100);
    }
  }

  const explicit = loan.pendingPrincipal ?? loan.remainingAmount ?? loan.outstanding_amount;
  if (explicit !== undefined && explicit !== null) {
    return Math.max(0, Math.round(number(explicit) * 100) / 100);
  }

  const totalPaid = number(loan.totalPrincipalPaid ?? loan.total_principal_paid ?? loan.total_principal_repaid);
  if (totalPaid > 0) {
    return Math.max(0, Math.round((original - totalPaid) * 100) / 100);
  }

  return Math.max(0, Math.round(original * 100) / 100);
}

/**
 * Calculates reducing-balance monthly interest (2% of current outstanding principal).
 */
function calculateLoanInterest(outstandingPrincipal, rate = LOAN_INTEREST_RATE) {
  const principal = Math.max(0, number(outstandingPrincipal));
  if (principal <= 0) return 0;
  const interestRate = Number(rate) || LOAN_INTEREST_RATE;
  return Math.round(((principal * interestRate) / 100) * 100) / 100;
}

/**
 * Calculates the complete financial summary for a group based on raw database records.
 * @param {Array} savings - List of savings records
 * @param {Array} loans - List of loan records
 * @param {Array} repayments - List of repayment records
 * @returns {Object} The financial summary
 */
function calculateGroupFinancialSummary(savings = [], loans = [], repayments = []) {
  // 1. TOTAL GROUP SAVINGS
  const totalGroupSavings = savings.reduce((sum, s) => sum + number(s.paidAmount ?? s.amount ?? s.paid_amount), 0);

  const isRepayDeposit = (r) => Boolean(
    r.isDeposit ||
    r.isLumpSum ||
    r.isPrepayment ||
    r.transactionType === 'LOAN_DEPOSIT' ||
    r.type === 'LOAN_DEPOSIT' ||
    r.transactionType === 'BANK_LOAN' ||
    r.type === 'BANK_LOAN' ||
    r.type === 'LUMP_SUM_LOAN_PAYMENT' ||
    r.type === 'LOAN_PREPAYMENT'
  );

  const regularRepayments = repayments.filter(r => !isRepayDeposit(r));
  const loanDepositRecords = repayments.filter(r => isRepayDeposit(r));

  const totalLoanDeposits = loanDepositRecords.reduce((sum, r) => {
    return sum + number(r.principalAmount ?? r.principalPaid ?? r.amount);
  }, 0);

  const totalPrincipalRepaid = regularRepayments.reduce((sum, r) => {
    return sum + number(r.principalAmount ?? r.principalPaid ?? r.principal_amount ?? r.loanPrincipalPaid ?? 0);
  }, 0);

  // 2. ACTIVE LOANS (strictly loans where outstanding > 0 and not closed)
  const activeLoansList = loans.filter((l) => {
    const outstanding = calculateLoanOutstanding(l, regularRepayments);
    const rawStatus = (l.status || '').toUpperCase();
    const isClosed = outstanding <= 0 || rawStatus === 'CLOSED' || rawStatus === 'REJECTED' || rawStatus === 'CANCELLED';
    return !isClosed && outstanding > 0;
  });

  const activeLoansOutstanding = activeLoansList.reduce((sum, l) => {
    return sum + calculateLoanOutstanding(l, regularRepayments);
  }, 0);

  // 3. CURRENT MONTHLY INTEREST (Strict Reducing Balance: Sum of each active loan's outstanding * 2%)
  const currentMonthlyInterest = Math.round(
    activeLoansList.reduce((sum, l) => {
      const out = calculateLoanOutstanding(l, regularRepayments);
      const r = Number(l.interestRate || l.interest_rate || LOAN_INTEREST_RATE);
      return sum + calculateLoanInterest(out, r);
    }, 0) * 100
  ) / 100;

  // 4. TOTAL INTEREST PAID (SUM of actual interest collected from all repayments)
  const totalInterestPaid = repayments.reduce((sum, r) => {
    return sum + number(r.interestAmount ?? r.interestPaid ?? r.interest_amount);
  }, 0);

  // 5. Baseline / Opening loans vs new disbursements
  const isBaselineLoan = (l) => Boolean(
    (l.id && String(l.id).startsWith('L_REG_')) ||
    l.isOpeningLoan ||
    l.isBaseline ||
    l.isImported
  );

  const totalNewDisbursed = loans
    .filter(l => !isBaselineLoan(l) && (l.status || '').toUpperCase() !== 'REJECTED')
    .reduce((sum, l) => sum + number(l.originalPrincipal ?? l.principalAmount), 0);

  // 6. AVAILABLE BALANCE
  const totalCashInflow = totalGroupSavings + totalLoanDeposits + totalPrincipalRepaid + totalInterestPaid;
  const availableBalance = Math.max(0, Math.round((totalCashInflow - totalNewDisbursed) * 100) / 100);

  // 7. TOTAL GROUP FUND
  const totalGroupFund = Math.round((availableBalance + activeLoansOutstanding) * 100) / 100;

  return {
    totalGroupSavings,
    totalSavings: totalGroupSavings,
    totalLoanDeposits,
    loanDeposit: totalLoanDeposits,
    totalPrincipalRepaid,
    principalRepaid: totalPrincipalRepaid,
    activeLoansOutstanding,
    activeLoans: activeLoansOutstanding,
    currentMonthlyInterest,
    totalInterestPaid,
    totalInterestCollected: totalInterestPaid,
    totalInterest: totalInterestPaid,
    totalGroupFund,
    totalFund: totalGroupFund,
    rawAvailableBalance: availableBalance,
    availableBalance,
    activeLoansCount: activeLoansList.length
  };
}

/**
 * Calculates financial state for a specific member.
 */
function calculateMemberFinancialSummary(memberId, savings = [], loans = [], repayments = []) {
  const memId = String(memberId);
  const memberSavings = savings
    .filter(s => String(s.memberId || s.member_id) === memId)
    .reduce((sum, s) => sum + number(s.paidAmount ?? s.amount ?? s.paid_amount), 0);

  const memberLoans = loans.filter(l => {
    const matchesMember = String(l.memberId || l.member_id) === memId;
    const outstanding = calculateLoanOutstanding(l, repayments);
    const rawStatus = (l.status || '').toUpperCase();
    const isClosed = outstanding <= 0 || rawStatus === 'CLOSED' || rawStatus === 'REJECTED' || rawStatus === 'CANCELLED';
    return matchesMember && !isClosed && outstanding > 0;
  });

  const activeLoanDues = memberLoans.reduce((sum, l) => {
    return sum + calculateLoanOutstanding(l, repayments);
  }, 0);

  // Interest Paid = actual interest payments recorded for that member.
  const interestPaid = repayments
    .filter(r => String(r.memberId || r.member_id) === memId)
    .reduce((sum, r) => sum + number(r.interestAmount ?? r.interestPaid ?? r.interest_amount), 0);

  // Current Pending Interest for member (Reducing balance: 2% of current active loan dues)
  const currentPendingInterest = Math.round(
    memberLoans.reduce((sum, l) => {
      const out = calculateLoanOutstanding(l, repayments);
      const r = Number(l.interestRate || l.interest_rate || LOAN_INTEREST_RATE);
      return sum + calculateLoanInterest(out, r);
    }, 0) * 100
  ) / 100;

  return {
    mySavings: memberSavings,
    myLoanOutstanding: activeLoanDues,
    myInterestPaid: interestPaid,
    myPendingInterest: currentPendingInterest,
    myActiveLoansCount: memberLoans.length
  };
}

/**
 * Generates a month-wise balance report for a date range.
 */
function calculateMonthlyBalanceReport(savings = [], loans = [], repayments = [], fromDate, toDate) {
  const start = new Date(fromDate);
  const end = new Date(toDate);

  // Group by calendar month (Rule 7)
  const monthSequence = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    monthSequence.push({
      month: current.getMonth() + 1,
      year: current.getFullYear(),
      label: current.toLocaleString('default', { month: 'long', year: 'numeric' })
    });
    current.setMonth(current.getMonth() + 1);
  }

  // Pre-calculate all events with normalized fields
  const allSavings = savings.map(s => {
    const sMonth = number(s.paymentMonth || s.payment_month || s.month);
    const sYear = number(s.paymentYear || s.payment_year || s.year);
    const date = (sMonth && sYear) ? new Date(sYear, sMonth - 1, 15) : new Date(s.paymentDate || s.createdAt || `${sYear || 2026}-${sMonth || 1}-01`);
    return { ...s, date };
  });
  const allLoans = loans.filter(l => l.status !== 'REJECTED' && l.status !== 'CANCELLED').map(l => ({ ...l, date: new Date(l.issueDate || l.loanDate || l.createdAt) }));
  const allRepayments = repayments.map(r => {
    const rMonth = number(r.paymentMonth || r.payment_month || r.month);
    const rYear = number(r.paymentYear || r.payment_year || r.year);
    const date = (rMonth && rYear) ? new Date(rYear, rMonth - 1, 15) : new Date(r.paymentDate || r.createdAt || `${rYear || 2026}-${rMonth || 1}-01`);
    return { ...r, date };
  });

  const reportRows = monthSequence.map(period => {
    const startOfMonth = new Date(period.year, period.month - 1, 1);
    const endOfMonth = new Date(period.year, period.month, 0, 23, 59, 59);

    // Monthly delta (cash movements)
    const monthSavings = allSavings.filter(s => s.date >= startOfMonth && s.date <= endOfMonth)
      .reduce((sum, s) => sum + number(s.amount || s.paidAmount || s.paid_amount), 0);

    const monthPrincipalPaid = allRepayments.filter(r => r.date >= startOfMonth && r.date <= endOfMonth)
      .reduce((sum, r) => sum + number(r.principalAmount || r.principal_repayment_amount || r.principalPaid || r.principal_amount), 0);

    const monthInterestPaid = allRepayments.filter(r => r.date >= startOfMonth && r.date <= endOfMonth)
      .reduce((sum, r) => sum + number(r.interestAmount || r.interest_amount || r.interestPaid), 0);

    const monthLoanDisbursed = allLoans.filter(l => l.date >= startOfMonth && l.date <= endOfMonth)
      .reduce((sum, l) => sum + number(l.principalAmount || l.principal_amount), 0);

    // cumulative snapshot totals (for valuation-based balance)
    const totalSavingsTillNow = allSavings.filter(s => s.date <= endOfMonth)
      .reduce((sum, s) => sum + number(s.amount || s.paidAmount || s.paid_amount), 0);

    const totalDisbursedTillNow = allLoans.filter(l => l.date <= endOfMonth)
      .reduce((sum, l) => sum + number(l.principalAmount || l.principal_amount), 0);

    const totalPrincipalPaidTillNow = allRepayments.filter(r => r.date <= endOfMonth)
      .reduce((sum, r) => sum + number(r.principalAmount || r.principal_repayment_amount || r.principalPaid || r.principal_amount), 0);

    const outstandingPrincipal = Math.max(0, totalDisbursedTillNow - totalPrincipalPaidTillNow);

    // Rule 3: Interest valuation (Authoritative snapshot rule: 2% of Current Outstanding)
    const interestSnapshot = Math.round(outstandingPrincipal * 0.02 * 100) / 100;

    // Rule 5: Available Balance = Total Fund - Active Loans
    // Formula: (Total Savings + 0.02*Outstanding) - Outstanding = Total Savings - 0.98*Outstanding
    const balance = Math.round((totalSavingsTillNow + interestSnapshot - outstandingPrincipal) * 100) / 100;

    return {
      month: period.month,
      year: period.year,
      dateLabel: period.label,
      regularSavings: monthSavings,    // Strict Separation: Regular monthly savings
      fundDeposit: monthSavings,       // column: निधी जमा (Savings)
      principalRepaid: monthPrincipalPaid, // Strict Separation: Loan principal repaid
      loanPrincipalRepaid: monthPrincipalPaid,
      loanDeposit: monthPrincipalPaid, // column: कर्ज जमा (Principal Repayment)
      haptaPaid: 0,                    // column: हप्ता जमा (Reserved/Lumpsum - never combines savings with principal)
      interestPaid: monthInterestPaid, // column: व्याज जमा (Interest Repayment)
      loanDisbursed: monthLoanDisbursed, // column: कर्ज वाटप (Loan Disbursed)
      availableBalance: balance,       // column: उपलब्ध शिल्लक (Available Balance)
      totalBalance: balance,           // column: एकूण शिल्लक (Available Balance Valuation)
      outstandingPrincipal,
      totalInterest: interestSnapshot,
      totalGroupFund: totalSavingsTillNow + interestSnapshot
    };
  });

  // Final totals row summary
  const lastRow = reportRows[reportRows.length - 1] || {};

  return {
    reportRows,
    summary: {
      totalSavings: allSavings.filter(s => s.date <= end).reduce((sum, s) => sum + number(s.amount || s.paidAmount || s.paid_amount), 0),
      totalDisbursed: allLoans.filter(l => l.date <= end).reduce((sum, l) => sum + number(l.principalAmount || l.principal_amount), 0),
      totalPrincipalPaid: allRepayments.filter(r => r.date <= end).reduce((sum, r) => sum + number(r.principalAmount || r.principal_repayment_amount || r.principalPaid || r.principal_amount), 0),
      finalOutstanding: lastRow.outstandingPrincipal || 0,
      finalInterest: lastRow.totalInterest || 0,
      finalGroupFund: lastRow.totalGroupFund || 0,
      finalAvailableBalance: lastRow.totalBalance || 0
    }
  };
}

/**
 * Generates member-wise collection demand for a specific month.
 */
function calculateMemberCollections(members = [], savings = [], loans = [], repayments = [], month, year) {
  return members.map(mem => {
    const memberId = mem.id;
    const activeLoan = loans.find(l => {
      const matches = (l.memberId === memberId || l.member_id === memberId);
      const out = calculateLoanOutstanding(l, repayments);
      const isClosed = out <= 0 || (l.status || '').toUpperCase() === 'CLOSED' || (l.status || '').toUpperCase() === 'REJECTED';
      return matches && !isClosed && out > 0;
    });
    const contrib = savings.find(s => (s.memberId === memberId || s.member_id === memberId) && number(s.month) === number(month) && number(s.year) === number(year));
    const repay = repayments.find(r => (r.memberId === memberId || r.member_id === memberId) && number(r.paymentMonth || r.month) === number(month) && number(r.paymentYear || r.year) === number(year));

    const originalLoan = activeLoan ? number(activeLoan.originalPrincipal || activeLoan.principalAmount) : 0;
    const outstandingAtStart = activeLoan ? calculateLoanOutstanding(activeLoan, repayments) : 0;

    let loanHafta = 0;
    let interestAmount = 0;
    let fundAmount = number(mem.monthlyContribution || 1000);
    let status = 'PENDING';

    // If already paid, use actuals
    if (repay || contrib) {
      loanHafta = number(repay?.principalAmount || repay?.principalPaid || 0);
      interestAmount = number(repay?.interestAmount || repay?.interestPaid || 0);
      fundAmount = number(repay?.regularHaftaAmount || contrib?.amount || contrib?.paidAmount || 1000);
      status = (loanHafta > 0 || interestAmount > 0 || (contrib && number(contrib.amount || contrib.paidAmount) >= number(mem.monthlyContribution || 1000))) ? 'PAID' : 'PARTIAL';
    } else if (activeLoan) {
      // Not paid, calculate DEMAND
      // Rule 3: Interest is exactly 2% of Outstanding (Reducing Balance)
      interestAmount = calculateLoanInterest(outstandingAtStart, activeLoan.interestRate || activeLoan.interest_rate || LOAN_INTEREST_RATE);
      // Standard rule of thumb: 10% of principal for installment
      loanHafta = Math.round(originalLoan / 10);
    }

    return {
      id: memberId,
      memberId,
      memberCode: mem.memberCode || mem.member_code,
      name: mem.fullName || mem.name,
      memberName: mem.fullName || mem.name,
      loan: originalLoan,
      inst: repay ? (repay.installmentNumber || 0) : (activeLoan ? (activeLoan.lastInstallmentPaid || 0) + 1 : 0),
      loanHafta,
      interest: interestAmount,
      interestAmount,
      fund: fundAmount,
      fundAmount,
      total: loanHafta + interestAmount + fundAmount,
      totalDemand: loanHafta + interestAmount + fundAmount,
      status,
      paymentDate: repay?.paymentDate || contrib?.paymentDate || null
    };
  });
}

module.exports = {
  LOAN_INTEREST_RATE,
  calculateLoanOutstanding,
  calculateLoanInterest,
  calculateGroupFinancialSummary,
  calculateMemberFinancialSummary,
  calculateMonthlyBalanceReport,
  calculateMemberCollections
};
