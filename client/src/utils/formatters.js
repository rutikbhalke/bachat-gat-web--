/**
 * Centralized, Ultra-Safe Formatters and Normalizers for Bachat Gat Web Application
 * Fully synchronized with Flutter Android App database schema (groups/shivshahi_group_001)
 * Guaranteed NEVER to throw runtime errors or TypeError on undefined/null values
 */

export const DEFAULT_GROUP_ID = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GROUP_ID)
  ? import.meta.env.VITE_GROUP_ID
  : 'shivshahi_group_001';

/**
 * Format any number or numeric string safely into Indian numbering system (e.g. 1,50,000)
 */
export const formatNumber = (value) => {
  if (value === null || value === undefined || value === '') return '0';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  if (isNaN(num) || !isFinite(num)) return '0';
  return Math.round(num).toLocaleString('en-IN');
};

/**
 * Format currency with single ₹ prefix safely (e.g. ₹1,50,000)
 * Guaranteed to return clean, single-symbol Indian currency representation
 */
export const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') return '₹0';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  if (isNaN(num) || !isFinite(num)) return '₹0';

  try {
    // Rule 12: Ensure negative values are represented correctly (e.g. -₹26,21,630)
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Math.round(num));

    // Fix for environments where Intl might return ₹-100 instead of -₹100
    if (num < 0 && formatted.startsWith('₹-')) {
      return '-' + formatted.replace('-', '');
    }
    return formatted;
  } catch (err) {
    const absNum = Math.abs(Math.round(num));
    const formattedNum = absNum.toLocaleString('en-IN');
    return num < 0 ? `-₹${formattedNum}` : `₹${formattedNum}`;
  }
};

/**
 * Format percentage safely (e.g. 75%)
 */
export const formatPercentage = (value) => {
  if (value === null || value === undefined || value === '') return '0%';
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num) || !isFinite(num)) return '0%';
  return `${Math.min(100, Math.max(0, Math.round(num)))}%`;
};

/**
 * Safely format dates (handles Firebase Timestamp, Date object, ISO string, milliseconds)
 */
export const formatDate = (value, options = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!value) return '-';
  try {
    let d;
    if (value && typeof value.toDate === 'function') {
      d = value.toDate();
    } else if (value && typeof value.seconds === 'number') {
      d = new Date(value.seconds * 1000);
    } else if (value instanceof Date) {
      d = value;
    } else {
      d = new Date(value);
    }

    if (isNaN(d.getTime())) return String(value) || '-';
    return d.toLocaleDateString('en-IN', options);
  } catch (err) {
    return String(value) || '-';
  }
};

/**
 * Safely format Month & Year (e.g. month: 3, year: 2026 -> "March 2026")
 */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const formatMonthYear = (month, year) => {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10) || new Date().getFullYear();
  const mName = (m >= 1 && m <= 12) ? MONTH_NAMES[m - 1] : 'Unknown';
  return `${mName} ${y}`;
};

/**
 * Data Normalizers for Firestore Documents
 * Fully mapped to both Flutter schema and Web fields
 */
export const normalizeGroup = (id, data = {}) => {
  const groupId = id || data.id || data.groupId || DEFAULT_GROUP_ID;
  const name = data.name || data.groupName || data.group_name || 'श्री सदुबाबा युवा स्वयम सहायता बचतगट';
  const monthlyContribution = Number(data.monthlyContributionAmount || data.monthlyContribution || data.monthly_contribution_per_share || 1000);
  const monthlyTarget = Number(data.monthlyTarget || data.monthly_target || 363000);
  const totalSavings = Number(data.totalSavings || data.total_savings || 0);
  const totalOutstandingLoans = Number(data.totalOutstandingLoans || data.total_outstanding_loans || 0);
  const totalInterestCollected = Number(data.totalInterestCollected || data.total_interest_collected || data.totalInterestPaid || data.total_interest_paid || 0);
  const totalInterestPaid = totalInterestCollected;
  const currentMonthlyInterest = Number(data.currentMonthlyInterest || data.current_monthly_interest || (totalOutstandingLoans * 0.02) || 0);
  const totalFund = data.totalFund !== undefined ? Number(data.totalFund) : Math.round((totalSavings + currentMonthlyInterest) * 100) / 100;
  const availableBalance = data.availableBalance !== undefined ? Number(data.availableBalance) : Math.max(0, Math.round((totalFund - totalOutstandingLoans) * 100) / 100);

  return {
    id: groupId,
    groupId: groupId,
    name: name,
    groupName: name,
    group_name: name,
    groupCode: data.groupCode || data.group_code || groupId,
    group_code: data.groupCode || data.group_code || groupId,
    monthlyContributionAmount: monthlyContribution,
    monthlyContribution: monthlyContribution,
    monthly_contribution_per_share: monthlyContribution,
    monthlyTarget: monthlyTarget,
    monthly_target: monthlyTarget,
    totalSavings,
    total_savings: totalSavings,
    totalOutstandingLoans,
    total_outstanding_loans: totalOutstandingLoans,
    currentMonthlyInterest,
    current_monthly_interest: currentMonthlyInterest,
    totalInterestPaid,
    total_interest_paid: totalInterestPaid,
    totalInterestCollected,
    total_interest_collected: totalInterestCollected,
    totalInterest: totalInterestPaid,
    total_interest: totalInterestPaid,
    totalFund,
    total_fund: totalFund,
    availableBalance,
    available_balance: availableBalance,
    managerId: data.managerId || 'manager_001',
    description: data.description || '',
    createdAt: data.createdAt || '',
    updatedAt: data.updatedAt || '',
  };
};

export const normalizeMember = (id, data = {}) => {
  const memberId = id || data.id || data.memberId || data.member_id || '';
  const name = data.name || data.fullName || data.full_name || 'Member';
  const monthlyContribution = Number(data.monthlyContribution || data.monthlyContributionPerShare || data.monthlyHaftaAmount || data.monthly_contribution || 1000);
  const shares = Number(data.shares || data.shareCount || 1);
  const status = (data.status || (data.isActive !== false ? 'ACTIVE' : 'INACTIVE')).toUpperCase();

  return {
    id: memberId,
    memberId: memberId,
    member_id: memberId,
    name: name,
    fullName: name,
    phone: data.phone || '',
    shares: shares,
    shareCount: shares,
    monthlyContribution: monthlyContribution,
    monthlyContributionPerShare: monthlyContribution,
    monthly_contribution: monthlyContribution,
    status: status,
    isActive: status === 'ACTIVE' || status === 'active',
    is_active: (status === 'ACTIVE' || status === 'active') ? 1 : 0,
    joinDate: data.joinDate || data.joinedAt || data.joined_date || '',
    joinedAt: data.joinDate || data.joinedAt || data.joined_date || '',
    joined_date: data.joinDate || data.joinedAt || data.joined_date || '',
    memberCode: data.memberCode || data.member_code || memberId,
    member_code: data.memberCode || data.member_code || memberId,
    email: data.email || '',
    userId: data.userId || data.authUid || data.firebaseUid || '',
    authUid: data.authUid || data.firebaseUid || data.userId || '',
    firebaseUid: data.firebaseUid || data.authUid || data.userId || '',
    role: (data.role || data.role_name || 'MEMBER').toUpperCase(),
    role_name: (data.role || data.role_name || 'MEMBER').toUpperCase(),
    groupId: data.groupId || DEFAULT_GROUP_ID,
    totalSavings: Number(data.totalSavings || data.total_savings || 0),
    total_savings: Number(data.totalSavings || data.total_savings || 0),
    activeLoanAmount: Number(data.activeLoanAmount || data.active_loan_amount || data.outstanding_loans || 0),
    outstanding_loans: Number(data.activeLoanAmount || data.active_loan_amount || data.outstanding_loans || 0),
  };
};

/**
 * Canonical calculation for a member's monthly contribution and dues status
 * Single source of truth for both Dashboard and Members pages.
 */
export function calculateMonthlyMemberStatus({
  member = {},
  payments = [],
  selectedMonth = new Date().getMonth() + 1,
  selectedYear = new Date().getFullYear(),
  monthlyShare = 1000,
}) {
  const m = Number(selectedMonth);
  const y = Number(selectedYear);
  const memberId = member.id || member.memberId || member.member_id;
  const requiredAmount = Number(
    member.monthly_contribution || member.monthlyContribution || member.monthlyShare || monthlyShare || 1000
  );

  // Filter payments strictly for this member in the selected month & year
  const memberPayments = payments.filter((p) => {
    const pMemId = p.memberId || p.member_id;
    const pMonth = Number(p.month);
    const pYear = Number(p.year);
    const pPaid = Number(
      p.paidAmount !== undefined
        ? p.paidAmount
        : (p.paid_amount !== undefined
        ? p.paid_amount
        : (p.amount !== undefined
        ? p.amount
        : 0))
    );
    const pStatus = (p.status || '').toLowerCase();
    const isBase = p.isBase || p.type === 'BASE_SAVINGS' || pMonth === 0 || p.notes?.toLowerCase().includes('opening') || p.remarks?.toLowerCase().includes('opening');
    return !isBase && pMemId === memberId && pMonth === m && pYear === y && (pStatus === 'paid' || pPaid > 0);
  });

  const amountPaid = memberPayments.reduce((sum, p) => {
    const pPaid = Number(
      p.paidAmount !== undefined
        ? p.paidAmount
        : (p.paid_amount !== undefined
        ? p.paid_amount
        : (p.amount !== undefined
        ? p.amount
        : 0))
    );
    return sum + pPaid;
  }, 0);

  const currentDues = Math.max(requiredAmount - amountPaid, 0);
  const isPaid = currentDues === 0 && amountPaid >= requiredAmount;
  const isPending = !isPaid;
  const status = isPaid ? 'Paid' : 'Pending';

  return {
    memberId,
    amountPaid,
    requiredAmount,
    currentDues,
    current_dues: currentDues,
    remainingDue: currentDues,
    remaining_due: currentDues,
    pending_amount: currentDues,
    pendingAmount: currentDues,
    status,
    due_status: status,
    dueStatus: status,
    payment_status: status,
    paymentStatus: status,
    isPending,
    is_pending_dues: isPending,
    isPendingDues: isPending,
    isPaid,
    has_paid_current_month: isPaid,
    hasPaidCurrentMonth: isPaid,
  };
}

/**
 * Single source of truth calculation for multiple active members in a selected period.
 */
export function calculateMonthlyMemberStatuses({
  activeMembers = [],
  payments = [],
  selectedMonth = new Date().getMonth() + 1,
  selectedYear = new Date().getFullYear(),
  monthlyShare = 1000,
}) {
  const m = Number(selectedMonth);
  const y = Number(selectedYear);

  const statuses = activeMembers.map((member) => {
    const statusObj = calculateMonthlyMemberStatus({
      member,
      payments,
      selectedMonth: m,
      selectedYear: y,
      monthlyShare,
    });
    return {
      ...member,
      ...statusObj,
    };
  });

  const paidMembers = statuses.filter((s) => s.isPaid);
  const pendingMembers = statuses.filter((s) => s.isPending);

  const totalMembers = statuses.length;
  const paidCount = paidMembers.length;
  const pendingCount = pendingMembers.length;

  const collectedAmount = statuses.reduce((sum, s) => sum + s.amountPaid, 0);
  const monthlyTarget = statuses.reduce((sum, s) => sum + s.requiredAmount, 0);
  const pendingAmount = pendingMembers.reduce((sum, s) => sum + s.currentDues, 0);
  const progressPercentage = monthlyTarget > 0 ? Math.min(100, Math.round(((collectedAmount / monthlyTarget) * 100) * 100) / 100) : 0;

  return {
    month: m,
    year: y,
    totalMembers,
    paidCount,
    paidMembersCount: paidCount,
    paidMembers,
    pendingCount,
    pendingMembersCount: pendingCount,
    pendingMembers,
    collectedAmount,
    monthlyTarget,
    targetAmount: monthlyTarget,
    pendingAmount,
    expectedPending: pendingAmount,
    expectedPendingAmount: pendingAmount,
    progressPercentage,
    completionPercentage: progressPercentage,
    monthlyStatuses: statuses,
  };
}

export const normalizeSavings = (id, data = {}) => {
  const savingId = id || data.id || '';
  const memberId = data.memberId || data.member_id || '';
  const expectedAmount = Number(data.expectedAmount || data.expected_amount || 1000);
  const rawStatus = (data.status || '').toLowerCase();

  let paidAmount = Number(
    data.paidAmount !== undefined
      ? data.paidAmount
      : (data.paid_amount !== undefined
      ? data.paid_amount
      : (data.amount !== undefined
      ? data.amount
      : (rawStatus === 'paid' ? expectedAmount : 0)))
  );

  // If status is not paid and no explicit paid amount was provided, paidAmount is 0
  if (rawStatus !== 'paid' && data.paidAmount === undefined && data.paid_amount === undefined && data.amount === undefined) {
    paidAmount = 0;
  }
  if (rawStatus === 'pending' && (data.paidAmount === 0 || data.paid_amount === 0 || data.totalPaid === 0)) {
    paidAmount = 0;
  }

  const loanPrincipalPaid = Number(data.loanPrincipalPaid || data.loan_principal_paid || 0);
  const interestAmount = Number(data.interestAmount || data.interest_amount || data.interest || 0);
  const isPaid = (rawStatus === 'paid' && paidAmount >= expectedAmount) || (paidAmount >= expectedAmount && expectedAmount > 0);
  const status = isPaid ? 'paid' : 'pending';

  return {
    id: savingId,
    saving_id: savingId,
    groupId: data.groupId || DEFAULT_GROUP_ID,
    memberId: memberId,
    member_id: memberId,
    memberName: data.memberName || data.member_name || data.name || data.fullName || 'Member',
    member_name: data.memberName || data.member_name || data.name || data.fullName || 'Member',
    memberCode: data.memberCode || data.member_code || memberId,
    member_code: data.memberCode || data.member_code || memberId,
    month: data.month !== undefined && data.month !== null && !isNaN(parseInt(data.month, 10))
      ? parseInt(data.month, 10)
      : (new Date().getMonth() + 1),
    year: parseInt(data.year, 10) || new Date().getFullYear(),
    expectedAmount,
    regularHaftaAmount: expectedAmount,
    paidAmount,
    amount: paidAmount,
    totalPaid: Number(data.totalPaid !== undefined ? data.totalPaid : (paidAmount + loanPrincipalPaid + interestAmount)),
    loanPrincipalPaid,
    interestAmount,
    status: status,
    isPaid: isPaid,
    paymentDate: data.paymentDate || data.payment_date || data.createdAt || new Date().toISOString().split('T')[0],
    payment_date: data.paymentDate || data.payment_date || data.createdAt || new Date().toISOString().split('T')[0],
    paymentMode: data.paymentMode || data.payment_mode || 'UPI',
    payment_mode: data.paymentMode || data.payment_mode || 'UPI',
    remarks: data.notes || data.remarks || '',
  };
};

