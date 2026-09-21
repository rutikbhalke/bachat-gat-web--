import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { memberService } from '../services/memberService';
import { loanService } from '../services/loanService';
import Loader from '../components/common/Loader';
import EmptyState from '../components/common/EmptyState';
import AddMemberModal from '../components/forms/AddMemberModal';
import RecordRepaymentModal from '../components/forms/RecordRepaymentModal';
import RecordSavingsModal from '../components/forms/RecordSavingsModal';
import { formatCurrency, formatDate, formatNumber } from '../utils/formatters';
import {
  Users,
  Search,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  PiggyBank,
  HandCoins,
  ChevronRight,
  Shield,
  Calendar,
  CreditCard,
  Layers,
  Info,
} from 'lucide-react';

const MONTHS = [
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

const Members = () => {
  const { canManageMembers, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const outletContext = useOutletContext() || {};
  const { refreshTrigger = 0, triggerRefresh, openAddMember } = outletContext;

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [repayModalData, setRepayModalData] = useState(null); // { loanId, memberId }
  const [savingsModalMemberId, setSavingsModalMemberId] = useState(null); // string
  const [members, setMembers] = useState([]);
  const [activeLoansByMember, setActiveLoansByMember] = useState(new Map());
  const [activeLoanMemberIds, setActiveLoanMemberIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'all'); // 'all' | 'active_loans' | 'non_loan' | 'pending'
  const [selectedMonth, setSelectedMonth] = useState(
    location.state?.selectedMonth ? Number(location.state.selectedMonth) : (new Date().getMonth() + 1)
  );
  const [selectedYear, setSelectedYear] = useState(
    location.state?.selectedYear ? Number(location.state.selectedYear) : new Date().getFullYear()
  );
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
    if (location.state?.selectedMonth) {
      setSelectedMonth(Number(location.state.selectedMonth));
    }
    if (location.state?.selectedYear) {
      setSelectedYear(Number(location.state.selectedYear));
    }
  }, [location.state]);

  const handleOpenAdd = () => {
    if (openAddMember) {
      openAddMember();
    } else {
      setIsAddModalOpen(true);
    }
  };

  const handleSuccess = () => {
    if (triggerRefresh) {
      triggerRefresh();
    } else {
      fetchMembers();
    }
  };

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const [membersRes, loansRes] = await Promise.allSettled([
        memberService.getAllMembers({
          month: selectedMonth,
          year: selectedYear,
        }),
        loanService.getAllLoans({ status: 'active' }),
      ]);

      if (membersRes.status === 'fulfilled' && membersRes.value.success) {
        const memberList = membersRes.value.members || [];
        setMembers(memberList);
      }

      // Build map and set of active loans by memberId
      if (loansRes.status === 'fulfilled' && loansRes.value.success) {
        const activeLoans = loansRes.value.loans || [];
        const loanMap = new Map();
        const ids = new Set();
        activeLoans.forEach((l) => {
          if ((l.status || '').toUpperCase() === 'ACTIVE') {
            const mid = l.memberId || l.member_id;
            if (mid) {
              loanMap.set(String(mid), l);
              ids.add(String(mid));
            }
          }
        });
        setActiveLoansByMember(loanMap);
        setActiveLoanMemberIds(ids);
      }
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [refreshTrigger, selectedMonth, selectedYear, location.key]);

  const isMemberPending = (m) =>
    m.status === 'Pending' ||
    m.due_status === 'Pending' ||
    m.paymentStatus === 'Pending' ||
    m.current_due > 0 ||
    m.currentDue > 0 ||
    m.is_pending_dues ||
    m.isPendingDues;

  // Filter out Admins and inactive/deleted members from regular active member list
  const nonAdminMembers = members.filter((m) => {
    const role = (m.role_name || m.role || '').toUpperCase();
    const isInactive =
      m.isActive === false ||
      m.is_active === 0 ||
      m.is_active === false ||
      m.isDeleted === true ||
      Boolean(m.deletedAt) ||
      (m.status || '').toLowerCase() === 'inactive' ||
      (m.status || '').toLowerCase() === 'deleted' ||
      (m.memberStatus || '').toLowerCase() === 'inactive' ||
      (m.account_status || '').toLowerCase() === 'inactive';
    return role !== 'ADMIN' && !m.email?.includes('admin') && !isInactive;
  });

  // Mutually Exclusive Partitioning
  const activeLoanMembers = nonAdminMembers.filter((m) =>
    activeLoanMemberIds.has(String(m.member_id || m.id))
  );

  const nonLoanMembers = nonAdminMembers.filter((m) =>
    !activeLoanMemberIds.has(String(m.member_id || m.id))
  );

  const totalMembersCount = nonAdminMembers.length;
  const pendingCount = nonAdminMembers.filter(isMemberPending).length;

  // Search Filter
  const matchesSearch = (m) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (m.name || '').toLowerCase().includes(q) ||
      (m.fullName || '').toLowerCase().includes(q) ||
      (m.member_code || m.memberCode || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q)
    );
  };

  const searchedActiveLoanMembers = activeLoanMembers.filter(matchesSearch);
  const searchedNonLoanMembers = nonLoanMembers.filter(matchesSearch);
  const searchedPendingMembers = nonAdminMembers.filter(isMemberPending).filter(matchesSearch);

  const getRoleBadge = (role) => {
    const r = (role || 'MEMBER').toUpperCase();
    if (r === 'ADMIN') return <span className="badge badge-pink">ADMIN</span>;
    if (r === 'TREASURER') return <span className="badge badge-warning">TREASURER</span>;
    if (r === 'SECRETARY') return <span className="badge badge-info">SECRETARY</span>;
    return <span className="badge badge-success">MEMBER</span>;
  };

  // Reusable Card Renderer
  const renderMemberCard = (m, isLoanMember) => {
    const memberIdStr = String(m.member_id || m.id);
    const isPending = isMemberPending(m);
    const memberDue = isPending ? (m.current_due !== undefined ? m.current_due : (m.currentDue !== undefined ? m.currentDue : 1000)) : 0;
    const memberPaid = Number(m.paid_amount ?? m.paidAmount ?? 0);
    const memberMonthlyShare = Number(m.monthly_share || m.monthlyShare || m.monthly_contribution || m.monthlyContribution || 1000);

    const activeLoan = activeLoansByMember.get(memberIdStr);
    const loanOutstanding = activeLoan
      ? Number(activeLoan.pendingPrincipal || activeLoan.outstanding_amount || activeLoan.remainingAmount || 0)
      : Number(m.outstanding_loans || m.activeLoanAmount || 0);

    return (
      <div
        key={memberIdStr}
        className="card keyboard-card"
        role="link"
        tabIndex={0}
        onClick={() => navigate(`/members/${memberIdStr}`)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            navigate(`/members/${memberIdStr}`);
          }
        }}
        aria-label={`Open ${m.name} member profile`}
        style={{
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '20px',
          borderLeft: isLoanMember ? '4px solid #EA580C' : '4px solid #16A34A',
          background: 'var(--bg-card)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <div>
          {/* Member Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: isLoanMember ? 'rgba(234, 88, 12, 0.12)' : 'rgba(22, 163, 74, 0.12)',
                  color: isLoanMember ? '#EA580C' : '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1rem',
                }}
              >
                {(m.name || 'M').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {m.name || m.fullName}
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {m.member_code || m.memberCode || m.id} • Joined {formatDate(m.joined_date || m.joinDate || m.joinedAt, { month: 'short', year: 'numeric' })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              {getRoleBadge(m.role_name || m.role)}
              {isLoanMember ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 9px',
                    borderRadius: 'var(--radius-full)',
                    background: '#FFF7ED',
                    color: '#C2410C',
                    border: '1px solid #FED7AA',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  🔴 Active Loan
                </span>
              ) : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 9px',
                    borderRadius: 'var(--radius-full)',
                    background: '#F0FDF4',
                    color: '#15803D',
                    border: '1px solid #BBF7D0',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  🟢 No Loan
                </span>
              )}
            </div>
          </div>

          {/* Pending Due Alert if viewing in pending context */}
          {isPending && activeTab === 'pending' && (
            <div
              style={{
                background: memberPaid > 0 ? 'var(--warning-light, #FFFBEB)' : 'var(--danger-light, #FFF1F2)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
                border: `1px solid ${memberPaid > 0 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.2)'}`,
              }}
            >
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Current Dues
                </span>
                <div
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 800,
                    color: memberPaid > 0 ? 'var(--warning-text, #B45309)' : 'var(--danger-text, #DC2626)',
                  }}
                >
                  {formatCurrency(memberDue)}
                </div>
              </div>

              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: memberPaid > 0 ? 'var(--warning-text, #B45309)' : 'var(--danger-text, #DC2626)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <AlertCircle size={14} /> {memberPaid > 0 ? 'Partially Paid' : 'Pending'}
              </span>
            </div>
          )}

          {/* Key Financial Data Box */}
          <div
            style={{
              background: isLoanMember ? 'rgba(255, 247, 237, 0.7)' : 'var(--bg-subtle, #F8FAFC)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              border: `1px solid ${isLoanMember ? '#FED7AA' : 'var(--border-color, #E2E8F0)'}`,
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Monthly Share
              </span>
              <div style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--primary)' }}>
                {formatCurrency(memberMonthlyShare)}/mo
              </div>
            </div>

            {isLoanMember ? (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: '#C2410C', fontWeight: 700, textTransform: 'uppercase' }}>
                  Loan Outstanding
                </span>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#C2410C' }}>
                  {formatCurrency(loanOutstanding)}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Total Savings
                </span>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#16A34A' }}>
                  {formatCurrency(m.total_savings || m.totalSavings || 0)}
                </div>
              </div>
            )}
          </div>

          {/* Highlights Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.825rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
              <PiggyBank size={15} color="var(--primary)" />
              <span>Savings: {formatCurrency(m.total_savings || m.totalSavings || 0)}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
              <HandCoins size={15} color={isLoanMember ? '#EA580C' : 'var(--text-muted)'} />
              <span>Loans: {formatCurrency(loanOutstanding)}</span>
            </div>
          </div>
        </div>

        {/* Action Button: Strictly Mutually Exclusive */}
        <div style={{ marginTop: '16px' }}>
          {isLoanMember ? (
            /* ACTIVE LOAN: ONLY Record Loan Payment */
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const loan = activeLoansByMember.get(memberIdStr);
                setRepayModalData({
                  loanId: loan ? loan.id : null,
                  memberId: memberIdStr,
                });
              }}
              className="btn-primary"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 14px',
                fontSize: '0.85rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
                border: 'none',
                boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
              }}
            >
              <CreditCard size={16} /> Record Loan Payment
            </button>
          ) : (
            /* NON-LOAN: ONLY Record Savings */
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSavingsModalMemberId(memberIdStr);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 14px',
                fontSize: '0.85rem',
                fontWeight: 700,
                background: '#F0FDF4',
                color: '#15803D',
                border: '1.5px solid #BBF7D0',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              <PiggyBank size={16} /> Record Savings
            </button>
          )}

          <div
            style={{
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              fontWeight: 600,
            }}
          >
            <span>View Full Profile</span>
            <ChevronRight size={14} color="var(--primary)" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header & Action Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Group Members</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Manage registered members, loan installments, monthly shares, and pending dues for {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Month / Year Filter Pickers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-subtle)', padding: '6px 12px', borderRadius: 'var(--radius-md)' }}>
            <Calendar size={16} color="var(--primary)" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={{
                background: 'transparent',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{
                background: 'transparent',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {(canManageMembers || isAdmin) && (
            <button
              onClick={handleOpenAdd}
              className="btn-primary"
              style={{
                padding: '10px 20px',
                fontSize: '0.925rem',
                fontWeight: 700,
                boxShadow: 'var(--shadow-pink)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <UserPlus size={18} /> + Add Member
            </button>
          )}
        </div>
      </div>

      {/* Category Counts Summary Banner (X + Y = Total) */}
      <div
        className="card"
        style={{
          padding: '14px 20px',
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={18} color="var(--primary)" />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Registered Members:</span>
          <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>{totalMembersCount}</strong>
        </div>
        <div style={{ height: '20px', width: '1px', background: 'var(--border-color)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              background: '#FFF7ED',
              color: '#C2410C',
              border: '1px solid #FED7AA',
              fontWeight: 700,
              fontSize: '0.825rem',
            }}
          >
            🔴 Active Loan Members: {activeLoanMembers.length}
          </span>
        </div>
        <div style={{ height: '20px', width: '1px', background: 'var(--border-color)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              background: '#F0FDF4',
              color: '#15803D',
              border: '1px solid #BBF7D0',
              fontWeight: 700,
              fontSize: '0.825rem',
            }}
          >
            🟢 Non-Loan Members: {nonLoanMembers.length}
          </span>
        </div>
      </div>

      {/* Navigation Tabs & Search Controls */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-full)',
              background: activeTab === 'all' ? 'var(--primary)' : 'var(--bg-subtle)',
              color: activeTab === 'all' ? '#FFFFFF' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            All Members ({totalMembersCount})
          </button>

          <button
            onClick={() => setActiveTab('active_loans')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-full)',
              background: activeTab === 'active_loans' ? '#EA580C' : 'var(--bg-subtle)',
              color: activeTab === 'active_loans' ? '#FFFFFF' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            🔴 Active Loan ({activeLoanMembers.length})
          </button>

          <button
            onClick={() => setActiveTab('non_loan')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-full)',
              background: activeTab === 'non_loan' ? '#16A34A' : 'var(--bg-subtle)',
              color: activeTab === 'non_loan' ? '#FFFFFF' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            🟢 Non-Loan ({nonLoanMembers.length})
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-full)',
              background: activeTab === 'pending' ? 'var(--danger)' : 'var(--bg-subtle)',
              color: activeTab === 'pending' ? '#FFFFFF' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            Pending Dues ({pendingCount})
          </button>
        </div>

        {/* Action Controls: [+ Add Member] [ 🔍 Search Bar ] */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 auto' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%))',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '38px', paddingRight: '12px', fontSize: '0.875rem' }}
              placeholder="Search by name, code, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <Loader text="Fetching member records..." />
      ) : activeTab === 'pending' ? (
        /* PENDING DUES TAB */
        searchedPendingMembers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No Pending Dues!"
            description="All registered members have contributed their monthly dues for this period."
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {searchedPendingMembers.map((m) =>
              renderMemberCard(m, activeLoanMemberIds.has(String(m.member_id || m.id)))
            )}
          </div>
        )
      ) : activeTab === 'active_loans' ? (
        /* ACTIVE LOAN MEMBERS ONLY TAB */
        searchedActiveLoanMembers.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No Active Loan Members Found"
            description="No members currently have an active borrowing installment matching your search."
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {searchedActiveLoanMembers.map((m) => renderMemberCard(m, true))}
          </div>
        )
      ) : activeTab === 'non_loan' ? (
        /* NON-LOAN MEMBERS ONLY TAB */
        searchedNonLoanMembers.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="No Non-Loan Members Found"
            description="All members in this group currently have active loans or none matched your filter."
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {searchedNonLoanMembers.map((m) => renderMemberCard(m, false))}
          </div>
        )
      ) : (
        /* ALL MEMBERS TAB — TWO DISTINCT SECTIONS */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* SECTION 1: ACTIVE LOAN MEMBERS */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#C2410C', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <span>🔴 Active Loan Members</span>
                  <span style={{ fontSize: '0.85rem', background: '#FFF7ED', border: '1px solid #FED7AA', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                    {searchedActiveLoanMembers.length}
                  </span>
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '4px 0 0 0' }}>
                  Members with active loans repay regular savings and loan installments together via Record Loan Payment.
                </p>
              </div>
            </div>

            {searchedActiveLoanMembers.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-subtle)',
                  border: '1px dashed var(--border-color)',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem',
                }}
              >
                {search.trim() ? 'No active loan members match your search.' : 'No active loan members in this group.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {searchedActiveLoanMembers.map((m) => renderMemberCard(m, true))}
              </div>
            )}
          </section>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--border-color)' }} />

          {/* SECTION 2: NON-LOAN MEMBERS */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803D', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <span>🟢 Non-Loan Members</span>
                  <span style={{ fontSize: '0.85rem', background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                    {searchedNonLoanMembers.length}
                  </span>
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '4px 0 0 0' }}>
                  Members without active loans record their regular monthly savings contributions.
                </p>
              </div>
            </div>

            {searchedNonLoanMembers.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-subtle)',
                  border: '1px dashed var(--border-color)',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem',
                }}
              >
                {search.trim() ? 'No non-loan members match your search.' : 'No non-loan members found.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {searchedNonLoanMembers.map((m) => renderMemberCard(m, false))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Local Add Member Modal */}
      <AddMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleSuccess}
      />

      {/* Record Loan Payment Modal (Triggered directly for active loan members) */}
      {repayModalData && (
        <RecordRepaymentModal
          isOpen={Boolean(repayModalData)}
          onClose={() => setRepayModalData(null)}
          onSuccess={handleSuccess}
          initialLoanId={repayModalData.loanId}
          initialMemberId={repayModalData.memberId}
        />
      )}

      {/* Record Savings Modal (Triggered directly for non-loan members) */}
      {savingsModalMemberId && (
        <RecordSavingsModal
          isOpen={Boolean(savingsModalMemberId)}
          onClose={() => setSavingsModalMemberId(null)}
          onSuccess={handleSuccess}
          initialMemberId={savingsModalMemberId}
        />
      )}
    </div>
  );
};

export default Members;
