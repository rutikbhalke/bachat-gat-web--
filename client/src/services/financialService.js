/**
 * Centralized Financial Calculation Service (Client-Side)
 * Strictly enforces authoritative Bachat Gat business rules.
 */

export const LOAN_INTEREST_RATE = 1.0; // Enforced global business rule: 1%

export const number = (val) => Number(val) || 0;

/**
 * Calculate loan outstanding principal.
 */
export const calculateLoanOutstanding = (loan, repayments = []) => {
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
};

/**
 * Strict Reducing-Balance Interest Rule:
 * Formula: Current Outstanding Principal × (Interest Rate % / Month)
 * As principal outstanding decreases, monthly interest decreases proportionally.
 */
export const calculateLoanInterest = (outstandingPrincipal, rate = LOAN_INTEREST_RATE) => {
  const principal = Math.max(0, number(outstandingPrincipal));
  if (principal <= 0) return 0;
  const interestRate = Number(rate) || LOAN_INTEREST_RATE;
  return Math.round(((principal * interestRate) / 100) * 100) / 100;
};

/**
 * Calculate Available Balance with non-negative display rule.
 * Formula: Total Group Fund - Active Loans
 * User-facing balance is floored at 0: Math.max(0, rawBalance)
 */
export const calculateAvailableBalance = (totalGroupFund, activeLoans) => {
  const fund = number(totalGroupFund);
  const loans = number(activeLoans);
  const rawBalance = Math.round((fund - loans) * 100) / 100;
  const displayBalance = Math.max(0, rawBalance);
  return { rawBalance, displayBalance };
};

/**
 * Group Financial Summary
 */
export const calculateGroupFinancialSummary = (savings = [], loans = [], repayments = [], transactions = []) => {
  // 1. Total Group Savings = sum of actual paid regular contributions (strictly capped at expected share, matching Flutter)
  const totalGroupSavings = savings.reduce((sum, s) => {
    const rawPaid = number(s.actualRegularPaid ?? s.paidAmount ?? s.amount ?? s.paid_amount);
    const expected = number(s.expectedAmount ?? s.expected_amount ?? s.regularHaftaAmount ?? s.regular_hafta_amount ?? 1000);
    const actualPaid = (expected > 0 && rawPaid > expected) ? expected : rawPaid;
    return sum + actualPaid;
  }, 0);

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

  // Total actual principal repaid from regular installments
  const totalPrincipalRepaid = regularRepayments.reduce((sum, r) => {
    return sum + number(r.principalAmount ?? r.principalPaid ?? r.principal_amount ?? r.loanPrincipalPaid ?? 0);
  }, 0);

  // 2. Active Loans = sum of outstanding principal of ACTIVE loans (strictly loans where outstanding > 0)
  const activeLoansList = loans.filter((l) => {
    const outstanding = calculateLoanOutstanding(l, regularRepayments);
    const rawStatus = (l.status || '').toUpperCase();
    const isClosed = outstanding <= 0 || rawStatus === 'CLOSED' || rawStatus === 'REJECTED';
    return !isClosed && outstanding > 0;
  });

  const activeLoansOutstanding = activeLoansList.reduce((sum, l) => {
    return sum + calculateLoanOutstanding(l, regularRepayments);
  }, 0);

  // 3. Current Monthly Interest: Sum of each individual active loan's (outstanding × 2%)
  const currentMonthlyInterest = Math.round(
    activeLoansList.reduce((sum, l) => {
      const out = calculateLoanOutstanding(l, regularRepayments);
      const r = Number(l.interestRate || l.interest_rate || LOAN_INTEREST_RATE);
      return sum + calculateLoanInterest(out, r);
    }, 0) * 100
  ) / 100;

  // 4. Total Interest Paid / Collected: SUM of actual interest paid from all repayment records
  const totalInterestPaid = repayments.reduce((sum, r) => {
    return sum + number(r.interestAmount ?? r.interestPaid ?? r.interest_amount);
  }, 0);

  // 5. Baseline / Opening loans vs genuine new disbursements
  const isBaselineLoan = (l) => Boolean(
    (l.id && String(l.id).startsWith('L_REG_')) ||
    l.isOpeningLoan ||
    l.isBaseline ||
    l.isImported
  );

  const totalNewDisbursed = loans
    .filter(l => !isBaselineLoan(l) && (l.status || '').toUpperCase() !== 'REJECTED')
    .reduce((sum, l) => sum + number(l.originalPrincipal ?? l.principalAmount), 0);

  // Extract Diwali Bonus distribution payouts from transactions/ledger records (Cash Outflow)
  let totalBonusDistributed = 0;
  if (Array.isArray(transactions)) {
    const bonusTxs = transactions.filter(t =>
      t.type === 'DIWALI_BONUS_DISTRIBUTED' || t.action === 'DIWALI_BONUS_DISTRIBUTED'
    );
    if (bonusTxs.length > 0) {
      totalBonusDistributed = bonusTxs.reduce((sum, t) => sum + number(t.amount), 0);
    } else {
      totalBonusDistributed = transactions.reduce((sum, t) => sum + number(t.bonusAmount), 0);
    }
  } else if (typeof transactions === 'number') {
    totalBonusDistributed = transactions;
  } else if (transactions && typeof transactions === 'object') {
    totalBonusDistributed = number(transactions.totalBonusDistributed ?? transactions.amount);
  }
  totalBonusDistributed = Math.round(totalBonusDistributed * 100) / 100;

  // 6. Authoritative Cash Accounting:
  // Available Balance = Total Cash Inflow (Savings + Deposits + Principal Repaid + Interest) - Total Cash Outflow (Disbursements + Bonus Payouts)
  const totalCashInflow = totalGroupSavings + totalLoanDeposits + totalPrincipalRepaid + totalInterestPaid;
  const totalCashOutflow = totalNewDisbursed + totalBonusDistributed;
  const availableBalance = Math.max(0, Math.round((totalCashInflow - totalCashOutflow) * 100) / 100);

  // 7. Total Group Fund = Available Balance (Cash) + Active Loans Outstanding (Receivables)
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
    totalBonusDistributed,
    totalGroupFund,
    totalFund: totalGroupFund,
    rawAvailableBalance: availableBalance,
    availableBalance,
    activeLoansCount: activeLoansList.length,
  };
};

/**
 * Member Financial Summary
 */
export const calculateMemberFinancialSummary = (memberId, savings = [], loans = [], repayments = []) => {
  const memId = String(memberId);
  const mySavings = savings
    .filter(s => String(s.memberId || s.member_id) === memId)
    .reduce((sum, s) => {
      const rawPaid = number(s.actualRegularPaid ?? s.paidAmount ?? s.amount ?? s.paid_amount);
      const expected = number(s.expectedAmount ?? s.expected_amount ?? s.regularHaftaAmount ?? s.regular_hafta_amount ?? 1000);
      return sum + ((expected > 0 && rawPaid > expected) ? expected : rawPaid);
    }, 0);

  const myActiveLoans = loans.filter(l => {
    const match = String(l.memberId || l.member_id) === memId;
    const outstanding = calculateLoanOutstanding(l, repayments);
    const rawStatus = (l.status || '').toUpperCase();
    const isClosed = outstanding <= 0 || rawStatus === 'CLOSED' || rawStatus === 'REJECTED';
    return match && !isClosed && outstanding > 0;
  });

  const myLoanOutstanding = myActiveLoans.reduce((sum, l) => {
    return sum + calculateLoanOutstanding(l, repayments);
  }, 0);

  const myPrincipalRepaid = repayments
    .filter(r => String(r.memberId || r.member_id) === memId)
    .reduce((sum, r) => sum + number(r.principalAmount ?? r.principalPaid ?? r.principal_amount ?? r.loanPrincipalPaid ?? 0), 0);

  const myInterestPaid = repayments
    .filter(r => String(r.memberId || r.member_id) === memId)
    .reduce((sum, r) => sum + number(r.interestAmount ?? r.interestPaid ?? r.interest_amount), 0);

  const myPendingInterest = Math.round(
    myActiveLoans.reduce((sum, l) => {
      const out = calculateLoanOutstanding(l, repayments);
      const r = Number(l.interestRate || l.interest_rate || LOAN_INTEREST_RATE);
      return sum + calculateLoanInterest(out, r);
    }, 0) * 100
  ) / 100;

  return {
    mySavings,
    totalSavings: mySavings,
    myLoanOutstanding,
    activeLoanOutstanding: myLoanOutstanding,
    myPrincipalRepaid,
    totalPrincipalRepaid: myPrincipalRepaid,
    myInterestPaid,
    totalInterestPaid: myInterestPaid,
    myPendingInterest,
    currentMonthlyInterest: myPendingInterest,
    myActiveLoansCount: myActiveLoans.length,
  };
};

