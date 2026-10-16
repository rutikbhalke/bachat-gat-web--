const { db } = require('../config/firebaseAdmin');
const { DEFAULT_GROUP_ID, getCollection, value } = require('../utils/firestore');
const {
  formatFlutterContribution,
  formatFlutterTransaction,
  syncBulkContributionsToFlutter,
  getSyncStatus,
} = require('../services/crossProjectSyncService');

const number = (val) => Number(val) || 0;
const groupIdOf = (req) => req.user?.groupId || req.body?.groupId || req.query?.groupId || DEFAULT_GROUP_ID;

/**
 * GET /api/savings/bulk/preview
 * Calculates member-by-member dues, multi-share configured contributions,
 * already-paid amounts, and remaining dues for a given period.
 */
async function getBulkSavingsPreview(req, res, next) {
  try {
    const groupId = groupIdOf(req);
    const currentDate = new Date();
    const month = parseInt(req.query.month || currentDate.getMonth() + 1, 10);
    const year = parseInt(req.query.year || currentDate.getFullYear(), 10);

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2000) {
      return res.status(400).json({ success: false, message: 'Invalid month or year provided.' });
    }

    const [members, contributions, groupDoc, loans] = await Promise.all([
      getCollection('users', groupId),
      getCollection('monthlyContributions', groupId),
      db.collection('groups').doc(groupId).get(),
      getCollection('loans', groupId),
    ]);

    const groupData = groupDoc.exists ? groupDoc.data() : {};
    const defaultGroupShare = number(groupData.monthlyContribution || groupData.monthly_contribution_per_share || 1000);

    // Filter active members only
    const activeMembers = members.filter(
      (m) =>
        m.status !== 'INACTIVE' &&
        (m.status || '').toLowerCase() !== 'inactive' &&
        m.isActive !== false &&
        !m.isDeleted &&
        (m.role || m.role_name || '').toUpperCase() !== 'ADMIN' &&
        !m.email?.includes('admin')
    );

    let totalExpected = 0;
    let totalAlreadyPaid = 0;
    let totalRemainingDue = 0;
    let paidMembersCount = 0;
    let partialMembersCount = 0;
    let unpaidMembersCount = 0;

    const previewList = activeMembers.map((m) => {
      // Configured share support: member's individual monthly share or group default
      const configuredShare = number(
        m.monthlyContribution ||
        m.monthlyShare ||
        m.monthly_contribution ||
        (m.shares ? m.shares * defaultGroupShare : null) ||
        defaultGroupShare
      );

      // Existing contribution for the target month and year
      const existing = contributions.find(
        (c) =>
          (c.memberId === m.id || c.member_id === m.id) &&
          number(c.month) === month &&
          number(c.year) === year
      );

      const alreadyPaid = existing
        ? number(existing.paidAmount ?? existing.paid_amount ?? existing.amount ?? 0)
        : 0;

      const remainingDue = Math.max(0, configuredShare - alreadyPaid);
      const isPaidFull = remainingDue === 0 && alreadyPaid > 0;
      const isPartial = alreadyPaid > 0 && remainingDue > 0;

      if (isPaidFull) paidMembersCount++;
      else if (isPartial) partialMembersCount++;
      else unpaidMembersCount++;

      totalExpected += configuredShare;
      totalAlreadyPaid += alreadyPaid;
      totalRemainingDue += remainingDue;

      // Active loan information for context
      const memberLoan = loans.find(
        (l) => (l.memberId === m.id || l.member_id === m.id) && l.status === 'ACTIVE'
      );

      return {
        memberId: m.id,
        memberName: m.fullName || m.name || 'Member',
        memberCode: m.memberCode || m.member_code || m.id.slice(-4),
        phone: m.phone || '',
        configuredShare,
        alreadyPaid,
        remainingDue,
        suggestedAmount: remainingDue,
        isPaidFull,
        isPartial,
        status: isPaidFull ? 'paid' : isPartial ? 'partial' : 'unpaid',
        hasActiveLoan: Boolean(memberLoan),
        loanDetails: memberLoan
          ? {
              loanId: memberLoan.id,
              loanNumber: memberLoan.loanNumber || memberLoan.loan_number || memberLoan.id,
              outstanding: number(memberLoan.remainingAmount || memberLoan.outstanding_amount || 0),
            }
          : null,
        existingContributionId: existing ? existing.id : null,
      };
    });

    // Sort: Unpaid and Partial first, then fully paid members
    previewList.sort((a, b) => {
      if (a.isPaidFull !== b.isPaidFull) return a.isPaidFull ? 1 : -1;
      return a.memberName.localeCompare(b.memberName);
    });

    const syncStatus = await getSyncStatus(groupId);

    res.json({
      success: true,
      groupId,
      month,
      year,
      totalActiveMembers: activeMembers.length,
      paidMembersCount,
      partialMembersCount,
      unpaidMembersCount,
      totalExpected,
      totalAlreadyPaid,
      totalRemainingDue,
      syncHealth: syncStatus,
      members: previewList,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/savings/bulk
 * Records monthly savings collection for multiple members idempotently with atomic group balance update.
 */
async function recordBulkSavings(req, res, next) {
  try {
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

    // Filter valid items with amount > 0
    const validItems = items.filter((item) => item && item.memberId && number(item.amount) > 0);
    if (validItems.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid savings items with amount > 0 provided.' });
    }

    const effectiveDate = paymentDate || new Date().toISOString();
    const requestId = clientRequestId || `BULK_REQ_${groupId}_${year}_${month}_${Date.now()}`;

    // Deterministic transaction execution to prevent double increments and race conditions
    const transactionResult = await db.runTransaction(async (transaction) => {
      // 1. Check idempotency record
      const idempotencyRef = db.collection('idempotencyKeys').doc(`BULK_${requestId}`);
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

      // 3. Read all target contribution docs
      const contributionRefs = validItems.map((item) => {
        const docId = `C_${item.memberId}_${year}_${String(month).padStart(2, '0')}`;
        return {
          item,
          docId,
          ref: db.collection('monthlyContributions').doc(docId),
        };
      });

      const contributionSnaps = await Promise.all(
        contributionRefs.map(({ ref }) => transaction.get(ref))
      );

      // Read member names for activities
      const memberRefs = validItems.map((item) => db.collection('users').doc(item.memberId));
      const memberSnaps = await Promise.all(memberRefs.map((ref) => transaction.get(ref)));
      const memberNameMap = {};
      memberSnaps.forEach((snap) => {
        if (snap.exists) {
          const d = snap.data();
          memberNameMap[snap.id] = d.fullName || d.name || 'Member';
        }
      });

      let totalDeltaSavings = 0;
      const contributionsToWrite = [];
      const transactionsToWrite = [];
      const flutterContributions = [];
      const flutterTransactions = [];
      const skippedDuplicates = [];
      const processedItems = [];

      // 4. Prepare updates for each member
      for (let i = 0; i < contributionRefs.length; i++) {
        const { item, docId, ref } = contributionRefs[i];
        const existingSnap = contributionSnaps[i];
        const existingData = existingSnap.exists ? existingSnap.data() : null;

        const deltaAmount = number(item.amount);
        const existingPaid = existingData ? number(existingData.paidAmount ?? existingData.paid_amount ?? 0) : 0;
        const expectedAmount = number(item.expectedAmount || existingData?.expectedAmount || 1000);
        const memberName = memberNameMap[item.memberId] || item.memberName || 'Member';

        // Check if member already has full savings recorded for this period
        if (existingPaid >= expectedAmount) {
          skippedDuplicates.push({
            memberId: item.memberId,
            memberName,
            alreadyPaid: existingPaid,
            expectedAmount,
            reason: 'Savings already recorded in full for this period',
          });
          continue;
        }

        // Support legitimate partial payment up to remaining balance
        const remainingAllowed = Math.max(0, expectedAmount - existingPaid);
        const allowedDelta = Math.min(deltaAmount, remainingAllowed);
        if (allowedDelta <= 0) {
          skippedDuplicates.push({
            memberId: item.memberId,
            memberName,
            alreadyPaid: existingPaid,
            expectedAmount,
            reason: 'No remaining balance due for this period',
          });
          continue;
        }

        const newTotalPaid = existingPaid + allowedDelta;
        const isPaidFull = newTotalPaid >= expectedAmount;
        const itemMode = item.paymentMode || paymentMode;
        const itemNotes = (item.remarks || remarks || '').trim();

        totalDeltaSavings += allowedDelta;

        const contributionPayload = {
          id: docId,
          contribId: docId,
          contrib_id: docId,
          groupId,
          group_id: groupId,
          memberId: item.memberId,
          member_id: item.memberId,
          month,
          year,
          expectedAmount,
          expected_amount: expectedAmount,
          paidAmount: newTotalPaid,
          paid_amount: newTotalPaid,
          amount: newTotalPaid,
          regularHaftaAmount: newTotalPaid,
          regular_hafta_amount: newTotalPaid,
          totalPaid: newTotalPaid,
          total_paid: newTotalPaid,
          loanPrincipalPaid: number(existingData?.loanPrincipalPaid || existingData?.loan_principal_paid || 0),
          loan_principal_paid: number(existingData?.loanPrincipalPaid || existingData?.loan_principal_paid || 0),
          interestAmount: number(existingData?.interestAmount || existingData?.interest_amount || 0),
          interest_amount: number(existingData?.interestAmount || existingData?.interest_amount || 0),
          interest: number(existingData?.interest || existingData?.interestAmount || 0),
          status: isPaidFull ? 'PAID' : 'PARTIAL',
          status_lower: isPaidFull ? 'paid' : 'partial', // Flutter lowercase enum compatibility
          source: 'BULK_COLLECTION',
          paymentDate: effectiveDate,
          payment_date: effectiveDate,
          paymentMode: itemMode,
          payment_mode: itemMode,
          notes: itemNotes,
          remarks: itemNotes,
          createdAt: existingData?.createdAt || effectiveDate,
          updatedAt: effectiveDate,
        };

        const actId = `ACT_${Date.now()}_${item.memberId}_bulk_saving`;
        const actRef = db.collection('transactions').doc(actId);
        const activityPayload = {
          id: actId,
          groupId,
          type: 'saving',
          type_flutter: 'monthlyInvestment', // Flutter AppTransaction enum compatibility
          amount: allowedDelta,
          description: `Bulk monthly savings ₹${allowedDelta} received from ${memberName} (${month}/${year})`,
          memberId: item.memberId,
          memberName,
          referenceId: docId,
          source: 'BULK_COLLECTION',
          date: effectiveDate,
          createdAt: effectiveDate,
        };

        // Stage writes
        transaction.set(ref, contributionPayload, { merge: true });
        transaction.set(actRef, activityPayload);

        contributionsToWrite.push(contributionPayload);
        transactionsToWrite.push(activityPayload);
        processedItems.push({
          memberId: item.memberId,
          memberName,
          amountCollected: allowedDelta,
          newTotalPaid,
        });

        // Format for Flutter subcollections
        flutterContributions.push(
          formatFlutterContribution({
            contribId: docId,
            memberId: item.memberId,
            memberName,
            amount: newTotalPaid,
            expectedAmount,
            month,
            year,
            paymentMode: itemMode,
            paymentDate: effectiveDate,
            notes: itemNotes,
          })
        );

        flutterTransactions.push(
          formatFlutterTransaction({
            actId,
            groupId,
            memberId: item.memberId,
            memberName,
            amount: allowedDelta,
            description: `Monthly savings ₹${allowedDelta} received from ${memberName}`,
            date: effectiveDate,
          })
        );
      }

      // 5. Update Group Totals ONLY if new savings were collected
      const currentTotalSavings = number(groupData.totalSavings || groupData.total_savings || 0);
      const currentAvailable = number(groupData.availableBalance ?? groupData.available_balance ?? 0);
      const currentOutstanding = number(groupData.activeLoans || groupData.active_loans || groupData.totalOutstandingLoans || 0);

      const newTotalSavings = currentTotalSavings + totalDeltaSavings;
      const newAvailableBalance = Math.round((currentAvailable + totalDeltaSavings) * 100) / 100;
      const newTotalFund = Math.round((newAvailableBalance + currentOutstanding) * 100) / 100;

      if (totalDeltaSavings > 0) {
        transaction.update(groupRef, {
          totalSavings: newTotalSavings,
          total_savings: newTotalSavings,
          availableBalance: newAvailableBalance,
          available_balance: newAvailableBalance,
          rawAvailableBalance: newAvailableBalance,
          totalFund: newTotalFund,
          total_fund: newTotalFund,
          updatedAt: effectiveDate,
        });
      }

      // 6. Record idempotency marker
      const idempotencyPayload = {
        requestId,
        groupId,
        month,
        year,
        itemsCount: validItems.length,
        processedCount: processedItems.length,
        skippedCount: skippedDuplicates.length,
        totalCollected: totalDeltaSavings,
        skippedDuplicates,
        executedAt: effectiveDate,
      };
      transaction.set(idempotencyRef, idempotencyPayload);

      return {
        isDuplicate: false,
        totalCollected: totalDeltaSavings,
        count: processedItems.length,
        skippedDuplicates,
        processedItems,
        newTotalSavings,
        newAvailableBalance,
        newTotalFund,
        flutterContributions,
        flutterTransactions,
      };
    });

    if (transactionResult.isDuplicate) {
      return res.status(200).json({
        success: true,
        isIdempotentReplay: true,
        message: 'This bulk request was already processed. Duplicate writes prevented.',
        data: transactionResult.previousData,
      });
    }

    // 7. Non-blocking Flutter Cross-Project Replication via Outbox (only if new savings collected)
    let syncResult = null;
    if (transactionResult.totalCollected > 0 && transactionResult.flutterContributions.length > 0) {
      syncResult = await syncBulkContributionsToFlutter({
        groupId,
        contributions: transactionResult.flutterContributions,
        transactions: transactionResult.flutterTransactions,
        totalDeltaSavings: transactionResult.totalCollected,
      });
    }

    res.status(201).json({
      success: true,
      message: transactionResult.count > 0
        ? `Bulk monthly savings of ₹${transactionResult.totalCollected.toLocaleString('en-IN')} recorded for ${transactionResult.count} members.`
        : 'All selected members already have savings recorded for this period. Duplicate writes prevented.',
      count: transactionResult.count,
      totalCollected: transactionResult.totalCollected,
      skippedDuplicates: transactionResult.skippedDuplicates || [],
      groupBalances: {
        totalSavings: transactionResult.newTotalSavings,
        availableBalance: transactionResult.newAvailableBalance,
        totalFund: transactionResult.newTotalFund,
      },
      syncResult,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBulkSavingsPreview,
  recordBulkSavings,
};