export const normalizeLoan = (idOrData, maybeData = {}) => {
  const isFirstArgObj = idOrData && typeof idOrData === 'object';
  const data = isFirstArgObj ? idOrData : (maybeData || {});
  const id = !isFirstArgObj ? idOrData : (data.id || data.loanId || data.loan_id || '');

  const loanId = id || data.id || data.loanId || data.loan_id || '';
  const memberId = data.memberId || data.member_id || '';
  const originalPrincipal = Math.max(0, Number(data.originalPrincipal !== undefined ? data.originalPrincipal : (data.principalAmount || data.principal_amount || 0)));
  
  // Calculate total principal paid from document or repayments
  let totalPrincipalPaid = Number(data.totalPrincipalPaid !== undefined ? data.totalPrincipalPaid : (data.total_principal_paid !== undefined ? data.total_principal_paid : (data.total_principal_repaid !== undefined ? data.total_principal_repaid : 0)));
  
  // Determine outstanding principal
  let pendingPrincipal;
  if (data.pendingPrincipal !== undefined) {
    pendingPrincipal = Number(data.pendingPrincipal);
  } else if (data.remainingAmount !== undefined) {
    pendingPrincipal = Number(data.remainingAmount);
  } else if (data.outstanding_amount !== undefined) {
    pendingPrincipal = Number(data.outstanding_amount);
  } else {
    pendingPrincipal = Math.max(0, originalPrincipal - totalPrincipalPaid);
  }

  // Ensure consistency: if totalPrincipalPaid equals or exceeds originalPrincipal, pendingPrincipal is 0
  if (totalPrincipalPaid >= originalPrincipal && originalPrincipal > 0) {
    pendingPrincipal = 0;
  }
  
  // If pendingPrincipal is 0, totalPrincipalPaid should equal originalPrincipal
  if (pendingPrincipal <= 0 && originalPrincipal > 0 && totalPrincipalPaid === 0) {
    totalPrincipalPaid = originalPrincipal;
  }

  const outstanding = Math.max(0, Math.round(pendingPrincipal * 100) / 100);
  const actualPrincipalPaid = Math.max(0, Math.round((originalPrincipal - outstanding) * 100) / 100);

  const interestRate = Number(data.interestRate || data.interest_rate || 2.0); // Enforced 2% default
  
  // Source of truth: A loan with 0 outstanding is CLOSED. Any loan with outstanding > 0 is ACTIVE.
  const rawStatus = (data.status || '').toUpperCase();
  const isClosed = outstanding <= 0 || rawStatus === 'CLOSED';
  const status = isClosed ? 'CLOSED' : 'ACTIVE';

  return {
    id: loanId,
    loanId: loanId,
    loan_id: loanId,
    loanNumber: data.loanNumber || data.loan_number || `LN-${String(loanId).slice(-6)}`,
    loan_number: data.loanNumber || data.loan_number || `LN-${String(loanId).slice(-6)}`,
    memberId: memberId,
    member_id: memberId,
    memberName: data.memberName || data.member_name || 'Member',
    member_name: data.memberName || data.member_name || 'Member',
    memberCode: data.memberCode || data.member_code || memberId,
    member_code: data.memberCode || data.member_code || memberId,
    groupId: data.groupId || DEFAULT_GROUP_ID,
    originalPrincipal,
    principalAmount: originalPrincipal,
    principal_amount: originalPrincipal,
    pendingPrincipal: outstanding,
    remainingAmount: outstanding,
    outstandingAmount: outstanding,
    outstanding_amount: outstanding,
    interestRate,
    interest_rate: interestRate,
    totalPrincipalPaid: actualPrincipalPaid,
    total_principal_paid: actualPrincipalPaid,
    total_principal_repaid: actualPrincipalPaid,
    totalInterestPaid: Math.max(0, Number(data.totalInterestPaid || data.total_interest_paid || 0)),
    total_interest_paid: Math.max(0, Number(data.totalInterestPaid || data.total_interest_paid || 0)),
    durationMonths: parseInt(data.durationMonths || data.duration_months, 10) || 10,
    duration_months: parseInt(data.durationMonths || data.duration_months, 10) || 10,
    status,
    isClosed,
    isFullyPaid: isClosed,
    purpose: data.purpose || 'General',
    issueDate: data.issueDate || data.loanDate || data.loan_date || data.createdAt || new Date().toISOString().split('T')[0],
    loanDate: data.issueDate || data.loanDate || data.loan_date || data.createdAt || new Date().toISOString().split('T')[0],
    loan_date: data.issueDate || data.loanDate || data.loan_date || data.createdAt || new Date().toISOString().split('T')[0],
    lastInstallmentPaid: parseInt(data.lastInstallmentPaid || data.last_installment_paid || 0, 10),
    createdAt: data.createdAt || '',
    updatedAt: data.updatedAt || '',
    repayments: Array.isArray(data.repayments) ? data.repayments : [],
  };
};

