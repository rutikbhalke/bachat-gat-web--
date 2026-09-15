import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../common/Modal';
import { loanService, getNextUnpaidInstallment, isLoanFullyPaid, getMemberExpectedRegularHapta, resolveRegularHapta } from '../../services/loanService';
import { formatCurrency, formatMonthYear } from '../../utils/formatters';
import { usePopup } from '../../context/PopupContext';
import { CreditCard, AlertCircle, CheckCircle2, Info } from 'lucide-react';

const RecordRepaymentModal = ({ isOpen, onClose, onSuccess, initialLoanId = null, initialMemberId = null }) => {
  const currentDate = new Date();
  const { showError, askConfirm, showSuccess } = usePopup();
  const [activeLoans, setActiveLoans] = useState([]);
  const [loanDetails, setLoanDetails] = useState(null);
  const [formData, setFormData] = useState({
    loan_id: initialLoanId ? initialLoanId.toString() : '',
    payment_month: (currentDate.getMonth() + 1).toString(),
    payment_year: currentDate.getFullYear().toString(),
    regular_hafta_amount: '1000',
    principal_repayment_amount: '0',
    payment_date: currentDate.toISOString().split('T')[0],
    payment_mode: 'UPI',
    remarks: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load a loan and auto-populate all installment fields based on the first unpaid installment
  const loadLoanAndPopulate = useCallback(async (targetLoanId) => {
    if (!targetLoanId) {
      setLoanDetails(null);
      return;
    }
    try {
      const res = await loanService.getLoanById(targetLoanId);
      if (res.success && res.loan) {
        setLoanDetails(res.loan);
        const schedule = res.loan.schedule || [];
        const nextUnpaid = getNextUnpaidInstallment(schedule) || schedule[0];
        const defaultRegHapta = resolveRegularHapta(res.loan, res.loan.member, null);

        if (nextUnpaid) {
          const regAmount = (nextUnpaid.regularHaptaRemaining !== undefined && nextUnpaid.regularHaptaRemaining !== null)
            ? nextUnpaid.regularHaptaRemaining
            : defaultRegHapta;
          const prinAmount = (nextUnpaid.principalRemaining !== undefined && nextUnpaid.principalRemaining !== null)
            ? nextUnpaid.principalRemaining
            : 0;

          setFormData((prev) => ({
            ...prev,
            loan_id: targetLoanId.toString(),
            payment_month: nextUnpaid.month.toString(),
            payment_year: nextUnpaid.year.toString(),
            regular_hafta_amount: regAmount.toString(),
            principal_repayment_amount: prinAmount.toString(),
          }));
        } else if (res.loan.isFullyPaid) {
          setFormData((prev) => ({
            ...prev,
            loan_id: targetLoanId.toString(),
            regular_hafta_amount: '0',
            principal_repayment_amount: '0',
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load loan details in RecordRepaymentModal:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccess('');

      const initializeModal = async () => {
        try {
          const res = await loanService.getAllLoans({ status: 'active' });
          if (res.success && res.loans) {
            setActiveLoans(res.loans);
            const memberLoan = initialMemberId
              ? res.loans.find((l) => String(l.memberId || l.member_id) === String(initialMemberId))
              : null;
            const targetId = initialLoanId
              ? initialLoanId.toString()
              : (memberLoan ? memberLoan.id.toString() : (res.loans.length > 0 ? res.loans[0].id.toString() : ''));
            
            if (targetId) {
              await loadLoanAndPopulate(targetId);
            }
          }
        } catch (err) {
          console.error('Failed to initialize loans in modal:', err);
        }
      };

      initializeModal();
    }
  }, [isOpen, initialLoanId, initialMemberId, loadLoanAndPopulate]);

  const selectedLoan = activeLoans.find((l) => l.id.toString() === formData.loan_id.toString()) || loanDetails;
  const currentOutstanding = selectedLoan ? parseFloat(selectedLoan.outstanding_amount || selectedLoan.pendingPrincipal || 0) : 0;
  const interestRate = Number(selectedLoan?.interest_rate || selectedLoan?.interestRate || 2.0);
  const isFullyRepaid = Boolean(selectedLoan && (selectedLoan.status === 'CLOSED' || loanDetails?.isFullyPaid || (currentOutstanding <= 0 && loanDetails?.schedule?.every(s => s.status === 'PAID'))));

  // Active schedule installment matching current selected month & year
  const currentMonthNum = parseInt(formData.payment_month, 10);
  const currentYearNum = parseInt(formData.payment_year, 10);
  const activeScheduleRow = loanDetails?.schedule?.find(
    (s) => s.month === currentMonthNum && s.year === currentYearNum
  ) || getNextUnpaidInstallment(loanDetails?.schedule) || loanDetails?.schedule?.[0];

  const applicableInstallmentNumber = activeScheduleRow
    ? activeScheduleRow.installmentNumber
    : ((Number(selectedLoan?.lastInstallmentPaid) || 0) + 1);

  // Expected / Due values per authoritative schedule
  const expectedRegularHapta = activeScheduleRow
    ? activeScheduleRow.regularHaptaExpected
    : getMemberExpectedRegularHapta(loanDetails?.member, selectedLoan, null);

  const expectedPrincipal = activeScheduleRow
    ? activeScheduleRow.principalExpected
    : (selectedLoan ? Math.min(currentOutstanding, Math.round((Number(selectedLoan.principal_amount || selectedLoan.principalAmount || 0)) / 10)) : 0);

  const expectedInterest = activeScheduleRow
    ? activeScheduleRow.interestExpected
    : (selectedLoan ? Math.round((currentOutstanding * interestRate) / 100) : 0);

  const expectedTotalDue = expectedRegularHapta + expectedPrincipal + expectedInterest;

  // Already paid for this specific scheduled installment (multi-payment aggregation)
  const alreadyPaidRegular = activeScheduleRow ? (activeScheduleRow.regularHaptaPaid || 0) : 0;
  const alreadyPaidPrincipal = activeScheduleRow ? (activeScheduleRow.principalPaid || 0) : 0;
  const alreadyPaidInterest = activeScheduleRow ? (activeScheduleRow.interestPaid || 0) : 0;

  // Actual values entered for current payment
  const regularHafta = Math.round(parseFloat(formData.regular_hafta_amount) || 0);
  const principalRepay = Math.round(parseFloat(formData.principal_repayment_amount) || 0);
  const calculatedInterest = Math.max(0, Math.round((expectedInterest - alreadyPaidInterest) * 100) / 100);
  const totalPayment = Math.round((regularHafta + principalRepay + calculatedInterest) * 100) / 100;
  const newOutstanding = Math.max(0, Math.round((currentOutstanding - principalRepay) * 100) / 100);

  // Remaining values after this transaction
  const remainingRegular = Math.max(0, expectedRegularHapta - alreadyPaidRegular - regularHafta);
  const remainingPrincipal = Math.max(0, expectedPrincipal - alreadyPaidPrincipal - principalRepay);
  const rawRemainingInterest = Math.max(0, Math.round((expectedInterest - alreadyPaidInterest - calculatedInterest) * 100) / 100);
  const remainingInterest = rawRemainingInterest < 0.01 ? 0 : rawRemainingInterest;
  const totalRemaining = remainingRegular + remainingPrincipal + remainingInterest;

  const installmentStatusPreview = (remainingRegular === 0 && remainingPrincipal === 0 && remainingInterest === 0)
    ? 'PAID'
    : (alreadyPaidRegular + alreadyPaidPrincipal + alreadyPaidInterest + regularHafta + principalRepay + calculatedInterest > 0)
      ? 'PARTIAL'
      : (activeScheduleRow?.status === 'DUE' ? 'DUE' : 'UPCOMING');

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // When loan_id changes, fetch that loan's schedule and auto-fill its first unpaid installment
    if (name === 'loan_id') {
      setFormData((prev) => ({ ...prev, loan_id: value }));
      loadLoanAndPopulate(value);
      setError('');
      return;
    }

    // Changing actual payment_date does NOT mutate the scheduled installment month/year
    if (name === 'payment_date') {
      setFormData((prev) => ({ ...prev, payment_date: value }));
      setError('');
      return;
    }

    // When changing month or year, auto-populate that specific installment's remaining dues
    if (name === 'payment_month' || name === 'payment_year') {
      const newMonth = name === 'payment_month' ? parseInt(value, 10) : parseInt(formData.payment_month, 10);
      const newYear = name === 'payment_year' ? parseInt(value, 10) : parseInt(formData.payment_year, 10);
      const matched = loanDetails?.schedule?.find((s) => s.month === newMonth && s.year === newYear);
      
      if (matched) {
        setFormData((prev) => ({
          ...prev,
          [name]: value,
          principal_repayment_amount: matched.principalRemaining.toString(),
          regular_hafta_amount: matched.regularHaptaRemaining.toString(),
        }));
      } else {
        setFormData((prev) => ({ ...prev, [name]: value }));
      }
      setError('');
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSetFullRepayment = () => {
    setFormData((prev) => ({
      ...prev,
      principal_repayment_amount: currentOutstanding.toString(),
      regular_hafta_amount: (activeScheduleRow ? activeScheduleRow.regularHaptaRemaining : expectedRegularHapta).toString(),
    }));
  };

  const handleAutoFillExpected = () => {
    setFormData((prev) => ({
      ...prev,
      principal_repayment_amount: (activeScheduleRow ? activeScheduleRow.principalRemaining : expectedPrincipal).toString(),
      regular_hafta_amount: (activeScheduleRow ? activeScheduleRow.regularHaptaRemaining : expectedRegularHapta).toString(),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.loan_id) {
      showError({
        title: 'Validation Error',
        message: 'Please select an active loan.',
      });
      return;
    }

    if (isFullyRepaid) {
      showError({
        title: 'Loan Closed',
        message: 'This loan is already closed. No further payment is allowed.',
        details: [
          { label: 'Loan Status', value: 'CLOSED', highlight: true },
          { label: 'Outstanding Balance', value: '₹0' },
        ],
      });
      return;
    }

    const selectedInstNum = Number(applicableInstallmentNumber);
    if (!selectedInstNum || isNaN(selectedInstNum) || selectedInstNum <= 0) {
      showError({
        title: 'Validation Error',
        message: 'Unable to determine the selected installment. Please reopen the payment form.',
      });
      return;
    }

    if (regularHafta < 0) {
      showError({
        title: 'Validation Error',
        message: 'Regular Hapta amount cannot be negative.',
      });
      return;
    }

    if (principalRepay < 0) {
      showError({
        title: 'Validation Error',
        message: 'Principal payment must be greater than or equal to ₹0.',
      });
      return;
    }

    if (principalRepay > currentOutstanding) {
      showError({
        title: 'Validation Error',
        message: 'Principal payment cannot exceed outstanding principal.',
        details: [
          { label: 'Outstanding Principal', value: formatCurrency(currentOutstanding) },
          { label: 'Entered Principal', value: formatCurrency(principalRepay), highlight: true },
        ],
      });
      return;
    }

    if (totalPayment <= 0) {
      showError({
        title: 'Validation Error',
        message: 'Total payment must be greater than ₹0.',
      });
      return;
    }

    const memberName = loanDetails?.memberName || selectedLoan?.member_name || 'Member';
    const loanCode = selectedLoan?.loan_number || selectedLoan?.loanNumber || selectedLoan?.id || 'Loan';

    // Confirmation Modal with exact breakdown
    const confirmed = await askConfirm({
      title: 'Confirm Payment',
      message: 'Are you sure you want to record this payment?',
      details: [
        { label: 'Member', value: memberName },
        { label: 'Loan #', value: loanCode },
        { label: 'Installment Period', value: `${formatMonthYear(formData.payment_month, formData.payment_year)} (#${selectedInstNum})` },
        { label: 'Regular Hapta', value: formatCurrency(regularHafta) },
        { label: 'Loan Principal', value: formatCurrency(principalRepay) },
        { label: 'Interest', value: formatCurrency(calculatedInterest) },
        { label: 'Loan Repayment', value: formatCurrency(principalRepay + calculatedInterest) },
        { label: 'Total Cash Paid', value: formatCurrency(totalPayment), highlight: true },
      ],
      confirmText: 'Confirm Payment',
      confirmVariant: 'primary',
    });

    if (!confirmed) {
      // Clean cancel: 0 database writes!
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await loanService.recordRepayment({
        loan_id: formData.loan_id,
        loanId: formData.loan_id,
        installmentNumber: selectedInstNum,
        installment_number: selectedInstNum,
        payment_month: parseInt(formData.payment_month, 10),
        paymentMonth: parseInt(formData.payment_month, 10),
        payment_year: parseInt(formData.payment_year, 10),
        paymentYear: parseInt(formData.payment_year, 10),
        regular_hafta_amount: regularHafta,
        regularHaftaAmount: regularHafta,
        principal_repayment_amount: principalRepay,
        principalAmount: principalRepay,
        interest_amount: calculatedInterest,
        interestAmount: calculatedInterest,
        payment_date: formData.payment_date,
        paymentDate: formData.payment_date,
        payment_mode: formData.payment_mode,
        paymentMode: formData.payment_mode,
        remarks: formData.remarks || '',
      });

      if (res.success) {
        showSuccess({
          title: 'Repayment Recorded',
          message: `Repayment of ${formatCurrency(totalPayment)} recorded successfully for ${memberName}.`,
        });
        onSuccess();
        onClose();
      }
    } catch (err) {
      showError({
        title: 'Payment Failed',
        error: err,
        details: [
          { label: 'Member', value: memberName },
          { label: 'Total Payment', value: formatCurrency(totalPayment) },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Loan Payment" maxWidth="600px" bodyPadding="0">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100%', minHeight: 0, overflow: 'hidden' }}>
        {/* Scrollable Form Content Area */}
        <div style={{ flex: '1 1 auto', overflowY: 'auto', overflowX: 'hidden', minHeight: 0, padding: '20px 24px', overscrollBehavior: 'contain' }}>
          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '10px 14px', background: 'var(--success-light)', color: 'var(--success-text)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} /> {success}
            </div>
          )}

          {isFullyRepaid && (
            <div style={{ padding: '12px 16px', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} />
              <div>
                <strong>Loan Fully Repaid</strong> — All installments and principal have been completely settled.
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Select Active Loan *</label>
            <select name="loan_id" className="form-select" value={formData.loan_id} onChange={handleChange} tabIndex={0} required>
              <option value="">-- Select Active Loan --</option>
              {activeLoans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.member_name} ({l.member_code}) — {l.loan_number} | Outstanding: {formatCurrency(l.outstanding_amount)} (@ {l.interest_rate}%/mo)
                </option>
              ))}
            </select>
          </div>

          {selectedLoan && (
            <div
              className="form-grid-3"
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: '#F8FAFC',
                border: '1px solid var(--border-color)',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>OUTSTANDING</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(currentOutstanding)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>MONTHLY RATE</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--info)' }}>{interestRate}%</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>INSTALLMENT #</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>{applicableInstallmentNumber}</div>
              </div>
            </div>
          )}

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Scheduled Installment Month *</label>
              <select name="payment_month" className="form-select" value={formData.payment_month} onChange={handleChange} tabIndex={0} disabled={isFullyRepaid} required>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Scheduled Year *</label>
              <input
                type="number"
                name="payment_year"
                className="form-input"
                value={formData.payment_year}
                onChange={handleChange}
                tabIndex={0}
                min="2020"
                max="2040"
                disabled={isFullyRepaid}
                required
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Regular Hapta (₹) *</label>
                {alreadyPaidRegular > 0 && (
                  <span style={{ fontSize: '0.72rem', color: alreadyPaidRegular >= expectedRegularHapta ? 'var(--success-text)' : 'var(--info)', fontWeight: 600 }}>
                    {alreadyPaidRegular >= expectedRegularHapta ? '✓ Already Paid' : `Paid: ${formatCurrency(alreadyPaidRegular)}`}
                  </span>
                )}
              </div>
              <input
                type="number"
                name="regular_hafta_amount"
                className="form-input"
                style={{ marginTop: '6px' }}
                value={formData.regular_hafta_amount}
                onChange={handleChange}
                tabIndex={0}
                min="0"
                step="1"
                disabled={isFullyRepaid}
              />
              {alreadyPaidRegular >= expectedRegularHapta && (
                <div style={{ fontSize: '0.75rem', color: 'var(--success-text)', marginTop: '4px', fontWeight: 500 }}>
                  ✓ Regular monthly savings of {formatCurrency(expectedRegularHapta)} is already recorded for this month.
                </div>
              )}
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Loan Principal (₹)</label>
                {selectedLoan && !isFullyRepaid && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleAutoFillExpected}
                      tabIndex={0}
                      style={{ background: 'none', color: 'var(--info)', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', border: 'none', padding: 0 }}
                    >
                      Auto-fill Due
                    </button>
                    <button
                      type="button"
                      onClick={handleSetFullRepayment}
                      tabIndex={0}
                      style={{ background: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', border: 'none', padding: 0 }}
                    >
                      Pay Full
                    </button>
                  </div>
                )}
              </div>
              <input
                type="number"
                name="principal_repayment_amount"
                className="form-input"
                value={formData.principal_repayment_amount}
                onChange={handleChange}
                tabIndex={0}
                min="0"
                max={currentOutstanding}
                step="1"
                disabled={isFullyRepaid}
              />
            </div>
          </div>

          {/* Automatic Regular Savings Explanation Banner */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: alreadyPaidRegular >= expectedRegularHapta ? '#F0FDF4' : '#FFF7ED',
              border: `1px solid ${alreadyPaidRegular >= expectedRegularHapta ? '#BBF7D0' : '#FED7AA'}`,
              marginBottom: '16px',
              fontSize: '0.825rem',
              color: alreadyPaidRegular >= expectedRegularHapta ? '#15803D' : '#C2410C',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 500,
            }}
          >
            <Info size={16} />
            <span>
              {alreadyPaidRegular >= expectedRegularHapta
                ? 'Regular Savings: Already Paid for this period (₹0 added). Only loan repayment will be recorded.'
                : 'Regular Savings (₹1,000) is included and recorded automatically together with this loan payment.'}
            </span>
          </div>

          {/* 3-Panel Repayment Comparison: Expected vs Actual vs Remaining */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            {/* Panel 1: EXPECTED / DUE */}
            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: '#F8FAFC',
                border: '1px solid var(--border-color)',
                fontSize: '0.8rem',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '8px', letterSpacing: '0.5px' }}>
                EXPECTED (INST #{applicableInstallmentNumber})
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Regular Hapta (Savings):</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(expectedRegularHapta)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Loan Principal:</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(expectedPrincipal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Loan Interest ({interestRate}%):</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(expectedInterest)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--primary)', fontWeight: 600 }}>
                <span>Loan Total Due:</span>
                <span>{formatCurrency(expectedPrincipal + expectedInterest)}</span>
              </div>
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-primary)' }}>
                <span>Total Member Due:</span>
                <span>{formatCurrency(expectedTotalDue)}</span>
              </div>
            </div>

            {/* Panel 2: ACTUAL PAYMENT */}
            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                fontSize: '0.8rem',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.72rem', marginBottom: '8px', letterSpacing: '0.5px' }}>
                ACTUAL PAYMENT
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Regular Savings:</span>
                <span style={{ fontWeight: 600, color: alreadyPaidRegular >= expectedRegularHapta ? 'var(--success-text)' : 'var(--text-primary)' }}>
                  {formatCurrency(regularHafta)} {alreadyPaidRegular >= expectedRegularHapta ? '(Already Paid)' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Loan Principal:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(principalRepay)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Loan Interest:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(calculatedInterest)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--primary)', fontWeight: 600 }}>
                <span>Loan Repaid:</span>
                <span>{formatCurrency(principalRepay + calculatedInterest)}</span>
              </div>
              <div style={{ height: '1px', background: 'var(--accent-border)', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--primary)' }}>
                <span>Total Cash Paid:</span>
                <span>{formatCurrency(totalPayment)}</span>
              </div>
            </div>

            {/* Panel 3: REMAINING */}
            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: totalRemaining === 0 ? 'rgba(34, 197, 94, 0.06)' : 'rgba(234, 179, 8, 0.06)',
                border: `1px solid ${totalRemaining === 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
                fontSize: '0.8rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, color: totalRemaining === 0 ? '#15803d' : '#b45309', fontSize: '0.72rem', letterSpacing: '0.5px' }}>
                  REMAINING
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: installmentStatusPreview === 'PAID' ? '#dcfce7' : installmentStatusPreview === 'PARTIAL' ? '#fef3c7' : '#fee2e2',
                    color: installmentStatusPreview === 'PAID' ? '#166534' : installmentStatusPreview === 'PARTIAL' ? '#92400e' : '#991b1b',
                  }}
                >
                  {installmentStatusPreview}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Regular Hapta:</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(remainingRegular)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Principal:</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(remainingPrincipal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Interest:</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(remainingInterest)}</span>
              </div>
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: totalRemaining === 0 ? '#15803d' : '#b45309' }}>
                <span>Remaining:</span>
                <span>{formatCurrency(totalRemaining)}</span>
              </div>
            </div>
          </div>

          {/* Live Outstanding Balance Status */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              marginBottom: '16px',
              fontSize: '0.85rem',
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>New Loan Outstanding Balance:</span>
            <span style={{ fontWeight: 700, color: newOutstanding === 0 ? 'var(--success)' : 'var(--text-primary)', fontSize: '0.95rem' }}>
              {formatCurrency(newOutstanding)} {newOutstanding === 0 && <span style={{ color: 'var(--success)', fontWeight: 600 }}> (Will mark loan as CLOSED)</span>}
            </span>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Payment Date (Actual Transaction)</label>
              <input
                type="date"
                name="payment_date"
                className="form-input"
                value={formData.payment_date}
                onChange={handleChange}
                tabIndex={0}
                disabled={isFullyRepaid}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Payment Mode</label>
              <select name="payment_mode" className="form-select" value={formData.payment_mode} onChange={handleChange} tabIndex={0} disabled={isFullyRepaid}>
                <option value="UPI">UPI / QR Code</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Payment Remarks</label>
            <input
              type="text"
              name="remarks"
              className="form-input"
              placeholder="e.g. Received via GPay, receipt #104"
              value={formData.remarks}
              onChange={handleChange}
              tabIndex={0}
              disabled={isFullyRepaid}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            flexShrink: 0,
            background: 'var(--bg-card)',
            padding: '16px 24px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button type="button" onClick={onClose} className="btn-secondary" tabIndex={0}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading || !selectedLoan || isFullyRepaid} tabIndex={0}>
            <CreditCard size={16} />
            {loading ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default RecordRepaymentModal;
