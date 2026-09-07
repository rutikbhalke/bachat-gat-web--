import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { memberService } from '../../services/memberService';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  formatMemberWithHonorific,
  toDevanagariDigits,
} from '../../utils/formatters';
import Loader from '../common/Loader';
import EmptyState from '../common/EmptyState';
import {
  X,
  User,
  Phone,
  Calendar,
  PiggyBank,
  HandCoins,
  Receipt,
  ExternalLink,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  Shield,
  ArrowRight,
} from 'lucide-react';

const MemberHistoryModal = ({ isOpen, onClose, member }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('savings'); // 'savings' | 'loans' | 'repayments'
  const [loading, setLoading] = useState(false);
  const [memberDetails, setMemberDetails] = useState(null);

  useEffect(() => {
    if (isOpen && member) {
      const fetchHistory = async () => {
        try {
          setLoading(true);
          const lookupKey = member.id || member.member_id || member.name || member.memberName;
          const res = await memberService.getMemberById(lookupKey);
          if (res.success && res.member) {
            setMemberDetails(res.member);
          }
        } catch (err) {
          console.error('Failed to load member history:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchHistory();
    } else {
      setMemberDetails(null);
    }
  }, [isOpen, member]);

  if (!isOpen || !member) return null;

  const memberName = member.name || member.memberName || 'Member';
  const memberCode = member.member_code || member.memberCode || memberDetails?.memberCode || 'M-130';
  const phone = member.phone || memberDetails?.phone || '';
  const currentLoan = member.loan !== undefined ? member.loan : (memberDetails?.totalOutstanding || 0);
  const currentFund = member.fund !== undefined ? member.fund : 1000;
  const currentTotal = member.total !== undefined ? member.total : (member.loanHafta || 0) + (member.interest || 0) + currentFund;
  const totalSavings = memberDetails?.totalSavings ?? (member.totalSavings || currentFund * 12);
  const totalOutstanding = memberDetails?.totalOutstanding ?? currentLoan;

  const savingsList = memberDetails?.savingsHistory || [];
  const loansList = memberDetails?.loans || [];
  const repaymentsList = memberDetails?.repayments || [];

  const handleOpenFullProfile = () => {
    const targetId = memberDetails?.id || member.id || member.member_id;
    if (targetId) {
      onClose();
      navigate(`/members/${targetId}`);
    }
  };

  const handlePrintStatement = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="fade-in"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '840px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                fontWeight: 800,
                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
              }}
            >
              {memberName.charAt(0)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  {formatMemberWithHonorific(memberName)}
                </h2>
                <span className="badge badge-info">{memberCode}</span>
                {currentLoan > 0 ? (
                  <span className="badge badge-warning">Active Loan</span>
                ) : (
                  <span className="badge badge-success">Regular Saver</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={13} /> {phone}
                  </span>
                )}
                <span>• Bachat Gat Member History</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleOpenFullProfile}
              className="btn-secondary"
              style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Full Profile <ExternalLink size={14} />
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top KPI Metrics Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
            <div className="card" style={{ padding: '14px', background: '#F8FAFC' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL SAVINGS</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
                {formatCurrency(totalSavings)}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Deposited in group fund</span>
            </div>

            <div className="card" style={{ padding: '14px', background: '#F8FAFC' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>LOAN OUTSTANDING</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: totalOutstanding > 0 ? 'var(--danger-text)' : 'var(--text-muted)', marginTop: '2px' }}>
                {formatCurrency(totalOutstanding)}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Remaining principal</span>
            </div>

            <div className="card" style={{ padding: '14px', background: '#F8FAFC' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>MONTHLY HAFTA</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#D97706', marginTop: '2px' }}>
                {formatCurrency(member.loanHafta || 0)}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Inst. #{member.inst || 0} / 10</span>
            </div>

            <div className="card" style={{ padding: '14px', background: '#F0FDF4', borderColor: 'rgba(34, 197, 94, 0.3)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>CURRENT DEMAND</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success-text)', marginTop: '2px' }}>
                {formatCurrency(currentTotal)}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Fund + Hafta + Interest</span>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="tabs-container" style={{ margin: '0' }}>
            <button
              onClick={() => setActiveTab('savings')}
              className={`tab-btn ${activeTab === 'savings' ? 'active' : ''}`}
              style={{ fontSize: '0.85rem', padding: '8px 16px' }}
            >
              <PiggyBank size={16} /> Savings Deposits ({savingsList.length || 1})
            </button>
            <button
              onClick={() => setActiveTab('loans')}
              className={`tab-btn ${activeTab === 'loans' ? 'active' : ''}`}
              style={{ fontSize: '0.85rem', padding: '8px 16px' }}
            >
              <HandCoins size={16} /> Loan Accounts ({loansList.length || (currentLoan > 0 ? 1 : 0)})
            </button>
            <button
              onClick={() => setActiveTab('repayments')}
              className={`tab-btn ${activeTab === 'repayments' ? 'active' : ''}`}
              style={{ fontSize: '0.85rem', padding: '8px 16px' }}
            >
              <Receipt size={16} /> Loan Repayments ({repaymentsList.length || (member.inst > 0 ? member.inst : 0)})
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '40px 0' }}>
              <Loader text="Loading member financial records..." />
            </div>
          ) : (
            <>
              {/* TAB 1: SAVINGS HISTORY */}
              {activeTab === 'savings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="table-responsive">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Period (Month/Year)</th>
                          <th>Expected (निधी)</th>
                          <th>Amount Paid</th>
                          <th>Payment Date</th>
                          <th>Mode</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {savingsList.length > 0 ? (
                          savingsList.map((s, idx) => (
                            <tr key={s.id || idx}>
                              <td style={{ fontWeight: 700 }}>
                                {s.month}/{s.year}
                              </td>
                              <td>{formatCurrency(s.expectedAmount || s.expected_amount || 1000)}</td>
                              <td style={{ fontWeight: 800, color: 'var(--success-text)' }}>
                                {formatCurrency(s.paidAmount || s.paid_amount || s.amount)}
                              </td>
                              <td>{s.paymentDate || s.payment_date ? formatDate(s.paymentDate || s.payment_date) : '20th of Month'}</td>
                              <td>
                                <span className="badge badge-info">{s.paymentMode || s.payment_mode || 'Cash'}</span>
                              </td>
                              <td>
                                <span className="badge badge-success">
                                  <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                  PAID
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          // Display current registered record if no archived Firestore documents yet
                          <tr>
                            <td style={{ fontWeight: 700 }}>Current Register Period</td>
                            <td>{formatCurrency(currentFund)}</td>
                            <td style={{ fontWeight: 800, color: 'var(--success-text)' }}>{formatCurrency(currentFund)}</td>
                            <td>Active Register</td>
                            <td><span className="badge badge-info">UPI / Cash</span></td>
                            <td><span className="badge badge-success">RECORDED</span></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: LOAN ACCOUNTS */}
              {activeTab === 'loans' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {loansList.length > 0 ? (
                    loansList.map((l, idx) => (
                      <div key={l.id || idx} className="card" style={{ padding: '16px', background: '#FAFAFA' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
                          <div>
                            <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                              Loan #{l.loanNumber || l.loan_number || `L-${idx + 1}`}
                            </span>
                            <span style={{ marginLeft: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Disbursed: {formatDate(l.startDate || l.created_at || new Date())}
                            </span>
                          </div>
                          <span className={`badge ${l.status === 'ACTIVE' ? 'badge-warning' : 'badge-success'}`}>
                            {l.status || 'ACTIVE'}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', fontSize: '0.85rem' }}>
                          <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>ORIGINAL PRINCIPAL</div>
                            <div style={{ fontWeight: 700 }}>{formatCurrency(l.principalAmount || l.originalPrincipal)}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>MONTHLY HAFTA</div>
                            <div style={{ fontWeight: 700 }}>{formatCurrency(l.monthlyInstallment || Math.round((l.principalAmount || 1) / 10))}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>INTEREST RATE</div>
                            <div style={{ fontWeight: 700 }}>{l.interestRate || 2}% / Month</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>REMAINING BALANCE</div>
                            <div style={{ fontWeight: 800, color: 'var(--danger-text)' }}>{formatCurrency(l.pendingPrincipal || l.remainingAmount)}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : currentLoan > 0 ? (
                    <div className="card" style={{ padding: '16px', background: '#FAFAFA' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div>
                          <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                            Active Group Loan
                          </span>
                          <span style={{ marginLeft: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Inst. #{member.inst || 1} of 10
                          </span>
                        </div>
                        <span className="badge badge-warning">ACTIVE</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', fontSize: '0.85rem' }}>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>ORIGINAL LOAN (कर्ज)</div>
                          <div style={{ fontWeight: 700 }}>{formatCurrency(currentLoan)}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>LOAN HAFTA (कर्जाचा हप्ता)</div>
                          <div style={{ fontWeight: 700 }}>{formatCurrency(member.loanHafta || Math.round(currentLoan / 10))}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>INTEREST (कर्जाचे व्याज)</div>
                          <div style={{ fontWeight: 700, color: '#D97706' }}>{formatCurrency(member.interest || 0)} (2%)</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>INSTALLMENT #</div>
                          <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{member.inst || 1} / 10</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={HandCoins}
                      title="No Active Loans"
                      description="This member has no active or past loans in the record."
                    />
                  )}
                </div>
              )}

              {/* TAB 3: REPAYMENTS & RECEIPTS */}
              {activeTab === 'repayments' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {repaymentsList.length > 0 ? (
                    <div className="table-responsive">
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>Receipt Date</th>
                            <th>Principal Paid</th>
                            <th>Interest Paid (2%)</th>
                            <th>Total Repaid</th>
                            <th>Payment Mode</th>
                          </tr>
                        </thead>
                        <tbody>
                          {repaymentsList.map((r, idx) => (
                            <tr key={r.id || idx}>
                              <td style={{ fontWeight: 700 }}>{r.paymentDate ? formatDate(r.paymentDate) : `${r.month}/${r.year}`}</td>
                              <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatCurrency(r.loanPrincipalPaid || 0)}</td>
                              <td style={{ fontWeight: 600, color: '#D97706' }}>{formatCurrency(r.interestAmount || 0)}</td>
                              <td style={{ fontWeight: 800, color: 'var(--success-text)' }}>
                                {formatCurrency((r.loanPrincipalPaid || 0) + (r.interestAmount || 0))}
                              </td>
                              <td><span className="badge badge-info">{r.paymentMode || 'UPI'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : currentLoan > 0 ? (
                    <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Current active installment: <strong>Installment #{member.inst || 1} of 10</strong>
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '12px' }}>
                        <div style={{ background: '#F8FAFC', padding: '10px 16px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Principal Hafta</span>
                          <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem' }}>
                            {formatCurrency(member.loanHafta || 0)}
                          </div>
                        </div>
                        <div style={{ background: '#F8FAFC', padding: '10px 16px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Interest Due</span>
                          <div style={{ fontWeight: 800, color: '#D97706', fontSize: '1.1rem' }}>
                            {formatCurrency(member.interest || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Receipt}
                      title="No Repayment History"
                      description="No loan repayments recorded for this member."
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            onClick={handlePrintStatement}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <Printer size={15} /> Print Statement
          </button>
          <button
            onClick={onClose}
            className="btn-primary"
            style={{ padding: '8px 20px', fontSize: '0.85rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemberHistoryModal;
