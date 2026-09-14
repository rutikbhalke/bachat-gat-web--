import React, { useState, useEffect } from 'react';
import { Printer, Download, User } from 'lucide-react';
import { reportService, formatMonthEndDate } from '../../services/reportService';
import { DEFAULT_GROUP_ID } from '../../utils/formatters';

const formatDecimal2 = (val) => {
  const num = Number(val);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
};

const formatDecimal4 = (val) => {
  const num = Number(val);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
};

const NewMonthWiseBachatGatTaalebandReport = ({ selectedMonth, selectedYear }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [groupInfo, setGroupInfo] = useState({
    name: 'श्री सदुबाबा युवा स्वयम सहाय्य बचतगट',
    address: 'कोल्हेवाडी रोड ,समनापूर,ता. संगमनेर,जि. अहमदनगर',
    phone: '7020825028',
    email: 'sadubaba@gmail.com',
  });
  
  const currentYear = selectedYear || new Date().getFullYear();
  const initialToDate = (selectedMonth && selectedYear)
    ? formatMonthEndDate(selectedYear, selectedMonth)
    : `${currentYear}-12-31`;

  const [fromDate, setFromDate] = useState(`${currentYear}-01-01`);
  const [toDate, setToDate] = useState(initialToDate);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (selectedYear) {
      setFromDate(`${selectedYear}-01-01`);
      if (selectedMonth) {
        setToDate(formatMonthEndDate(selectedYear, selectedMonth));
      }
    }
  }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await reportService.getDateWiseBachatGatTaalebandReport(fromDate, toDate, DEFAULT_GROUP_ID);
      if (res && res.reportRows) {
        setData(res.reportRows);
      } else {
        setData([]);
      }
      if (res && res.summary) {
        setSummary(res.summary);
      } else {
        setSummary(null);
      }
      if (res && res.groupName) {
        setGroupInfo(prev => ({
          ...prev,
          name: res.groupName,
          address: res.address || prev.address,
          phone: res.phone || prev.phone,
          email: res.email || prev.email,
        }));
      }
    } catch (err) {
      console.error('Failed to load Taaleband Register:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const handlePrint = () => {
    window.print();
  };

  // Grand Totals matching photo calculation
  const totalFundDeposit = data.reduce((acc, row) => acc + (Number(row.fundDeposit) || 0), 0);
  const totalLoanDeposit = data.reduce((acc, row) => acc + (Number(row.loanDeposit) || 0), 0);
  const totalHaptaPaid = data.reduce((acc, row) => acc + (Number(row.haptaPaid) || 0), 0);
  const totalInterestPaid = data.reduce((acc, row) => acc + (Number(row.interestPaid) || 0), 0);
  const totalLoanDisbursed = data.reduce((acc, row) => acc + (Number(row.loanDisbursed) || 0), 0);

  // Authoritative Reconciled Metrics from Live Firestore Data
  const summaryTotalSavings = summary?.totalSavings ?? totalFundDeposit;
  const summaryLoanDisbursed = summary?.loanDisbursed ?? summary?.totalLoanDisbursed ?? totalLoanDisbursed;
  const summaryLoanDeposit = summary?.loanDeposit ?? summary?.totalLoanDeposit ?? totalLoanDeposit;
  const summaryPrincipalRepaid = summary?.principalRepaid ?? totalHaptaPaid;
  const summaryInterestPaid = summary?.totalInterestPaid ?? totalInterestPaid;
  const summaryOutstandingPrincipal = summary?.outstandingPrincipal ?? 0;
  const summaryCurrentMonthlyInterest = summary?.currentMonthlyInterest ?? Math.round(summaryOutstandingPrincipal * 0.02 * 100) / 100;
  const summaryAvailableBalance = summary?.availableBalance ?? (data.length > 0 ? data[data.length - 1].totalBalance : 0);
  const summaryTotalGroupFund = summary?.totalGroupFund ?? Math.round((summaryAvailableBalance + summaryOutstandingPrincipal) * 100) / 100;

  // Closing balance reconciles to ending Available Balance
  const grandTotalBalance = summaryAvailableBalance;

  const handleExportCSV = () => {
    if (!data || data.length === 0) return;
    const header = [
      'अ.नं.',
      'नियमित बचत / हप्ता (Regular Savings)',
      'कर्ज मुद्दल परतफेड (Loan Principal Repaid)',
      'जमा व्याज (Interest Paid)',
      'कर्ज वाटप (Loan Disbursement)',
      'उपलब्ध शिल्लक (Available Balance)',
      'तारीख (Payment Date)',
    ];
    const rows = data.map((row, idx) => [
      row.sr || idx + 1,
      formatDecimal2(row.fundDeposit || row.regularSavings),
      formatDecimal2(row.principalRepaid || row.loanPrincipalRepaid || row.haptaPaid),
      formatDecimal2(row.interestPaid),
      formatDecimal2(row.loanDisbursed),
      formatDecimal2(row.totalBalance || row.availableBalance),
      row.dateLabel,
    ]);

    const emptyRow = ['', '', '', '', '', '', ''];
    const summaryColumns = [
      'Total Regular Savings',
      'Loan Deposit',
      'Loan Principal Repaid',
      'Total Interest Paid',
      'Current Monthly Interest',
      'Outstanding Principal',
      'Total Group Fund',
      'Available Balance',
    ];
    const summaryValues = [
      formatDecimal2(summaryTotalSavings),
      formatDecimal2(summaryLoanDeposit),
      formatDecimal2(summaryPrincipalRepaid),
      formatDecimal2(summaryInterestPaid),
      formatDecimal2(summaryCurrentMonthlyInterest),
      formatDecimal2(summaryOutstandingPrincipal),
      formatDecimal2(summaryTotalGroupFund),
      formatDecimal2(summaryAvailableBalance),
    ];

    const csvContent = [
      header,
      ...rows,
      emptyRow,
      ['--- AUTHORITATIVE FINANCIAL SUMMARY ---', '', '', '', '', '', '', ''],
      summaryColumns,
      summaryValues
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Mahinyacha_Taaleband_Report_${fromDate}_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Date formatting for header (DD/MM/YYYY)
  const formatHeaderDate = (isoStr) => {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoStr;
  };

  const fromDateDisplay = formatHeaderDate(fromDate);
  const toDateDisplay = formatHeaderDate(toDate);
  const reportDateDisplay = toDateDisplay || `${new Date().getDate()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${currentYear}`;

  return (
    <div>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .no-print, .no-print *, .sidebar, .navbar, .tabs-container, header, button, .app-header {
            display: none !important;
            visibility: hidden !important;
          }
          .taaleband-print-area,
          .taaleband-print-area * {
            visibility: visible !important;
          }
          .taaleband-print-area {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10px !important;
            color: #000 !important;
            background: #fff !important;
            border: none !important;
            box-shadow: none !important;
          }
          .taaleband-print-area table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          .taaleband-print-area th,
          .taaleband-print-area td {
            border: 1px solid #777 !important;
            font-size: 11px !important;
            padding: 4px 6px !important;
          }
          .taaleband-print-area tfoot {
            display: table-row-group !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>

      {/* Control Bar (Screen only) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }} className="no-print">
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', background: '#f8f9fa', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e9ecef' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#495057' }}>या तारखेपासून:</span>
            <input 
              type="date" 
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.9rem' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#495057' }}>या तारखेपर्यंत:</span>
            <input 
              type="date" 
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '0.9rem' }}
            />
          </div>
          <button 
            onClick={fetchData}
            style={{ padding: '6px 16px', background: '#228be6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
          >
            Generate Report
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
            <Download size={18} /> Export CSV
          </button>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
            <Printer size={18} /> Print Report
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading Register...</div>
      ) : (
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
          {/* Main Paper Sheet Container */}
          <div 
            className="taaleband-print-area" 
            style={{ 
              background: '#fff', 
              color: '#000', 
              width: '100%', 
              maxWidth: '960px', 
              border: '1px solid #999', 
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              padding: '24px 30px', 
              fontFamily: "'Noto Sans Devanagari', 'Mangal', 'Arial', sans-serif",
              position: 'relative'
            }}
          >
            {/* Right Margin Vertical Text (Exact Replica of Photo) */}
            <div 
              style={{
                position: 'absolute',
                right: '4px',
                top: '50%',
                transform: 'rotate(90deg) translateX(-50%)',
                transformOrigin: 'right top',
                fontSize: '11px',
                color: '#555',
                whiteSpace: 'nowrap',
                fontWeight: 600,
                letterSpacing: '0.5px'
              }}
            >
              {groupInfo.name} &nbsp; {groupInfo.address} &nbsp; {groupInfo.email} &nbsp; {groupInfo.phone} &nbsp; तारीख:- {reportDateDisplay}
            </div>

            {/* Header matching Photo */}
            <div style={{ position: 'relative', marginBottom: '14px', minHeight: '90px' }}>
              {/* Circular Avatar / Logo on top-left */}
              <div 
                style={{
                  position: 'absolute',
                  left: '0',
                  top: '0',
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#9ca3af',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  border: '2px solid #e5e7eb'
                }}
              >
                <User size={42} strokeWidth={1.8} />
              </div>

              {/* Center Title & Details */}
              <div style={{ textAlign: 'center', padding: '0 70px' }}>
                <h1 style={{ margin: '0', fontSize: '1.45rem', fontWeight: 800, color: '#000', letterSpacing: '0.3px' }}>
                  {groupInfo.name}
                </h1>
                <div style={{ fontSize: '0.85rem', marginTop: '3px', color: '#222' }}>
                  {groupInfo.address}
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: '2px', color: '#222', fontWeight: 600 }}>
                  {groupInfo.phone}
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: '2px', color: '#333' }}>
                  {groupInfo.email}
                </div>
              </div>
            </div>

            {/* Report Title & Dates Row */}
            <div style={{ borderBottom: '1px solid #000', paddingBottom: '6px', marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#000' }}>
                  &nbsp;
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <h2 style={{ margin: '0', fontSize: '1.25rem', fontWeight: 800, color: '#000' }}>
                    महिन्याचा ताळेबंद रिपोर्ट
                  </h2>
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#000', whiteSpace: 'nowrap' }}>
                  तारीख : {reportDateDisplay}
                </div>
              </div>

              {/* Date Filter Range Subtitle */}
              <div style={{ display: 'flex', gap: '30px', marginTop: '6px', fontSize: '0.9rem', color: '#000' }}>
                <div><strong>या तारखेपासून :</strong> {fromDateDisplay}</div>
                <div><strong>या तारखेपर्यंत :</strong> {toDateDisplay}</div>
              </div>
            </div>

            {/* Financial Reconciliation & Interest Separation Summary (Screen & Print) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px',
              marginTop: '10px',
              marginBottom: '14px',
              padding: '10px 12px',
              background: '#f8fafc',
              border: '1.5px solid #475569',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              {/* Row 1 */}
              <div style={{ borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #e2e8f0', padding: '4px 6px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                  १. एकूण बचत (Total Savings)
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                  ₹{summaryTotalSavings.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>सभासदांचे जमा हप्ते</div>
              </div>

              <div style={{ borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #e2e8f0', padding: '4px 6px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>
                  २. कर्ज जमा (Loan Deposit)
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0284c7', marginTop: '2px' }}>
                  ₹{summaryLoanDeposit.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>लंपसम / बँक कर्ज जमा</div>
              </div>

              <div style={{ borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #e2e8f0', padding: '4px 6px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>
                  ३. मुद्दल परतफेड (Principal Repaid)
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                  ₹{summaryPrincipalRepaid.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>हप्ता जमा मुद्दल</div>
              </div>

              <div style={{ borderBottom: '1px solid #e2e8f0', padding: '4px 6px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>
                  ४. जमा व्याज (Interest Paid)
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                  ₹{summaryInterestPaid.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>प्रत्यक्ष वसूल व्याज</div>
              </div>

              {/* Row 2 */}
              <div style={{ borderRight: '1px solid #cbd5e1', padding: '4px 6px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>
                  ५. चालू व्याज (Monthly 2%)
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
                  ₹{summaryCurrentMonthlyInterest.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>शिल्लक मुद्दलावर २%</div>
              </div>

              <div style={{ borderRight: '1px solid #cbd5e1', padding: '4px 6px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>
                  ६. शिल्लक मुद्दल (Outstanding)
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>
                  ₹{summaryOutstandingPrincipal.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>कर्ज वाटप - परतफेड</div>
              </div>

              <div style={{ borderRight: '1px solid #cbd5e1', padding: '4px 6px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                  ७. एकूण गट निधी (Group Fund)
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                  ₹{summaryTotalGroupFund.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>बचत + चालू व्याज</div>
              </div>

              <div style={{ padding: '4px 6px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>
                  ८. उपलब्ध शिल्लक (Available Balance)
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1d4ed8', marginTop: '2px' }}>
                  ₹{summaryAvailableBalance.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>गट निधी - शिल्लक मुद्दल</div>
              </div>
            </div>

            {/* Taaleband Table */}
            <div style={{ overflowX: 'auto', margin: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.88rem', color: '#000' }}>
                <thead>
                  <tr style={{ borderTop: '1px solid #777', borderBottom: '1px solid #777', fontWeight: 700, background: '#fafafa' }}>
                    <th style={{ border: '1px solid #777', padding: '6px 4px', width: '45px' }}>अ.नं.</th>
                    <th style={{ border: '1px solid #777', padding: '6px 4px', width: '130px' }}>
                      <div>नियमित बचत / हप्ता</div>
                      <div style={{ fontSize: '0.72rem', color: '#555', fontWeight: 600 }}>Regular Savings</div>
                    </th>
                    <th style={{ border: '1px solid #777', padding: '6px 4px', width: '135px' }}>
                      <div>कर्ज मुद्दल परतफेड</div>
                      <div style={{ fontSize: '0.72rem', color: '#555', fontWeight: 600 }}>Principal Repaid</div>
                    </th>
                    <th style={{ border: '1px solid #777', padding: '6px 4px', width: '110px' }}>
                      <div>जमा व्याज</div>
                      <div style={{ fontSize: '0.72rem', color: '#555', fontWeight: 600 }}>Interest Paid</div>
                    </th>
                    <th style={{ border: '1px solid #777', padding: '6px 4px', width: '115px' }}>
                      <div>कर्ज वाटप</div>
                      <div style={{ fontSize: '0.72rem', color: '#555', fontWeight: 600 }}>Loan Disbursed</div>
                    </th>
                    <th style={{ border: '1px solid #777', padding: '6px 4px', width: '135px' }}>
                      <div>उपलब्ध शिल्लक</div>
                      <div style={{ fontSize: '0.72rem', color: '#555', fontWeight: 600 }}>Available Balance</div>
                    </th>
                    <th style={{ border: '1px solid #777', padding: '6px 4px', width: '100px' }}>
                      <div>तारीख</div>
                      <div style={{ fontSize: '0.72rem', color: '#555', fontWeight: 600 }}>Date</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #aaa' }}>
                      <td style={{ border: '1px solid #888', padding: '5px 3px', fontWeight: 600 }}>{row.sr || idx + 1}</td>
                      <td style={{ border: '1px solid #888', padding: '5px 4px', textAlign: 'right' }}>{formatDecimal2(row.fundDeposit || row.regularSavings)}</td>
                      <td style={{ border: '1px solid #888', padding: '5px 4px', textAlign: 'right' }}>{formatDecimal2(row.principalRepaid || row.loanPrincipalRepaid || row.haptaPaid)}</td>
                      <td style={{ border: '1px solid #888', padding: '5px 4px', textAlign: 'right' }}>{formatDecimal2(row.interestPaid)}</td>
                      <td style={{ border: '1px solid #888', padding: '5px 4px', textAlign: 'right' }}>{formatDecimal2(row.loanDisbursed)}</td>
                      <td style={{ border: '1px solid #888', padding: '5px 4px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{formatDecimal2(row.totalBalance || row.availableBalance)}</td>
                      <td style={{ border: '1px solid #888', padding: '5px 3px' }}>{row.dateLabel}</td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ padding: '30px', textAlign: 'center', fontSize: '1.1rem' }}>No transactions found for this period.</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #000', fontWeight: 900, background: '#f5f5f5' }}>
                    <td style={{ border: '1px solid #777', padding: '7px 4px', textAlign: 'center' }}>एकूण :</td>
                    <td style={{ border: '1px solid #777', padding: '7px 4px', textAlign: 'right' }}>{formatDecimal2(totalFundDeposit)}</td>
                    <td style={{ border: '1px solid #777', padding: '7px 4px', textAlign: 'right' }}>{formatDecimal2(totalHaptaPaid)}</td>
                    <td style={{ border: '1px solid #777', padding: '7px 4px', textAlign: 'right' }}>{formatDecimal2(totalInterestPaid)}</td>
                    <td style={{ border: '1px solid #777', padding: '7px 4px', textAlign: 'right' }}>{formatDecimal2(totalLoanDisbursed)}</td>
                    <td style={{ border: '1px solid #777', padding: '7px 4px', textAlign: 'right', fontWeight: 900, color: '#1d4ed8' }}>{formatDecimal2(grandTotalBalance)}</td>
                    <td style={{ border: '1px solid #777', padding: '7px 4px' }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewMonthWiseBachatGatTaalebandReport;
