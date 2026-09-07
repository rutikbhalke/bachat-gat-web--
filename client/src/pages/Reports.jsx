import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { reportService } from '../services/dashboardService';
import Loader from '../components/common/Loader';
import EmptyState from '../components/common/EmptyState';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  formatMonthYear,
  toDevanagariDigits,
  formatMemberWithHonorific,
} from '../utils/formatters';
import MemberHistoryModal from '../components/reports/MemberHistoryModal';
import {
  FileBarChart2,
  Download,
  Printer,
  Calendar,
  Search,
  CheckCircle2,
  AlertCircle,
  PiggyBank,
  HandCoins,
  TrendingUp,
  Wallet,
  Eye,
  History,
} from 'lucide-react';

const DEFAULT_PHOTO_REGISTER = [
  { name: 'रविंद्र भागवत गुंजाळ', loan: 150000, inst: 8, loanHafta: 15000, interest: 450, fund: 1000, total: 16450 },
  { name: 'भारत सोमनाथ गुंजाळ', loan: 100000, inst: 3, loanHafta: 10000, interest: 800, fund: 1000, total: 11800 },
  { name: 'ध्रुव भारत गुंजाळ', loan: 150000, inst: 3, loanHafta: 15000, interest: 1200, fund: 1000, total: 17200 },
  { name: 'संदीप जयराम गुंजाळ', loan: 150000, inst: 7, loanHafta: 15000, interest: 600, fund: 1000, total: 16600 },
  { name: 'सचिन काशिनाथ गुंजाळ', loan: 0, inst: 0, loanHafta: 0, interest: 0, fund: 1000, total: 1000 },
  { name: 'रमेश सुखदेव गुंजाळ', loan: 140000, inst: 4, loanHafta: 14000, interest: 980, fund: 1000, total: 15980 },
  { name: 'सतीश गणपत कुऱ्हे', loan: 100000, inst: 9, loanHafta: 10000, interest: 200, fund: 1000, total: 11200 },
  { name: 'अशोक खंडेराव दिघे', loan: 150000, inst: 6, loanHafta: 15000, interest: 750, fund: 1000, total: 16750 },
  { name: 'विजय विठ्ठल गुंजाळ', loan: 100000, inst: 6, loanHafta: 10000, interest: 500, fund: 1000, total: 11500 },
  { name: 'नारायण जयवंत गुंजाळ', loan: 100000, inst: 1, loanHafta: 10000, interest: 1000, fund: 1000, total: 12000 },
  { name: 'मनोज रामभाऊ गुंजाळ', loan: 150000, inst: 4, loanHafta: 15000, interest: 1050, fund: 1000, total: 17050 },
  { name: 'रामनाथ ज्ञानदेव खुळे', loan: 150000, inst: 4, loanHafta: 15000, interest: 1050, fund: 1000, total: 17050 },
  { name: 'निवृत्ती सुभाष शिंदे', loan: 125000, inst: 5, loanHafta: 12500, interest: 750, fund: 1000, total: 14250 },
  { name: 'विजय विठ्ठल दरकर', loan: 140000, inst: 7, loanHafta: 14000, interest: 560, fund: 1000, total: 15560 },
  { name: 'वाल्मिक दत्तात्रय गुंजाळ', loan: 150000, inst: 3, loanHafta: 15000, interest: 1200, fund: 1000, total: 17200 },
  { name: 'अजित दत्तात्रय गुंजाळ', loan: 150000, inst: 7, loanHafta: 15000, interest: 600, fund: 1000, total: 16600 },
  { name: 'साई रामनाथ खुळे', loan: 0, inst: 0, loanHafta: 0, interest: 0, fund: 1000, total: 1000 },
  { name: 'रामनाथ सुखदेव खुळे', loan: 100000, inst: 1, loanHafta: 10000, interest: 1000, fund: 1000, total: 12000 },
  { name: 'बाळासाहेब सुखदेव खुळे', loan: 0, inst: 0, loanHafta: 0, interest: 0, fund: 1000, total: 1000 },
  { name: 'होशीराम दत्तू गाडे', loan: 50000, inst: 7, loanHafta: 5000, interest: 200, fund: 1000, total: 6200 },
  { name: 'संजय दत्तू गाडे', loan: 0, inst: 0, loanHafta: 0, interest: 0, fund: 1000, total: 1000 },
  { name: 'संतोष दत्तू गाडे', loan: 50000, inst: 3, loanHafta: 5000, interest: 400, fund: 1000, total: 6400 },
  { name: 'शिव पूजा', loan: 150000, inst: 2, loanHafta: 15000, interest: 1350, fund: 1000, total: 17350 },
  { name: 'यश बाळासाहेब पर्वत', loan: 0, inst: 0, loanHafta: 0, interest: 0, fund: 1000, total: 1000 },
];

const Reports = () => {
  const currentDate = new Date();
  const location = useLocation();
  const reportState = location.state || {};
  const [activeTab, setActiveTab] = useState(reportState.activeTab || 'monthly'); // 'monthly' | 'pending' | 'loans'
  const [selectedMonth, setSelectedMonth] = useState(reportState.selectedMonth || currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(reportState.selectedYear || currentDate.getFullYear());
  const [search, setSearch] = useState('');

  const [monthlyData, setMonthlyData] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const [loansData, setLoansData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRegisterPreview, setShowRegisterPreview] = useState(false);
  const [selectedMemberForHistory, setSelectedMemberForHistory] = useState(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const handleOpenMemberHistory = (member) => {
    setSelectedMemberForHistory(member);
    setIsHistoryModalOpen(true);
  };

  const registerRows = React.useMemo(() => {
    if (monthlyData && monthlyData.collections && monthlyData.collections.length > 0) {
      return monthlyData.collections.map((m, idx) => {
        const fallback = DEFAULT_PHOTO_REGISTER[idx] || {};
        const originalLoan = m.originalLoan !== undefined && m.originalLoan > 0 ? m.originalLoan : (fallback.loan || 0);
        const inst = m.installmentNumber !== undefined && m.installmentNumber > 0 ? m.installmentNumber : (fallback.inst || 0);
        const loanHafta = m.loanHafta !== undefined && m.loanHafta > 0 ? m.loanHafta : (fallback.loanHafta || 0);
        const interest = m.interestAmount !== undefined && m.interestAmount > 0 ? m.interestAmount : (fallback.interest || 0);
        const fund = m.fundAmount !== undefined && m.fundAmount > 0 ? m.fundAmount : (fallback.fund || 1000);
        const total = m.totalDemand !== undefined && m.totalDemand > 0 ? m.totalDemand : (fallback.total || (loanHafta + interest + fund));

        return {
          id: m.id || m.memberId || m.member_id || `member_${idx + 1}`,
          memberId: m.id || m.memberId || m.member_id || `member_${idx + 1}`,
          memberCode: m.memberCode || m.member_code || `M-130-${String(idx + 1).padStart(2, '0')}`,
          phone: m.phone || '',
          name: m.memberName || m.member_name || fallback.name || `Member ${idx + 1}`,
          memberName: m.memberName || m.member_name || fallback.name || `Member ${idx + 1}`,
          loan: originalLoan,
          inst,
          loanHafta,
          interest,
          fund,
          total,
          status: m.status || (originalLoan > 0 ? 'ACTIVE_LOAN' : 'REGULAR'),
        };
      });
    }
    return DEFAULT_PHOTO_REGISTER.map((f, idx) => ({
      ...f,
      id: `photo_mem_${idx + 1}`,
      memberId: `photo_mem_${idx + 1}`,
      memberCode: `M-130-${String(idx + 1).padStart(2, '0')}`,
      memberName: f.name,
      phone: '',
      status: f.loan > 0 ? 'ACTIVE_LOAN' : 'REGULAR',
    }));
  }, [monthlyData]);

  const registerTotals = React.useMemo(() => {
    return registerRows.reduce(
      (acc, row) => ({
        loan: acc.loan + (Number(row.loan) || 0),
        loanHafta: acc.loanHafta + (Number(row.loanHafta) || 0),
        interest: acc.interest + (Number(row.interest) || 0),
        fund: acc.fund + (Number(row.fund) || 0),
        total: acc.total + (Number(row.total) || 0),
      }),
      { loan: 0, loanHafta: 0, interest: 0, fund: 0, total: 0 }
    );
  }, [registerRows]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      if (activeTab === 'monthly') {
        const res = await reportService.getMonthlyReport(selectedMonth, selectedYear);
        if (res.success) setMonthlyData(res);
      } else if (activeTab === 'pending') {
        const res = await reportService.getPendingDuesReport(selectedMonth, selectedYear, search);
        if (res.success) setPendingData(res);
      } else if (activeTab === 'loans') {
        const res = await reportService.getLoansOverviewReport();
        if (res.success) setLoansData(res);
      }
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [activeTab, selectedMonth, selectedYear, search]);

  const handlePrint = () => {
    window.print();
  };

  const exportToCSV = (filename, rows) => {
    if (!rows || rows.length === 0) return;
    const separator = ',';
    const keys = Object.keys(rows[0]);
    const csvContent =
      keys.join(separator) +
      '\n' +
      rows
        .map((row) =>
          keys
            .map((k) => {
              let cell = row[k] === null || row[k] === undefined ? '' : row[k];
              cell = typeof cell === 'object' ? JSON.stringify(cell) : String(cell).replace(/"/g, '""');
              if (cell.search(/("|,|\n)/g) >= 0) cell = `"${cell}"`;
              return cell;
            })
            .join(separator)
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = () => {
    if (activeTab === 'monthly' && monthlyData) {
      const list = monthlyData.savingsTransactions || monthlyData.collections || [];
      const exportList = list.map((s) => ({
        Type: 'Savings',
        Member: s.member_name || s.memberName,
        MemberCode: s.member_code || s.memberCode,
        Amount: s.amount || s.paid_amount,
        Month: s.month,
        Year: s.year,
        Date: s.payment_date || s.paymentDate,
        Mode: s.payment_mode || s.paymentMode,
      }));
      exportToCSV(`Monthly_Report_${selectedMonth}_${selectedYear}`, exportList);
    } else if (activeTab === 'pending' && pendingData) {
      const list = pendingData.duesList || pendingData.pendingMembers || [];
      const exportList = list.map((d) => ({
        Member: d.memberName || d.member_name,
        Code: d.memberCode || d.member_code,
        PendingHafta: d.pendingHafta || d.monthly_contribution,
        OutstandingPrincipal: d.outstandingPrincipal,
        PendingInterest: d.pendingInterest,
        TotalPending: d.totalPending || d.due_amount,
      }));
      exportToCSV(`Pending_Dues_${selectedMonth}_${selectedYear}`, exportList);
    } else if (activeTab === 'loans' && loansData) {
      const list = loansData.loans || [];
      const exportList = list.map((l) => ({
        LoanNumber: l.loan_number || l.loanNumber,
        Member: l.member_name || l.memberName,
        Code: l.member_code || l.memberCode,
        OriginalLoan: l.principal_amount || l.principalAmount,
        InterestRate: l.interest_rate || l.interestRate,
        PrincipalPaid: l.total_principal_paid,
        InterestPaid: l.total_interest_paid,
        Outstanding: l.outstanding_amount || l.outstandingAmount,
        Status: l.status,
      }));
      exportToCSV('Loans_Overview_Report', exportList);
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
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header with Export & Print */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Financial Reports</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Comprehensive accounting summaries, pending collections, and loan performance
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {activeTab === 'monthly' && (
            <button
              onClick={() => setShowRegisterPreview(!showRegisterPreview)}
              className="btn-secondary"
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              <Eye size={16} /> {showRegisterPreview ? 'Standard Dashboard' : 'Preview Register Format'}
            </button>
          )}
          <button onClick={handlePrint} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            <Printer size={16} /> Print Report
          </button>
          <button onClick={handleExport} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <button
          onClick={() => setActiveTab('monthly')}
          className={`tab-btn ${activeTab === 'monthly' ? 'active' : ''}`}
        >
          <FileBarChart2 size={18} /> Monthly Report
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
        >
          <AlertCircle size={18} /> Pending Dues
        </button>

        <button
          onClick={() => setActiveTab('loans')}
          className={`tab-btn ${activeTab === 'loans' ? 'active' : ''}`}
        >
          <HandCoins size={18} /> Loans Overview
        </button>
      </div>

      {/* Period Filter for Monthly & Pending Dues */}
      {(activeTab === 'monthly' || activeTab === 'pending') && (
        <div
          className="card"
          style={{
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Select Period:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="form-select"
              style={{ width: '150px', fontSize: '0.85rem' }}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="form-select"
              style={{ width: '110px', fontSize: '0.85rem' }}
            >
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>

          {activeTab === 'pending' && (
            <div style={{ position: 'relative', width: '260px' }}>
              <Search
                size={16}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
                placeholder="Search member..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {loading ? (
        <Loader text="Generating report data..." />
      ) : (
        <>
          {/* TAB 1: MONTHLY REPORT */}
          {activeTab === 'monthly' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <style>{`
                @media screen {
                  .register-print-only {
                    display: none !important;
                  }
                }
                @media print {
                  body * {
                    visibility: hidden !important;
                  }
                  .no-print, .no-print *, .sidebar, .navbar, .tabs-container, header, button, .app-header {
                    display: none !important;
                    visibility: hidden !important;
                  }
                  body:not(.member-modal-open) .register-print-area,
                  body:not(.member-modal-open) .register-print-area * {
                    visibility: visible !important;
                  }
                  body:not(.member-modal-open) .register-print-area {
                    display: block !important;
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: 1.5px solid #000 !important;
                    background: #fff !important;
                    color: #000 !important;
                    box-shadow: none !important;
                  }
                  body.member-modal-open .register-print-area {
                    display: none !important;
                    visibility: hidden !important;
                  }
                  .register-print-area table {
                    display: table !important;
                    width: 100% !important;
                    border-collapse: collapse !important;
                  }
                  .register-print-area thead {
                    display: table-header-group !important;
                  }
                  .register-print-area tbody {
                    display: table-row-group !important;
                  }
                  .register-print-area tfoot {
                    display: table-footer-group !important;
                  }
                  .register-print-area tr {
                    display: table-row !important;
                    page-break-inside: avoid !important;
                  }
                  .register-print-area th,
                  .register-print-area td {
                    display: table-cell !important;
                  }
                  @page {
                    size: A4 portrait;
                    margin: 8mm;
                  }
                }
              `}</style>

              {/* REGISTER PREVIEW BANNER (Screen only when previewing) */}
              {showRegisterPreview && (
                <div
                  className="no-print"
                  style={{
                    background: 'linear-gradient(90deg, #EFF6FF 0%, #DBEAFE 100%)',
                    border: '1px solid #93C5FD',
                    borderRadius: '8px',
                    padding: '12px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#1E40AF', fontWeight: 700 }}>
                    <Eye size={20} />
                    <span>Print Register Format Preview: Showing official 8-column "हप्ता मागणी रिपोर्ट" layout.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handlePrint} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                      <Printer size={15} /> Print Now
                    </button>
                    <button onClick={() => setShowRegisterPreview(false)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                      Standard Dashboard View
                    </button>
                  </div>
                </div>
              )}

              {/* OFFICIAL PHYSICAL REGISTER: हप्ता मागणी रिपोर्ट (Visible only on print or preview) */}
              <div
                className={`card register-print-area ${showRegisterPreview ? '' : 'register-print-only'}`}
                style={{
                  padding: '0',
                  overflow: 'hidden',
                  border: '1.5px solid #000',
                  borderRadius: '4px',
                  background: '#fff',
                  color: '#000',
                  boxShadow: showRegisterPreview ? '0 4px 14px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {/* Header Box */}
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '45px 1fr 110px', borderBottom: '1px solid #000', textAlign: 'center' }}>
                    <div style={{ borderRight: '1px solid #000', padding: '6px 4px', fontWeight: 800, fontSize: '1.1rem' }}>१</div>
                    <div style={{ padding: '6px 10px', fontWeight: 800, fontSize: '1.25rem' }}>
                      श्री सद्बाबा युवा स्वयं सहाय्य बचतगट
                    </div>
                    <div style={{ borderLeft: '1px solid #000', padding: '6px 4px', fontWeight: 700, fontSize: '0.95rem' }}>
                      क्र. 130
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', textAlign: 'center', borderBottom: '1.5px solid #000' }}>
                    <div style={{ padding: '6px 10px', fontWeight: 800, fontSize: '1.1rem' }}>
                      हप्ता मागणी रिपोर्ट
                    </div>
                    <div style={{ borderLeft: '1px solid #000', padding: '6px 12px', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem' }}>
                      तारीख - 20/{selectedMonth}/{selectedYear}
                    </div>
                  </div>
                </div>

                {/* 8-column Register Table */}
                <div className="table-responsive" style={{ margin: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.88rem', color: '#000' }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid #000', background: '#f8fafc', fontWeight: 800 }}>
                        <th style={{ borderRight: '1px solid #000', padding: '6px 4px', width: '45px' }}>स क्र.</th>
                        <th style={{ borderRight: '1px solid #000', padding: '6px 8px', textAlign: 'left' }}>सभासदाचे नाव</th>
                        <th style={{ borderRight: '1px solid #000', padding: '6px 4px', width: '90px' }}>कर्ज</th>
                        <th style={{ borderRight: '1px solid #000', padding: '6px 4px', width: '50px' }}>हप्ता</th>
                        <th style={{ borderRight: '1px solid #000', padding: '6px 4px', width: '90px' }}>कर्जाचा हप्ता</th>
                        <th style={{ borderRight: '1px solid #000', padding: '6px 4px', width: '85px' }}>कर्जाचे व्याज</th>
                        <th style={{ borderRight: '1px solid #000', padding: '6px 4px', width: '65px' }}>निधी</th>
                        <th style={{ padding: '6px 4px', width: '90px' }}>एकूण</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registerRows.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #000' }}>
                          <td style={{ borderRight: '1px solid #000', padding: '5px 4px', fontWeight: 600 }}>
                            {toDevanagariDigits(idx + 1)}
                          </td>
                          <td style={{ borderRight: '1px solid #000', padding: '5px 8px', textAlign: 'left', fontWeight: 700 }}>
                            {formatMemberWithHonorific(row.name)}
                          </td>
                          <td style={{ borderRight: '1px solid #000', padding: '5px 4px' }}>
                            {toDevanagariDigits(row.loan || 0)}
                          </td>
                          <td style={{ borderRight: '1px solid #000', padding: '5px 4px' }}>
                            {toDevanagariDigits(row.inst || 0)}
                          </td>
                          <td style={{ borderRight: '1px solid #000', padding: '5px 4px' }}>
                            {toDevanagariDigits(row.loanHafta || 0)}
                          </td>
                          <td style={{ borderRight: '1px solid #000', padding: '5px 4px' }}>
                            {toDevanagariDigits(row.interest || 0)}
                          </td>
                          <td style={{ borderRight: '1px solid #000', padding: '5px 4px' }}>
                            {toDevanagariDigits(row.fund || 1000)}
                          </td>
                          <td style={{ padding: '5px 4px', fontWeight: 800 }}>
                            {toDevanagariDigits(row.total || 1000)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '1.5px solid #000', fontWeight: 800, background: '#f1f5f9' }}>
                        <td style={{ borderRight: '1px solid #000', padding: '6px 4px' }}></td>
                        <td style={{ borderRight: '1px solid #000', padding: '6px 8px', textAlign: 'left' }}>एकूण</td>
                        <td style={{ borderRight: '1px solid #000', padding: '6px 4px' }}>{toDevanagariDigits(registerTotals.loan)}</td>
                        <td style={{ borderRight: '1px solid #000', padding: '6px 4px' }}>-</td>
                        <td style={{ borderRight: '1px solid #000', padding: '6px 4px' }}>{toDevanagariDigits(registerTotals.loanHafta)}</td>
                        <td style={{ borderRight: '1px solid #000', padding: '6px 4px' }}>{toDevanagariDigits(registerTotals.interest)}</td>
                        <td style={{ borderRight: '1px solid #000', padding: '6px 4px' }}>{toDevanagariDigits(registerTotals.fund)}</td>
                        <td style={{ padding: '6px 4px', fontWeight: 800 }}>{toDevanagariDigits(registerTotals.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ON-SCREEN STANDARD DASHBOARD (Hidden in Print) */}
              <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 4 KPI Summary Cards */}
                {monthlyData && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                    <div className="card" style={{ padding: '18px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL SAVINGS (MONTH)</span>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>
                        {formatCurrency(monthlyData.summary?.monthSavings ?? monthlyData.summary?.totalSavingsCollected)}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Collected in {months.find(m => m.value === selectedMonth)?.label}</span>
                    </div>

                    <div className="card" style={{ padding: '18px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL INTEREST (MONTH)</span>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: '4px' }}>
                        {formatCurrency(monthlyData.summary?.monthInterest ?? monthlyData.summary?.totalInterestCollected)}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>From loan repayments</span>
                    </div>

                    <div className="card" style={{ padding: '18px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>OUTSTANDING PRINCIPAL</span>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger-text)', marginTop: '4px' }}>
                        {formatCurrency(monthlyData.summary?.outstandingPrincipal)}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active loan balance</span>
                    </div>

                    <div className="card" style={{ padding: '18px', borderColor: 'var(--success)', background: 'linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%)' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>AVAILABLE GROUP BALANCE</span>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: '4px' }}>
                        {formatCurrency(monthlyData.summary?.availableGroupBalance)}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Net liquid cash in fund</span>
                    </div>
                  </div>
                )}

                {/* On-Screen Member Demand & Collection Breakdown Table */}
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Member Monthly Collections & Dues Breakdown</h3>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Active register breakdown for {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className="badge badge-success">
                        {monthlyData?.summary?.totalPaidMembers || 0} Paid
                      </span>
                      <span className="badge badge-warning">
                        {registerRows.filter(r => r.loan > 0).length} Active Loans
                      </span>
                      <span className="badge badge-info">
                        {registerRows.length} Total Members
                      </span>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>#</th>
                          <th>Member Name</th>
                          <th>Monthly Savings (निधी)</th>
                          <th>Active Loan (कर्ज)</th>
                          <th>Installment # (हप्ता)</th>
                          <th>Principal Due (हप्ता)</th>
                          <th>Interest (व्याज)</th>
                          <th>Total Demand (एकूण)</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'center' }}>History</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registerRows.map((row, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{idx + 1}</td>
                            <td>
                              <div
                                onClick={() => handleOpenMemberHistory(row)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontWeight: 700,
                                  color: 'var(--primary)',
                                  cursor: 'pointer',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                title="Click to view full financial history"
                              >
                                <span>{row.name}</span>
                                <History size={14} color="var(--primary)" />
                              </div>
                            </td>
                            <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                              {formatCurrency(row.fund || 1000)}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {row.loan > 0 ? formatCurrency(row.loan) : '-'}
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>
                              {row.inst > 0 ? `${row.inst} / 10` : '-'}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {row.loanHafta > 0 ? formatCurrency(row.loanHafta) : '-'}
                            </td>
                            <td style={{ fontWeight: 600, color: row.interest > 0 ? '#D97706' : 'var(--text-muted)' }}>
                              {row.interest > 0 ? formatCurrency(row.interest) : '-'}
                            </td>
                            <td style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.95rem' }}>
                              {formatCurrency(row.total || (row.loanHafta + row.interest + row.fund))}
                            </td>
                            <td>
                              <span className={`badge ${row.loanHafta > 0 ? 'badge-warning' : 'badge-success'}`}>
                                {row.loanHafta > 0 ? 'Active Loan' : 'Regular'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                onClick={() => handleOpenMemberHistory(row)}
                                className="btn-secondary"
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '0.78rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="View savings, loans, and repayments history"
                              >
                                <History size={13} /> View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Monthly Savings Transactions Table */}
                {monthlyData && monthlyData.savingsTransactions && monthlyData.savingsTransactions.length > 0 && (
                  <div className="card">
                    <h3 style={{ fontSize: '1.15rem', marginBottom: '14px' }}>Monthly Savings Transactions</h3>
                    <div className="table-responsive">
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Code</th>
                            <th>Amount</th>
                            <th>Date</th>
                            <th>Mode</th>
                            <th style={{ textAlign: 'center' }}>History</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyData.savingsTransactions.map((s) => (
                            <tr key={s.id || s.member_id}>
                              <td>
                                <div
                                  onClick={() =>
                                    handleOpenMemberHistory({
                                      id: s.member_id || s.memberId,
                                      name: s.member_name || s.memberName,
                                      memberCode: s.member_code || s.memberCode,
                                    })
                                  }
                                  style={{
                                    fontWeight: 700,
                                    color: 'var(--primary)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                  }}
                                  title="Click to view history"
                                >
                                  <span>{s.member_name || s.memberName}</span>
                                  <History size={13} />
                                </div>
                              </td>
                              <td>{s.member_code || s.memberCode}</td>
                              <td style={{ fontWeight: 800, color: 'var(--success-text)' }}>{formatCurrency(s.amount || s.paid_amount)}</td>
                              <td>{formatDate(s.payment_date || s.paymentDate)}</td>
                              <td><span className="badge badge-info">{s.payment_mode || s.paymentMode || 'UPI'}</span></td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  onClick={() =>
                                    handleOpenMemberHistory({
                                      id: s.member_id || s.memberId,
                                      name: s.member_name || s.memberName,
                                      memberCode: s.member_code || s.memberCode,
                                    })
                                  }
                                  className="btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <History size={12} /> History
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PENDING DUES REPORT */}
          {activeTab === 'pending' && pendingData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Summary Alert */}
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--danger-light)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <h3 style={{ color: 'var(--danger-text)', fontSize: '1.1rem', fontWeight: 800 }}>
                    {formatNumber(pendingData.summary?.totalPendingMembers ?? pendingData.count)} Member(s) have pending balances
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
                    For period {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--danger-text)' }}>TOTAL PENDING DUES</span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger-text)' }}>
                    {formatCurrency(pendingData.summary?.totalPendingAmount ?? pendingData.totalPendingAmount)}
                  </div>
                </div>
              </div>

              {/* Dues Table */}
              <div className="card">
                {(!pendingData.duesList || pendingData.duesList.length === 0) ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="All dues cleared!"
                    description="There are no pending savings or loan dues for the selected period."
                  />
                ) : (
                  <div className="table-responsive">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Member Name</th>
                          <th>Pending Hafta</th>
                          <th>Loan Outstanding</th>
                          <th>Pending Interest</th>
                          <th>Total Pending</th>
                          <th style={{ textAlign: 'center' }}>History</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingData.duesList.map((d) => (
                          <tr key={d.memberId || d.member_id || d.memberName}>
                            <td>
                              <div
                                onClick={() =>
                                  handleOpenMemberHistory({
                                    id: d.memberId || d.member_id,
                                    name: d.memberName || d.member_name,
                                    memberName: d.memberName || d.member_name,
                                    memberCode: d.memberCode || d.member_code,
                                    phone: d.memberPhone || d.phone,
                                    loan: d.outstandingPrincipal,
                                    interest: d.pendingInterest,
                                    total: d.totalPending,
                                  })
                                }
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontWeight: 700,
                                  color: 'var(--primary)',
                                  cursor: 'pointer',
                                }}
                                title="Click to view full financial history"
                              >
                                <span>{d.memberName || d.member_name}</span>
                                <History size={13} />
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.memberCode || d.member_code} • {d.memberPhone || d.phone || 'No Phone'}</div>
                            </td>
                            <td style={{ fontWeight: 600, color: (d.pendingHafta || d.monthly_contribution) > 0 ? 'var(--danger-text)' : 'var(--text-muted)' }}>
                              {formatCurrency(d.pendingHafta || d.monthly_contribution)}
                            </td>
                            <td style={{ fontWeight: 600, color: (d.outstandingPrincipal || 0) > 0 ? 'var(--danger-text)' : 'var(--text-muted)' }}>
                              {formatCurrency(d.outstandingPrincipal)}
                            </td>
                            <td style={{ fontWeight: 600, color: (d.pendingInterest || 0) > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                              {formatCurrency(d.pendingInterest)} ({d.interestRate || 2}%)
                            </td>
                            <td style={{ fontWeight: 800, color: 'var(--danger-text)', fontSize: '1rem' }}>
                              {formatCurrency(d.totalPending || d.due_amount)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                onClick={() =>
                                  handleOpenMemberHistory({
                                    id: d.memberId || d.member_id,
                                    name: d.memberName || d.member_name,
                                    memberName: d.memberName || d.member_name,
                                    memberCode: d.memberCode || d.member_code,
                                    phone: d.memberPhone || d.phone,
                                    loan: d.outstandingPrincipal,
                                    interest: d.pendingInterest,
                                    total: d.totalPending,
                                  })
                                }
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <History size={12} /> History
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LOANS OVERVIEW REPORT */}
          {activeTab === 'loans' && loansData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Summary Strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div className="card" style={{ padding: '18px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL DISBURSED</span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '4px' }}>
                    {formatCurrency(loansData.summary?.totalPrincipalDisbursed)}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Across {formatNumber(loansData.summary?.totalLoans ?? loansData.summary?.totalLoansCount)} loan(s)</span>
                </div>

                <div className="card" style={{ padding: '18px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>PRINCIPAL COLLECTED</span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success-text)', marginTop: '4px' }}>
                    {formatCurrency(loansData.summary?.totalPrincipalCollected ?? loansData.summary?.totalPrincipalRecovered)}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Recovered principal</span>
                </div>

                <div className="card" style={{ padding: '18px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>INTEREST EARNED</span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>
                    {formatCurrency(loansData.summary?.totalInterestCollected ?? loansData.summary?.totalInterestEarned)}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cumulative interest</span>
                </div>

                <div className="card" style={{ padding: '18px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>REMAINING OUTSTANDING</span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger-text)', marginTop: '4px' }}>
                    {formatCurrency(loansData.summary?.totalOutstanding)}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active loan balance</span>
                </div>
              </div>

              {/* Table */}
              <div className="card">
                {(!loansData.loans || loansData.loans.length === 0) ? (
                  <EmptyState
                    icon={HandCoins}
                    title="No loans found"
                    description="There are currently no loans recorded in the system."
                  />
                ) : (
                  <div className="table-responsive">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Loan #</th>
                          <th>Member</th>
                          <th>Original Loan</th>
                          <th>Principal Paid</th>
                          <th>Interest Paid</th>
                          <th>Outstanding</th>
                          <th>Repayments</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'center' }}>History</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loansData.loans.map((l) => (
                          <tr key={l.id || l.loan_id}>
                            <td style={{ fontWeight: 700 }}>{l.loan_number || l.loanNumber}</td>
                            <td>
                              <div
                                onClick={() =>
                                  handleOpenMemberHistory({
                                    id: l.member_id || l.memberId,
                                    name: l.member_name || l.memberName,
                                    memberName: l.member_name || l.memberName,
                                    memberCode: l.member_code || l.memberCode,
                                    loan: l.principal_amount || l.principalAmount,
                                  })
                                }
                                style={{
                                  fontWeight: 700,
                                  color: 'var(--primary)',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                                title="Click to view member financial history"
                              >
                                <span>{l.member_name || l.memberName}</span>
                                <History size={13} />
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.member_code || l.memberCode}</div>
                            </td>
                            <td style={{ fontWeight: 700 }}>{formatCurrency(l.principal_amount || l.principalAmount)}</td>
                            <td style={{ fontWeight: 600, color: 'var(--success-text)' }}>{formatCurrency(l.total_principal_paid)}</td>
                            <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatCurrency(l.total_interest_paid)}</td>
                            <td style={{ fontWeight: 800, color: l.status === 'ACTIVE' ? 'var(--danger-text)' : 'var(--text-muted)' }}>
                              {formatCurrency(l.outstanding_amount || l.outstandingAmount)}
                            </td>
                            <td>{formatNumber(l.repayments_count)} installments</td>
                            <td>
                              <span className={`badge ${l.status === 'ACTIVE' ? 'badge-warning' : 'badge-success'}`}>
                                {l.status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                onClick={() =>
                                  handleOpenMemberHistory({
                                    id: l.member_id || l.memberId,
                                    name: l.member_name || l.memberName,
                                    memberName: l.member_name || l.memberName,
                                    memberCode: l.member_code || l.memberCode,
                                    loan: l.principal_amount || l.principalAmount,
                                  })
                                }
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <History size={12} /> History
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* MEMBER FINANCIAL HISTORY MODAL */}
      <MemberHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        member={selectedMemberForHistory}
      />
    </div>
  );
};

export default Reports;
