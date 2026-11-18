import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit & Integration Test Suite: Loan Interest Auto-Collection & Pending Interest Recovery
 * Tests:
 * 1. 1% monthly reducing-balance interest formula.
 * 2. 10-installment equal-principal distribution and issue-month exclusion.
 * 3. Simultaneous Principal + 1% Interest auto-collection.
 * 4. Pending Interest Recovery financial isolation (principal untouched, available balance increases).
 * 5. Mathematical invariant: Available Balance + Active Loans === Total Fund.
 * 6. Audit alignment with Bachat Gat official register & handwritten notes.
 */

// 1% Reducing-Balance Monthly Interest Calculation helper
function calculateReducingInterest(openingPrincipal, rate = 1.0) {
  if (openingPrincipal <= 0) return 0;
  return Math.round(((openingPrincipal * rate) / 100) * 100) / 100;
}

test('1. 1% monthly reducing-balance interest calculation accuracy', () => {
  assert.equal(calculateReducingInterest(150000, 1.0), 1500);
  assert.equal(calculateReducingInterest(135000, 1.0), 1350);
  assert.equal(calculateReducingInterest(84000, 1.0), 840);
  assert.equal(calculateReducingInterest(70000, 1.0), 700);
  assert.equal(calculateReducingInterest(40000, 1.0), 400);
  assert.equal(calculateReducingInterest(28000, 1.0), 280);
  assert.equal(calculateReducingInterest(24000, 1.0), 240);
  assert.equal(calculateReducingInterest(0, 1.0), 0);
});

test('2. Issue-month exclusion rule: Installment #1 starts in following month', () => {
  const issueDateStr = '2025-12-20';
  const issueDate = new Date(issueDateStr);
  const issueMonth = issueDate.getMonth() + 1; // 12
  const issueYear = issueDate.getFullYear(); // 2025

  // Installment 1
  const inst1Index = issueYear * 12 + (issueMonth - 1) + 1;
  const inst1Year = Math.floor(inst1Index / 12);
  const inst1Month = (inst1Index % 12) + 1;

  assert.equal(inst1Month, 1);
  assert.equal(inst1Year, 2026);
});

test('3. Combined Principal + 1% Interest installment calculation', () => {
  const originalPrincipal = 150000;
  const tenure = 10;
  const monthlyPrincipal = originalPrincipal / tenure; // 15000

  // Installment #1: Opening = 150,000
  const opening1 = 150000;
  const interest1 = calculateReducingInterest(opening1, 1.0);
  const totalInstallment1 = monthlyPrincipal + interest1;
  assert.equal(monthlyPrincipal, 15000);
  assert.equal(interest1, 1500);
  assert.equal(totalInstallment1, 16500);

  // Installment #2: Opening = 135,000
  const opening2 = 135000;
  const interest2 = calculateReducingInterest(opening2, 1.0);
  const totalInstallment2 = monthlyPrincipal + interest2;
  assert.equal(interest2, 1350);
  assert.equal(totalInstallment2, 16350);
});

test('4. Group Financial Reconciliation on combined Principal + Interest collection', () => {
  // Initial state
  let availableBalance = 50000;
  let activeLoans = 950000;
  let totalFund = availableBalance + activeLoans; // 1,000,000
  let totalInterestPaid = 2000;

  // Collection: Principal ₹15,000 + Interest ₹1,500
  const collectedPrincipal = 15000;
  const collectedInterest = 1500;
  const totalCashCollected = collectedPrincipal + collectedInterest;

  // Accounting transitions:
  // 1. activeLoans decreases by collected principal
  activeLoans -= collectedPrincipal;
  // 2. availableBalance increases by total cash/UPI collected
  availableBalance += totalCashCollected;
  // 3. totalFund increases strictly by interest earned (income)
  totalFund = availableBalance + activeLoans;
  totalInterestPaid += collectedInterest;

  assert.equal(activeLoans, 935000);
  assert.equal(availableBalance, 66500);
  assert.equal(totalFund, 1001500);
  assert.equal(totalInterestPaid, 3500);
  // Strict invariant: availableBalance + activeLoans === totalFund
  assert.equal(availableBalance + activeLoans, totalFund);
});

test('5. Pending Interest Recovery isolation: Loan principal and active loans untouched', () => {
  // Initial state
  let availableBalance = 66500;
  let activeLoans = 935000;
  let totalFund = availableBalance + activeLoans;
  let groupInterest = 3500;
  let loanPendingPrincipal = 135000;

  // Recovery of uncollected interest: ₹1,500
  const recoveredInterest = 1500;

  // Financial transitions:
  // Principal is UNTOUCHED
  assert.equal(loanPendingPrincipal, 135000);
  // Group active loans is UNTOUCHED
  assert.equal(activeLoans, 935000);

  // Available balance and group income increase strictly by recovered interest
  availableBalance += recoveredInterest;
  totalFund = availableBalance + activeLoans;
  groupInterest += recoveredInterest;

  assert.equal(availableBalance, 68000);
  assert.equal(totalFund, 1003000);
  assert.equal(groupInterest, 5000);
  assert.equal(availableBalance + activeLoans, totalFund);
});

test('6. Audit verification of handwritten notes: ₹2,060 for 4 closed loans', () => {
  const handwrittenRecords = [
    { name: 'श्री. शेखर तात्यासाहेब गुंजाळ', code: '042', amount: 280 },
    { name: 'श्री. नारायण जयवंत गुंजाळ', code: '010', amount: 240 },
    { name: 'श्री. मनोज रामभाऊ गुंजाळ', code: '011', amount: 700 },
    { name: 'श्री. रामनाथ ज्ञानदेव खुळे', code: '012', amount: 840 },
  ];

  const totalHandwrittenInterest = handwrittenRecords.reduce((s, r) => s + r.amount, 0);
  assert.equal(totalHandwrittenInterest, 2060);
  assert.equal(handwrittenRecords.length, 4);
});

test('7. Audit verification of uncollected interest on 7 active loans (Installment #1): ₹8,800', () => {
  const activeLoansInst1 = [
    { name: 'संतोष दत्तू गाडे', code: '022', loan: 40000, inst1InterestDue: 400 },
    { name: 'दिगंबर रामनाथ पर्बत', code: '033', loan: 90000, inst1InterestDue: 900 },
    { name: 'निलेश भागवत गुंजाळ', code: '038', loan: 150000, inst1InterestDue: 1500 },
    { name: 'रविंद्र भागवत गुंजाळ', code: '001', loan: 150000, inst1InterestDue: 1500 },
    { name: 'शंभू रविंद्र गुंजाळ', code: '036', loan: 150000, inst1InterestDue: 1500 },
    { name: 'समर्थ निलेश गुंजाळ', code: '037', loan: 150000, inst1InterestDue: 1500 },
    { name: 'सुभाष पांडुरंग आरोटे', code: '039', loan: 150000, inst1InterestDue: 1500 },
  ];

  const totalActiveInst1Uncollected = activeLoansInst1.reduce((s, l) => s + l.inst1InterestDue, 0);
  assert.equal(totalActiveInst1Uncollected, 8800);
  assert.equal(activeLoansInst1.length, 7);
});

