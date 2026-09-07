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
    if (isOpen) {
      document.body.classList.add('member-modal-open');
    } else {
      document.body.classList.remove('member-modal-open');
    }
    return () => {
      document.body.classList.remove('member-modal-open');
    };
  }, [isOpen]);

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
      className="member-history-modal-overlay"
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
      <style>{`
        @media screen {
          .member-statement-print-area {
            display: none !important;
          }
        }
        @media print {
          body * {
            visibility: hidden !important;
          }
          .no-print,
          .no-print *,
          .member-history-modal-screen,
          .member-history-modal-screen *,
          .register-print-area,
          .register-print-area *,
          .sidebar,
          .navbar,
          .tabs-container,
          header,
          button,
          .app-header {
            display: none !important;
            visibility: hidden !important;
          }
          .member-history-modal-overlay {
            position: static !important;
            background: transparent !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
          }
          .member-statement-print-area,
          .member-statement-print-area * {
            visibility: visible !important;
          }
          .member-statement-print-area {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 6mm 10mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .member-statement-print-area table {
            display: table !important;
            width: 100% !important;
            border-collapse: collapse !important;
          }
          .member-statement-print-area thead {
            display: table-header-group !important;
          }
          .member-statement-print-area tbody {
            display: table-row-group !important;
          }
          .member-statement-print-area tr {
            display: table-row !important;
            page-break-inside: avoid !important;
          }
          .member-statement-print-area th,
          .member-statement-print-area td {
            display: table-cell !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>
      <div
        className="fade-in member-history-modal-screen no-print"
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

      {/* ========================================================================= */}
      {/* DEDICATED PRINT STATEMENT LAYOUT: "in this print only this"               */}
      {/* Displays official printed statement for this specific member only         */}
      {/* ========================================================================= */}
      <div className="member-statement-print-area">
        {/* Organization Header */}
        <div style={{ textAlign: 'center', borderBottom: '2.5px solid #000', paddingBottom: '10px', marginBottom: '14px' }}>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 900, margin: '0 0 4px 0', letterSpacing: '0.5px' }}>
            श्री सदुबाबा युवा स्वयं सहाय्य बचतगट
          </h1>
          <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>
            सभासद वैयक्तिक खाते उतारा व आर्थिक अहवाल (Member Financial Statement)
          </div>
          <div style={{ fontSize: '0.75rem', color: '#333', marginTop: '2px' }}>
            नोंदणी क्र. १३० • शाखा / पत्ता: सदुबाबा • हप्ता मागणी व बचत विवरण
          </div>
        </div>

        {/* Member Profile & Statement Info */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr',
            border: '1.5px solid #000',
            borderRadius: '4px',
            padding: '10px 14px',
            marginBottom: '14px',
            background: '#F8FAFC',
          }}
        >
          <div>
            <div style={{ fontSize: '0.85rem' }}>
              <strong>सभासदाचे नाव:</strong>{' '}
              <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                {formatMemberWithHonorific(memberName)}
              </span>
            </div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
              <strong>सभासद क्र.:</strong> {memberCode} &nbsp;|&nbsp; <strong>मोबाईल:</strong> {phone || 'N/A'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem' }}>
              <strong>खाते स्थिती:</strong>{' '}
              <span style={{ fontWeight: 800 }}>
                {currentLoan > 0 ? 'सक्रिय कर्जदार (ACTIVE LOAN)' : 'नियमित बचत सभासद (REGULAR)'}
              </span>
            </div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
              <strong>अहवाल दिनांक:</strong>{' '}
              {new Date().toLocaleDateString('mr-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Key Metrics 4-Box Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
          <div style={{ border: '1.5px solid #000', borderRadius: '4px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>एकूण बचत (SAVINGS)</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, marginTop: '3px' }}>
              {formatCurrency(totalSavings)}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#555' }}>जमा बचत निधी</div>
          </div>

          <div style={{ border: '1.5px solid #000', borderRadius: '4px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>शिल्लक कर्ज (OUTSTANDING)</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, marginTop: '3px' }}>
              {formatCurrency(totalOutstanding)}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#555' }}>शिल्लक मुद्दल</div>
          </div>

          <div style={{ border: '1.5px solid #000', borderRadius: '4px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>मासिक हप्ता (HAFTA)</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, marginTop: '3px' }}>
              {formatCurrency(member.loanHafta || 0)}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#555' }}>हप्ता क्र. #{member.inst || 0}/१०</div>
          </div>

          <div style={{ border: '1.5px solid #000', borderRadius: '4px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>चालू मागणी (DEMAND)</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, marginTop: '3px' }}>
              {formatCurrency(currentTotal)}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#555' }}>निधी + हप्ता + २% व्याज</div>
          </div>
        </div>

        {/* Section 1: Monthly Savings */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '6px' }}>
            १. मासिक बचत निधी जमा तपशील (Monthly Savings Deposits)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #000' }}>
            <thead>
              <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #000' }}>
                <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'center', width: '35px' }}>अ.क्र.</th>
                <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'center' }}>महिना / वर्ष</th>
                <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'right' }}>अपेक्षित निधी</th>
                <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'right' }}>जमा रक्कम</th>
                <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'center' }}>जमा दिनांक</th>
                <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'center' }}>भरणा प्रकार</th>
                <th style={{ padding: '4px 6px', textAlign: 'center' }}>स्थिती</th>
              </tr>
            </thead>
            <tbody>
              {savingsList.length > 0 ? (
                savingsList.map((s, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>{toDevanagariDigits(idx + 1)}</td>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center', fontWeight: 700 }}>{s.month}/{s.year}</td>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right' }}>{formatCurrency(s.expectedAmount || s.expected_amount || 1000)}</td>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 800 }}>{formatCurrency(s.paidAmount || s.paid_amount || s.amount)}</td>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>{s.paymentDate || s.payment_date ? formatDate(s.paymentDate || s.payment_date) : '२० तारीख'}</td>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>{s.paymentMode || s.payment_mode || 'Cash'}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}>जमा (PAID)</td>
                  </tr>
                ))
              ) : (
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>१</td>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center', fontWeight: 700 }}>चालू नोंदवही</td>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right' }}>{formatCurrency(currentFund)}</td>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 800 }}>{formatCurrency(currentFund)}</td>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>२० तारीख</td>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>UPI / रोख</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}>नोंदवही जमा</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Section 2: Loan Account Details */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '6px' }}>
            २. कर्ज खात्याचा सविस्तर तपशील (Loan Account Status)
          </div>
          {currentLoan > 0 || loansList.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #000' }}>
              <thead>
                <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #000' }}>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'center' }}>कर्ज क्र.</th>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'right' }}>मंजूर कर्ज मुद्दल</th>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'right' }}>मासिक हप्ता</th>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'center' }}>मासिक व्याज दर</th>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'right' }}>चालू व्याज (२%)</th>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'center' }}>हप्ता प्रगती</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>शिल्लक मुद्दल</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center', fontWeight: 700 }}>L-130-1</td>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(member.loan || currentLoan)}</td>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(member.loanHafta || Math.round(currentLoan / 10))}</td>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>२% दरमहा</td>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(member.interest || 0)}</td>
                  <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>हप्ता #{member.inst || 1} / १०</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 800 }}>{formatCurrency(totalOutstanding)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '8px 12px', border: '1px dashed #666', fontSize: '0.8rem', fontStyle: 'italic', background: '#F8FAFC' }}>
              सदर सभासदाच्या नावावर कोणतेही चालू कर्ज नाही (No Active Loan Account).
            </div>
          )}
        </div>

        {/* Section 3: Loan Repayments History */}
        {currentLoan > 0 && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '6px' }}>
              ३. कर्ज परतफेड व व्याज भरणा नोंदी (Loan Repayments History)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', border: '1px solid #000' }}>
              <thead>
                <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #000' }}>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'center', width: '35px' }}>अ.क्र.</th>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'center' }}>पावती दिनांक</th>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'right' }}>परतफेड मुद्दल</th>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'right' }}>जमा व्याज (२%)</th>
                  <th style={{ padding: '4px 6px', borderRight: '1px solid #000', textAlign: 'right' }}>एकूण जमा</th>
                  <th style={{ padding: '4px 6px', textAlign: 'center' }}>भरणा पद्धत</th>
                </tr>
              </thead>
              <tbody>
                {repaymentsList.length > 0 ? (
                  repaymentsList.map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>{toDevanagariDigits(idx + 1)}</td>
                      <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>{r.paymentDate ? formatDate(r.paymentDate) : `${r.month}/${r.year}`}</td>
                      <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(r.loanPrincipalPaid || 0)}</td>
                      <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(r.interestAmount || 0)}</td>
                      <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 800 }}>{formatCurrency((r.loanPrincipalPaid || 0) + (r.interestAmount || 0))}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>{r.paymentMode || 'UPI'}</td>
                    </tr>
                  ))
                ) : (
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>१</td>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>चालू हप्ता क्र. #{member.inst || 1}</td>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(member.loanHafta || 0)}</td>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(member.interest || 0)}</td>
                    <td style={{ padding: '4px 6px', borderRight: '1px solid #ddd', textAlign: 'right', fontWeight: 800 }}>{formatCurrency((member.loanHafta || 0) + (member.interest || 0))}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>नोंदवही हप्ता मागणी</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Signatures & System Footer */}
        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '16px' }}>
          <div style={{ textAlign: 'center', width: '220px' }}>
            <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '0.82rem', fontWeight: 700 }}>
              सभासदाची सही (Member Sign)
            </div>
            <div style={{ fontSize: '0.72rem', color: '#666', marginTop: '2px' }}>{memberName}</div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: '#666', fontStyle: 'italic' }}>
              सदर खाते उतारा सदुबाबा बचतगट डिजिटल प्रणालीद्वारे तयार करण्यात आला आहे.
            </div>
          </div>

          <div style={{ textAlign: 'center', width: '220px' }}>
            <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '0.82rem', fontWeight: 700 }}>
              अध्यक्ष / सचिव स्वाक्षरी (Auth. Sign)
            </div>
            <div style={{ fontSize: '0.72rem', color: '#666', marginTop: '2px' }}>श्री सदुबाबा युवा स्वयं सहाय्य बचतगट</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberHistoryModal;
