import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Modal from '../common/Modal';
import { savingsService } from '../../services/savingsService';
import { formatCurrency, formatMonthYear } from '../../utils/formatters';
import { usePopup } from '../../context/PopupContext';
import {
  Users,
  PiggyBank,
  CheckCircle2,
  AlertCircle,
  Search,
  CheckSquare,
  Square,
  RefreshCw,
  Info,
  Calendar,
  CreditCard,
  ShieldCheck,
  Zap,
} from 'lucide-react';

const BulkSavingsModal = ({ isOpen, onClose, onSuccess }) => {
  const currentDate = new Date();
  const { showError, askConfirm, showSuccess } = usePopup();

  const [selectedMonth, setSelectedMonth] = useState((currentDate.getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear().toString());
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [globalMode, setGlobalMode] = useState('UPI');
  const [remarks, setRemarks] = useState('');

  // Row selection state: map of memberId -> boolean
  const [selectedMap, setSelectedMap] = useState({});
  // Amount inputs state: map of memberId -> number/string
  const [amountMap, setAmountMap] = useState({});
  // Mode override state: map of memberId -> string
  const [modeMap, setModeMap] = useState({});

  // Session-bound submission key for idempotent protection
  const sessionRequestIdRef = useRef(`BULK_${Date.now()}`);

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
      const res = await savingsService.getBulkSavingsPreview({
        month: parseInt(month, 10),
        year: parseInt(year, 10),
      });

      if (res && res.success) {
        setPreviewData(res);

        // Pre-select all members who have remaining dues > 0
        const initialSelected = {};
        const initialAmounts = {};
        const initialModes = {};

        (res.members || []).forEach((m) => {
          const hasDue = m.remainingDue > 0;
          initialSelected[m.memberId] = hasDue;
          initialAmounts[m.memberId] = (m.remainingDue > 0 ? m.remainingDue : 0).toString();
          initialModes[m.memberId] = 'UPI';
        });

        setSelectedMap(initialSelected);
        setAmountMap(initialAmounts);
        setModeMap(initialModes);
      }
    } catch (err) {
      console.error('Failed to load bulk savings preview:', err);
      showError({
        title: 'Error Loading Dues',
        message: err.message || 'Could not fetch member dues.',
      });
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (isOpen) {
      sessionRequestIdRef.current = `BULK_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      fetchPreview(selectedMonth, selectedYear);
    }
  }, [isOpen, selectedMonth, selectedYear, fetchPreview]);

  // Filtered members list based on search term
  const filteredMembers = useMemo(() => {
    if (!previewData?.members) return [];
    if (!search.trim()) return previewData.members;
    const term = search.toLowerCase();
    return previewData.members.filter(
      (m) =>
        m.memberName.toLowerCase().includes(term) ||
        m.memberCode.toLowerCase().includes(term) ||
        (m.phone && m.phone.includes(term))
    );
  }, [previewData, search]);

  // Compute selected totals live
  const selectedSummary = useMemo(() => {
    if (!previewData?.members) return { count: 0, totalAmount: 0, validItems: [] };
    let count = 0;
    let totalAmount = 0;
    const validItems = [];

    previewData.members.forEach((m) => {
      if (selectedMap[m.memberId]) {
        const amt = parseFloat(amountMap[m.memberId] || 0);
        if (amt > 0) {
          count++;
          totalAmount += amt;
          validItems.push({
            memberId: m.memberId,
            memberName: m.memberName,
            memberCode: m.memberCode,
            configuredShare: m.configuredShare,
            expectedAmount: m.configuredShare,
            alreadyPaid: m.alreadyPaid,
            remainingDue: m.remainingDue,
            amount: amt,
            paymentMode: modeMap[m.memberId] || globalMode,
            remarks: remarks.trim(),
          });
        }
      }
    });

    return { count, totalAmount, validItems };
  }, [previewData, selectedMap, amountMap, modeMap, globalMode, remarks]);

  // Select all / Deselect all handlers
  const handleToggleSelectAll = () => {
    const allSelected = filteredMembers.every((m) => selectedMap[m.memberId]);
    const nextSelected = { ...selectedMap };
    filteredMembers.forEach((m) => {
      nextSelected[m.memberId] = !allSelected;
    });
    setSelectedMap(nextSelected);
  };

  const handleSelectOnlyPending = () => {
    const nextSelected = {};
    (previewData?.members || []).forEach((m) => {
      nextSelected[m.memberId] = m.remainingDue > 0;
    });
    setSelectedMap(nextSelected);
  };

  const handleAutoFillDues = () => {
    const nextAmounts = { ...amountMap };
    (previewData?.members || []).forEach((m) => {
      nextAmounts[m.memberId] = m.remainingDue.toString();
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

  // Form submission with idempotency protection and confirmation
  const handleSubmit = async () => {
    if (submitting) return; // Prevent duplicate submission while a request is processing

    const { count, totalAmount, validItems } = selectedSummary;

    if (count === 0 || totalAmount <= 0) {
      showError({
        title: 'No Members Selected',
        message: 'Please select at least one member with a payment amount greater than ₹0.',
      });
      return;
    }

    const monthName = months.find((m) => m.value === selectedMonth)?.label || selectedMonth;

    // Rich Confirmation Dialog
    const confirmed = await askConfirm({
      title: 'Confirm Bulk Savings Collection',
      message: `Record bulk monthly savings for ${monthName} ${selectedYear}?`,
      details: [
        { label: 'Selected Members', value: `${count} Members` },
        { label: 'Period', value: `${monthName} ${selectedYear}` },
        { label: 'Total Collection Amount', value: formatCurrency(totalAmount), highlight: true },
        { label: 'Primary Payment Mode', value: globalMode },
        { label: 'Cross-Project Sync', value: 'Queued to Flutter App (bachatgatapp-5158b)' },
      ],
      confirmText: `Collect ${formatCurrency(totalAmount)}`,
      confirmVariant: 'primary',
    });

    if (!confirmed) return;

    try {
      setSubmitting(true);
      const res = await savingsService.recordBulkSavings({
        month: selectedMonth,
        year: selectedYear,
        items: validItems,
        clientRequestId: sessionRequestIdRef.current,
        paymentMode: globalMode,
        remarks: remarks.trim(),
        paymentDate: currentDate.toISOString(),
      });

      if (res && res.success) {
        if (res.isIdempotentReplay) {
          showSuccess({
            title: 'Already Recorded',
            message: 'This bulk savings request was already recorded. Duplicate writes were prevented.',
          });
        } else if (res.skippedDuplicates && res.skippedDuplicates.length > 0) {
          showSuccess({
            title: 'Bulk Savings Recorded',
            message: `Successfully collected ${formatCurrency(res.totalCollected ?? totalAmount)} from ${res.count ?? count} members. ${res.skippedDuplicates.length} members already had savings recorded and were safely skipped to prevent duplicates.`,
          });
        } else {
          showSuccess({
            title: 'Bulk Savings Recorded',
            message: `Successfully collected ${formatCurrency(res.totalCollected ?? totalAmount)} from ${res.count ?? count} members for ${monthName} ${selectedYear}.`,
          });
        }
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      console.error('Failed to submit bulk savings:', err);
      showError({
        title: 'Bulk Collection Failed',
        message: err.message || 'An error occurred while recording bulk savings.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Monthly Savings Collection"
      maxWidth="980px"
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

          {/* Cross-Project Sync Info Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: 'var(--radius-full)',
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              fontSize: '0.75rem',
              color: '#1D4ED8',
              fontWeight: 600,
            }}
          >
            <Zap size={14} />
            <span>Flutter Sync Queue Active</span>
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '12px',
          }}
        >
          {/* Card 1: Active Members */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid var(--primary)',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={14} color="var(--primary)" />
              ACTIVE MEMBERS
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px' }}>
              {previewData?.totalActiveMembers ?? '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {previewData?.paidMembersCount ?? 0} Fully Paid · {previewData?.pendingMembersCount ?? (previewData?.partialMembersCount ?? 0) + (previewData?.unpaidMembersCount ?? 0)} Pending
            </div>
          </div>

          {/* Card 2: Total Month Target / Expected */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid #6366F1',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PiggyBank size={14} color="#6366F1" />
              MONTH EXPECTED
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#4F46E5' }}>
              {previewData ? formatCurrency(previewData.totalExpected) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Already Paid: {previewData ? formatCurrency(previewData.totalAlreadyPaid) : '—'}
            </div>
          </div>

          {/* Card 3: Remaining Due */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid #F59E0B',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} color="#F59E0B" />
              REMAINING DUES
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#D97706' }}>
              {previewData ? formatCurrency(previewData.totalRemainingDue) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Uncollected balance for period
            </div>
          </div>

          {/* Card 4: Selected for Collection */}
          <div
            className="card"
            style={{
              padding: '12px 14px',
              borderLeft: '4px solid #10B981',
              background: '#F0FDF4',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={14} color="#10B981" />
              SELECTED TO COLLECT
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px', color: '#065F46' }}>
              {formatCurrency(selectedSummary.totalAmount)}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 600 }}>
              {selectedSummary.count} of {filteredMembers.length} members checked
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
          {/* Search Member */}
          <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 200px' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Search member name or code..."
              style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Quick Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.78rem' }}
            >
              Toggle All
            </button>
            <button
              type="button"
              onClick={handleSelectOnlyPending}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.78rem' }}
            >
              Select Only Pending
            </button>
            <button
              type="button"
              onClick={handleAutoFillDues}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600 }}
            >
              Fill Remaining Dues
            </button>

            {/* Global Payment Mode */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Mode:</span>
              <select
                value={globalMode}
                onChange={(e) => handleApplyGlobalMode(e.target.value)}
                className="form-select"
                style={{ width: '100px', fontSize: '0.8rem', padding: '4px 8px' }}
              >
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
          </div>
        </div>

        {/* Member Table */}
        <div
          style={{
            maxHeight: '360px',
            overflowY: 'auto',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-card)',
          }}
        >
          <table className="table" style={{ margin: 0, width: '100%', fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 2 }}>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={filteredMembers.length > 0 && filteredMembers.every((m) => selectedMap[m.memberId])}
                    onChange={handleToggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th>Member</th>
                <th style={{ textAlign: 'right' }}>Share (Config)</th>
                <th style={{ textAlign: 'right' }}>Already Paid</th>
                <th style={{ textAlign: 'right' }}>Pending Due</th>
                <th style={{ width: '150px' }}>Collect Amount (₹)</th>
                <th style={{ width: '110px' }}>Mode</th>
                <th style={{ textAlign: 'center', width: '90px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    {loading ? 'Loading member dues...' : 'No active members match your filter.'}
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => {
                  const isChecked = Boolean(selectedMap[m.memberId]);
                  const amtVal = amountMap[m.memberId] ?? '';
                  const itemMode = modeMap[m.memberId] || globalMode;

                  return (
                    <tr
                      key={m.memberId}
                      style={{
                        background: isChecked ? '#F8FAFC' : 'transparent',
                        opacity: m.isPaidFull && !isChecked ? 0.65 : 1,
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedMap((prev) => ({ ...prev, [m.memberId]: checked }));
                            if (checked && (!amountMap[m.memberId] || amountMap[m.memberId] === '0')) {
                              setAmountMap((prev) => ({
                                ...prev,
                                [m.memberId]: (m.remainingDue > 0 ? m.remainingDue : m.configuredShare).toString(),
                              }));
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>

                      {/* Member Info */}
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.memberName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span>#{m.memberCode}</span>
                          {m.hasActiveLoan && (
                            <span
                              style={{
                                background: '#FEF3C7',
                                color: '#92400E',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '0.68rem',
                                fontWeight: 600,
                              }}
                            >
                              Active Loan
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Configured Share */}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(m.configuredShare)}
                      </td>

                      {/* Already Paid */}
                      <td style={{ textAlign: 'right', color: m.alreadyPaid > 0 ? '#10B981' : 'var(--text-muted)', fontWeight: 600 }}>
                        {formatCurrency(m.alreadyPaid)}
                      </td>

                      {/* Remaining Due */}
                      <td style={{ textAlign: 'right', color: m.remainingDue > 0 ? '#D97706' : '#10B981', fontWeight: 700 }}>
                        {formatCurrency(m.remainingDue)}
                      </td>

                      {/* Amount to Collect Input */}
                      <td>
                        <input
                          type="number"
                          className="form-input"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            textAlign: 'right',
                            borderColor: isChecked && parseFloat(amtVal || 0) > 0 ? 'var(--primary)' : undefined,
                          }}
                          value={amtVal}
                          disabled={!isChecked}
                          min="0"
                          step="1"
                          onChange={(e) => {
                            const val = e.target.value;
                            setAmountMap((prev) => ({ ...prev, [m.memberId]: val }));
                          }}
                        />
                      </td>

                      {/* Payment Mode */}
                      <td>
                        <select
                          className="form-select"
                          style={{ padding: '4px 6px', fontSize: '0.8rem' }}
                          value={itemMode}
                          disabled={!isChecked}
                          onChange={(e) => {
                            const val = e.target.value;
                            setModeMap((prev) => ({ ...prev, [m.memberId]: val }));
                          }}
                        >
                          <option value="UPI">UPI</option>
                          <option value="CASH">Cash</option>
                          <option value="BANK_TRANSFER">Bank</option>
                          <option value="CHEQUE">Cheque</option>
                        </select>
                      </td>

                      {/* Status Badge */}
                      <td style={{ textAlign: 'center' }}>
                        {m.isPaidFull ? (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: '#DCFCE7',
                              color: '#15803D',
                              whiteSpace: 'nowrap',
                              display: 'inline-block',
                            }}
                            title={`Already recorded ${formatCurrency(m.alreadyPaid)} for this month`}
                          >
                            ✓ Already Recorded
                          </span>
                        ) : m.isPartial ? (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: '#FEF3C7',
                              color: '#B45309',
                              whiteSpace: 'nowrap',
                              display: 'inline-block',
                            }}
                            title={`Paid: ${formatCurrency(m.alreadyPaid)}, Remaining: ${formatCurrency(m.remainingDue)}`}
                          >
                            Partial (Paid {formatCurrency(m.alreadyPaid)})
                          </span>
                        ) : (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: '#FEE2E2',
                              color: '#B91C1C',
                              whiteSpace: 'nowrap',
                              display: 'inline-block',
                            }}
                          >
                            Unpaid
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Remarks & Notes */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Optional collection remarks (e.g., Monthly meeting collection at Mandir hall)..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
        </div>

        {/* Bottom Submission Action Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            <ShieldCheck size={18} color="var(--primary)" />
            <span>
              Idempotent session · Safe atomic updates · No double increments
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary"
              style={{ padding: '8px 18px' }}
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
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
              }}
            >
              {submitting ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>Recording Collection...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>
                    Collect {formatCurrency(selectedSummary.totalAmount)} ({selectedSummary.count} Members)
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

export default BulkSavingsModal;
