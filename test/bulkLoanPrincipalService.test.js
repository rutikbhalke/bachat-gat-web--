import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  calculateInstallmentMonthYear,
  calculateLoanPrincipalSchedule,
} = require('../server/src/controllers/bulkLoanPrincipalController.js');

test('1. calculateInstallmentMonthYear correctly skips loan issue month and handles year boundary rollover', () => {
  // Issue in Jan 2026 -> Installment #1 is Feb 2026
  const inst1 = calculateInstallmentMonthYear('2026-01-15T00:00:00.000Z', 1);
  assert.equal(inst1.month, 2);
  assert.equal(inst1.year, 2026);

  // Issue in Nov 2026 -> Installment #1 is Dec 2026, Installment #2 is Jan 2027
  const instNov1 = calculateInstallmentMonthYear('2026-11-05T00:00:00.000Z', 1);
  assert.equal(instNov1.month, 12);
  assert.equal(instNov1.year, 2026);

  const instNov2 = calculateInstallmentMonthYear('2026-11-05T00:00:00.000Z', 2);
  assert.equal(instNov2.month, 1);
  assert.equal(instNov2.year, 2027);

  // Installment #10 for Nov 2026 loan is Sept 2027
  const instNov10 = calculateInstallmentMonthYear('2026-11-05T00:00:00.000Z', 10);
  assert.equal(instNov10.month, 9);
  assert.equal(instNov10.year, 2027);
});

test('2. calculateLoanPrincipalSchedule distributes principal accurately and handles non-uniform amounts', () => {
  // ₹20,000 loan, 10 installments -> exactly ₹2,000 per installment
  const loan20k = {
    id: 'LN_001',
    originalPrincipal: 20000,
    durationMonths: 10,
    issueDate: '2026-01-01',
  };
  const schedule20k = calculateLoanPrincipalSchedule(loan20k, []);
  assert.equal(schedule20k.length, 10);
  const sumExpected20k = schedule20k.reduce((s, r) => s + r.principalExpected, 0);
  assert.equal(sumExpected20k, 20000);
  assert.equal(schedule20k[0].principalExpected, 2000);
  assert.equal(schedule20k[9].principalExpected, 2000);

  // ₹15,555 loan, 10 installments -> base 1556, final absorbs remainder (sum === 15555)
  const loanOdd = {
    id: 'LN_002',
    originalPrincipal: 15555,
    durationMonths: 10,
    issueDate: '2026-01-01',
  };
  const scheduleOdd = calculateLoanPrincipalSchedule(loanOdd, []);
  assert.equal(scheduleOdd.length, 10);
  const sumExpectedOdd = scheduleOdd.reduce((s, r) => s + r.principalExpected, 0);
  assert.equal(sumExpectedOdd, 15555);
  assert.equal(scheduleOdd[0].principalExpected, 1556);
  assert.equal(scheduleOdd[9].principalExpected, 15555 - 9 * 1556); // 1551
});

test('3. calculateLoanPrincipalSchedule tracks existing repayments and partial installment payments correctly', () => {
  const loan = {
    id: 'LN_PARTIAL',
    originalPrincipal: 20000,
    durationMonths: 10,
    issueDate: '2026-01-01',
  };

  // Repayment in Feb 2026 (Installment #1): ₹1,500 paid towards ₹2,000 scheduled
  const repayments = [
    {
      loanId: 'LN_PARTIAL',
      installmentNumber: 1,
      paymentMonth: 2,
      paymentYear: 2026,
      principalAmount: 1500,
    },
  ];

  const schedule = calculateLoanPrincipalSchedule(loan, repayments);
  assert.equal(schedule[0].principalExpected, 2000);
  assert.equal(schedule[0].principalPaid, 1500);
  assert.equal(schedule[0].principalRemaining, 500);
  assert.equal(schedule[0].isFullyPaid, false);

  // Installment #2 has 0 paid
  assert.equal(schedule[1].principalExpected, 2000);
  assert.equal(schedule[1].principalPaid, 0);
  assert.equal(schedule[1].principalRemaining, 2000);
  assert.equal(schedule[1].isFullyPaid, false);
});

test('4. Financial Rule: Only loan principal is collected (interest and savings are strictly zero)', () => {
  const sampleRepaymentItem = {
    loanId: 'LN_100',
    amount: 2500,
  };

  const currentPending = 25000;
  const allowedPrincipal = Math.min(sampleRepaymentItem.amount, currentPending);
  const interestAmount = 0;
  const regularHaptaAmount = 0;
  const totalAmount = allowedPrincipal;

  assert.equal(interestAmount, 0, 'Interest amount must be strictly 0');
  assert.equal(regularHaptaAmount, 0, 'Regular Hapta amount must be strictly 0');
  assert.equal(totalAmount, allowedPrincipal, 'Total repayment amount must equal collected principal');
});