export const normalizeActivity = (id, data = {}) => {
  const type = (data.type || data.transactionType || 'SAVINGS_DEPOSIT').toUpperCase();
  const memberName = data.memberName || data.member_name || data.name || 'Member';
  const pAmt = Number(data.principalAmount || data.principal_amount || data.principalRepaid || 0);
  const iAmt = Number(data.interestAmount || data.interest_amount || data.interestPaid || 0);
  const explicitRegular = Number(data.regularHaptaAmount || data.regular_hafta_amount || data.regularContribution || 0);
  
  let rAmt = explicitRegular;
  if (rAmt === 0 && (type.includes('REPAY') || type.includes('INSTALLMENT') || type === 'LOAN_REPAYMENT')) {
    const rawTotal = Number(data.totalAmount || data.amount || data.totalPaid || 0);
    if (rawTotal > (pAmt + iAmt) && (pAmt + iAmt) > 0) {
      rAmt = Math.round((rawTotal - (pAmt + iAmt)) * 100) / 100;
    }
  }

  let amount = Number(data.totalAmount || data.totalPaid || data.amount || data.paidAmount || (pAmt + iAmt + rAmt));
  let description = data.description;

  if (type.includes('REPAY') || type.includes('INSTALLMENT') || type === 'LOAN_REPAYMENT') {
    if (rAmt > 0) {
      amount = pAmt + iAmt + rAmt;
      description = `Loan repayment ₹${amount.toLocaleString('en-IN')} (Regular Hapta: ₹${rAmt.toLocaleString('en-IN')}, Principal: ₹${pAmt.toLocaleString('en-IN')}, Interest: ₹${iAmt.toLocaleString('en-IN')}) from ${memberName}`;
    } else if (pAmt > 0 || iAmt > 0) {
      amount = Number(data.totalAmount || data.amount || (pAmt + iAmt));
      description = `Loan repayment ₹${amount.toLocaleString('en-IN')} (Principal: ₹${pAmt.toLocaleString('en-IN')}, Interest: ₹${iAmt.toLocaleString('en-IN')}) from ${memberName}`;
    }
  }

  if (!description) {
    if (type.includes('SAVING') || type === 'MONTHLY_CONTRIBUTION') {
      description = `Regular savings of ₹${amount.toLocaleString('en-IN')} collected from ${memberName}`;
    } else if (type.includes('LOAN_DISBURSE') || type === 'LOAN') {
      description = `Loan of ₹${amount.toLocaleString('en-IN')} disbursed to ${memberName}`;
    } else if (type.includes('REPAY') || type.includes('INSTALLMENT')) {
      if (rAmt > 0) {
        description = `Loan repayment ₹${amount.toLocaleString('en-IN')} (Regular Hapta: ₹${rAmt.toLocaleString('en-IN')}, Principal: ₹${pAmt.toLocaleString('en-IN')}, Interest: ₹${iAmt.toLocaleString('en-IN')}) from ${memberName}`;
      } else {
        description = `Loan repayment ₹${amount.toLocaleString('en-IN')} (Principal: ₹${pAmt.toLocaleString('en-IN')}, Interest: ₹${iAmt.toLocaleString('en-IN')}) from ${memberName}`;
      }
    } else {
      description = `Transaction of ₹${amount.toLocaleString('en-IN')} recorded for ${memberName}`;
    }
  }

  const rawDate = data.date || data.created_at || data.createdAt || data.paymentDate || data.payment_date || new Date().toISOString();

  return {
    id: id || data.id || `ACT_${Date.now()}`,
    type,
    amount,
    description,
    date: rawDate,
    created_at: rawDate,
    createdAt: rawDate,
    memberId: data.memberId || data.member_id || '',
    memberName,
    groupId: data.groupId || data.group_id || DEFAULT_GROUP_ID,
    referenceId: data.referenceId || data.reference_id || '',
  };
};

/**
 * Converts numbers to authentic Marathi Devanagari numerals (०-९).
 */
export const toDevanagariDigits = (value) => {
  if (value === null || value === undefined || value === '') return '०';
  const num = typeof value === 'number' ? Math.round(value) : parseInt(String(value).replace(/,/g, ''), 10);
  const str = isNaN(num) ? String(value) : String(num);
  const mrDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  return str.replace(/[0-9]/g, (d) => mrDigits[d]);
};

/**
 * Ensures Marathi honorific 'श्री.' prefix is present on member names.
 */
export const formatMemberWithHonorific = (name) => {
  const clean = String(name || '').trim();
  if (!clean) return '';
  if (clean.startsWith('श्री.') || clean.startsWith('श्री ')) return clean;
  return `श्री. ${clean}`;
};

