import React, { useState, useEffect, useMemo, useRef } from 'react';
import Modal from '../common/Modal';
import { bonusService } from '../../services/bonusService';
import { memberService } from '../../services/memberService';
import { formatCurrency, formatNumber, DEFAULT_GROUP_ID } from '../../utils/formatters';
import { usePopup } from '../../context/PopupContext';
import { Sparkles, AlertCircle, Calculator, CheckCircle2, Info } from 'lucide-react';
import { getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

const DistributeDiwaliBonusModal = ({ isOpen, onClose, onSuccess, initialYear = new Date().getFullYear(), targetGroupId = DEFAULT_GROUP_ID, preloadedPoolSummary }) => {
  const { showError, showSuccess, askConfirm } = usePopup();

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [distributionDate, setDistributionDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const [poolSummary, setPoolSummary] = useState({
    totalInterestCollected: 0,
    totalBonusDistributed: 0,
    netInterestAvailable: 0,
  });

  const [members, setMembers] = useState([]);
  const [bonusAllocations, setBonusAllocations] = useState({}); // { [memberId]: number }

  // Load active members and pool summary when modal opens or year changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const loadInitialData = async () => {
      setFetching(true);
      try {
        // Optimize fetch: direct minimal Firestore queries avoiding massive cross-collection joins
        const [membersSnap, poolRes] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('groupId', '==', targetGroupId))),
          (preloadedPoolSummary && selectedYear === initialYear)
            ? Promise.resolve(preloadedPoolSummary)
            : bonusService.getBonusPoolSummary(selectedYear, targetGroupId),
        ]);

        if (!isMounted) return;

        // Filter to active, non-deleted, non-admin members
        const allMems = membersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const activeMems = allMems.filter(m => {
          const role = (m.role_name || m.role || '').toUpperCase();
          const isInactive = m.isActive === false || m.is_active === 0 || m.isDeleted === true || (m.status || '').toLowerCase() === 'inactive' || (m.status || '').toLowerCase() === 'deleted';
          const isAdmin = role === 'ADMIN' || m.email?.includes('admin');
          return !isInactive && !isAdmin;
        });
        setMembers(activeMems);

        let netAvail = 0;
        if (poolRes && poolRes.success) {
          netAvail = Number(poolRes.netInterestAvailable) || 0;
          setPoolSummary({
            totalInterestCollected: Number(poolRes.totalInterestCollected) || 0,
            totalBonusDistributed: Number(poolRes.totalBonusDistributed) || 0,
            netInterestAvailable: netAvail,
          });
        }

        // Calculate default equal distribution and pre-populate directly into Bonus Amount
        const equalAmount = activeMems.length > 0 && netAvail > 0
          ? Math.floor(netAvail / activeMems.length)
          : 0;
        const initialMap = {};
        activeMems.forEach(m => {
          initialMap[m.id || m.member_id] = equalAmount;
        });
        setBonusAllocations(initialMap);
      } catch (err) {
        console.error('Failed to load bonus modal data:', err);
      } finally {
        if (isMounted) setFetching(false);
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedYear, targetGroupId]);

  // Total currently entered across all members
  const totalAllocated = useMemo(() => {
    return Object.values(bonusAllocations).reduce((sum, val) => sum + (Number(val) || 0), 0);
  }, [bonusAllocations]);

  // Remaining interest after this distribution
  const remainingAfterDistribution = Math.round((poolSummary.netInterestAvailable - totalAllocated) * 100) / 100;
  const isOverBudget = totalAllocated > poolSummary.netInterestAvailable;

  // Auto-distribute equally among members based on available net interest
  const handleDistributeEqually = () => {
    if (members.length === 0) return;
    const available = Math.max(0, poolSummary.netInterestAvailable);
    if (available <= 0) {
      showError({
        title: 'No Available Interest',
        message: `There is no available interest pool for year ${selectedYear} to distribute.`,
      });
      return;
    }

    const equalAmount = Math.floor(available / members.length);
    const updated = {};
    members.forEach(m => {
      updated[m.id || m.member_id] = equalAmount;
    });
    setBonusAllocations(updated);
  };

  const handleClearAll = () => {
    const cleared = {};
    members.forEach(m => {
      cleared[m.id || m.member_id] = 0;
    });
    setBonusAllocations(cleared);
  };

  const handleMemberAmountChange = (memberId, value) => {
    if (value === '') {
      setBonusAllocations(prev => ({
        ...prev,
        [memberId]: '',
      }));
      return;
    }
    const parsed = parseFloat(value);
    setBonusAllocations(prev => ({
      ...prev,
      [memberId]: isNaN(parsed) ? '' : parsed,
    }));
  };

  const isSubmittingRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    try {
      // 1. Validate negative or invalid values entered
    for (const [mid, val] of Object.entries(bonusAllocations)) {
      if (val !== '' && (isNaN(val) || Number(val) < 0)) {
        showError({
          title: 'Validation Error',
          message: 'Bonus amounts cannot be negative or invalid. Please correct the values.',
        });
        return;
      }
    }

    // 2. Validate over-budget
    if (isOverBudget) {
      showError({
        title: 'Validation Error',
        message: 'Bonus distribution cannot exceed the available interest amount.',
      });
      return;
    }

    // 3. Validate total allocated > 0
    if (totalAllocated <= 0) {
      showError({
        title: 'Validation Error',
        message: 'Please allocate a bonus amount greater than ₹0 for at least one member.',
      });
      return;
    }

    // 4. Build distributions array using EXACT edited values without recalculation
    const seen = new Set();
    const distributions = [];
    for (const m of members) {
      const id = m.id || m.member_id;
      const amount = Number(bonusAllocations[id]) || 0;
      if (amount > 0) {
        if (seen.has(id)) {
          showError({
            title: 'Validation Error',
            message: `Duplicate member detected: ${id}.`,
          });
          return;
        }
        seen.add(id);
        distributions.push({
          memberId: id,
          memberName: m.name || m.member_name,
          memberCode: m.member_code || m.memberCode || '',
          bonusAmount: amount,
        });
      }
    }

    // 5. Validate non-empty distribution list
    if (distributions.length === 0) {
      showError({
        title: 'Validation Error',
        message: 'No members have been allocated a bonus amount.',
      });
      return;
    }

    // Confirmation dialog
    const confirmed = await askConfirm({
      title: 'Confirm Diwali Bonus Distribution',
      message: `You are distributing a total of ${formatCurrency(totalAllocated)} to ${distributions.length} member(s) for the year ${selectedYear}. This will be permanently recorded in the ledger. Do you want to proceed?`,
      confirmText: 'Confirm & Distribute',
      confirmVariant: 'primary',
    });

    if (!confirmed) return;

    setLoading(true);
    const res = await bonusService.distributeDiwaliBonus({
      year: selectedYear,
      distributionDate,
      distributions,
      remarks: remarks.trim() || `Diwali Bonus Distribution for ${selectedYear}`,
    }, targetGroupId);

    showSuccess({
      title: 'Bonus Distributed',
      message: `Successfully distributed ${formatCurrency(res.totalDistributed || totalAllocated)} to ${res.distributedCount || distributions.length} members.`,
    });

    if (onSuccess) onSuccess(res);
    onClose();

    } catch (err) {
      showError({
        title: 'Distribution Failed',
        message: err.message || 'Failed to distribute bonus. Please try again.',
      });
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="✨ Distribute Diwali Bonus"
      maxWidth="780px"
    >
      {fetching ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p>Loading interest pool and member roster...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Top Controls: Year & Distribution Date */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Distribution Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="form-select"
                style={{ width: '100%', fontSize: '0.9rem', padding: '8px 12px' }}
                disabled={loading}
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((yr) => (
                  <option key={yr} value={yr}>
                    Year {yr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Distribution Date
              </label>
              <input
                type="date"
                value={distributionDate}
                onChange={(e) => setDistributionDate(e.target.value)}
                className="form-input"
                style={{ width: '100%', fontSize: '0.9rem', padding: '8px 12px' }}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Interest Pool Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              background: 'var(--surface-color, #F8FAFC)',
              padding: '14px',
              borderRadius: '10px',
              border: '1px solid var(--border-color, #E2E8F0)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                Available Interest Pool
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary, #2563EB)', marginTop: '4px' }}>
                {formatCurrency(poolSummary.netInterestAvailable)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                Current Distribution
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: isOverBudget ? 'var(--danger-text, #DC2626)' : 'var(--success-text, #16A34A)',
                  marginTop: '4px',
                }}
              >
                {formatCurrency(totalAllocated)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                Remaining Interest Pool
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: isOverBudget ? 'var(--danger-text, #DC2626)' : 'var(--text-primary, #0F172A)',
                  marginTop: '4px',
                }}
              >
                {formatCurrency(remainingAfterDistribution)}
              </div>
            </div>
          </div>

          {/* Over Budget Alert */}
          {isOverBudget && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                borderRadius: '8px',
                background: '#FEF2F2',
                border: '1px solid #F87171',
                color: '#991B1B',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              <AlertCircle size={18} />
              <span>Bonus distribution cannot exceed the available interest amount. Please adjust member amounts.</span>
            </div>
          )}

          {/* Auto Calculate Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Eligible active members: <strong>{members.length}</strong>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleDistributeEqually}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                disabled={loading || poolSummary.netInterestAvailable <= 0}
              >
                <Calculator size={14} /> Distribute Equally
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                disabled={loading}
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Member Allocations Table */}
          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              border: '1px solid var(--border-color, #E2E8F0)',
              borderRadius: '8px',
            }}
          >
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface-color, #F8FAFC)', position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', width: '60px' }}>Sr</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Member</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Code</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', width: '180px' }}>Bonus Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No active members found.
                    </td>
                  </tr>
                ) : (
                  members.map((m, idx) => {
                    const id = m.id || m.member_id;
                    const val = bonusAllocations[id] !== undefined ? bonusAllocations[id] : 0;
                    return (
                      <tr key={id} style={{ borderBottom: '1px solid var(--border-color, #F1F5F9)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{m.name || m.member_name}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {m.member_code || m.memberCode || '-'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>₹</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={val}
                              onChange={(e) => handleMemberAmountChange(id, e.target.value)}
                              className="form-input"
                              style={{
                                width: '110px',
                                textAlign: 'right',
                                padding: '4px 8px',
                                fontSize: '0.875rem',
                                fontWeight: 700,
                              }}
                              disabled={loading}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Remarks Field */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Notes / Remarks (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g., Diwali 2026 Annual Interest Bonus"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="form-input"
              style={{ width: '100%', fontSize: '0.875rem', padding: '8px 12px' }}
              disabled={loading}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              style={{ padding: '8px 16px', fontSize: '0.9rem' }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{
                padding: '8px 20px',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: isOverBudget ? 'var(--text-muted)' : undefined,
                cursor: isOverBudget ? 'not-allowed' : 'pointer',
              }}
              disabled={loading || isOverBudget || totalAllocated <= 0}
            >
              <Sparkles size={16} />
              {loading ? 'Processing...' : `Distribute ${formatCurrency(totalAllocated)}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default DistributeDiwaliBonusModal;
