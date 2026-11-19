import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Modal from '../common/Modal';
import { loanService } from '../../services/loanService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { usePopup } from '../../context/PopupContext';
import {
  HandCoins,
  CheckCircle2,
  AlertCircle,
  Search,
  CheckSquare,
  Square,
  RefreshCw,
  Calendar,
  CreditCard,
  ShieldCheck,
  Coins,
  FileCheck2,
  Info,
} from 'lucide-react';

const BulkLoanPrincipalModal = ({ isOpen, onClose, onSuccess }) => {
  const currentDate = new Date();
  const { showError, askConfirm, showSuccess } = usePopup();

  const [selectedMonth, setSelectedMonth] = useState((currentDate.getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear().toString());
  const [collectionDate, setCollectionDate] = useState(currentDate.toISOString().split('T')[0]);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [globalMode, setGlobalMode] = useState('UPI');
  const [remarks, setRemarks] = useState('');

  // Row selection state: map of loanId -> boolean
  const [selectedMap, setSelectedMap] = useState({});
  // Principal amount inputs state: map of loanId -> number/string
  const [amountMap, setAmountMap] = useState({});
  // Current 1% interest amount inputs state: map of loanId -> number/string
  const [currentInterestMap, setCurrentInterestMap] = useState({});
  // Historical previous pending interest inputs state: map of loanId -> number/string
  const [previousInterestMap, setPreviousInterestMap] = useState({});
  // Mode override state: map of loanId -> string
  const [modeMap, setModeMap] = useState({});

  // Session-bound submission key for idempotent protection
  const sessionRequestIdRef = useRef(`BULK_LOAN_${Date.now()}`);

  const months = [
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  const years = [
    currentDate.getFullYear() - 1,
    currentDate.getFullYear(),
    currentDate.getFullYear() + 1,
  ];

  // Fetch preview dues for target month and year
  const fetchPreview = useCallback(async (month, year) => {
    try {
      setLoading(true);
      const res = await loanService.getBulkLoanPrincipalPreview({
        month: parseInt(month, 10),
        year: parseInt(year, 10),
      });

      if (res && res.success) {
        setPreviewData(res);

        // Pre-select all loans who have monthly principal, current interest, or previous pending interest due > 0
        const initialSelected = {};
        const initialAmounts = {};
        const initialCurrentInterests = {};
        const initialPreviousInterests = {};
        const initialModes = {};

        (res.loans || []).forEach((l) => {
          const curInt = l.currentInterestDue !== undefined ? l.currentInterestDue : (l.monthlyInterestDue || 0);
          const prevInt = l.previousPendingInterest || 0;
          const prinDue = l.monthlyPrincipalDue || 0;
          const hasDue = prinDue > 0 || curInt > 0 || prevInt > 0;

          initialSelected[l.loanId] = hasDue;
          initialAmounts[l.loanId] = prinDue.toString();
          initialCurrentInterests[l.loanId] = curInt.toString();
          initialPreviousInterests[l.loanId] = prevInt.toString();
          initialModes[l.loanId] = 'UPI';
        });

        setSelectedMap(initialSelected);
        setAmountMap(initialAmounts);
        setCurrentInterestMap(initialCurrentInterests);
        setPreviousInterestMap(initialPreviousInterests);
        setModeMap(initialModes);
      }
    } catch (err) {
      console.error('Failed to load bulk loan principal preview:', err);
      showError({
        title: 'Error Loading Loan Dues',
        message: err.message || 'Could not fetch active loan dues.',
      });
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (isOpen) {
      sessionRequestIdRef.current = `BULK_LOAN_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setCollectionDate(new Date().toISOString().split('T')[0]);
      fetchPreview(selectedMonth, selectedYear);
    }
  }, [isOpen, selectedMonth, selectedYear, fetchPreview]);

  // Filtered loans list based on search term
  const filteredLoans = useMemo(() => {
    if (!previewData?.loans) return [];
    if (!search.trim()) return previewData.loans;
    const term = search.toLowerCase();
    return previewData.loans.filter(
      (l) =>
        l.memberName.toLowerCase().includes(term) ||
        l.memberCode.toLowerCase().includes(term) ||
        l.loanNumber.toLowerCase().includes(term) ||
        (l.phone && l.phone.includes(term))
    );
  }, [previewData, search]);

  // Compute selected totals live
  const selectedSummary = useMemo(() => {
    if (!previewData?.loans) {
      return { count: 0, totalPrincipal: 0, totalCurrentInterest: 0, totalPreviousInterest: 0, totalInterest: 0, totalAmount: 0, validItems: [] };
    }
    let count = 0;
    let totalPrincipal = 0;
    let totalCurrentInterest = 0;
    let totalPreviousInterest = 0;
    const validItems = [];

    previewData.loans.forEach((l) => {
      if (selectedMap[l.loanId]) {
        const prinAmt = parseFloat(amountMap[l.loanId] || 0);
        const curIntAmt = parseFloat(currentInterestMap[l.loanId] || 0);
        const prevIntAmt = parseFloat(previousInterestMap[l.loanId] || 0);
        const totalIntAmt = Math.round((curIntAmt + prevIntAmt) * 100) / 100;
        const totalItem = Math.round((prinAmt + totalIntAmt) * 100) / 100;

        if (totalItem > 0) {
          count++;
          totalPrincipal += prinAmt;
          totalCurrentInterest += curIntAmt;
          totalPreviousInterest += prevIntAmt;
          validItems.push({
            loanId: l.loanId,
            loanNumber: l.loanNumber,
            memberId: l.memberId,
            memberName: l.memberName,
            memberCode: l.memberCode,
            totalLoanPrincipal: l.totalLoanPrincipal,
            remainingPrincipal: l.remainingPrincipal,
            installmentNumber: l.installmentNumber,
            scheduledMonthlyPrincipal: l.scheduledMonthlyPrincipal,
            alreadyPaidForPeriod: l.alreadyPaidForPeriod,
            monthlyPrincipalDue: l.monthlyPrincipalDue,
            scheduledMonthlyInterest: l.scheduledMonthlyInterest,
            interestPaidForPeriod: l.interestPaidForPeriod,
            currentInterestDue: l.currentInterestDue ?? l.monthlyInterestDue,
            previousPendingInterest: l.previousPendingInterest || 0,
            principalAmount: prinAmt,
            currentInterestAmount: curIntAmt,
            previousPendingInterestAmount: prevIntAmt,
            interestAmount: totalIntAmt,
            amount: totalItem,
            paymentMode: modeMap[l.loanId] || globalMode,
            remarks: remarks.trim(),
          });
        }
      }
    });

    const totalInterest = Math.round((totalCurrentInterest + totalPreviousInterest) * 100) / 100;
    return {
      count,
      totalPrincipal: Math.round(totalPrincipal * 100) / 100,
      totalCurrentInterest: Math.round(totalCurrentInterest * 100) / 100,
      totalPreviousInterest: Math.round(totalPreviousInterest * 100) / 100,
      totalInterest,
      totalAmount: Math.round((totalPrincipal + totalInterest) * 100) / 100,
      validItems,
    };
  }, [previewData, selectedMap, amountMap, currentInterestMap, previousInterestMap, modeMap, globalMode, remarks]);

  // Select all / Deselect all handlers
  const handleToggleSelectAll = () => {
    const allSelected = filteredLoans.length > 0 && filteredLoans.every((l) => selectedMap[l.loanId]);
    const nextSelected = { ...selectedMap };
    filteredLoans.forEach((l) => {
      nextSelected[l.loanId] = !allSelected;
    });
    setSelectedMap(nextSelected);
  };

  const handleSelectOnlyPending = () => {
    const nextSelected = {};
    (previewData?.loans || []).forEach((l) => {
      const curInt = l.currentInterestDue !== undefined ? l.currentInterestDue : (l.monthlyInterestDue || 0);
      const prevInt = l.previousPendingInterest || 0;
      const prinDue = l.monthlyPrincipalDue || 0;
      nextSelected[l.loanId] = prinDue > 0 || curInt > 0 || prevInt > 0;
    });
    setSelectedMap(nextSelected);
  };

  const handleAutoFillDues = () => {
    const nextAmounts = { ...amountMap };
    const nextCurrentInterests = { ...currentInterestMap };
    const nextPreviousInterests = { ...previousInterestMap };
    (previewData?.loans || []).forEach((l) => {
      nextAmounts[l.loanId] = (l.monthlyPrincipalDue || 0).toString();
      nextCurrentInterests[l.loanId] = (l.currentInterestDue !== undefined ? l.currentInterestDue : (l.monthlyInterestDue || 0)).toString();
      nextPreviousInterests[l.loanId] = (l.previousPendingInterest || 0).toString();
    });
    setAmountMap(nextAmounts);
    setCurrentInterestMap(nextCurrentInterests);
    setPreviousInterestMap(nextPreviousInterests);
  };

  const handleApplyGlobalMode = (mode) => {
    setGlobalMode(mode);
    const nextModes = { ...modeMap };
    Object.keys(selectedMap).forEach((id) => {
      if (selectedMap[id]) nextModes[id] = mode;
    });
    setModeMap(nextModes);
  };

  // Safe handler for amount input changes (prevents negative values or exceeding maximum due)
  const handleAmountChange = (loanId, rawValue, maxAllowed) => {
    if (rawValue === '') {
      setAmountMap((prev) => ({ ...prev, [loanId]: '' }));
      return;
    }
    const val = parseFloat(rawValue);
    if (isNaN(val) || val < 0) {
      setAmountMap((prev) => ({ ...prev, [loanId]: '0' }));
      return;
    }
    if (maxAllowed !== undefined && maxAllowed > 0 && val > maxAllowed) {
      setAmountMap((prev) => ({ ...prev, [loanId]: maxAllowed.toString() }));
      return;
    }
    setAmountMap((prev) => ({ ...prev, [loanId]: rawValue }));
  };

  const handleCurrentInterestChange = (loanId, rawValue, maxAllowed) => {
    if (rawValue === '') {
      setCurrentInterestMap((prev) => ({ ...prev, [loanId]: '' }));
      return;
    }
    const val = parseFloat(rawValue);
    if (isNaN(val) || val < 0) {
      setCurrentInterestMap((prev) => ({ ...prev, [loanId]: '0' }));
      return;
    }
    if (maxAllowed !== undefined && maxAllowed > 0 && val > maxAllowed) {
      setCurrentInterestMap((prev) => ({ ...prev, [loanId]: maxAllowed.toString() }));
      return;
    }
    setCurrentInterestMap((prev) => ({ ...prev, [loanId]: rawValue }));
  };

  const handlePreviousInterestChange = (loanId, rawValue, maxAllowed) => {
    if (rawValue === '') {
      setPreviousInterestMap((prev) => ({ ...prev, [loanId]: '' }));
      return;
    }
    const val = parseFloat(rawValue);
    if (isNaN(val) || val < 0) {
      setPreviousInterestMap((prev) => ({ ...prev, [loanId]: '0' }));
      return;
    }
    if (maxAllowed !== undefined && maxAllowed > 0 && val > maxAllowed) {
      setPreviousInterestMap((prev) => ({ ...prev, [loanId]: maxAllowed.toString() }));
      return;
    }
    setPreviousInterestMap((prev) => ({ ...prev, [loanId]: rawValue }));
  };

  // Form submission with idempotency protection and double confirmation
  const handleSubmit = async () => {
    if (submitting) return;

    try {
      const {
        count,
        totalPrincipal,
        totalCurrentInterest,
        totalPreviousInterest,
        totalInterest,
        totalAmount,
        validItems,
      } = selectedSummary;

      if (count === 0 || totalAmount <= 0) {
        showError({
          title: 'No Loans Selected',
          message: 'Please select at least one loan with a collection amount greater than ₹0.',
        });
        return;
      }

      const monthName = months.find((m) => m.value === selectedMonth)?.label || selectedMonth;

      // Confirmation Dialog
      const confirmed = await askConfirm({
        title: 'Confirm Bulk Loan Repayment (Principal + Interest)',
        message: `Record bulk monthly loan collection for ${monthName} ${selectedYear}?`,
        details: [
          { label: 'Selected Loans', value: `${count} Loans` },
          { label: 'Period', value: `${monthName} ${selectedYear}` },
          { label: 'Collection Date', value: formatDate(collectionDate) },
          { label: 'Principal to Collect', value: formatCurrency(totalPrincipal) },
          { label: 'Current 1% Interest', value: formatCurrency(totalCurrentInterest) },
          ...(totalPreviousInterest > 0
            ? [{ label: 'Previous Pending Interest', value: formatCurrency(totalPreviousInterest) }]
            : []),
          { label: 'Total Interest', value: formatCurrency(totalInterest) },
          { label: 'Total Collection Amount', value: formatCurrency(totalAmount), highlight: true },
          { label: 'Primary Payment Mode', value: globalMode },
          { label: 'Accounting Rule', value: 'Principal reduces Active Loans • Total Interest credited as Interest Income' },
        ],
        confirmText: `Collect ${formatCurrency(totalAmount)} (Prin + Int)`,
        confirmVariant: 'primary',
      });

      if (!confirmed) return;

      setSubmitting(true);

      // Fresh unique requestId for this submission attempt
      const submissionRequestId = `BULK_LOAN_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const res = await loanService.recordBulkLoanPrincipal({
        month: selectedMonth,
        year: selectedYear,
        items: validItems,
        clientRequestId: submissionRequestId,
        paymentMode: globalMode,
        remarks: remarks.trim(),
        paymentDate: collectionDate,
      });

      if (res && res.success) {
        const collectedTotal = res.totalCollected ?? totalAmount;
        const collectedPrincipal = res.totalPrincipalCollected ?? totalPrincipal;
        const collectedInterest = res.totalInterestCollected ?? totalInterest;
        const collectedCount = res.count ?? count;

        if (res.isIdempotentReplay) {
          showSuccess({
            title: 'Already Recorded',
            message: 'This bulk loan repayment request was already recorded. Duplicate writes were prevented.',
          });
        } else if (res.skippedDuplicates && res.skippedDuplicates.length > 0) {
          showSuccess({
            title: 'Loan Repayments Recorded',
            message: `Successfully collected ${formatCurrency(collectedTotal)} (Principal: ${formatCurrency(collectedPrincipal)}, Interest: ${formatCurrency(collectedInterest)}) from ${collectedCount} loans. ${res.skippedDuplicates.length} loans were skipped because their installment was already fully settled.`,
          });
        } else {
          showSuccess({
            title: 'Loan Repayments Recorded',
            message: `Successfully collected ${formatCurrency(collectedTotal)} (Principal: ${formatCurrency(collectedPrincipal)}, Interest: ${formatCurrency(collectedInterest)}) from ${collectedCount} loans for ${monthName} ${selectedYear}.`,
          });
        }

        // Refresh preview data and notify parent
        await fetchPreview(selectedMonth, selectedYear);
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      console.error('Failed to submit bulk loan repayments:', err);
      showError({
        title: 'Bulk Loan Repayment Failed',
        message: err.message || 'An error occurred while recording bulk loan repayments.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Loan Repayment (Principal + 1% Interest)"
      maxWidth="1240px"
      bodyPadding="20px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Top Controls: Period Selector & Quick Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            background: 'var(--bg-secondary)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
          }}
        >
          {/* Month & Year Selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.875rem' }}>
              <Calendar size={18} color="var(--primary)" />
              <span>Collection Period:</span>
            </div>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="form-select"
              style={{ width: '130px', fontSize: '0.85rem' }}
              disabled={loading || submitting}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="form-select"
              style={{ width: '95px', fontSize: '0.85rem' }}
              disabled={loading || submitting}
            >
              {years.map((y) => (
                <option key={y} value={y.toString()}>
                  {y}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => fetchPreview(selectedMonth, selectedYear)}
              disabled={loading || submitting}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Refresh dues calculation"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Collection Date Selector & Accounting Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
              <span>Collection Date:</span>
              <input
                type="date"
                className="form-input"
                style={{ width: '140px', padding: '4px 8px', fontSize: '0.8rem' }}
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-full)',
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                fontSize: '0.75rem',
                color: '#065F46',
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={14} color="#059669" />
              <span>Principal + 1% Reducing Interest Collection</span>
            </div>
          </div>
        </div>

        {/* Informational Banner for Excluded Loans */}
        {previewData?.excludedLoans?.length > 0 && (
          <div
            style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              fontSize: '0.825rem',
              color: '#1E40AF',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                <Info size={16} color="#2563EB" />
                <span>
                  {previewData.excludedLoans.length} Active Loan(s) Excluded for {months.find((m) => m.value === selectedMonth)?.label} {selectedYear}
                </span>
              </div>
              {previewData.excludedLoans[0]?.nextEligibleMonth && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth(previewData.excludedLoans[0].nextEligibleMonth.toString());
                    setSelectedYear(previewData.excludedLoans[0].nextEligibleYear.toString());
                  }}
                  className="btn-primary"
                  style={{ padding: '4px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <span>Switch to {previewData.excludedLoans[0].nextEligibleLabel}</span>
                  <span>→</span>
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: '#1E3A8A' }}>
              {previewData.excludedLoans.map((ex) => (
                <div key={ex.loanId}>
                  • <strong>{ex.memberName}</strong> ({ex.loanNumber}): {ex.reason}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6 Summary Stat Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
          }}
        >
          {/* Card 1: Active Loans */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid var(--primary)',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <HandCoins size={14} color="var(--primary)" />
              ACTIVE LOANS
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px' }}>
              {previewData?.totalActiveLoans ?? '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {previewData?.paidLoansCount ?? 0} Paid · {previewData?.pendingLoansCount ?? 0} Pending
            </div>
          </div>

          {/* Card 2: Monthly Principal Expected */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid #6366F1',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} color="#6366F1" />
              PRINCIPAL DUE
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#4F46E5' }}>
              {previewData ? formatCurrency(previewData.totalRemainingPrincipalDue ?? previewData.totalMonthlyPrincipalExpected) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Scheduled monthly principal
            </div>
          </div>

          {/* Card 3: Monthly 1% Interest Expected */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid #F59E0B',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Coins size={14} color="#F59E0B" />
              1% INTEREST DUE
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#D97706' }}>
              {previewData ? formatCurrency(previewData.totalRemainingInterestDue ?? previewData.totalMonthlyInterestExpected ?? 0) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              1% monthly reducing interest
            </div>
          </div>

          {/* Card 4: Historical Previous Pending Interest */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid #EF4444',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} color="#EF4444" />
              PREV PENDING INT
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#DC2626' }}>
              {previewData ? formatCurrency(previewData.totalPreviousPendingInterest ?? 0) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Uncollected prior interest
            </div>
          </div>

          {/* Card 5: Total Expected Collection */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid #0EA5E9',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={14} color="#0EA5E9" />
              TOTAL PERIOD DUE
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#0284C7' }}>
              {previewData ? formatCurrency(previewData.totalCollectionExpected ?? ((previewData.totalRemainingPrincipalDue || 0) + (previewData.totalInterestDue || 0))) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Principal + All Interest
            </div>
          </div>

          {/* Card 6: Selected to Collect */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid #10B981',
              background: '#F0FDF4',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileCheck2 size={14} color="#10B981" />
              SELECTED TO COLLECT
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#065F46' }}>
              {formatCurrency(selectedSummary.totalAmount)}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 600 }}>
              Prin: {formatCurrency(selectedSummary.totalPrincipal)} • Int: {formatCurrency(selectedSummary.totalInterest)}
            </div>
          </div>
        </div>

        {/* Action Bar: Search, Bulk Toggles & Global Mode */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 200px' }}>
            <Search
              size={15}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search member, code or loan #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
              disabled={loading || submitting}
            />
          </div>

          {/* Bulk Toggles */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleToggleSelectAll}
              disabled={loading || submitting || filteredLoans.length === 0}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {filteredLoans.length > 0 && filteredLoans.every((l) => selectedMap[l.loanId]) ? (
                <>
                  <Square size={14} /> Deselect All
                </>
              ) : (
                <>
                  <CheckSquare size={14} /> Select All
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSelectOnlyPending}
              disabled={loading || submitting || !previewData?.loans}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              Select Only Pending
            </button>

            <button
              type="button"
              onClick={handleAutoFillDues}
              disabled={loading || submitting || !previewData?.loans}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              Fill All Dues
            </button>

            {/* Global Payment Mode */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CreditCard size={15} color="var(--text-muted)" />
              <select
                value={globalMode}
                onChange={(e) => handleApplyGlobalMode(e.target.value)}
                className="form-select"
                style={{ width: '110px', fontSize: '0.8rem', padding: '5px 8px' }}
                disabled={submitting}
              >
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>
        </div>

        {/* Member-wise Collection Table */}
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            maxHeight: '380px',
            overflowY: 'auto',
          }}
        >
          <table className="custom-table" style={{ margin: 0, fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg-secondary)' }}>
              <tr>
                <th style={{ width: '36px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={filteredLoans.length > 0 && filteredLoans.every((l) => selectedMap[l.loanId])}
                    onChange={handleToggleSelectAll}
                    disabled={loading || submitting || filteredLoans.length === 0}
                  />
                </th>
                <th>Member Name</th>
                <th>Member Code</th>
                <th>Loan ID / Inst</th>
                <th style={{ textAlign: 'right' }}>Outstanding Prin</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Monthly Prin (₹)</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Current 1% Int (₹)</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Prev Pending Int (₹)</th>
                <th style={{ width: '115px', textAlign: 'right' }}>Total Collection (₹)</th>
                <th style={{ width: '100px' }}>Mode</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '36px' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--primary)' }} />
                    <div style={{ color: 'var(--text-secondary)' }}>Calculating loan principal, 1% interest, and pending dues...</div>
                  </td>
                </tr>
              ) : filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
                      No eligible active loans found for {months.find((m) => m.value === selectedMonth)?.label} {selectedYear}.
                    </div>
                    {previewData?.excludedLoans?.length > 0 ? (
                      <div style={{ fontSize: '0.85rem', color: '#1E40AF', marginTop: '6px' }}>
                        {previewData.excludedLoans.length} active loan(s) exist, but per schedule rules their first installment begins in a subsequent month.
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        All loans in this group are either fully repaid or closed.
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredLoans.map((loan) => {
                  const isSelected = Boolean(selectedMap[loan.loanId]);
                  const maxAllowedPrin = loan.remainingPrincipal;
                  const maxAllowedCurInt = loan.currentInterestDue !== undefined ? loan.currentInterestDue : (loan.monthlyInterestDue ?? 0);
                  const maxAllowedPrevInt = loan.previousPendingInterest ?? 0;

                  const currentPrin = parseFloat(amountMap[loan.loanId] || 0);
                  const currentCurInt = parseFloat(currentInterestMap[loan.loanId] || 0);
                  const currentPrevInt = parseFloat(previousInterestMap[loan.loanId] || 0);
                  const currentTotal = Math.round((currentPrin + currentCurInt + currentPrevInt) * 100) / 100;

                  let statusBadge = (
                    <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                      PENDING
                    </span>
                  );
                  if (loan.status === 'PAID') {
                    statusBadge = (
                      <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                        PAID
                      </span>
                    );
                  } else if (loan.status === 'PARTIAL') {
                    statusBadge = (
                      <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                        PARTIAL
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={loan.loanId}
                      style={{
                        background: isSelected ? '#F0F9FF' : undefined,
                        opacity: loan.status === 'PAID' && !isSelected ? 0.75 : 1,
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) =>
                            setSelectedMap((prev) => ({ ...prev, [loan.loanId]: e.target.checked }))
                          }
                          disabled={submitting}
                        />
                      </td>

                      {/* Member Name */}
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {loan.memberName}
                      </td>

                      {/* Member Code */}
                      <td style={{ color: 'var(--text-muted)' }}>
                        <code>{loan.memberCode}</code>
                      </td>

                      {/* Loan ID */}
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.8rem' }}>
                          {loan.loanNumber}
                        </span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Inst #{loan.installmentNumber}
                        </div>
                      </td>

                      {/* Outstanding Principal */}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(loan.remainingPrincipal)}
                      </td>

                      {/* Collect Principal Amount Input */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <input
                            type="number"
                            min="0"
                            max={maxAllowedPrin}
                            step="1"
                            value={amountMap[loan.loanId] ?? ''}
                            onChange={(e) => handleAmountChange(loan.loanId, e.target.value, maxAllowedPrin)}
                            disabled={!isSelected || submitting}
                            className="form-input"
                            style={{
                              width: '90px',
                              textAlign: 'right',
                              padding: '4px 6px',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              borderColor: isSelected ? 'var(--primary)' : undefined,
                            }}
                          />
                          <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            Due: {formatCurrency(loan.monthlyPrincipalDue)}
                          </span>
                        </div>
                      </td>

                      {/* Collect Current 1% Interest Input */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <input
                            type="number"
                            min="0"
                            max={maxAllowedCurInt || undefined}
                            step="1"
                            value={currentInterestMap[loan.loanId] ?? ''}
                            onChange={(e) => handleCurrentInterestChange(loan.loanId, e.target.value, maxAllowedCurInt || 999999)}
                            disabled={!isSelected || submitting}
                            className="form-input"
                            style={{
                              width: '80px',
                              textAlign: 'right',
                              padding: '4px 6px',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              borderColor: isSelected ? '#D97706' : undefined,
                            }}
                          />
                          <span style={{ fontSize: '0.68rem', color: '#D97706', fontWeight: 600 }}>
                            1%: {formatCurrency(loan.currentInterestDue ?? loan.monthlyInterestDue)}
                          </span>
                        </div>
                      </td>

                      {/* Collect Previous Pending Interest Input */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <input
                            type="number"
                            min="0"
                            max={maxAllowedPrevInt || undefined}
                            step="1"
                            value={previousInterestMap[loan.loanId] ?? ''}
                            onChange={(e) => handlePreviousInterestChange(loan.loanId, e.target.value, maxAllowedPrevInt || 999999)}
                            disabled={!isSelected || submitting}
                            className="form-input"
                            style={{
                              width: '80px',
                              textAlign: 'right',
                              padding: '4px 6px',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              borderColor: isSelected ? '#DC2626' : undefined,
                            }}
                          />
                          <span style={{ fontSize: '0.68rem', color: (loan.previousPendingInterest || 0) > 0 ? '#DC2626' : '#94A3B8', fontWeight: 600 }}>
                            {(loan.previousPendingInterest || 0) > 0 ? `Unpaid: ${formatCurrency(loan.previousPendingInterest)}` : '₹0'}
                          </span>
                        </div>
                      </td>

                      {/* Total Installment Calculated Live */}
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#1E293B', fontSize: '0.9rem' }}>
                        {formatCurrency(currentTotal)}
                      </td>

                      {/* Row Payment Mode */}
                      <td>
                        <select
                          value={modeMap[loan.loanId] || globalMode}
                          onChange={(e) =>
                            setModeMap((prev) => ({ ...prev, [loan.loanId]: e.target.value }))
                          }
                          disabled={!isSelected || submitting}
                          className="form-select"
                          style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                        >
                          <option value="UPI">UPI</option>
                          <option value="Cash">Cash</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Cheque">Cheque</option>
                        </select>
                      </td>

                      {/* Status */}
                      <td style={{ textAlign: 'center' }}>{statusBadge}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Section: Optional Remarks & Submit Button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          {/* Optional Remarks */}
          <div style={{ flex: '1 1 300px', maxWidth: '420px' }}>
            <input
              type="text"
              placeholder="Optional collection batch remarks..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.85rem', padding: '7px 12px' }}
              disabled={submitting}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary"
              style={{ padding: '8px 18px', fontSize: '0.875rem' }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || selectedSummary.count === 0 || selectedSummary.totalAmount <= 0}
              className="btn-primary"
              style={{
                padding: '8px 22px',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {submitting ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>Recording Repayments...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>
                    Collect {selectedSummary.totalAmount > 0 ? formatCurrency(selectedSummary.totalAmount) : 'Repayments'} (Prin + Int)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BulkLoanPrincipalModal;

