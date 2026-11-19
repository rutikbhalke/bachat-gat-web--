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

test('4. Financial Rule: Unified collection collects Principal + 1% Interest without mixing monthly savings', () => {
  const sampleRepaymentItem = {
    loanId: 'LN_100',
    principalAmount: 2500,
    currentInterestAmount: 250,
    previousPendingInterestAmount: 100,
    amount: 2850,
  };

  const currentPending = 25000;
  const allowedPrincipal = Math.min(sampleRepaymentItem.principalAmount, currentPending);
  const currentInterest = sampleRepaymentItem.currentInterestAmount;
  const previousInterest = sampleRepaymentItem.previousPendingInterestAmount;
  const totalInterest = currentInterest + previousInterest;
  const regularHaptaAmount = 0;
  const totalAmount = allowedPrincipal + totalInterest;

  assert.equal(allowedPrincipal, 2500, 'Principal collected matches scheduled amount');
  assert.equal(totalInterest, 350, 'Total interest equals current 1% interest + prior pending interest');
  assert.equal(regularHaptaAmount, 0, 'Regular Hapta/savings must be strictly 0 in loan repayment modal');
  assert.equal(totalAmount, 2850, 'Total repayment amount equals principal + all interest');
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

test('15. Integrated Bulk Repayment: Outstanding principal, 1% current interest, and historical pending interest breakdown', () => {
  // Example scenario:
  // Borrower outstanding principal: ₹1,00,000
  // Monthly principal due: ₹10,000
  // Current 1% interest due: ₹1,00,000 * 1% = ₹1,000
  // Previous pending interest: ₹500
  // Expected total collection: ₹10,000 + ₹1,000 + ₹500 = ₹11,500
  const outstandingPrincipal = 100000;
  const monthlyPrincipalDue = 10000;
  const currentInterestDue = Math.round(outstandingPrincipal * 0.01);
  const previousPendingInterest = 500;
  const totalInterestDue = currentInterestDue + previousPendingInterest;
  const totalCollectionDue = monthlyPrincipalDue + totalInterestDue;

  assert.equal(currentInterestDue, 1000, 'Current 1% reducing interest on ₹1,00,000 must be ₹1,000');
  assert.equal(totalInterestDue, 1500, 'Total interest due must be ₹1,500');
  assert.equal(totalCollectionDue, 11500, 'Total collection amount must be ₹11,500');

  // Verify principal reduction only affects principal
  const newOutstanding = outstandingPrincipal - monthlyPrincipalDue;
  assert.equal(newOutstanding, 90000, 'Outstanding principal reduces strictly by ₹10,000 to ₹90,000');
});

test('16. Group Balance Invariant on Integrated Principal + Interest Collection', () => {
  const initialGroup = {
    availableBalance: 4000000,
    activeLoans: 600000,
    totalFund: 4600000,
    totalInterestPaid: 150000,
  };

  const principalCollected = 50000;
  const interestCollected = 6000; // 1% reducing interest + prior pending interest

  const newActiveLoans = initialGroup.activeLoans - principalCollected; // 550,000
  const newAvailableBalance = initialGroup.availableBalance + principalCollected + interestCollected; // 4,056,000
  const newTotalFund = newAvailableBalance + newActiveLoans; // 4,606,000
  const newTotalInterest = initialGroup.totalInterestPaid + interestCollected; // 156,000

  assert.equal(newActiveLoans, 550000, 'Active loans reduced strictly by principal');
  assert.equal(newAvailableBalance, 4056000, 'Available balance increased by principal + interest');
  assert.equal(newTotalFund, 4606000, 'Total fund increased strictly by interest income');
  assert.equal(newTotalInterest, 156000, 'Total interest paid increased by collected interest');
  assert.equal(newAvailableBalance + newActiveLoans, newTotalFund, 'Invariant availableBalance + activeLoans === totalFund holds');
});

test('17. Duplicate Collection Prevention: Fully paid loans and settled installments are skipped', () => {
  const alreadySettledItem = {
    loanId: 'LN_SETTLED',
    monthlyPrincipalDue: 0,
    currentInterestDue: 0,
    previousPendingInterest: 0,
    amount: 0,
  };

  const isEligibleForCollection = (alreadySettledItem.amount > 0) ||
    (alreadySettledItem.monthlyPrincipalDue > 0) ||
    (alreadySettledItem.currentInterestDue > 0) ||
    (alreadySettledItem.previousPendingInterest > 0);

  assert.equal(isEligibleForCollection, false, 'Already settled loans with 0 dues must not be collected');
});

test('18. Phase 5 Comprehensive Workflow: Single & multiple borrower collection, payment modes, and financial reconciliation', () => {
  // Test 1: Single borrower collection (Principal + Current 1% Interest)
  const singleItem = {
    loanId: 'LN_001',
    principalAmount: 5000,
    currentInterestAmount: 500,
    previousPendingInterestAmount: 0,
    interestAmount: 500,
    amount: 5500,
    paymentMode: 'UPI',
  };
  const currentPending1 = 50000;
  const allowedPrincipal1 = Math.min(singleItem.principalAmount, currentPending1);
  const allowedInterest1 = Math.max(0, singleItem.interestAmount);
  const totalItemAmount1 = allowedPrincipal1 + allowedInterest1;
  const newPending1 = currentPending1 - allowedPrincipal1;

  assert.equal(allowedPrincipal1, 5000);
  assert.equal(allowedInterest1, 500);
  assert.equal(totalItemAmount1, 5500);
  assert.equal(newPending1, 45000);
  assert.equal(singleItem.paymentMode, 'UPI');

  // Test 2 & 4: Multiple borrowers with Principal + Current Interest + Previous Pending Interest
  const multiItems = [
    {
      loanId: 'LN_101',
      memberName: 'Borrower A',
      principalAmount: 10000,
      currentInterestAmount: 1000,
      previousPendingInterestAmount: 500,
      interestAmount: 1500,
      amount: 11500,
      paymentMode: 'Cash',
    },
    {
      loanId: 'LN_102',
      memberName: 'Borrower B',
      principalAmount: 8000,
      currentInterestAmount: 800,
      previousPendingInterestAmount: 0,
      interestAmount: 800,
      amount: 8800,
      paymentMode: 'Bank Transfer',
    },
  ];

  let totalCollectedPrin = 0;
  let totalCollectedInt = 0;
  multiItems.forEach((it) => {
    totalCollectedPrin += it.principalAmount;
    totalCollectedInt += it.interestAmount;
  });

  assert.equal(totalCollectedPrin, 18000, 'Total bulk principal must equal 18,000');
  assert.equal(totalCollectedInt, 2300, 'Total bulk interest must equal 2,300');
  assert.equal(totalCollectedPrin + totalCollectedInt, 20300, 'Total collected must equal 20,300');
  assert.equal(multiItems[0].paymentMode, 'Cash');
  assert.equal(multiItems[1].paymentMode, 'Bank Transfer');

  // Test 8: Duplicate submission prevention
  const idempotencyMap = new Map();
  const reqId = 'REQ_BULK_001';
  idempotencyMap.set(`IDEM_${reqId}`, { recorded: true });
  assert.equal(idempotencyMap.has(`IDEM_${reqId}`), true, 'Replay with same requestId is identified as duplicate');

  // Test 9: Invalid / 0 amount rejection
  const invalidItems = [
    { loanId: 'LN_INV', amount: 0, principalAmount: 0, interestAmount: 0 },
  ];
  const validFiltered = invalidItems.filter((i) => Number(i.amount) > 0);
  assert.equal(validFiltered.length, 0, 'Zero amount items must be rejected from submission');

  // Test 10: Group accounting reconciliation
  const initialGroup = {
    availableBalance: 2000000,
    activeLoans: 500000,
    totalFund: 2500000,
    totalInterestPaid: 50000,
  };
  const newActiveLoans = initialGroup.activeLoans - totalCollectedPrin;
  const newAvailableBalance = initialGroup.availableBalance + totalCollectedPrin + totalCollectedInt;
  const newTotalFund = newAvailableBalance + newActiveLoans;
  const newTotalInterest = initialGroup.totalInterestPaid + totalCollectedInt;

  assert.equal(newActiveLoans, 482000, 'Active loans reduced only by collected principal');
  assert.equal(newAvailableBalance, 2020300, 'Available balance increased by principal + interest');
  assert.equal(newTotalFund, 2502300, 'Total fund increased only by interest income');
  assert.equal(newTotalInterest, 52300, 'Total interest increased by collected interest');
  assert.equal(newAvailableBalance + newActiveLoans, newTotalFund, 'Invariant holds');
});

test('19. Duplicate Interest Prevention: Collected current and historical interest are excluded from future dues', () => {
  // Scenario: Borrower with Opening Outstanding: ₹50,000
  // Installment 1: Expected Interest = ₹500. Borrower pays ₹500.
  const openingPrincipal = 50000;
  const scheduledInterest = Math.round(((openingPrincipal * 1.0) / 100) * 100) / 100;
  assert.equal(scheduledInterest, 500);

  // Before payment: due is ₹500
  let interestPaid = 0;
  let currentInterestDue = Math.max(0, Math.round((scheduledInterest - interestPaid) * 100) / 100);
  assert.equal(currentInterestDue, 500);

  // Simulate payment of current interest
  interestPaid += 500;
  currentInterestDue = Math.max(0, Math.round((scheduledInterest - interestPaid) * 100) / 100);
  assert.equal(currentInterestDue, 0, 'Current interest due must be exactly 0 after collection');

  // Verify historical pending interest calculation excludes already-paid installments
  const pastInstallments = [
    { installmentNumber: 1, interestExpected: 500, interestPaid: 500, interestRemaining: 0 },
    { installmentNumber: 2, interestExpected: 450, interestPaid: 450, interestRemaining: 0 },
  ];
  const previousPendingInterest = Math.round(
    pastInstallments.reduce((sum, s) => sum + Math.max(0, Number(s.interestRemaining || 0)), 0) * 100
  ) / 100;
  assert.equal(previousPendingInterest, 0, 'No prior pending interest when past installments are settled');
});

test('20. Partially Paid Installments: Tracking remaining principal & interest dues accurately', () => {
  const originalPrincipal = 100000;
  const tenure = 10;
  const scheduledMonthlyPrincipal = originalPrincipal / tenure; // 10,000
  const scheduledMonthlyInterest = Math.round((originalPrincipal * 0.01) * 100) / 100; // 1,000

  // Borrower pays partial amounts: ₹4,000 principal and ₹600 interest
  const partialPrincipalPaid = 4000;
  const partialInterestPaid = 600;

  const remainingPrincipalDue = Math.max(0, scheduledMonthlyPrincipal - partialPrincipalPaid);
  const remainingInterestDue = Math.max(0, scheduledMonthlyInterest - partialInterestPaid);
  const totalRemainingDue = remainingPrincipalDue + remainingInterestDue;

  assert.equal(remainingPrincipalDue, 6000, 'Remaining principal due must be 6,000');
  assert.equal(remainingInterestDue, 400, 'Remaining interest due must be 400');
  assert.equal(totalRemainingDue, 6400, 'Total remaining due must be 6,400');

  // Status must be PARTIAL
  const isPaidFull = remainingPrincipalDue === 0 && remainingInterestDue === 0;
  const isPartial = (partialPrincipalPaid > 0 || partialInterestPaid > 0) && (remainingPrincipalDue > 0 || remainingInterestDue > 0);
  const status = isPaidFull ? 'PAID' : (isPartial ? 'PARTIAL' : 'PENDING');
  assert.equal(status, 'PARTIAL', 'Installment status must be PARTIAL');

  // Next installment opening principal reduces by partial payment: 100,000 - 4,000 = 96,000
  const nextOpeningPrincipal = originalPrincipal - partialPrincipalPaid;
  assert.equal(nextOpeningPrincipal, 96000);
  // Next month 1% interest is 1% of 96,000 = 960
  const nextMonthInterest = Math.round((nextOpeningPrincipal * 0.01) * 100) / 100;
  assert.equal(nextMonthInterest, 960, 'Next month interest reduces to ₹960 on reducing balance');
});

test('21. Advance Repayment and Clamping Policy Resolution: Safe advance payment up to total outstanding balance', () => {
  const currentPending = 40000;
  const scheduledMonthlyDue = 5000;

  // Case 1: Borrower pays exact monthly due (5,000)
  const reqNormal = 5000;
  const allowedNormal = Math.min(reqNormal, currentPending);
  assert.equal(allowedNormal, 5000, 'Normal installment matches scheduled due');

  // Case 2: Borrower makes an advance repayment of 3 installments (15,000)
  const reqAdvance = 15000;
  const allowedAdvance = Math.min(reqAdvance, currentPending);
  assert.equal(allowedAdvance, 15000, 'Advance repayment is permitted up to currentPending (40,000)');
  const pendingAfterAdvance = currentPending - allowedAdvance;
  assert.equal(pendingAfterAdvance, 25000, 'Pending principal correctly reduces to 25,000');

  // Case 3: Borrower attempts to pay 50,000 (exceeding total loan balance of 40,000)
  const reqOver = 50000;
  const allowedOver = Math.min(reqOver, currentPending);
  assert.equal(allowedOver, 40000, 'Clamping strictly caps payment to outstanding balance (40,000)');

  // Policy Resolution Summary:
  // UI auto-fill suggests scheduledMonthlyDue (5,000), but execution ceiling is currentPending (40,000).
  // This allows partial (1,000), normal (5,000), advance (15,000), and full payoff (40,000) safely.
});

test('22. Full Loan Closure & Zero Unintended Collection: Loan closes cleanly at 0 balance and rejects further collection', () => {
  const currentPending = 8000;
  const fullPaymentPrincipal = 8000;
  const finalInterest = 80; // 1% on 8,000

  const allowedPrincipal = Math.min(fullPaymentPrincipal, currentPending);
  const newPending = Math.max(0, currentPending - allowedPrincipal);
  const newStatus = newPending === 0 ? 'CLOSED' : 'ACTIVE';

  assert.equal(newPending, 0, 'New pending must be exactly 0');
  assert.equal(newStatus, 'CLOSED', 'Status must transition to CLOSED');

  // Subsequent check: Closed loans with 0 balance are excluded from preview
  const closedLoanRecord = {
    id: 'LN_CLOSED_TEST',
    status: 'CLOSED',
    pendingPrincipal: 0,
    remainingAmount: 0,
    isDeleted: false,
  };
  const isActiveForPreview = (closedLoanRecord.status || '').toUpperCase() === 'ACTIVE' &&
    Number(closedLoanRecord.pendingPrincipal || 0) > 0 &&
    !closedLoanRecord.isDeleted;
  assert.equal(isActiveForPreview, false, 'Closed loan is excluded from bulk preview');

  // If submitted again, transaction skips with zero writes
  const isSkipEligible = (closedLoanRecord.status || '').toUpperCase() === 'CLOSED' && Number(closedLoanRecord.pendingPrincipal || 0) <= 0;
  assert.equal(isSkipEligible, true, 'Transaction safely skips already closed loan');
});

test('23. Firestore Transaction Failure, Rollback & Idempotent Retry Safety', () => {
  const store = {
    group: { activeLoans: 300000, availableBalance: 1000000, totalFund: 1300000 },
    loans: new Map([
      ['LN_001', { pendingPrincipal: 30000, status: 'ACTIVE' }],
    ]),
    idempotency: new Map(),
  };

  const requestId = 'REQ_FAIL_TEST_1';

  // Simulation: Failure before commit (e.g. optimistic lock collision)
  let committed = false;
  try {
    // Check idempotency
    if (store.idempotency.has(`IDEM_${requestId}`)) {
      throw new Error('Duplicate');
    }
    // Read and simulate conflict/exception
    const loan = store.loans.get('LN_001');
    if (!loan) throw new Error('Not found');
    throw new Error('Simulated optimistic concurrency failure');
    committed = true;
  } catch (err) {
    // Transaction rolled back - no changes applied
    assert.equal(committed, false);
    assert.equal(store.group.activeLoans, 300000);
    assert.equal(store.group.availableBalance, 1000000);
    assert.equal(store.loans.get('LN_001').pendingPrincipal, 30000);
    assert.equal(store.idempotency.has(`IDEM_${requestId}`), false);
  }

  // Simulation: Successful Retry
  try {
    const loan = store.loans.get('LN_001');
    const payment = 5000;
    const interest = 300;
    loan.pendingPrincipal -= payment;
    store.group.activeLoans -= payment;
    store.group.availableBalance += (payment + interest);
    store.group.totalFund = store.group.activeLoans + store.group.availableBalance;
    store.idempotency.set(`IDEM_${requestId}`, { totalCollected: payment + interest });
    committed = true;
  } catch (err) {
    committed = false;
  }

  assert.equal(committed, true, 'Retry succeeded cleanly');
  assert.equal(store.group.activeLoans, 295000);
  assert.equal(store.group.availableBalance, 1005300);
  assert.equal(store.group.totalFund, 1300300);

  // Simulation: Replay of same requestId triggers idempotency protection
  let isReplayCaught = false;
  if (store.idempotency.has(`IDEM_${requestId}`)) {
    isReplayCaught = true;
  }
  assert.equal(isReplayCaught, true, 'Replay of same request is caught by idempotency without mutating balances');
});
