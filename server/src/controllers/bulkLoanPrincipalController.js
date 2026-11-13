const { db, hasServiceAccount } = require('../config/firebaseAdmin');
const { DEFAULT_GROUP_ID, getCollection } = require('../utils/firestore');

const number = (val) => Number(val) || 0;
const groupIdOf = (req) => req.user?.groupId || req.body?.groupId || req.query?.groupId || DEFAULT_GROUP_ID;

/**
 * Calculate dynamic installment Month and Year using zero-based modular arithmetic.
 * Invariant: Loan issue month does NOT contain an installment.
 * Installment #1 starts in the month AFTER the loan issue date (issue month + 1).
 */
function calculateInstallmentMonthYear(issueDateStr, installmentNumber = 1) {
  const issueDate = new Date(issueDateStr);
  const issueMonth = !isNaN(issueDate.getTime()) ? (issueDate.getMonth() + 1) : 3;
  const issueYear = !isNaN(issueDate.getTime()) ? issueDate.getFullYear() : new Date().getFullYear();

  const absoluteMonthIndex = issueYear * 12 + (issueMonth - 1) + installmentNumber;
  const instYear = Math.floor(absoluteMonthIndex / 12);
  const instMonth = (absoluteMonthIndex % 12) + 1;
  return { month: instMonth, year: instYear };
}

/**
 * Calculate loan schedule for principal repayment tracking.
 * Strictly adheres to Bachat Gat business rules:
 * - Tenure is fixed at 10 installments (or loan duration)
 * - Base monthly principal = Math.round(originalPrincipal / tenure)
 * - Final installment absorbs rounding remainder
 */
function calculateLoanPrincipalSchedule(loan, repayments = []) {
  const originalPrincipal = number(loan.originalPrincipal ?? loan.principalAmount ?? loan.principal_amount);
  const tenure = number(loan.durationMonths ?? loan.duration_months ?? loan.tenureMonths ?? loan.tenure_months ?? 10) || 10;
  const baseMonthlyPrincipal = tenure > 0 ? Math.round(originalPrincipal / tenure) : 0;
  const lastInstallmentPrincipal = tenure > 0 ? Math.max(0, originalPrincipal - (baseMonthlyPrincipal * (tenure - 1))) : 0;
  const issueDateStr = loan.issueDate || loan.loanDate || loan.disbursementDate || loan.createdAt || new Date().toISOString();

  const loanIdStr = String(loan.id || loan.loanId || loan.loan_id || '');
  const loanRepayments = (repayments || []).filter((r) => {
    const rLoanId = String(r.loanId || r.loan_id || '');
    return loanIdStr && rLoanId === loanIdStr;
  });

  const schedule = [];
  for (let i = 1; i <= tenure; i++) {
    const { month, year } = calculateInstallmentMonthYear(issueDateStr, i);
    const nominalExpected = (i === tenure) ? lastInstallmentPrincipal : baseMonthlyPrincipal;

    const matchingRepayments = loanRepayments.filter((r) => {
      const rInst = number(r.installmentNumber ?? r.installment_number);
      const rMonth = number(r.paymentMonth ?? r.payment_month ?? r.month);
      const rYear = number(r.paymentYear ?? r.payment_year ?? r.year);

      if (rInst > 0) return rInst === i;
      if (rMonth > 0 && rYear > 0) return rMonth === month && rYear === year;
      return false;
    });

    const principalPaid = matchingRepayments.reduce(
      (sum, r) => sum + number(r.principalAmount ?? r.principal_amount ?? r.principalPaid ?? r.principal_repayment_amount ?? r.loanPrincipalPaid ?? 0),
      0
    );

    const principalRemaining = Math.max(0, nominalExpected - principalPaid);

    schedule.push({
      installmentNumber: i,
      month,
      year,
      principalExpected: nominalExpected,
      principalPaid,
      principalRemaining,
      isFullyPaid: principalRemaining === 0,
    });
  }

  return schedule;
}

