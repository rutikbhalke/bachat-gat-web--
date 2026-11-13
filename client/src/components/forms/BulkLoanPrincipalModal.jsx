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
  // Amount inputs state: map of loanId -> number/string
  const [amountMap, setAmountMap] = useState({});
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

        // Pre-select all loans who have monthly principal due > 0
        const initialSelected = {};
        const initialAmounts = {};
        const initialModes = {};

        (res.loans || []).forEach((l) => {
          const hasDue = (l.monthlyPrincipalDue || 0) > 0;
          initialSelected[l.loanId] = hasDue;
          initialAmounts[l.loanId] = (l.monthlyPrincipalDue || 0).toString();
          initialModes[l.loanId] = 'UPI';
        });

        setSelectedMap(initialSelected);
        setAmountMap(initialAmounts);
        setModeMap(initialModes);
      }
    } catch (err) {
      console.error('Failed to load bulk loan principal preview:', err);
      showError({
        title: 'Error Loading Loan Dues',
        message: err.message || 'Could not fetch active loan principal dues.',
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
    if (!previewData?.loans) return { count: 0, totalAmount: 0, validItems: [] };
    let count = 0;
    let totalAmount = 0;
    const validItems = [];

    previewData.loans.forEach((l) => {
      if (selectedMap[l.loanId]) {
        const amt = parseFloat(amountMap[l.loanId] || 0);
        if (amt > 0) {
          count++;
          totalAmount += amt;
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
            amount: amt,
            paymentMode: modeMap[l.loanId] || globalMode,
            remarks: remarks.trim(),
          });
        }
      }
    });

    return { count, totalAmount, validItems };
  }, [previewData, selectedMap, amountMap, modeMap, globalMode, remarks]);

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
      nextSelected[l.loanId] = (l.monthlyPrincipalDue || 0) > 0;
    });
    setSelectedMap(nextSelected);
  };

  const handleAutoFillDues = () => {
    const nextAmounts = { ...amountMap };
    (previewData?.loans || []).forEach((l) => {
      nextAmounts[l.loanId] = (l.monthlyPrincipalDue || 0).toString();
    });
    setAmountMap(nextAmounts);
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
    if (val > maxAllowed) {
      setAmountMap((prev) => ({ ...prev, [loanId]: maxAllowed.toString() }));
      return;
    }
    setAmountMap((prev) => ({ ...prev, [loanId]: rawValue }));
  };

  // Form submission with idempotency protection and double confirmation
  const handleSubmit = async () => {
    if (submitting) return;

    const { count, totalAmount, validItems } = selectedSummary;

    if (count === 0 || totalAmount <= 0) {
      showError({
        title: 'No Loans Selected',
        message: 'Please select at least one loan with a principal collection amount greater than ₹0.',
      });
      return;
    }

    const monthName = months.find((m) => m.value === selectedMonth)?.label || selectedMonth;

    // Confirmation Dialog
    const confirmed = await askConfirm({
      title: 'Confirm Bulk Loan Principal Collection',
      message: `Record bulk loan principal collection for ${monthName} ${selectedYear}?`,
      details: [
        { label: 'Selected Loans', value: `${count} Loans` },
        { label: 'Period', value: `${monthName} ${selectedYear}` },
        { label: 'Collection Date', value: formatDate(collectionDate) },
        { label: 'Total Principal Amount', value: formatCurrency(totalAmount), highlight: true },
        { label: 'Primary Payment Mode', value: globalMode },
        { label: 'Accounting Rule', value: 'Principal Only • 0% Interest • 0% Savings' },
      ],
      confirmText: `Collect ${formatCurrency(totalAmount)} Principal`,
      confirmVariant: 'primary',
    });

    if (!confirmed) return;

    try {
      setSubmitting(true);
      const res = await loanService.recordBulkLoanPrincipal({
        month: selectedMonth,
        year: selectedYear,
        items: validItems,
        clientRequestId: sessionRequestIdRef.current,
        paymentMode: globalMode,
        remarks: remarks.trim(),
        paymentDate: collectionDate,
      });

      if (res && res.success) {
        if (res.isIdempotentReplay) {
          showSuccess({
            title: 'Already Recorded',
            message: 'This bulk loan principal request was already recorded. Duplicate writes were prevented.',
          });
        } else if (res.skippedDuplicates && res.skippedDuplicates.length > 0) {
          showSuccess({
            title: 'Principal Collection Recorded',
            message: `Successfully collected ${formatCurrency(res.totalCollected ?? totalAmount)} principal from ${res.count ?? count} loans. ${res.skippedDuplicates.length} loans were skipped because their installment was already fully paid.`,
          });
        } else {
          showSuccess({
            title: 'Principal Collection Recorded',
            message: `Successfully collected ${formatCurrency(res.totalCollected ?? totalAmount)} principal from ${res.count ?? count} loans for ${monthName} ${selectedYear}.`,
          });
        }
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      console.error('Failed to submit bulk loan principal:', err);
      showError({
        title: 'Bulk Principal Collection Failed',
        message: err.message || 'An error occurred while recording bulk loan principal.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Monthly Loan Principal Collection"
      maxWidth="1040px"
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
                background: '#FEF3C7',
                border: '1px solid #FDE68A',
                fontSize: '0.75rem',
                color: '#92400E',
                fontWeight: 700,
              }}
            >
              <Coins size={14} />
              <span>Principal Only • 0% Interest</span>
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

        {/* 5 Summary Stat Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
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
              {previewData?.paidLoansCount ?? 0} Fully Paid · {previewData?.pendingLoansCount ?? 0} Pending
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
              MONTH EXPECTED
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#4F46E5' }}>
              {previewData ? formatCurrency(previewData.totalMonthlyPrincipalExpected) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Scheduled installment principal
            </div>
          </div>

          {/* Card 3: Already Collected */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid #0EA5E9',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={14} color="#0EA5E9" />
              ALREADY COLLECTED
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#0284C7' }}>
              {previewData ? formatCurrency(previewData.totalAlreadyCollected) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Collected for this period
            </div>
          </div>

          {/* Card 4: Remaining Principal Due */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid #F59E0B',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} color="#F59E0B" />
              REMAINING DUE
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#D97706' }}>
              {previewData ? formatCurrency(previewData.totalRemainingPrincipalDue) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Uncollected balance for period
            </div>
          </div>

          {/* Card 5: Selected to Collect */}
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
              {selectedSummary.count} of {filteredLoans.length} loans checked
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
              Fill Monthly Due
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
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={filteredLoans.length > 0 && filteredLoans.every((l) => selectedMap[l.loanId])}
                    onChange={handleToggleSelectAll}
                    disabled={loading || submitting || filteredLoans.length === 0}
                  />
                </th>
                <th>Member Name</th>
                <th>Member Code</th>
                <th>Loan ID</th>
                <th style={{ textAlign: 'right' }}>Total Principal</th>
                <th style={{ textAlign: 'right' }}>Already Paid</th>
                <th style={{ textAlign: 'right' }}>Monthly Due</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Collect Amount</th>
                <th style={{ width: '120px' }}>Payment Mode</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '36px' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--primary)' }} />
                    <div style={{ color: 'var(--text-secondary)' }}>Calculating loan principal installments...</div>
                  </td>
                </tr>
              ) : filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
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
                  const maxAllowed = Math.min(loan.monthlyPrincipalDue, loan.remainingPrincipal);

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

                      {/* Total Loan Principal */}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(loan.totalLoanPrincipal)}
                      </td>

                      {/* Already Paid Principal */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatCurrency(loan.totalPrincipalPaidSoFar)}
                        </div>
                        {loan.alreadyPaidForPeriod > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--success-text)', fontWeight: 600 }}>
                            +{formatCurrency(loan.alreadyPaidForPeriod)} this mo
                          </div>
                        )}
                      </td>

                      {/* Monthly Principal Due */}
                      <td style={{ textAlign: 'right', fontWeight: 700, color: loan.monthlyPrincipalDue > 0 ? '#D97706' : 'var(--success-text)' }}>
                        {formatCurrency(loan.monthlyPrincipalDue)}
                      </td>

                      {/* Collect Principal Amount Input */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>₹</span>
                          <input
                            type="number"
                            min="0"
                            max={maxAllowed}
                            step="1"
                            value={amountMap[loan.loanId] ?? ''}
                            onChange={(e) => handleAmountChange(loan.loanId, e.target.value, maxAllowed)}
                            disabled={!isSelected || submitting}
                            className="form-input"
                            style={{
                              width: '100px',
                              textAlign: 'right',
                              padding: '4px 8px',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              borderColor: isSelected ? 'var(--primary)' : undefined,
                            }}
                          />
                        </div>
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
                    Collect {selectedSummary.totalAmount > 0 ? formatCurrency(selectedSummary.totalAmount) : 'Principal'}
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