/**
 * Month-Wise Financial Summary
 */
export const calculateMonthlyFinancialSummary = (month, year, savings = [], loans = [], repayments = []) => {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  const monthSavings = savings.filter(s => number(s.month) === m && number(s.year) === y);
  const totalMonthSavings = monthSavings.reduce((sum, s) => {
    const rawPaid = number(s.actualRegularPaid ?? s.paidAmount ?? s.amount ?? s.paid_amount);
    const expected = number(s.expectedAmount ?? s.expected_amount ?? s.regularHaftaAmount ?? s.regular_hafta_amount ?? 1000);
    return sum + ((expected > 0 && rawPaid > expected) ? expected : rawPaid);
  }, 0);

  const monthRepayments = repayments.filter(r => {
    const rM = number(r.paymentMonth ?? r.month);
    const rY = number(r.paymentYear ?? r.year);
    return rM === m && rY === y;
  });

  const monthPrincipalPaid = monthRepayments.reduce((sum, r) => sum + number(r.principalAmount ?? r.principalPaid ?? r.loanPrincipalPaid), 0);
  const monthInterestPaid = monthRepayments.reduce((sum, r) => sum + number(r.interestAmount ?? r.interestPaid), 0);

  return {
    month: m,
    year: y,
    totalMonthSavings,
    monthPrincipalPaid,
    monthInterestPaid,
    savingsTransactions: monthSavings,
    repaymentsTransactions: monthRepayments,
  };
};

/**
 * Dynamic Demand Register Calculation for members
 */
export const calculateDemandRegister = (members = [], loans = [], repayments = [], month, year) => {
  const activeMembers = members.filter((member) => {
    const role = String(member.role || member.role_name || 'member').trim().toLowerCase();
    const status = String(member.status || 'ACTIVE').trim().toUpperCase();
    return role === 'member' && member.isActive !== false && status === 'ACTIVE';
  });

  return activeMembers.map((mem, idx) => {
    const memberId = mem.id || mem.memberId;
    const memberLoan = loans.find(l => {
      const match = (l.memberId === memberId || l.member_id === memberId);
      const outstanding = calculateLoanOutstanding(l, repayments);
      const rawStatus = (l.status || '').toUpperCase();
      return match && rawStatus !== 'CLOSED' && rawStatus !== 'REJECTED' && outstanding > 0;
    });
    
    let loanAmount = 0;
    let loanHafta = 0;
    let interest = 0;
    let instNumber = 0;
    const fund = number(mem.monthlyContribution || 1000);

    if (memberLoan) {
      loanAmount = number(memberLoan.originalPrincipal ?? memberLoan.principalAmount);
      const tenure = parseInt(memberLoan.durationMonths || memberLoan.duration_months || 10, 10) || 10;
      loanHafta = Math.round(loanAmount / tenure);
      const outstanding = calculateLoanOutstanding(memberLoan, repayments);
      interest = calculateLoanInterest(outstanding, memberLoan.interestRate || memberLoan.interest_rate || LOAN_INTEREST_RATE);
      instNumber = number(memberLoan.lastInstallmentPaid || 0) + 1;
    }

    const total = loanHafta + interest + fund;

    return {
      sr: idx + 1,
      id: memberId,
      memberId,
      name: mem.fullName || mem.name || `Member ${idx + 1}`,
      memberCode: mem.memberCode || `M-130-${String(idx + 1).padStart(2, '0')}`,
      loan: loanAmount,
      originalPrincipal: loanAmount,
      inst: instNumber,
      loanHafta,
      interest,
      fund,
      total,
      totalDemand: total,
      status: loanHafta > 0 ? 'ACTIVE_LOAN' : 'REGULAR',
    };
  });
};

/**
 * Dynamic Monthly Taaleband Calculation
 * Calculates authoritative running available balance matching physical Bachat Gat register.
 */