/**
 * GET /api/loans/bulk/preview
 * Fetches all eligible active loans for the selected month/year,
 * calculating principal due, already collected, and remaining balance.
 */
async function getBulkLoanPrincipalPreview(req, res, next) {
  try {
    if (!hasServiceAccount) {
      return res.status(503).json({
        success: false,
        message: 'Server Firebase Admin service account not configured. Client-side SDK must be used.',
      });
    }

    const groupId = groupIdOf(req);
    const currentDate = new Date();
    const month = parseInt(req.query.month || currentDate.getMonth() + 1, 10);
    const year = parseInt(req.query.year || currentDate.getFullYear(), 10);

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2000) {
      return res.status(400).json({ success: false, message: 'Invalid month (1-12) or year provided.' });
    }

    const [loans, repayments, members] = await Promise.all([
      getCollection('loans', groupId),
      getCollection('repayments', groupId),
      getCollection('users', groupId),
    ]);

    const memberMap = {};
    members.forEach((m) => {
      memberMap[m.id] = {
        name: m.fullName || m.name || 'Member',
        memberCode: m.memberCode || m.member_code || m.id.slice(-4),
        phone: m.phone || '',
      };
    });

    // Filter active loans with outstanding principal > 0
    const activeLoans = loans.filter((l) => {
      const rawStatus = (l.status || '').toUpperCase();
      const outstanding = number(l.pendingPrincipal ?? l.remainingAmount ?? l.outstanding_amount ?? 1);
      return (rawStatus === 'ACTIVE' || rawStatus === '') && outstanding > 0 && !l.isDeleted;
    });

    let totalMonthlyPrincipalExpected = 0;
    let totalAlreadyCollected = 0;
    let totalRemainingPrincipalDue = 0;
    let paidLoansCount = 0;
    let partialLoansCount = 0;
    let pendingLoansCount = 0;

    const previewLoans = [];
    const excludedLoans = [];

    for (const loan of activeLoans) {
      const originalPrincipal = number(loan.originalPrincipal ?? loan.principalAmount ?? loan.principal_amount);
      const tenure = number(loan.durationMonths ?? loan.duration_months ?? loan.tenureMonths ?? loan.tenure_months ?? 10) || 10;
      const baseMonthlyPrincipal = tenure > 0 ? Math.round(originalPrincipal / tenure) : 0;
      const currentOutstanding = number(loan.pendingPrincipal ?? loan.remainingAmount ?? loan.outstanding_amount ?? originalPrincipal);

      // Sum of all principal paid across loan's history
      const totalPrincipalPaidSoFar = number(loan.totalPrincipalPaid ?? loan.total_principal_paid ?? loan.total_principal_repaid);

      const schedule = calculateLoanPrincipalSchedule(loan, repayments);

      // Find matching installment for selected month & year
      const targetRow = schedule.find((s) => s.month === month && s.year === year);

      let installmentNumber;
      let scheduledMonthlyPrincipal;
      let alreadyPaidForPeriod;
      let monthlyPrincipalDue;
      let isEligible = true;

      const member = memberMap[loan.memberId || loan.member_id] || {};

      if (targetRow) {
        installmentNumber = targetRow.installmentNumber;
        scheduledMonthlyPrincipal = targetRow.principalExpected;
        alreadyPaidForPeriod = targetRow.principalPaid;
        monthlyPrincipalDue = Math.min(currentOutstanding, targetRow.principalRemaining);
      } else {
        // Check if selected month is before or after the loan's schedule
        const issueDate = new Date(loan.issueDate || loan.loanDate || loan.createdAt || new Date());
        const issueMonth = issueDate.getMonth() + 1;
        const issueYear = issueDate.getFullYear();
        const issueCalIndex = issueYear * 12 + (issueMonth - 1);
        const selectedCalIndex = year * 12 + (month - 1);

        if (selectedCalIndex <= issueCalIndex) {
          isEligible = false;
          const firstInstDate = calculateInstallmentMonthYear(issueDate.toISOString(), 1);
          const firstInstDateObj = new Date(firstInstDate.year, firstInstDate.month - 1, 1);
          const firstInstLabel = firstInstDateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
          const issueLabel = issueDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

          excludedLoans.push({
            loanId: loan.id,
            loanNumber: loan.loanNumber || loan.loan_number || loan.id,
            memberName: member.name || loan.memberName || 'Member',
            memberCode: member.memberCode || loan.memberCode || '',
            issueDate: loan.issueDate,
            reason: `Issued in ${issueLabel}. First installment begins in ${firstInstLabel}.`,
            nextEligibleMonth: firstInstDate.month,
            nextEligibleYear: firstInstDate.year,
            nextEligibleLabel: firstInstLabel,
          });
        } else if (currentOutstanding > 0) {
          // Overdue active loan past scheduled tenure
          const firstUnpaid = schedule.find((s) => s.principalRemaining > 0);
          installmentNumber = firstUnpaid ? firstUnpaid.installmentNumber : tenure;
          scheduledMonthlyPrincipal = firstUnpaid ? firstUnpaid.principalExpected : Math.min(currentOutstanding, baseMonthlyPrincipal);

          const matchingRepayments = (repayments || []).filter((r) => {
            const rLoanId = String(r.loanId || r.loan_id || '');
            const currentLoanId = String(loan.id || loan.loanId || '');
            if (rLoanId !== currentLoanId) return false;
            const rMonth = number(r.paymentMonth ?? r.payment_month ?? r.month);
            const rYear = number(r.paymentYear ?? r.payment_year ?? r.year);
            return rMonth === month && rYear === year;
          });

          alreadyPaidForPeriod = matchingRepayments.reduce(
            (sum, r) => sum + number(r.principalAmount ?? r.principal_amount ?? r.principalPaid ?? r.principal_repayment_amount ?? 0),
            0
          );
          monthlyPrincipalDue = Math.min(currentOutstanding, Math.max(0, scheduledMonthlyPrincipal - alreadyPaidForPeriod));
        } else {
          isEligible = false;
        }
      }

      if (!isEligible) continue;

      const isPaidFull = monthlyPrincipalDue === 0 && (alreadyPaidForPeriod >= scheduledMonthlyPrincipal || currentOutstanding === 0);
      const isPartial = alreadyPaidForPeriod > 0 && monthlyPrincipalDue > 0;
      const status = isPaidFull ? 'PAID' : (isPartial ? 'PARTIAL' : 'PENDING');

      if (isPaidFull) paidLoansCount++;
      else if (isPartial) partialLoansCount++;
      else pendingLoansCount++;

      totalMonthlyPrincipalExpected += scheduledMonthlyPrincipal;
      totalAlreadyCollected += alreadyPaidForPeriod;
      totalRemainingPrincipalDue += monthlyPrincipalDue;

      previewLoans.push({
        loanId: loan.id,
        loanNumber: loan.loanNumber || loan.loan_number || loan.id,
        memberId: loan.memberId || loan.member_id,
        memberName: member.name || loan.memberName || loan.member_name || 'Member',
        memberCode: member.memberCode || loan.memberCode || loan.member_code || loan.id.slice(-4),
        phone: member.phone || '',
        totalLoanPrincipal: originalPrincipal,
        totalPrincipalPaidSoFar,
        remainingPrincipal: currentOutstanding,
        installmentNumber,
        scheduledMonthlyPrincipal,
        alreadyPaidForPeriod,
        monthlyPrincipalDue,
        suggestedAmount: monthlyPrincipalDue,
        isPaidFull,
        isPartial,
        status,
      });
    }

    // Sort: Pending and Partial first, then fully paid
    previewLoans.sort((a, b) => {
      if (a.isPaidFull !== b.isPaidFull) return a.isPaidFull ? 1 : -1;
      return a.memberName.localeCompare(b.memberName);
    });

    res.json({
      success: true,
      groupId,
      month,
      year,
      totalActiveLoans: previewLoans.length,
      totalMonthlyPrincipalExpected,
      totalAlreadyCollected,
      totalRemainingPrincipalDue,
      paidLoansCount,
      partialLoansCount,
      pendingLoansCount,
      loans: previewLoans,
      excludedLoans,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/loans/bulk/collect
 * Records bulk monthly loan principal repayments atomically and idempotently.
 * Collects ONLY loan principal (0 interest, 0 savings).
 */
async function recordBulkLoanPrincipal(req, res, next) {
  try {
    if (!hasServiceAccount) {
      return res.status(503).json({
        success: false,
        message: 'Server Firebase Admin service account not configured. Client-side SDK must be used.',
      });
    }
    const groupId = groupIdOf(req);
    const {
      month: rawMonth,
      year: rawYear,
      items,
      clientRequestId,
      paymentMode = 'UPI',
      remarks = '',
      paymentDate,
    } = req.body;

    const month = parseInt(rawMonth, 10);
    const year = parseInt(rawYear, 10);

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2000) {
      return res.status(400).json({ success: false, message: 'Valid month (1-12) and year are required.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Items array cannot be empty.' });
    }

    const validItems = items.filter((item) => item && (item.loanId || item.loan_id) && number(item.amount) > 0);
    if (validItems.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid loan repayment items with amount > 0 provided.' });
    }

    const effectiveDate = paymentDate || new Date().toISOString().split('T')[0];
    const requestId = clientRequestId || `BULK_LOAN_REQ_${groupId}_${year}_${month}_${Date.now()}`;

    const transactionResult = await db.runTransaction(async (transaction) => {
      // 1. Idempotency Check
      const idempotencyRef = db.collection('idempotencyKeys').doc(`BULK_LOAN_${requestId}`);
      const idempotencySnap = await transaction.get(idempotencyRef);
      if (idempotencySnap.exists) {
        return {
          isDuplicate: true,
          previousData: idempotencySnap.data(),
        };
      }

      // 2. Read Group Document
      const groupRef = db.collection('groups').doc(groupId);
      const groupSnap = await transaction.get(groupRef);
      const groupData = groupSnap.exists ? groupSnap.data() : {};

      // 3. Read all target Loan documents
      const loanRefs = validItems.map((item) => {
        const id = item.loanId || item.loan_id;
        return {
          item,
          loanId: id,
          ref: db.collection('loans').doc(id),
        };
      });

      const loanSnaps = await Promise.all(loanRefs.map(({ ref }) => transaction.get(ref)));

      // Read member names for activities
      const memberIds = [...new Set(validItems.map((i) => i.memberId || i.member_id).filter(Boolean))];
      const memberSnaps = await Promise.all(memberIds.map((mId) => transaction.get(db.collection('users').doc(mId))));
      const memberNameMap = {};
      memberSnaps.forEach((snap) => {
        if (snap.exists) {
          const d = snap.data();
          memberNameMap[snap.id] = d.fullName || d.name || 'Member';
        }
      });

      let totalPrincipalCollected = 0;
      const processedItems = [];
      const skippedDuplicates = [];
      const repaymentsToWrite = [];
      const transactionsToWrite = [];

      for (let i = 0; i < loanRefs.length; i++) {
        const { item, loanId, ref: loanRef } = loanRefs[i];
        const loanSnap = loanSnaps[i];

        if (!loanSnap.exists) {
          skippedDuplicates.push({
            loanId,
            reason: 'Loan document not found',
          });
          continue;
        }

        const loanData = loanSnap.data();
        const currentPending = number(loanData.pendingPrincipal ?? loanData.remainingAmount ?? loanData.outstanding_amount);
        const memberId = loanData.memberId || loanData.member_id || item.memberId;
        const memberName = memberNameMap[memberId] || item.memberName || loanData.memberName || 'Member';
        const loanNumber = loanData.loanNumber || loanData.loan_number || loanId;

        // Check if loan is already closed or has no pending balance
        if ((loanData.status || '').toUpperCase() === 'CLOSED' || currentPending <= 0) {
          skippedDuplicates.push({
            loanId,
            loanNumber,
            memberName,
            reason: 'Loan is already closed or has 0 outstanding balance',
          });
          continue;
        }

        const requestedAmount = number(item.amount);
        const monthlyPrincipalDue = number(item.monthlyPrincipalDue ?? item.suggestedAmount ?? currentPending);

        // Prevent collecting more than the eligible principal due or remaining principal
        const allowedPrincipal = Math.min(requestedAmount, monthlyPrincipalDue, currentPending);
        if (allowedPrincipal <= 0) {
          skippedDuplicates.push({
            loanId,
            loanNumber,
            memberName,
            reason: 'Principal installment already paid or zero balance due',
          });
          continue;
        }

        const targetInstallmentNumber = number(item.installmentNumber ?? item.installment_number) || ((number(loanData.lastInstallmentPaid) || 0) + 1);
        const repaymentId = `REP_${loanId}_${targetInstallmentNumber}_${year}_${String(month).padStart(2, '0')}_${requestId}`;
        const repayRef = db.collection('repayments').doc(repaymentId);

        const newPending = Math.max(0, Math.round((currentPending - allowedPrincipal) * 100) / 100);
        const newStatus = newPending === 0 ? 'CLOSED' : 'ACTIVE';
        const currentTotalPrincipalPaid = number(loanData.totalPrincipalPaid ?? loanData.total_principal_paid ?? loanData.total_principal_repaid);
        const newTotalPrincipalPaid = currentTotalPrincipalPaid + allowedPrincipal;

        totalPrincipalCollected += allowedPrincipal;

        const itemMode = item.paymentMode || paymentMode;
        const itemRemarks = (item.remarks || remarks || `Bulk Monthly Loan Principal Collection (${month}/${year})`).trim();

        // 1. Update Loan Document
        transaction.update(loanRef, {
          pendingPrincipal: newPending,
          remainingAmount: newPending,
          outstanding_amount: newPending,
          totalPrincipalPaid: newTotalPrincipalPaid,
          total_principal_paid: newTotalPrincipalPaid,
          total_principal_repaid: newTotalPrincipalPaid,
          lastInstallmentPaid: targetInstallmentNumber,
          status: newStatus,
          updatedAt: effectiveDate,
        });

        // 2. Create Repayment Record (strictly principal, 0 interest, 0 regular savings)
        const repaymentPayload = {
          id: repaymentId,
          repaymentId,
          repayment_id: repaymentId,
          groupId,
          group_id: groupId,
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
          interestAmount: 0,
          interest_amount: 0,
          regularHaptaAmount: 0,
          regular_hafta_amount: 0,
          regularContribution: 0,
          amount: allowedPrincipal,
          loanRepaymentAmount: allowedPrincipal,
          totalAmount: allowedPrincipal,
          total_amount: allowedPrincipal,
          totalPaid: allowedPrincipal,
          total_payment: allowedPrincipal,
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
          source: 'BULK_LOAN_PRINCIPAL_COLLECTION',
          createdAt: effectiveDate,
        };

        transaction.set(repayRef, repaymentPayload);
        repaymentsToWrite.push(repaymentPayload);

        // 3. Create Transaction Record
        const actId = `ACT_${Date.now()}_${loanId}_bulk_principal`;
        const actRef = db.collection('transactions').doc(actId);
        const activityPayload = {
          id: actId,
          groupId,
          type: 'repayment',
          type_flutter: 'loanRepayment',
          amount: allowedPrincipal,
          principalAmount: allowedPrincipal,
          principal_amount: allowedPrincipal,
          interestAmount: 0,
          interest_amount: 0,
          regularHaptaAmount: 0,
          regular_hafta_amount: 0,
          totalAmount: allowedPrincipal,
          description: `Bulk monthly loan principal ₹${allowedPrincipal.toLocaleString('en-IN')} collected from ${memberName} (${loanNumber})`,
          memberId,
          memberName,
          referenceId: repaymentId,
          source: 'BULK_LOAN_PRINCIPAL_COLLECTION',
          date: effectiveDate,
          createdAt: effectiveDate,
        };

        transaction.set(actRef, activityPayload);
        transactionsToWrite.push(activityPayload);

        processedItems.push({
          loanId,
          loanNumber,
          memberId,
          memberName,
          amountCollected: allowedPrincipal,
          newPending,
          newStatus,
        });
      }

      // 4. Update Group Financial Totals (Available Balance increases, Active Loans decreases, Total Fund constant, Savings & Interest untouched)
      const currentActiveLoans = number(groupData.activeLoans || groupData.active_loans || groupData.totalOutstandingLoans || 0);
      const newActiveLoans = Math.max(0, currentActiveLoans - totalPrincipalCollected);
      const currentAvailable = number(groupData.availableBalance ?? groupData.available_balance ?? 0);
      const newAvailableBalance = Math.round((currentAvailable + totalPrincipalCollected) * 100) / 100;
      const newTotalFund = Math.round((newAvailableBalance + newActiveLoans) * 100) / 100;
      const newMonthlyInterest = Math.round(newActiveLoans * 0.02 * 100) / 100;

      if (totalPrincipalCollected > 0) {
        transaction.update(groupRef, {
          activeLoans: newActiveLoans,
          active_loans: newActiveLoans,
          totalOutstandingLoans: newActiveLoans,
          availableBalance: newAvailableBalance,
          available_balance: newAvailableBalance,
          rawAvailableBalance: newAvailableBalance,
          totalFund: newTotalFund,
          total_fund: newTotalFund,
          currentMonthlyInterest: newMonthlyInterest,
          current_monthly_interest: newMonthlyInterest,
          updatedAt: effectiveDate,
        });
      }

      // 5. Store Idempotency Marker
      const idempotencyPayload = {
        requestId,
        groupId,
        month,
        year,
        itemsCount: validItems.length,
        processedCount: processedItems.length,
        skippedCount: skippedDuplicates.length,
        totalCollected: totalPrincipalCollected,
        skippedDuplicates,
        executedAt: effectiveDate,
        type: 'BULK_LOAN_PRINCIPAL_COLLECTION',
      };
      transaction.set(idempotencyRef, idempotencyPayload);

      return {
        isDuplicate: false,
        totalCollected: totalPrincipalCollected,
        count: processedItems.length,
        skippedDuplicates,
        processedItems,
        newActiveLoans,
        newAvailableBalance,
        newTotalFund,
      };
    });

    if (transactionResult.isDuplicate) {
      return res.status(200).json({
        success: true,
        isIdempotentReplay: true,
        message: 'This bulk loan principal request was already processed. Duplicate writes prevented.',
        data: transactionResult.previousData,
      });
    }

    res.status(201).json({
      success: true,
      message: transactionResult.count > 0
        ? `Bulk monthly loan principal of ₹${transactionResult.totalCollected.toLocaleString('en-IN')} recorded for ${transactionResult.count} loan(s).`
        : 'All selected loans already have principal recorded for this period. Duplicate writes prevented.',
      count: transactionResult.count,
      totalCollected: transactionResult.totalCollected,
      skippedDuplicates: transactionResult.skippedDuplicates,
      processedItems: transactionResult.processedItems,
      groupBalances: {
        activeLoans: transactionResult.newActiveLoans,
        availableBalance: transactionResult.newAvailableBalance,
        totalFund: transactionResult.newTotalFund,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  calculateInstallmentMonthYear,
  calculateLoanPrincipalSchedule,
  getBulkLoanPrincipalPreview,
  recordBulkLoanPrincipal,
};

