import React, { useState, useEffect, useCallback, useRef } from 'react';
import Modal from '../common/Modal';
import { memberService } from '../../services/memberService';
import { loanService } from '../../services/loanService';
import { savingsService, calculateNextUnpaidSavingsPeriod } from '../../services/savingsService';
import { formatCurrency, formatMonthYear } from '../../utils/formatters';
import { usePopup } from '../../context/PopupContext';
import { CheckCircle2, AlertCircle, PiggyBank, Calendar, Info } from 'lucide-react';

const RecordSavingsModal = ({ isOpen, onClose, onSuccess, initialMemberId = null }) => {
  const currentDate = new Date();
  const { showError, askConfirm, showSuccess } = usePopup();
  const [members, setMembers] = useState([]);
  const membersRef = useRef([]);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const [activeLoanMemberIds, setActiveLoanMemberIds] = useState(new Set());
  const [periodHint, setPeriodHint] = useState('');
  const [formData, setFormData] = useState({
    member_id: initialMemberId || '',
    amount: '1000',
    month: (currentDate.getMonth() + 1).toString(),
    year: currentDate.getFullYear().toString(),
    payment_date: currentDate.toISOString().split('T')[0],
    payment_mode: 'UPI',
    remarks: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Auto-detect next unpaid month/year for a selected member
  const updateMemberPeriod = useCallback(async (selectedMemberId, memberList = []) => {
    if (!selectedMemberId) {
      setPeriodHint('');
      return;
    }
    try {
      const savings = await savingsService.getMemberSavings(selectedMemberId);
      const { month: nextM, year: nextY } = calculateNextUnpaidSavingsPeriod(savings);

      const availableMembers = (memberList && memberList.length > 0) ? memberList : membersRef.current;
      const targetMem = availableMembers.find(
        (m) => String(m.member_id) === String(selectedMemberId) || String(m.id) === String(selectedMemberId)
      );
      const defaultShare = targetMem
        ? Number(targetMem.monthly_contribution || targetMem.monthlyContribution || targetMem.monthly_share || targetMem.monthlyShare || 1000)
        : 1000;

      setFormData((prev) => ({
        ...prev,
        member_id: selectedMemberId,
        month: nextM.toString(),
        year: nextY.toString(),
        amount: (targetMem?.current_due !== undefined && targetMem.current_due > 0 ? targetMem.current_due : defaultShare).toString(),
      }));

      if (savings && savings.length > 0) {
        setPeriodHint(`Auto-selected next unpaid period: ${formatMonthYear(nextM, nextY)}`);
      } else {
        setPeriodHint(`First contribution period: ${formatMonthYear(nextM, nextY)}`);
      }
    } catch (err) {
      console.error('Failed to resolve member next savings period:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccess('');
      setPeriodHint('');

      const initializeModal = async () => {
        try {
          const [membersRes, loansRes] = await Promise.allSettled([
            memberService.getAllMembers({ status: 'active' }),
            loanService.getAllLoans({ status: 'active' }),
          ]);

          if (membersRes.status === 'fulfilled' && membersRes.value.success && membersRes.value.members) {
            setMembers(membersRes.value.members);
            const targetId = initialMemberId || (membersRes.value.members.length > 0 ? (membersRes.value.members[0].member_id || membersRes.value.members[0].id) : '');
            if (targetId) {
              await updateMemberPeriod(targetId, membersRes.value.members);
            }
          }

          // Build Set of member IDs with active loans for instant O(1) lookup
          if (loansRes.status === 'fulfilled' && loansRes.value.success) {
            const ids = new Set(
              (loansRes.value.loans || [])
                .filter((l) => (l.status || '').toUpperCase() === 'ACTIVE')
                .map((l) => l.memberId || l.member_id)
                .filter(Boolean)
            );
            setActiveLoanMemberIds(ids);
          }
        } catch (err) {
          console.error('Failed to load members for savings modal:', err);
        }
      };
      initializeModal();
    }
  }, [isOpen, initialMemberId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'member_id') {
      updateMemberPeriod(value);
      setError('');
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(formData.amount);

    // 0. Block standalone saving for active-loan members — ZERO Firestore writes
    if (formData.member_id && activeLoanMemberIds.has(formData.member_id)) {
      const targetMem = members.find(
        (m) => String(m.member_id) === String(formData.member_id) || String(m.id) === String(formData.member_id)
      );
      const memberDisplayName = targetMem ? (targetMem.name || targetMem.fullName) : 'Member';
      showError({
        title: 'Active Loan — Use Loan Payment',
        message: 'This member has an active loan. Please record the loan payment instead — the Regular Saving will be recorded automatically together with the loan repayment.',
        details: [
          { label: 'Member', value: memberDisplayName },
          { label: 'Action Required', value: 'Record Loan Payment', highlight: true },
          { label: 'Note', value: 'Regular Saving is created automatically when the loan installment is paid.' },
        ],
      });
      return; // ZERO Firestore writes
    }

    // 1. Validation checks with popup
    if (!formData.member_id) {
      showError({
        title: 'Validation Error',
        message: 'Please select a member.',
      });
      return;
    }

    if (isNaN(numAmount) || numAmount <= 0) {
      showError({
        title: 'Validation Error',
        message: 'Please enter a valid contribution amount greater than ₹0.',
      });
      return;
    }

    const monthNum = parseInt(formData.month, 10);
    const yearNum = parseInt(formData.year, 10);
    if (!monthNum || !yearNum || monthNum < 1 || monthNum > 12) {
      showError({
        title: 'Validation Error',
        message: 'Please select a valid scheduled month and year.',
      });
      return;
    }

    const targetMem = members.find(
      (m) => String(m.member_id) === String(formData.member_id) || String(m.id) === String(formData.member_id)
    );
    const memberDisplayName = targetMem ? (targetMem.name || targetMem.fullName) : 'Member';
    const memberDisplayCode = targetMem ? (targetMem.member_code || targetMem.memberCode || '') : '';

    // 2. Pre-check for duplicate monthly savings
    try {
      const existingSavings = await savingsService.getMemberSavings(formData.member_id);
      const isAlreadyPaid = existingSavings.some(
        (s) => Number(s.month) === monthNum && Number(s.year) === yearNum && Number(s.paidAmount || s.amount) > 0
      );

      if (isAlreadyPaid) {
        showError({
          title: 'Duplicate Savings Entry',
          message: 'Savings already recorded for this member for this month.',
          details: [
            { label: 'Member', value: `${memberDisplayName} (${memberDisplayCode})` },
            { label: 'Period', value: formatMonthYear(monthNum, yearNum) },
            { label: 'Status', value: 'Already Paid', highlight: true },
          ],
        });
        return;
      }
    } catch (checkErr) {
      console.warn('Notice: Savings pre-check:', checkErr);
    }

    // 3. Confirmation Dialog
    const confirmed = await askConfirm({
      title: 'Confirm Monthly Savings',
      message: 'Are you sure you want to record this monthly savings payment?',
      details: [
        { label: 'Member', value: `${memberDisplayName} (${memberDisplayCode})` },
        { label: 'Scheduled Period', value: formatMonthYear(monthNum, yearNum) },
        { label: 'Regular Savings / Hapta', value: `₹${numAmount.toLocaleString('en-IN')}`, highlight: true },
        { label: 'Payment Mode', value: formData.payment_mode },
        { label: 'Payment Date', value: formData.payment_date },
      ],
      confirmText: 'Record Savings',
      confirmVariant: 'primary',
    });

    if (!confirmed) {
      // Clean cancellation: 0 database writes!
      return;
    }

    // 4. Persistence
    try {
      setLoading(true);
      setError('');
      const res = await savingsService.recordSavings({
        ...formData,
        amount: numAmount,
        month: monthNum,
        year: yearNum,
      });

      if (res.success) {
        showSuccess({
          title: 'Savings Recorded',
          message: `Monthly savings of ₹${numAmount.toLocaleString('en-IN')} for ${formatMonthYear(monthNum, yearNum)} successfully recorded for ${memberDisplayName}.`,
        });
        onSuccess();
        onClose();
      }
    } catch (err) {
      showError({
        title: 'Payment Failed',
        error: err,
        details: [
          { label: 'Member', value: memberDisplayName },
          { label: 'Scheduled Period', value: formatMonthYear(monthNum, yearNum) },
          { label: 'Amount', value: `₹${numAmount.toLocaleString('en-IN')}` },
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
    <Modal isOpen={isOpen} onClose={onClose} title="Record Monthly Savings" maxWidth="520px">
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
          <label className="form-label">Select Member *</label>
          <select name="member_id" className="form-select" value={formData.member_id} onChange={handleChange} required>
            <option value="">-- Choose Member --</option>
            {members.map((m) => {
              const mid = m.member_id || m.id;
              const hasLoan = activeLoanMemberIds.has(mid);
              return (
                <option key={mid} value={mid}>
                  {hasLoan ? '🔴 ' : ''}{m.name} ({m.member_code}) - Share: {formatCurrency(m.monthly_contribution || m.monthlyContribution)}{hasLoan ? ' [Active Loan — Use Loan Payment]' : ''}
                </option>
              );
            })}
          </select>
        </div>

        {formData.member_id && activeLoanMemberIds.has(formData.member_id) && (
          <div style={{ padding: '10px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.825rem', color: '#C2410C', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <div>
              <strong>Active Loan Member:</strong> Standalone savings cannot be recorded for members with active loans. Regular Savings is recorded automatically when recording their loan payment.
            </div>
          </div>
        )}

        {periodHint && (
          <div style={{ padding: '8px 12px', background: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.8rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <Calendar size={14} />
            <span>{periodHint}</span>
          </div>
        )}

        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Month *</label>
            <select name="month" className="form-select" value={formData.month} onChange={handleChange} required>
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Year *</label>
            <input
              type="number"
              name="year"
              className="form-input"
              value={formData.year}
              onChange={handleChange}
              min="2020"
              max="2040"
              required
            />
          </div>
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Contribution Amount (₹) *</label>
            <input
              type="number"
              name="amount"
              className="form-input"
              value={formData.amount}
              onChange={handleChange}
              min="1"
              step="1"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Payment Mode</label>
            <select name="payment_mode" className="form-select" value={formData.payment_mode} onChange={handleChange}>
              <option value="UPI">UPI / QR Code</option>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Payment Date</label>
          <input
            type="date"
            name="payment_date"
            className="form-input"
            value={formData.payment_date}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Remarks / Note</label>
          <input
            type="text"
            name="remarks"
            className="form-input"
            placeholder="e.g. Paid via Google Pay"
            value={formData.remarks}
            onChange={handleChange}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            <PiggyBank size={16} />
            {loading ? 'Recording...' : 'Record Savings'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default RecordSavingsModal;
