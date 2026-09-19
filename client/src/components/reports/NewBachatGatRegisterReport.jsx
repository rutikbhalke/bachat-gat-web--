import React, { useState, useEffect, useMemo } from 'react';
import { reportService } from '../../services/reportService';
import { groupService } from '../../services/groupService';
import { formatCurrency, formatDate, toDevanagariDigits } from '../../utils/formatters';

const NewBachatGatRegisterReport = ({ selectedMonth: initialMonth, selectedYear: initialYear }) => {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(initialMonth || currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(initialYear || currentDate.getFullYear());
  const [memberFilter, setMemberFilter] = useState('');
  
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState([]);

  // Load members for filter dropdown
  useEffect(() => {
    const loadMembers = async () => {
      try {
        const { group } = await groupService.getGroupDetails();
        const { activeMembers } = await reportService._getBaselineData(group?.id);
        setMembers(activeMembers || []);
      } catch (err) {
        console.error("Failed to load members for filter", err);
      }
    };
    loadMembers();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await reportService.getNewBachatGatRegisterReport(selectedMonth, selectedYear, memberFilter);
      setReportData(data);
    } catch (err) {
      console.error("Failed to fetch new register report", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedMonth, selectedYear, memberFilter]);

  const handlePrint = () => {
    // Hide standard elements before printing
    const originalTitle = document.title;
    document.title = `Bachat Gat Register - ${selectedMonth}/${selectedYear}`;
    window.print();
    document.title = originalTitle;
  };

  // Grand Totals Calculation
  const totals = useMemo(() => {
    return reportData.reduce((acc, row) => ({
      principal: acc.principal + (Number(row.principalPaid) || 0),
      interest: acc.interest + (Number(row.interestPaid) || 0),
      regularHapta: acc.regularHapta + (Number(row.regularHapta) || 0),
      total: acc.total + (Number(row.total) || 0)
    }), { principal: 0, interest: 0, regularHapta: 0, total: 0 });
  }, [reportData]);

  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  const currentYear = currentDate.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="new-bachat-gat-report-container">
      {/* Print Specific Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .new-bachat-gat-register-print-area, .new-bachat-gat-register-print-area * {
            visibility: visible;
          }
          .new-bachat-gat-register-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .new-bachat-gat-register-print-area tfoot {
            display: table-row-group !important;
          }
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          .no-print-area {
            display: none !important;
          }
        }
      `}</style>

      {/* Filters Area (Not Printed) */}
      <div className="card no-print-area" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>New Bachat Gat Register Report</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="form-control"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={{ width: '130px' }}
            >
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select
              className="form-control"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{ width: '100px' }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              className="form-control"
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              style={{ width: '180px' }}
            >
              <option value="">All Members</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name || m.fullName}</option>
              ))}
            </select>
            
            <button className="btn btn-secondary" onClick={handlePrint}>
              Print Preview / Print
            </button>
          </div>
        </div>
      </div>

      {/* Printable Area */}
      <div className="card new-bachat-gat-register-print-area" style={{ padding: '20px', backgroundColor: '#fff' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0 0 10px 0' }}>New Bachat Gat Register Report</h1>
          <p style={{ margin: 0, fontSize: '1.1rem' }}>
            For the Month of: {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
          </p>
          <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem', color: '#555' }}>
            Generated On: {formatDate(new Date())}
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Loading report...</div>
        ) : reportData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No records found for the selected period.</div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem', color: '#000' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #000' }}>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Sr. No.</th>
                  <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>Member Full Name</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Loan Amount</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Hapta Number / Installment No.</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Loan Hapta / Principal Paid</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Interest</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Regular Hapta / Fund</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Total</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, index) => (
                  <tr key={row.id}>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>{index + 1}</td>
                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', fontWeight: 'bold' }}>
                      {row.memberName}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>
                      {(row.loan || row.loanAmount) ? formatCurrency(row.loan || row.loanAmount) : '-'}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>
                      {row.installmentNumber}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>
                      {formatCurrency(row.principalPaid)}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>
                      {formatCurrency(row.interestPaid)}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>
                      {formatCurrency(row.regularHapta)}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>
                      {formatCurrency(row.total)}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>
                      {row.paymentDate ? formatDate(row.paymentDate) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#e2e8f0', borderTop: '2px solid #000', fontWeight: 'bold' }}>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }} colSpan={2}>
                    Grand Total
                  </td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>-</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>-</td>
                  <td style={{ border: '1px solid #000', padding: '8px' }}>{formatCurrency(totals.principal)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px' }}>{formatCurrency(totals.interest)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px' }}>{formatCurrency(totals.regularHapta)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', color: '#0f172a' }}>{formatCurrency(totals.total)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewBachatGatRegisterReport;
