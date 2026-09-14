import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loanService } from '../services/loanService';
import Loader from '../components/common/Loader';
import EmptyState from '../components/common/EmptyState';
import RecordRepaymentModal from '../components/forms/RecordRepaymentModal';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import {
  ArrowLeft,
  HandCoins,
  CreditCard,
  Calendar,
  User,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calculator,
} from 'lucide-react';

const LoanDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canManageLoans } = useAuth();

  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRepayOpen, setIsRepayOpen] = useState(false);

  const fetchLoan = async () => {
    try {
      setLoading(true);
      const res = await loanService.getLoanById(id);
      if (res.success) {
        setLoan(res.loan);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoan();
  }, [id]);

  if (loading) return <Loader text="Loading loan profile..." />;
  if (!loan) return <EmptyState title="Loan not found" description="The requested loan record could not be found." />;

  const repaymentsList = loan.repayments || [];
  const totalPrincipalRepaid = repaymentsList.reduce((acc, r) => acc + (parseFloat(r.principal_repayment_amount || r.principalAmount || r.principalPaid || 0) || 0), 0);
  const totalInterestPaid = repaymentsList.reduce((acc, r) => acc + (parseFloat(r.interest_amount || r.interestAmount || r.interestPaid || 0) || 0), 0);
  const totalPaymentSum = totalPrincipalRepaid + totalInterestPaid;

  const origPrincipal = Number(loan.principal_amount || loan.principalAmount || loan.originalPrincipal || 0);
  const actualPrincipalPaid = Number(loan.total_principal_repaid || loan.total_principal_paid || loan.totalPrincipalPaid || totalPrincipalRepaid || 0);
  const repaidPercent = origPrincipal > 0 ? Math.min(100, Math.round((actualPrincipalPaid / origPrincipal) * 100)) : (loan.repaid_percent || loan.repaidPercent || 0);

  const schedule = loan.schedule || [];
  const totalScheduleRegExp = schedule.reduce((sum, row) => sum + (row.regularHaptaExpected || 0), 0);
  const totalScheduleRegPaid = schedule.reduce((sum, row) => sum + (row.regularHaptaPaid || 0), 0);
  const totalSchedulePrinExp = schedule.reduce((sum, row) => sum + (row.principalExpected || 0), 0);
  const totalSchedulePrinPaid = schedule.reduce((sum, row) => sum + (row.principalPaid || 0), 0);
  const totalScheduleIntExp = schedule.reduce((sum, row) => sum + (row.interestExpected || 0), 0);
  const totalScheduleIntPaid = schedule.reduce((sum, row) => sum + (row.interestPaid || 0), 0);
  const totalScheduleLoanExp = schedule.reduce((sum, row) => sum + ((row.principalExpected || 0) + (row.interestExpected || 0)), 0);
  const totalScheduleLoanPaid = schedule.reduce((sum, row) => sum + ((row.principalPaid || 0) + (row.interestPaid || 0)), 0);
  const totalScheduleExp = schedule.reduce((sum, row) => sum + (row.totalExpected || 0), 0);
  const totalSchedulePaid = schedule.reduce((sum, row) => sum + (row.totalPaid || 0), 0);

  const renderStatusBadge = (status) => {
    let bg = '#f1f5f9';
    let color = '#475569';
    if (status === 'PAID') {
      bg = '#dcfce7';
      color = '#166534';
    } else if (status === 'PARTIAL') {
      bg = '#fef3c7';
      color = '#92400e';
    } else if (status === 'DUE') {
      bg = '#fee2e2';
      color = '#991b1b';
    } else if (status === 'UPCOMING') {
      bg = '#f1f5f9';
      color = '#64748b';
    }

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '9999px',
          fontSize: '0.72rem',
          fontWeight: 700,
          backgroundColor: bg,
          color: color,
          letterSpacing: '0.4px',
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <button
          onClick={() => navigate('/loans')}
          className="btn-secondary"
          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
        >
          <ArrowLeft size={16} /> Back to Loans
        </button>
      </div>

      {/* Main Loan Info Card */}
      <div
        className="card"
        style={{
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          borderLeft: loan.status === 'ACTIVE' ? '5px solid var(--primary)' : '5px solid var(--success)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Loan #{loan.loan_number || loan.loanNumber}</h1>
            <span className={`badge ${loan.status === 'ACTIVE' ? 'badge-warning' : 'badge-success'}`}>
              {loan.status}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={16} color="var(--primary)" />
              <strong style={{ color: 'var(--text-primary)' }}>{loan.member_name || loan.memberName}</strong> ({loan.member_code || loan.memberCode})
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={16} color="var(--text-muted)" />
              <span>Disbursed: {formatDate(loan.loan_date || loan.loanDate)}</span>
            </div>
          </div>

          {loan.purpose && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              Purpose: {loan.purpose}
            </div>
          )}
        </div>

        {canManageLoans && loan.status === 'ACTIVE' && (
          <button onClick={() => setIsRepayOpen(true)} className="btn-primary">
            <CreditCard size={16} /> Record Repayment
          </button>
        )}
      </div>

      {/* Financial Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>ORIGINAL PRINCIPAL</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '4px' }}>{formatCurrency(loan.principal_amount || loan.principalAmount)}</div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Duration: {loan.duration_months || loan.durationMonths || 10} Months</span>
        </div>

        <div className="card" style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>MONTHLY INTEREST RATE</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{loan.interest_rate || loan.interestRate || 2}% / month</div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatCurrency(((Number(loan.outstanding_amount || 0)) * Number(loan.interest_rate || 2)) / 100)} on current balance</span>
        </div>

        <div className="card" style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>CURRENT OUTSTANDING</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: loan.status === 'ACTIVE' ? 'var(--danger-text)' : 'var(--success-text)', marginTop: '4px' }}>
            {formatCurrency(loan.outstanding_amount || loan.outstandingAmount)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Repaid: {repaidPercent}%</span>
        </div>

        <div className="card" style={{ padding: '18px 20px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL INTEREST PAID</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: '4px' }}>
            {formatCurrency(totalInterestPaid)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Over {repaymentsList.length} installment(s)</span>
        </div>
      </div>

      {/* Repayments Schedule Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Month-Wise Repayment Schedule</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Planned installments start the month following loan issue, showing expected vs actual paid amounts.
            </p>
          </div>
          {loan.nextDueInstallment ? (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px', padding: '6px 12px', fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>
              Next Due: Installment #{loan.nextDueInstallment.installmentNumber} ({loan.nextDueInstallment.periodLabel || loan.nextDueInstallment.monthLabel}) — {formatCurrency(loan.nextDueInstallment.totalRemaining)}
            </div>
          ) : (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '6px', padding: '6px 12px', fontSize: '0.8rem', color: '#166534', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} /> Loan Fully Repaid
            </div>
          )}
        </div>

        {schedule.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
            No schedule available for this loan.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="custom-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Inst #</th>
                  <th>Month / Year</th>
                  <th style={{ textAlign: 'right' }}>Regular Hapta (Savings)</th>
                  <th style={{ textAlign: 'right' }}>Loan Principal (Hapta)</th>
                  <th style={{ textAlign: 'right' }}>Interest (2%)</th>
                  <th style={{ textAlign: 'right', color: 'var(--primary)' }}>Loan Total Due (Prin + Int)</th>
                  <th style={{ textAlign: 'right' }}>Total Member Due</th>
                  <th style={{ textAlign: 'right' }}>Total Paid</th>
                  <th style={{ textAlign: 'right' }}>Remaining Prin.</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => {
                  const loanDueExp = (row.principalExpected || 0) + (row.interestExpected || 0);
                  return (
                    <tr key={row.installmentNumber} style={{ background: row.status === 'PAID' ? 'rgba(34, 197, 94, 0.02)' : undefined }}>
                      <td style={{ fontWeight: 700, textAlign: 'center' }}>#{row.installmentNumber}</td>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{row.periodLabel}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(row.regularHaptaExpected)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(row.principalExpected)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(row.interestExpected)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(loanDueExp)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(row.totalExpected)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success-text)' }}>{formatCurrency(row.totalPaid)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(row.remainingPrincipal)}</td>
                      <td style={{ textAlign: 'center' }}>{renderStatusBadge(row.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F8FAFC', fontWeight: 800 }}>
                  <td colSpan={2}>TOTALS</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(totalScheduleRegExp)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(totalSchedulePrinExp)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(totalScheduleIntExp)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--primary)' }}>{formatCurrency(totalScheduleLoanExp)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(totalScheduleExp)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--success-text)', fontSize: '0.95rem' }}>{formatCurrency(totalSchedulePaid)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(loan.outstanding_amount || loan.outstandingAmount || 0)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Payment Transactions History */}
      <div className="card">
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', fontWeight: 700 }}>Payment Transactions History</h2>

        {repaymentsList.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No repayments recorded"
            description="No installment payments have been made on this loan yet."
            actionText={canManageLoans && loan.status === 'ACTIVE' ? 'Record Payment' : undefined}
            onAction={() => setIsRepayOpen(true)}
          />
        ) : (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Installment Period</th>
                  <th>Regular Hapta</th>
                  <th>Principal Paid</th>
                  <th>Interest Paid</th>
                  <th>Total Payment</th>
                  <th>Payment Date</th>
                  <th>Mode</th>
                  <th>Remarks</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {repaymentsList.map((r) => (
                  <tr key={r.id || r.repayment_id}>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                      {formatMonthYear(r.payment_month || r.month, r.payment_year || r.year)}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {formatCurrency(r.regular_hafta_amount || r.regularHaftaAmount || r.savingsAmount || 0)}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(r.principal_repayment_amount || r.principalAmount)}</td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatCurrency(r.interest_amount || r.interestAmount)}</td>
                    <td style={{ fontWeight: 800, color: 'var(--success-text)' }}>{formatCurrency(r.total_payment || r.totalPayment)}</td>
                    <td>{formatDate(r.payment_date || r.paymentDate)}</td>
                    <td><span className="badge badge-info">{r.payment_mode || r.paymentMode || 'UPI'}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.remarks || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.recorded_by_name || 'System'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F8FAFC', fontWeight: 800 }}>
                  <td>TOTAL PAID</td>
                  <td style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(repaymentsList.reduce((acc, r) => acc + (parseFloat(r.regular_hafta_amount || r.regularHaftaAmount || r.savingsAmount) || 0), 0))}
                  </td>
                  <td style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalPrincipalRepaid)}</td>
                  <td style={{ color: 'var(--primary)' }}>{formatCurrency(totalInterestPaid)}</td>
                  <td style={{ color: 'var(--success-text)', fontSize: '1.05rem' }}>{formatCurrency(totalPaymentSum)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <RecordRepaymentModal
        isOpen={isRepayOpen}
        onClose={() => setIsRepayOpen(false)}
        onSuccess={fetchLoan}
        initialLoanId={loan.id}
      />
    </div>
  );
};

export default LoanDetails;
