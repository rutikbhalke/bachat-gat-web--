import React, { useState, useEffect, useRef } from 'react';
import { Printer } from 'lucide-react';
import { reportService } from '../../services/reportService';
import { formatCurrency, formatDate } from '../../utils/formatters';

const NewMonthWiseBachatGatRegisterReport = ({ selectedMonth, selectedYear }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const printRef = useRef(null);

  const [memberId, setMemberId] = useState('');
  const [loanId, setLoanId] = useState('');

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear, memberId, loanId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const rows = await reportService.getMonthWiseBachatGatRegisterReport(selectedMonth, selectedYear, memberId, loanId);
      setData(rows || []);
    } catch (err) {
      console.error('Failed to load Month-wise Register:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Grand Totals
  const totalFundDeposit = data.reduce((acc, row) => acc + (row.fundDeposit || 0), 0);
  const totalLoanDeposit = data.reduce((acc, row) => acc + (row.loanDeposit || 0), 0);
  const totalHaptaPaid = data.reduce((acc, row) => acc + (row.haptaPaid || 0), 0);
  const totalInterestPaid = data.reduce((acc, row) => acc + (row.interestPaid || 0), 0);
  const grandTotal = data.reduce((acc, row) => acc + (row.total || 0), 0);

  // Extract unique members and loans for filter dropdowns
  const uniqueMembers = Array.from(new Set(data.map(r => r.memberName))).filter(Boolean);

  return (
    <div>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .month-wise-register-print-area,
          .month-wise-register-print-area * {
            visibility: visible !important;
          }
          .month-wise-register-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            color: #000 !important;
            background: #fff !important;
            border: none !important;
          }
          .month-wise-register-print-area tfoot {
            display: table-row-group !important;
          }
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }} className="no-print">
        <div style={{ display: 'flex', gap: '10px' }}>
          <select 
            value={memberId} 
            onChange={(e) => setMemberId(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px' }}
          >
            <option value="">All Members</option>
            {uniqueMembers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          <Printer size={18} /> Print Report
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading Month-wise Register...</div>
      ) : (
        <div className="card month-wise-register-print-area" style={{ padding: '0', border: '1.5px solid #000', borderRadius: '4px', background: '#fff', color: '#000', width: '100%', fontFamily: 'serif' }}>
          {/* Traditional Header */}
          <div style={{ borderBottom: '1.5px solid #000', textAlign: 'center', padding: '15px 10px' }}>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: 900 }}>श्री सदुबाबा युवा स्वयं सहाय्यता बचतगट</h1>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 800 }}>महिन्याचा ताळेबंद रिपोर्ट</h2>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>महिना: {selectedMonth} {selectedYear}</h3>
          </div>

          <div style={{ overflowX: 'auto', margin: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.95rem', color: '#000' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #000', fontWeight: 800 }}>
                  <th style={{ borderRight: '1px solid #000', padding: '10px 4px', width: '60px' }}>अ. क्र.<br/>Sr. No.</th>
                  <th style={{ borderRight: '1px solid #000', padding: '10px 8px', textAlign: 'left' }}>सभासदाचे नाव<br/>Member Name</th>
                  <th style={{ borderRight: '1px solid #000', padding: '10px 4px', width: '120px' }}>कर्ज रक्कम<br/>Loan Amount</th>
                  <th style={{ borderRight: '1px solid #000', padding: '10px 4px', width: '100px' }}>हप्ता क्रमांक<br/>Installment No.</th>
                  <th style={{ borderRight: '1px solid #000', padding: '10px 4px', width: '110px' }}>कर्ज हप्ता<br/>Principal Paid</th>
                  <th style={{ borderRight: '1px solid #000', padding: '10px 4px', width: '100px' }}>व्याज<br/>Interest</th>
                  <th style={{ borderRight: '1px solid #000', padding: '10px 4px', width: '130px' }}>निधी जमा<br/>Regular Hapta / Fund</th>
                  <th style={{ padding: '10px 4px', width: '110px' }}>एकूण<br/>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr key={row.id || idx} style={{ borderBottom: '1px solid #000' }}>
                    <td style={{ borderRight: '1px solid #000', padding: '8px 4px', fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ borderRight: '1px solid #000', padding: '8px 8px', textAlign: 'left', fontWeight: 700 }}>{row.memberName}</td>
                    <td style={{ borderRight: '1px solid #000', padding: '8px 4px' }}>{row.loanDisbursed === 0 ? '-' : formatCurrency(row.loanDisbursed)}</td>
                    <td style={{ borderRight: '1px solid #000', padding: '8px 4px', fontWeight: 700 }}>{row.installmentNumber && row.installmentNumber !== '-' ? row.installmentNumber : '-'}</td>
                    <td style={{ borderRight: '1px solid #000', padding: '8px 4px' }}>{row.haptaPaid === 0 ? '-' : formatCurrency(row.haptaPaid)}</td>
                    <td style={{ borderRight: '1px solid #000', padding: '8px 4px' }}>{row.interestPaid === 0 ? '-' : formatCurrency(row.interestPaid)}</td>
                    <td style={{ borderRight: '1px solid #000', padding: '8px 4px' }}>{row.fundDeposit === 0 ? '-' : formatCurrency(row.fundDeposit)}</td>
                    <td style={{ padding: '8px 4px', fontWeight: 800 }}>{formatCurrency(row.total)}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ padding: '30px', textAlign: 'center', fontSize: '1.1rem' }}>No transactions found for this period.</td>
                  </tr>
                )}
              </tbody>
              {data.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #000', fontWeight: 900 }}>
                    <td colSpan="4" style={{ borderRight: '1px solid #000', padding: '10px 8px', textAlign: 'right' }}>एकूण / Grand Total:</td>
                    <td style={{ borderRight: '1px solid #000', padding: '10px 4px' }}>{formatCurrency(totalHaptaPaid)}</td>
                    <td style={{ borderRight: '1px solid #000', padding: '10px 4px' }}>{formatCurrency(totalInterestPaid)}</td>
                    <td style={{ borderRight: '1px solid #000', padding: '10px 4px' }}>{formatCurrency(totalFundDeposit)}</td>
                    <td style={{ padding: '10px 4px' }}>{formatCurrency(grandTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewMonthWiseBachatGatRegisterReport;
