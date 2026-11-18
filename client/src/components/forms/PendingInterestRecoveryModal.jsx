import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Modal from '../common/Modal';
import { loanService } from '../../services/loanService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { usePopup } from '../../context/PopupContext';
import {
  Coins,
  CheckCircle2,
  AlertCircle,
  Search,
  CheckSquare,
  Square,
  RefreshCw,
  Calendar,
  CreditCard,
  ShieldCheck,
  FileCheck2,
  Info,
  DollarSign,
  History,
} from 'lucide-react';

const PendingInterestRecoveryModal = ({ isOpen, onClose, onSuccess }) => {
  const currentDate = new Date();
  const { showError, askConfirm, showSuccess } = usePopup();

  const [collectionDate, setCollectionDate] = useState(currentDate.toISOString().split('T')[0]);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [globalMode, setGlobalMode] = useState('UPI');
  const [remarks, setRemarks] = useState('मागील हप्त्यांचे प्रलंबित व्याज जमा (Pending Interest Recovery)');

  // Selection & Amount states
  const [selectedMap, setSelectedMap] = useState({});
  const [amountMap, setAmountMap] = useState({});
  const [modeMap, setModeMap] = useState({});

  const sessionRequestIdRef = useRef(`INT_RECOV_${Date.now()}`);

  const fetchPreview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await loanService.getPendingInterestRecoveryPreview();
      if (res && res.success) {
        setPreviewData(res);
        const initialSelected = {};
        const initialAmounts = {};
        const initialModes = {};

        (res.items || []).forEach((item) => {
          initialSelected[item.loanId] = (item.uncollectedInterest || 0) > 0;
          initialAmounts[item.loanId] = (item.uncollectedInterest || 0).toString();
          initialModes[item.loanId] = 'UPI';
        });

        setSelectedMap(initialSelected);
        setAmountMap(initialAmounts);
        setModeMap(initialModes);
      }
    } catch (err) {
      console.error('Failed to load pending interest recovery preview:', err);
      showError({
        title: 'Error Loading Pending Interest',
        message: err.message || 'Could not fetch uncollected interest dues.',
      });
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (isOpen) {
      sessionRequestIdRef.current = `INT_RECOV_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setCollectionDate(new Date().toISOString().split('T')[0]);
      fetchPreview();
    }
  }, [isOpen, fetchPreview]);

  // Filtered loans list based on search term
  const filteredItems = useMemo(() => {
    if (!previewData?.items) return [];
    if (!search.trim()) return previewData.items;
    const term = search.toLowerCase();
    return previewData.items.filter(
      (item) =>
        item.memberName.toLowerCase().includes(term) ||
        item.memberCode.toLowerCase().includes(term) ||
        item.loanNumber.toLowerCase().includes(term) ||
        (item.phone && item.phone.includes(term))
    );
  }, [previewData, search]);

  // Selected totals live calculation
  const selectedSummary = useMemo(() => {
    if (!previewData?.items) return { count: 0, totalAmount: 0, validItems: [] };
    let count = 0;
    let totalAmount = 0;
    const validItems = [];

    previewData.items.forEach((item) => {
      if (selectedMap[item.loanId]) {
        const amt = parseFloat(amountMap[item.loanId] || 0);
        if (amt > 0) {
          count++;
          totalAmount += amt;
          validItems.push({
            loanId: item.loanId,
            loanNumber: item.loanNumber,
            memberId: item.memberId,
            memberName: item.memberName,
            memberCode: item.memberCode,
            amount: amt,
            paymentMode: modeMap[item.loanId] || globalMode,
            remarks: remarks.trim(),
          });
        }
      }
    });

    return { count, totalAmount, validItems };
  }, [previewData, selectedMap, amountMap, modeMap, globalMode, remarks]);

  const handleToggleSelectAll = () => {
    const allSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedMap[i.loanId]);
    const nextSelected = { ...selectedMap };
    filteredItems.forEach((i) => {
      nextSelected[i.loanId] = !allSelected;
    });
    setSelectedMap(nextSelected);
  };

  const handleAutoFillDues = () => {
    const nextAmounts = { ...amountMap };
    (previewData?.items || []).forEach((i) => {
      nextAmounts[i.loanId] = (i.uncollectedInterest || 0).toString();
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

  const handleSubmit = async () => {
    if (submitting) return;

    const { count, totalAmount, validItems } = selectedSummary;

    if (count === 0 || totalAmount <= 0) {
      showError({
        title: 'No Loans Selected',
        message: 'Please select at least one borrower with an interest recovery amount greater than ₹0.',
      });
      return;
    }

    const confirmed = await askConfirm({
      title: 'Confirm Pending Interest Recovery',
      message: `Recover uncollected loan interest totaling ${formatCurrency(totalAmount)} for ${count} borrower(s)?`,
      details: [
        { label: 'Selected Borrowers', value: `${count} Members` },
        { label: 'Collection Date', value: formatDate(collectionDate) },
        { label: 'Total Interest Amount', value: formatCurrency(totalAmount), highlight: true },
        { label: 'Primary Payment Mode', value: globalMode },
        { label: 'Accounting Rule', value: 'Interest Income Only • Loan Principal Untouched • Available Balance Increases' },
      ],
      confirmText: `Recover ${formatCurrency(totalAmount)} Interest`,
      confirmVariant: 'primary',
    });

    if (!confirmed) return;

    try {
      setSubmitting(true);
      const res = await loanService.recordPendingInterestRecovery({
        items: validItems,
        paymentDate: collectionDate,
        paymentMode: globalMode,
        remarks: remarks.trim(),
        clientRequestId: sessionRequestIdRef.current,
      });

      if (res && res.success) {
        showSuccess({
          title: 'Interest Recovered Successfully',
          message: res.message || `Successfully recovered ${formatCurrency(totalAmount)} pending interest.`,
        });
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      console.error('Failed to record pending interest recovery:', err);
      showError({
        title: 'Interest Recovery Failed',
        message: err.message || 'Could not record pending interest recovery.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pending Loan Interest Recovery (मागील हप्त्यांचे प्रलंबित व्याज जमा)"
      size="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '82vh', overflowY: 'auto', paddingRight: '4px' }}>
        
        {/* Accounting Rule Notice Banner */}
        <div
          style={{
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <ShieldCheck size={24} color="#15803D" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '0.85rem', color: '#166534', lineHeight: 1.4 }}>
            <strong>Financial Safety Guarantee:</strong> Recovering pending interest records transactions as <strong>Interest Income (व्याज जमा)</strong>.
            Loan principal and active loan balances remain completely untouched, while the Group's Available Balance and Total Fund increase strictly by the collected interest amount.
          </div>
        </div>

        {/* Global Controls & Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          {/* Card 1: Total Identified Pending Interest */}
          <div
            style={{
              background: '#FEF3C7',
              border: '1px solid #FCD34D',
              borderRadius: '10px',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: '#92400E', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Identified Uncollected Interest
            </span>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B45309' }}>
              {formatCurrency(previewData?.totalPendingInterest || 0)}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#92400E' }}>
              Across {previewData?.items?.length || 0} borrower(s)
            </span>
          </div>

          {/* Card 2: Selected Amount to Recover */}
          <div
            style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '10px',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: '#1E40AF', fontWeight: 600, textTransform: 'uppercase' }}>
              Selected Recovery Amount
            </span>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1D4ED8' }}>
              {formatCurrency(selectedSummary.totalAmount)}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#1E40AF' }}>
              {selectedSummary.count} borrower(s) selected
            </span>
          </div>

          {/* Card 3: Collection Date */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>
              Collection Date
            </label>
            <input
              type="date"
              value={collectionDate}
              onChange={(e) => setCollectionDate(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '0.85rem',
                fontWeight: 600,
                background: '#FFFFFF',
              }}
            />
          </div>

          {/* Card 4: Global Mode */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>
              Payment Mode
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['UPI', 'CASH', 'BANK'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleApplyGlobalMode(mode)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: globalMode === mode ? '2px solid #2563EB' : '1px solid #CBD5E1',
                    background: globalMode === mode ? '#EFF6FF' : '#FFFFFF',
                    color: globalMode === mode ? '#1D4ED8' : '#64748B',
                    fontWeight: globalMode === mode ? 700 : 500,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 240px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Search member name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="btn-outline"
              style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CheckSquare size={14} /> Toggle Select All
            </button>
            <button
              type="button"
              onClick={handleAutoFillDues}
              className="btn-outline"
              style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} /> Auto-fill Full Dues
            </button>
          </div>
        </div>

        {/* Borrowers Table */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: '8px' }} />
              <div>Auditing uncollected loan interest across records...</div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              <CheckCircle2 size={32} color="#16A34A" style={{ marginBottom: '8px' }} />
              <div style={{ fontWeight: 600, color: '#1E293B' }}>No Pending Interest Found</div>
              <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                All loan installments have their scheduled 1% monthly interest fully recorded!
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '10px 14px', width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={filteredItems.length > 0 && filteredItems.every((i) => selectedMap[i.loanId])}
                        onChange={handleToggleSelectAll}
                      />
                    </th>
                    <th style={{ padding: '10px 14px' }}>Member & Loan</th>
                    <th style={{ padding: '10px 14px' }}>Status</th>
                    <th style={{ padding: '10px 14px' }}>Original Loan</th>
                    <th style={{ padding: '10px 14px' }}>Unpaid Installment Reason</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Pending Interest Due</th>
                    <th style={{ padding: '10px 14px', width: '150px' }}>Recovery Amount (₹)</th>
                    <th style={{ padding: '10px 14px', width: '100px' }}>Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const isSelected = Boolean(selectedMap[item.loanId]);
                    const currentAmt = amountMap[item.loanId] ?? '';
                    const maxAllowed = item.uncollectedInterest;

                    return (
                      <tr
                        key={item.loanId}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: isSelected ? '#F0FDF4' : '#FFFFFF',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '12px 14px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              setSelectedMap((prev) => ({ ...prev, [item.loanId]: e.target.checked }));
                            }}
                          />
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#1E293B' }}>{item.memberName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            Code: {item.memberCode} • ID: {item.loanNumber || item.loanId.slice(-8)}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: item.status === 'CLOSED' ? '#E2E8F0' : '#DCFCE7',
                              color: item.status === 'CLOSED' ? '#475569' : '#166534',
                            }}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{formatCurrency(item.originalPrincipal)}</div>
                          {item.pendingPrincipal > 0 && (
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                              Bal: {formatCurrency(item.pendingPrincipal)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#475569', fontSize: '0.78rem' }}>
                          {item.unpaidInstallments && item.unpaidInstallments.length > 0 ? (
                            <div>
                              {item.unpaidInstallments.map((u, idx) => (
                                <div key={idx}>
                                  Inst #{u.installmentNumber} ({u.month}/{u.year}): Prin {formatCurrency(u.principalPaid)}, Int Paid {formatCurrency(u.interestPaid)} (Due: {formatCurrency(u.interestDue)})
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div>Historical uncollected interest from previous payments</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#B45309' }}>
                          {formatCurrency(item.uncollectedInterest)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <input
                            type="number"
                            min="0"
                            max={maxAllowed}
                            value={currentAmt}
                            onChange={(e) => handleAmountChange(item.loanId, e.target.value, maxAllowed)}
                            disabled={!isSelected}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              border: isSelected ? '1px solid #16A34A' : '1px solid #CBD5E1',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              textAlign: 'right',
                              background: isSelected ? '#FFFFFF' : '#F8FAFC',
                            }}
                          />
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <select
                            value={modeMap[item.loanId] || globalMode}
                            onChange={(e) => setModeMap((prev) => ({ ...prev, [item.loanId]: e.target.value }))}
                            disabled={!isSelected}
                            style={{
                              width: '100%',
                              padding: '5px 6px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.75rem',
                              background: '#FFFFFF',
                            }}
                          >
                            <option value="UPI">UPI</option>
                            <option value="CASH">Cash</option>
                            <option value="BANK">Bank</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '12px',
            borderTop: '1px solid #E2E8F0',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
            Selected: <strong>{selectedSummary.count} borrower(s)</strong> • Total: <strong style={{ color: '#16A34A', fontSize: '1rem' }}>{formatCurrency(selectedSummary.totalAmount)}</strong>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={onClose} className="btn-outline" disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="btn-primary"
              disabled={submitting || selectedSummary.count === 0 || selectedSummary.totalAmount <= 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                fontWeight: 700,
                background: selectedSummary.count > 0 ? '#16A34A' : undefined,
                borderColor: selectedSummary.count > 0 ? '#16A34A' : undefined,
              }}
            >
              {submitting ? (
                <>
                  <RefreshCw size={16} className="spin" /> Recording Recovery...
                </>
              ) : (
                <>
                  <Coins size={16} /> Recover {formatCurrency(selectedSummary.totalAmount)} Interest
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </Modal>
  );
};

export default PendingInterestRecoveryModal;

