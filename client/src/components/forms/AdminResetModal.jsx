import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Download,
  RotateCcw,
  ShieldAlert,
  Loader2,
  Lock,
  Layers,
  Users,
} from 'lucide-react';
import Modal from '../common/Modal';
import {
  fetchResetPreview,
  executeAdminReset,
  TARGET_PROJECT_ID,
} from '../../services/adminResetService';
import { formatCurrency, formatNumber, DEFAULT_GROUP_ID } from '../../utils/formatters';

const REQUIRED_CONFIRMATION_TEXT = 'RESET DATA';

const AdminResetModal = ({ isOpen, onClose, onSuccess, groupId = DEFAULT_GROUP_ID }) => {
  // Wizard steps: 1: fetch/input amount, 2: first confirmation, 3: second confirmation, 4: executing, 5: success report
  const [step, setStep] = useState(1);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  // Step 1: Form state
  const [amountPerMember, setAmountPerMember] = useState('120000');

  // Step 3: Confirmation text
  const [confirmationInput, setConfirmationInput] = useState('');

  // Step 4: Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [progressState, setProgressState] = useState({ step: 0, percent: 0, message: '' });
  const [executionError, setExecutionError] = useState(null);

  // Step 5: Success report state
  const [resetResult, setResetResult] = useState(null);

  // Fetch preview data when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setConfirmationInput('');
      setExecutionError(null);
      setResetResult(null);
      setProgressState({ step: 0, percent: 0, message: '' });
      loadPreview();
    }
  }, [isOpen, groupId]);

  const loadPreview = async () => {
    try {
      setLoadingPreview(true);
      setPreviewError(null);
      const data = await fetchResetPreview(groupId);
      setPreviewData(data);
    } catch (err) {
      console.error('Error loading reset preview:', err);
      setPreviewError(err.message || 'Failed to fetch existing member and financial counts.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const memberCount = previewData?.memberCount || 0;
  const numAmount = parseFloat(amountPerMember) || 0;
  const totalAllocation = memberCount * numAmount;

  // Handle Step 1 -> Step 2
  const handleProceedToFirstConfirmation = (e) => {
    e.preventDefault();
    if (numAmount <= 0) return;
    setStep(2);
  };

  // Handle Step 2 -> Step 3
  const handleProceedToSecondConfirmation = () => {
    setConfirmationInput('');
    setStep(3);
  };

  // Handle Step 3 -> Step 4 Execution
  const handleExecuteReset = async () => {
    if (confirmationInput !== REQUIRED_CONFIRMATION_TEXT || isExecuting) return;

    setIsExecuting(true);
    setExecutionError(null);
    setStep(4);

    try {
      const result = await executeAdminReset({
        amountPerMember: numAmount,
        groupId,
        confirmationText: confirmationInput,
        onProgress: (prog) => {
          setProgressState(prog);
        },
      });

      setResetResult(result);
      setStep(5);
      if (typeof onSuccess === 'function') {
        onSuccess(result);
      }
    } catch (err) {
      console.error('Reset execution failed:', err);
      setExecutionError(err.message || 'Reset failed unexpectedly.');
      if (err.backupData) {
        setResetResult({ backupData: err.backupData });
      }
    } finally {
      setIsExecuting(false);
    }
  };

  // Download safety backup JSON helper
  const handleDownloadBackup = () => {
    let backupObj = resetResult?.backupData;
    if (!backupObj && typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem('bachat_backup_latest');
        if (cached) backupObj = JSON.parse(cached);
      } catch (e) {}
    }
    if (!backupObj) return;
    try {
      const jsonStr = JSON.stringify(backupObj, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bachat_gat_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to trigger backup download:', e);
    }
  };

  // Prevent closing dialog while executing
  const handleModalClose = () => {
    if (isExecuting) return;
    onClose();
  };

  const modalTitle =
    step === 5
      ? 'Database Reset Completed & Verified'
      : step === 4
      ? 'Executing System Reset...'
      : step === 3
      ? 'Step 3: Final Security Confirmation'
      : step === 2
      ? 'Step 2: Review Deletion Summary'
      : 'Step 1: Clean & Reset Demo Data';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title={modalTitle}
      maxWidth="680px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* STEP 1: FETCH MEMBERS & ENTER AMOUNT */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span className="badge badge-danger">ADMIN ONLY</span>
                <span className="badge badge-info">Target Project: {TARGET_PROJECT_ID}</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Reset demo financial records and allocate fresh opening capital for all approved members.
              </p>
            </div>

            {loadingPreview ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Loader2 size={32} className="spin" style={{ margin: '0 auto 12px', display: 'block', color: 'var(--primary)' }} />
                <p style={{ fontWeight: 600 }}>Fetching existing approved members from Firestore...</p>
              </div>
            ) : previewError ? (
              <div
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--danger-light)',
                  color: 'var(--danger-text)',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <AlertCircle size={20} />
                <div style={{ flex: 1 }}>{previewError}</div>
                <button type="button" className="btn-secondary" onClick={loadPreview} style={{ padding: '6px 12px' }}>
                  Retry
                </button>
              </div>
            ) : (
              <form onSubmit={handleProceedToFirstConfirmation}>
                {/* Dynamic Member Count Metric */}
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '18px 20px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--accent-soft)',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Users size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Existing Approved Members
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {formatNumber(memberCount)} Members
                      </div>
                    </div>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                    Fetched Dynamically
                  </span>
                </div>

                {/* Amount per Member Input */}
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.925rem' }}>
                    Opening Amount per Member (₹) *
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={amountPerMember}
                    onChange={(e) => setAmountPerMember(e.target.value)}
                    min="1"
                    step="1"
                    placeholder="e.g. 120000"
                    required
                    style={{ fontSize: '1.1rem', fontWeight: 700, padding: '12px 16px' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Amount formatted: {formatCurrency(numAmount)} per member</span>
                    <span>Monthly installment excluded (isBase: true)</span>
                  </div>
                </div>

                {/* Automatic Calculation Preview Card */}
                <div
                  style={{
                    background: '#EFF6FF',
                    border: '1.5px solid #BFDBFE',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px 20px',
                    marginBottom: '24px',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E40AF', marginBottom: '8px' }}>
                    AUTOMATIC ALLOCATION CALCULATION
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', color: '#1E3A8A' }}>
                        {memberCount} members × {formatCurrency(numAmount)}
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1E3A8A' }}>
                        Total Allocation: {formatCurrency(totalAllocation)}
                      </div>
                    </div>
                    <Database size={32} color="#3B82F6" />
                  </div>
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button type="button" className="btn-secondary" onClick={handleModalClose}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-danger" disabled={numAmount <= 0 || memberCount === 0}>
                    Next: Review Deletion & Reset <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* STEP 2: FIRST CONFIRMATION */}
        {step === 2 && (
          <div>
            {/* Warning Banner */}
            <div
              style={{
                border: '1.5px solid #FCA5A5',
                background: '#FEF2F2',
                borderRadius: 'var(--radius-lg)',
                padding: '16px 20px',
                marginBottom: '20px',
                display: 'flex',
                gap: '14px',
              }}
            >
              <ShieldAlert size={28} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#991B1B', marginBottom: '6px' }}>
                  Important Warning: Read Before Continuing
                </div>
                <p style={{ fontSize: '0.875rem', color: '#7F1D1D', lineHeight: 1.5, margin: 0 }}>
                  All existing financial records, including contributions, loans, repayments and transactions, will be permanently deleted from this demo project. Member profiles, Admin account and Group settings will be preserved.
                </p>
              </div>
            </div>

            {/* Deletion & Allocation Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>EXISTING APPROVED MEMBERS</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {formatNumber(memberCount)} Members
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>AMOUNT PER MEMBER</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {formatCurrency(numAmount)}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL ALLOCATION</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>
                  {formatCurrency(totalAllocation)}
                </div>
              </div>

              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: '#B91C1C', fontWeight: 700 }}>RECORDS TO BE PERMANENTLY DELETED</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>
                  {formatNumber(previewData?.financialCounts?.totalRecords || 0)} Records
                </div>
              </div>
            </div>

            {/* Affected Collections List */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                Firestore Collections Affected
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: '#DC2626', background: '#FFF5F5', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                  <Trash2 size={16} /> monthlyContributions ({previewData?.financialCounts?.monthlyContributions || 0})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: '#DC2626', background: '#FFF5F5', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                  <Trash2 size={16} /> loans ({previewData?.financialCounts?.loans || 0})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: '#DC2626', background: '#FFF5F5', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                  <Trash2 size={16} /> repayments ({previewData?.financialCounts?.repayments || 0})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: '#DC2626', background: '#FFF5F5', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                  <Trash2 size={16} /> transactions ({previewData?.financialCounts?.transactions || 0})
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', color: 'var(--success)', marginTop: '8px' }}>
                <CheckCircle2 size={14} /> Preserved 100%: users (all {memberCount} member profiles + Admin), groups configuration.
              </div>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={16} /> Back to Edit Amount
              </button>
              <button type="button" className="btn-danger" onClick={handleProceedToSecondConfirmation}>
                Yes, I Understand — Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SECOND CONFIRMATION (DOUBLE CONFIRMATION) */}
        {step === 3 && (
          <div>
            <div
              style={{
                border: '1.5px solid #DC2626',
                background: '#FEF2F2',
                borderRadius: 'var(--radius-lg)',
                padding: '16px 20px',
                marginBottom: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#B91C1C', fontWeight: 800, marginBottom: '6px' }}>
                <AlertTriangle size={20} />
                <span>FINAL CONFIRMATION REQUIRED</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#7F1D1D', margin: 0, lineHeight: 1.4 }}>
                This is the final confirmation before permanent deletion and allocation. No changes to the amount are allowed without restarting the confirmation process.
              </p>
            </div>

            {/* Final Expected Financial State Summary */}
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ fontSize: '0.775rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px' }}>
                FINAL EXPECTED FINANCIAL STATE
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Approved Member Count:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{memberCount} members</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Opening Amount per Member:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(numAmount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Group Allocation:</span>
                  <strong style={{ color: 'var(--primary)' }}>{formatCurrency(totalAllocation)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Exact Records to Delete:</span>
                  <strong style={{ color: 'var(--danger)' }}>
                    {formatNumber(previewData?.financialCounts?.totalRecords || 0)} records
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Active Loans & Repayments after Reset:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>₹0 (All old loan records deleted)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Monthly Share Contribution Setting:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>₹1,000 (Preserved unchanged)</strong>
                </div>
              </div>
            </div>

            {/* Required Input */}
            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label" style={{ fontWeight: 700, color: '#991B1B', fontSize: '0.9rem' }}>
                To proceed, type "{REQUIRED_CONFIRMATION_TEXT}" below:
              </label>
              <input
                type="text"
                className="form-input"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder="Type RESET DATA here"
                autoComplete="off"
                spellCheck={false}
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  borderColor: confirmationInput === REQUIRED_CONFIRMATION_TEXT ? 'var(--danger)' : undefined,
                }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Case-sensitive exact match required. The reset button will stay disabled until verified.
              </span>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setConfirmationInput('');
                  setStep(1); // Restart process to allow editing amount
                }}
              >
                Cancel / Restart
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={confirmationInput !== REQUIRED_CONFIRMATION_TEXT || isExecuting}
                onClick={handleExecuteReset}
                style={{
                  boxShadow: confirmationInput === REQUIRED_CONFIRMATION_TEXT ? '0 4px 14px rgba(220, 38, 38, 0.4)' : 'none',
                }}
              >
                <Trash2 size={16} /> Permanently Delete & Reset
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: EXECUTION PROGRESS */}
        {step === 4 && (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ position: 'relative', width: '64px', height: '64px', margin: '0 auto 18px' }}>
              <Loader2 size={64} className="spin" color="var(--danger)" />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: 'var(--danger)',
                }}
              >
                {progressState.percent}%
              </div>
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>
              Reset Execution in Progress
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
              {progressState.message || 'Processing atomic Firestore operations...'}
            </p>

            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                background: '#E2E8F0',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressState.percent}%`,
                  background: 'var(--danger)',
                  transition: 'width 0.4s ease-in-out',
                }}
              />
            </div>

            <div
              style={{
                background: '#FEF2F2',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                fontSize: '0.8rem',
                color: '#991B1B',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Lock size={14} /> Dialog cannot be closed and buttons are locked during reset execution.
            </div>

            {executionError && (
              <div
                style={{
                  marginTop: '20px',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--danger-light)',
                  color: 'var(--danger-text)',
                  fontSize: '0.875rem',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '4px' }}>
                  <AlertCircle size={18} /> Reset Stopped with Error:
                </div>
                <div>{executionError}</div>
                <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <button type="button" className="btn-secondary" onClick={handleDownloadBackup} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                    <Download size={14} /> Download Pre-Reset Safety Backup
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setStep(1)} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                    Close / Return to Step 1
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: SUCCESS REPORT */}
        {step === 5 && resetResult && (
          <div>
            <div
              style={{
                textAlign: 'center',
                padding: '16px 0 20px',
                borderBottom: '1px solid var(--border-color)',
                marginBottom: '18px',
              }}
            >
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--success-light)',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                }}
              >
                <CheckCircle2 size={32} />
              </div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Reset & Allocation Successfully Completed
              </h2>
              <span className="badge badge-success">Direct Firestore Verification Passed 100%</span>
            </div>

            {/* Actual Verified State Table */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
              <div style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>APPROVED MEMBERS PRESERVED</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {resetResult.memberCount} Members
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>BASE SAVINGS PER MEMBER</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {formatCurrency(resetResult.amountPerMember)}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>TOTAL GROUP SAVINGS VERIFIED</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--success)', marginTop: '2px' }}>
                  {formatCurrency(resetResult.totalAllocation)}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>OLD FINANCIAL RECORDS REMAINING</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                  0 (All Old Records Cleaned)
                </div>
              </div>
            </div>

            {/* Checklist of Verifications */}
            <div
              style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                marginBottom: '20px',
                fontSize: '0.825rem',
                color: '#166534',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} /> Exactly {resetResult.memberCount} base savings records created (C_REG_001_BASE_SAVINGS ...).
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} /> Exactly {resetResult.memberCount} opening capital transactions logged (ACT_REG_001 ...).
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} /> Member totalSavings set to {formatCurrency(resetResult.amountPerMember)} each.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} /> Monthly dues remain unpaid/pending (regular hafta unperturbed).
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} /> Admin profile and group settings preserved 100%.
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" className="btn-secondary" onClick={handleDownloadBackup}>
                <Download size={16} /> Download Safety Backup JSON
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  onClose();
                  window.location.reload();
                }}
              >
                Done & Reload Portal
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AdminResetModal;