export const calculateTaaleband = (monthSequence = [], savings = [], loans = [], repayments = []) => {
  let runningCashBalance = 0;

  const isBaselineLoan = (l) => Boolean(
    (l.id && l.id.startsWith('L_REG_')) ||
    l.isOpeningLoan ||
    l.isBaseline ||
    l.isImported
  );

  return monthSequence.map((period, idx) => {
    const startOfMonth = new Date(period.year, period.month - 1, 1);
    const endOfMonth = new Date(period.year, period.month, 0, 23, 59, 59);

    const monthSavings = savings.filter(s => {
      const d = new Date(s.paymentDate || s.createdAt);
      return d >= startOfMonth && d <= endOfMonth;
    }).reduce((sum, s) => {
      const rawPaid = number(s.actualRegularPaid ?? s.paidAmount ?? s.amount ?? s.paid_amount);
      const expected = number(s.expectedAmount ?? s.expected_amount ?? s.regularHaftaAmount ?? s.regular_hafta_amount ?? 1000);
      return sum + ((expected > 0 && rawPaid > expected) ? expected : rawPaid);
    }, 0);

    const isRepayDeposit = (r) => Boolean(
      r.isLumpSum ||
      r.isPrepayment ||
      r.transactionType === 'LOAN_DEPOSIT' ||
      r.type === 'LOAN_DEPOSIT' ||
      r.transactionType === 'BANK_LOAN' ||
      r.type === 'BANK_LOAN' ||
      r.type === 'LUMP_SUM_LOAN_PAYMENT' ||
      r.type === 'LOAN_PREPAYMENT'
    );

    const rawLoanDeposit = repayments.filter(r => {
      const d = new Date(r.paymentDate || r.createdAt);
      return d >= startOfMonth && d <= endOfMonth && isRepayDeposit(r);
    }).reduce((sum, r) => sum + number(r.principalPaid ?? r.principalAmount), 0);
    const monthLoanDeposit = Number.isFinite(Number(rawLoanDeposit)) ? Number(rawLoanDeposit) : 0;

    const monthPrincipalPaid = repayments.filter(r => {
      const d = new Date(r.paymentDate || r.createdAt);
      return d >= startOfMonth && d <= endOfMonth && !isRepayDeposit(r);
    }).reduce((sum, r) => sum + number(r.principalPaid ?? r.principalAmount), 0);

    const monthInterestPaid = repayments.filter(r => {
      const d = new Date(r.paymentDate || r.createdAt);
      return d >= startOfMonth && d <= endOfMonth;
    }).reduce((sum, r) => sum + number(r.interestPaid ?? r.interestAmount), 0);

    // Only genuine new disbursements count as current-period cash outflows
    const monthLoanDisbursed = loans.filter(l => {
      const d = new Date(l.issueDate || l.loanDate || l.createdAt);
      return d >= startOfMonth && d <= endOfMonth && !isBaselineLoan(l) && (l.status || '').toUpperCase() !== 'REJECTED';
    }).reduce((sum, l) => sum + number(l.originalPrincipal ?? l.principalAmount), 0);

    const monthNetCash = monthSavings + monthLoanDeposit + monthPrincipalPaid + monthInterestPaid - monthLoanDisbursed;
    runningCashBalance = Math.round((runningCashBalance + monthNetCash) * 100) / 100;

    return {
      sr: idx + 1,
      month: period.month,
      year: period.year,
      dateLabel: `20/${String(period.month).padStart(2, '0')}/${period.year}`,
      fundDeposit: monthSavings,
      regularSavings: monthSavings,
      regularHapta: monthSavings,
      loanDeposit: monthLoanDeposit,
      haptaPaid: monthPrincipalPaid,
      principalRepaid: monthPrincipalPaid,
      loanPrincipalRepaid: monthPrincipalPaid,
      loanPrincipalPaid: monthPrincipalPaid,
      interestPaid: monthInterestPaid,
      loanDisbursed: monthLoanDisbursed,
      rawBalance: runningCashBalance,
      totalBalance: runningCashBalance,
      availableBalance: runningCashBalance,
    };
  });
};

export const financialService = {
  calculateLoanOutstanding,
  calculateLoanInterest,
  calculateAvailableBalance,
  calculateGroupFinancialSummary,
  calculateMemberFinancialSummary,
  calculateMonthlyFinancialSummary,
  calculateDemandRegister,
  calculateTaaleband,
};

export default financialService;
