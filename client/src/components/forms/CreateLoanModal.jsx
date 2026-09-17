import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { memberService } from '../../services/memberService';
import { loanService } from '../../services/loanService';
import { dashboardService } from '../../services/dashboardService';
import { formatCurrency, formatNumber, DEFAULT_GROUP_ID } from '../../utils/formatters';
import { usePopup } from '../../context/PopupContext';
import { HandCoins, AlertCircle, CheckCircle2, Calculator, Wallet } from 'lucide-react';

const CreateLoanModal = ({ isOpen, onClose, onSuccess, initialMemberId = null }) => {
  const { showError, askConfirm, showSuccess } = usePopup();
  const [members, setMembers] = useState([]);
  const [availableCash, setAvailableCash] = useState(null);
  const [formData, setFormData] = useState({
    member_id: initialMemberId || '',
    principal_amount: '10000',
    interest_rate: '1.0',
    duration_months: '10',
    loan_date: new Date().toISOString().split('T')[0],
    purpose: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset form synchronously
      setFormData({
        member_id: initialMemberId || '',
        principal_amount: '10000',
        interest_rate: '1.0',
        duration_months: '10',
        loan_date: new Date().toISOString().split('T')[0],
        purpose: '',
      });
      setError('');
      setSuccess('');
      setAvailableCash(null);

      const fetchData = async () => {
        try {
          const [memRes, summaryRes] = await Promise.all([
            memberService.getAllMembers({ status: 'active' }),
            dashboardService.getSummary(DEFAULT_GROUP_ID),
          ]);

          if (memRes.success) {
            setMembers(memRes.members);
            if (initialMemberId) {
              setFormData((prev) => ({ ...prev, member_id: initialMemberId }));
            } else if (memRes.members.length > 0) {
              setFormData((prev) => ({ ...prev, member_id: prev.member_id || memRes.members[0].member_id }));
            }
          }

          if (summaryRes?.summary) {
            const rawCash = summaryRes.summary.rawAvailableBalance !== undefined
              ? summaryRes.summary.rawAvailableBalance
              : summaryRes.summary.availableBalance;
            setAvailableCash(Number(rawCash) || 0);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchData();
    }
  }, [isOpen, initialMemberId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const principal = parseFloat(formData.principal_amount) || 0;
  const rate = parseFloat(formData.interest_rate) || 0;
  const monthlyInterest = (principal * rate) / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.member_id) {
      showError({
        title: 'Validation Error',
        message: 'Please select a borrowing member.',
      });
      return;
    }

    if (isNaN(principal) || principal <= 0) {
      showError({
        title: 'Validation Error',
        message: 'Loan amount must be greater than ₹0.',
      });
      return;
    }

    const durationNum = parseInt(formData.duration_months, 10);
    if (durationNum !== 10) {
      showError({
        title: 'Validation Error',
        message: 'Loan duration must be exactly 10 installments.',
      });
      return;
    }

    if (availableCash !== null && principal > availableCash) {
      showError({
        title: 'Insufficient Balance',
        message: `Insufficient available balance. Available: ₹${formatNumber(Math.max(0, availableCash))}. Requested loan: ₹${formatNumber(principal)}.`,
        details: [
          { label: 'Available Cash', value: formatCurrency(Math.max(0, availableCash)) },
          { label: 'Requested Loan', value: formatCurrency(principal), highlight: true },
        ],
      });
      return;
    }

    const targetMem = members.find(
      (m) => String(m.member_id) === String(formData.member_id) || String(m.id) === String(formData.member_id)
    );
    const memberName = targetMem ? (targetMem.name || targetMem.fullName) : 'Member';
    const memberCode = targetMem ? (targetMem.member_code || targetMem.memberCode || '') : '';

    // Confirmation Modal
    const confirmed = await askConfirm({
      title: 'Confirm Loan Disbursement',
      message: 'Are you sure you want to disburse this loan?',
      details: [
        { label: 'Borrowing Member', value: `${memberName} (${memberCode})` },
        { label: 'Loan Principal', value: formatCurrency(principal), highlight: true },
        { label: 'Interest Rate', value: '1.0% per month (Reducing Balance)' },
        { label: 'Loan Duration', value: '10 installments' },
        { label: 'First Month Interest', value: `${formatCurrency(monthlyInterest)}` },
        { label: 'Disbursement Date', value: formData.loan_date },
      ],
      confirmText: 'Disburse Loan',
      confirmVariant: 'primary',
    });

    if (!confirmed) {
      // 0 database writes!
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await loanService.createLoan({
        ...formData,
        principal_amount: principal,
        interest_rate: parseFloat(formData.interest_rate),
        duration_months: durationNum,
      });

      if (res.success) {
        showSuccess({
          title: 'Loan Disbursed',
          message: `Loan of ${formatCurrency(principal)} successfully disbursed for ${memberName}.`,
        });
        onSuccess();
        onClose();
      }
    } catch (err) {
      showError({
        title: 'Loan Disbursement Failed',
        error: err,
        details: [
          { label: 'Borrowing Member', value: memberName },
          { label: 'Principal', value: formatCurrency(principal) },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Issue New Group Loan" maxWidth="540px">
      <form onSubmit={handleSubmit}>
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

        <div className="form-group">
          <label className="form-label">Borrowing Member *</label>
          <select name="member_id" className="form-select" value={formData.member_id} onChange={handleChange} data-autofocus required>
            <option value="">-- Choose Member --</option>
            {members.map((m) => (
              <option key={m.member_id} value={m.member_id}>
                {m.name} ({m.member_code}) - Savings: {formatCurrency(m.total_savings || m.totalSavings)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Principal Amount (₹) *</label>
              {availableCash !== null && (
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: availableCash > 0 ? 'var(--success-text)' : 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Wallet size={12} /> Available: {formatCurrency(Math.max(0, availableCash))}
                </span>
              )}
            </div>
            <input
              type="number"
              name="principal_amount"
              className="form-input"
              value={formData.principal_amount}
              onChange={handleChange}
              min="1"
              step="1"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Monthly Interest Rate (%) *</label>
            <input
              type="number"
              name="interest_rate"
              className="form-input"
              value="1.0"
              readOnly
              style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
              title="Interest rate is fixed at 1% per Bachat Gat rules"
            />
          </div>
        </div>

        {/* Live Interest Calculation Box */}
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--accent-soft)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            border: '1px solid var(--accent-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }}>
            <Calculator size={16} /> Monthly Interest Calculation:
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)' }}>
            {formatCurrency(monthlyInterest)} / month
          </div>
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Duration (Months) *</label>
            <input
              type="number"
              name="duration_months"
              className="form-input"
              value="10"
              readOnly
              style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
              title="Loan duration is fixed at 10 months per Bachat Gat rules"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Disbursement Date</label>
            <input
              type="date"
              name="loan_date"
              className="form-input"
              value={formData.loan_date}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Loan Purpose / Remarks</label>
          <input
            type="text"
            name="purpose"
            className="form-input"
            placeholder="e.g. Agricultural equipment, business expansion"
            value={formData.purpose}
            onChange={handleChange}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            <HandCoins size={16} />
            {loading ? 'Disbursing...' : 'Disburse Loan'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateLoanModal;