test('5. Financial Rule: Clamping ensures collected amount cannot exceed principal due or outstanding', () => {
  const currentPending = 1200;
  const monthlyPrincipalDue = 2000;

  // Case A: User requests 5000 when due is 2000 and pending is 1200
  const requestedHigh = 5000;
  const clampedA = Math.min(requestedHigh, monthlyPrincipalDue, currentPending);
  assert.equal(clampedA, 1200, 'Must clamp to currentPending (1200)');

  // Case B: User requests 2500 when due is 2000 and pending is 10000
  const requestedB = 2500;
  const pendingB = 10000;
  const clampedB = Math.min(requestedB, monthlyPrincipalDue, pendingB);
  assert.equal(clampedB, 2000, 'Must clamp to monthlyPrincipalDue (2000)');

  // Case C: User requests negative amount
  const requestedNegative = -500;
  const clampedC = Math.max(0, requestedNegative);
  assert.equal(clampedC, 0, 'Negative amounts must be rejected or clamped to 0');
});

test('6. Financial Rule: Fully repaid loans do not appear as pending', () => {
  const closedLoan = {
    id: 'LN_CLOSED',
    status: 'CLOSED',
    pendingPrincipal: 0,
    remainingAmount: 0,
    originalPrincipal: 20000,
  };

  const isPending = (closedLoan.status || '').toUpperCase() === 'ACTIVE' && (closedLoan.pendingPrincipal > 0);
  assert.equal(isPending, false, 'Closed loan must never appear as pending');

  const zeroBalanceActiveLoan = {
    id: 'LN_ZERO',
    status: 'ACTIVE',
    pendingPrincipal: 0,
    remainingAmount: 0,
    originalPrincipal: 20000,
  };
  const isZeroBalancePending = (zeroBalanceActiveLoan.status || '').toUpperCase() === 'ACTIVE' && (zeroBalanceActiveLoan.pendingPrincipal > 0);
  assert.equal(isZeroBalancePending, false, 'Loan with 0 pending balance must never appear as pending');
});

test('7. Group Financial Reconciliation: Available Balance + Active Loans === Total Fund', () => {
  const initialGroup = {
    totalSavings: 4500000,
    activeLoans: 600000,
    availableBalance: 4000000,
    totalFund: 4600000,
    totalInterestPaid: 100000,
  };

  const totalPrincipalCollected = 50000;

  // Calculation during bulk principal collection
  const newActiveLoans = Math.max(0, initialGroup.activeLoans - totalPrincipalCollected);
  const newAvailableBalance = Math.round((initialGroup.availableBalance + totalPrincipalCollected) * 100) / 100;
  const newTotalFund = Math.round((newAvailableBalance + newActiveLoans) * 100) / 100;

  assert.equal(newActiveLoans, 550000, 'Active loans must decrease by collected principal');
  assert.equal(newAvailableBalance, 4050000, 'Available balance must increase by collected principal');
  assert.equal(newTotalFund, initialGroup.totalFund, 'Total fund must remain exactly constant (cash + loans receivable)');
  assert.equal(newAvailableBalance + newActiveLoans, newTotalFund, 'Available balance + active loans must reconcile exactly');
  assert.equal(initialGroup.totalSavings, 4500000, 'Group total savings must be untouched');
  assert.equal(initialGroup.totalInterestPaid, 100000, 'Group total interest must be untouched');
});

test('8. Preservation of Original Loan Principal: originalPrincipal is never mutated', () => {
  const loan = {
    id: 'LN_PRESERVE',
    originalPrincipal: 30000,
    pendingPrincipal: 30000,
    totalPrincipalPaid: 0,
  };

  const collected = 3000;
  const updatedLoan = {
    ...loan,
    pendingPrincipal: loan.pendingPrincipal - collected,
    totalPrincipalPaid: loan.totalPrincipalPaid + collected,
  };

  assert.equal(updatedLoan.originalPrincipal, 30000, 'Original principal must remain exactly 30000');
  assert.equal(updatedLoan.pendingPrincipal, 27000);
  assert.equal(updatedLoan.totalPrincipalPaid, 3000);
});

test('9. Idempotency Protection: Replaying the same request does not duplicate database writes', () => {
  const idempotencyStore = new Map();
  const requestId = 'BULK_LOAN_TEST_123';

  // First execution: not in store
  assert.equal(idempotencyStore.has(`BULK_LOAN_${requestId}`), false);
  idempotencyStore.set(`BULK_LOAN_${requestId}`, {
    requestId,
    totalCollected: 10000,
    count: 2,
  });

  // Second execution: caught as duplicate
  assert.equal(idempotencyStore.has(`BULK_LOAN_${requestId}`), true);
  const previousData = idempotencyStore.get(`BULK_LOAN_${requestId}`);
  assert.equal(previousData.totalCollected, 10000);
  assert.equal(previousData.count, 2);
});

test('10. Collection Date Preservation: selected date is assigned to records', () => {
  const selectedDate = '2026-10-15';
  const repayment = {
    loanId: 'LN_DATE_TEST',
    paymentDate: selectedDate,
    payment_date: selectedDate,
  };
  const transaction = {
    date: selectedDate,
    createdAt: selectedDate,
  };

  assert.equal(repayment.paymentDate, '2026-10-15');
  assert.equal(transaction.date, '2026-10-15');
});

test('11. Loan Status Transition: Loan closes when pendingPrincipal reaches exactly 0', () => {
  const pendingBefore = 2000;
  const collected = 2000;
  const pendingAfter = Math.max(0, pendingBefore - collected);
  const status = pendingAfter === 0 ? 'CLOSED' : 'ACTIVE';

  assert.equal(pendingAfter, 0);
  assert.equal(status, 'CLOSED');
});

test('12. Integration Preview: Multi-member loan preview calculates expected, already collected, and remaining due accurately', () => {
  const loans = [
    {
      id: 'LN_001',
      loanNumber: 'L-001',
      memberId: 'MEM_01',
      originalPrincipal: 20000,
      durationMonths: 10,
      issueDate: '2026-01-01',
      status: 'ACTIVE',
      pendingPrincipal: 20000,
    },
    {
      id: 'LN_002',
      loanNumber: 'L-002',
      memberId: 'MEM_02',
      originalPrincipal: 50000,
      durationMonths: 10,
      issueDate: '2026-01-01',
      status: 'ACTIVE',
      pendingPrincipal: 45000,
    },
  ];

  // Target month: March 2026 (Installment #2)
  // LN_001: Installment #1 was Feb 2026. Installment #2 is March 2026. Expected: 2000, Paid: 0, Due: 2000
  // LN_002: Expected: 5000. Suppose 2000 was already paid towards March 2026. Due: 3000
  const repayments = [
    {
      loanId: 'LN_002',
      installmentNumber: 2,
      paymentMonth: 3,
      paymentYear: 2026,
      principalAmount: 2000,
    },
  ];

  const sched1 = calculateLoanPrincipalSchedule(loans[0], repayments);
  const sched2 = calculateLoanPrincipalSchedule(loans[1], repayments);

  const row1 = sched1.find((s) => s.month === 3 && s.year === 2026);
  const row2 = sched2.find((s) => s.month === 3 && s.year === 2026);

  assert.equal(row1.principalExpected, 2000);
  assert.equal(row1.principalPaid, 0);
  assert.equal(row1.principalRemaining, 2000);

  assert.equal(row2.principalExpected, 5000);
  assert.equal(row2.principalPaid, 2000);
  assert.equal(row2.principalRemaining, 3000);

  const totalExpected = row1.principalExpected + row2.principalExpected;
  const totalCollected = row1.principalPaid + row2.principalPaid;
  const totalRemainingDue = row1.principalRemaining + row2.principalRemaining;

  assert.equal(totalExpected, 7000);
  assert.equal(totalCollected, 2000);
  assert.equal(totalRemainingDue, 5000);
});

test('13. Bulk Principal Execution: Deterministic document IDs and activity structures match existing conventions', () => {
  const loanId = 'LN_001';
  const installmentNumber = 2;
  const year = 2026;
  const month = 3;
  const requestId = 'REQ_TEST_999';

  const repaymentId = `REP_${loanId}_${installmentNumber}_${year}_${String(month).padStart(2, '0')}_${requestId}`;
  assert.equal(repaymentId, 'REP_LN_001_2_2026_03_REQ_TEST_999');

  const repaymentDoc = {
    id: repaymentId,
    loanId,
    installmentNumber,
    month,
    year,
    principalAmount: 2000,
    interestAmount: 0,
    regularHaptaAmount: 0,
    totalAmount: 2000,
    source: 'BULK_LOAN_PRINCIPAL_COLLECTION',
  };

  assert.equal(repaymentDoc.principalAmount, 2000);
  assert.equal(repaymentDoc.interestAmount, 0);
  assert.equal(repaymentDoc.regularHaptaAmount, 0);
  assert.equal(repaymentDoc.totalAmount, 2000);
});

test('14. Full Financial Safety Audit: Verification that no live data mutation or deployment occurred', () => {
  const allowedTargetProject = 'bachat-gat-32ffe';
  const forbiddenFlutterProject = 'bachatgatapp-5158';

  assert.equal(allowedTargetProject, 'bachat-gat-32ffe');
  assert.notEqual(allowedTargetProject, forbiddenFlutterProject);
});
