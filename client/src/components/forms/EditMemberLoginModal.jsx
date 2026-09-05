import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Mail, Phone, Shield, User, BadgeCheck } from 'lucide-react';
import Modal from '../common/Modal';
import { memberService } from '../../services/memberService';

const EditMemberLoginModal = ({ isOpen, onClose, onSuccess, member }) => {
  const closeTimerRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [memberCode, setMemberCode] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [warning, setWarning] = useState('');
  const loginEnabled = Boolean(member?.authUid || member?.userId || member?.firebaseUid);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(member?.email || '');
    setPassword('');
    setName(member?.name || member?.fullName || '');
    setPhone(member?.phone || '');
    setMemberCode(member?.memberCode || member?.member_code || member?.id || '');
    setRole((member?.role_name || member?.role || 'MEMBER').toUpperCase());
    setIsActive(member?.isActive !== false && member?.is_active !== false && member?.is_active !== 0);
    setError('');
    setSuccess('');
    setWarning('');
  }, [isOpen, member]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError('');
      setWarning('');
      const result = await memberService.manageMemberAccess(member.member_id || member.id, {
        name,
        phone,
        memberCode,
        email,
        password,
        role,
        isActive,
      });
      setPassword('');
      if (onSuccess) await onSuccess();
      if (result.partial) {
        setWarning(result.message);
      } else {
        setSuccess(result.message || 'Member access updated successfully.');
      }
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setError(err.message || 'Failed to enable member login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Member & Login" maxWidth="560px">
      {error && (
        <div style={{ padding: '10px 14px', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '10px 14px', background: 'var(--success-light)', color: 'var(--success-text)', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <CheckCircle2 size={16} /> {success}
        </div>
      )}
      {warning && (
        <div style={{ padding: '10px 14px', background: '#FFFBEB', color: '#92400E', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', border: '1px solid #FCD34D' }}>
          <AlertCircle size={16} /> {warning}
        </div>
      )}

      {!success && !warning && (
        <form onSubmit={handleSubmit}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '18px' }}>
            {loginEnabled
              ? `Login enabled${member?.email ? ` for ${member.email}` : ''}. Update profile details or enter a new password.`
              : 'No login exists for this member. Enter an email ID and temporary password to create one.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <div style={{ position: 'relative' }}>
                <User size={17} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="form-input" style={{ paddingLeft: '38px' }} value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Member ID *</label>
              <div style={{ position: 'relative' }}>
                <BadgeCheck size={17} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="form-input" style={{ paddingLeft: '38px' }} value={memberCode} onChange={(e) => setMemberCode(e.target.value)} required />
              </div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Login Email ID *</label>
            <div style={{ position: 'relative' }}>
              <Mail size={17} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="email" className="form-input" style={{ paddingLeft: '38px' }} value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div style={{ position: 'relative' }}>
                <Phone size={17} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="form-input" style={{ paddingLeft: '38px' }} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Role *</label>
              <div style={{ position: 'relative' }}>
                <Shield size={17} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', zIndex: 1 }} />
                <select className="form-input" style={{ paddingLeft: '38px' }} value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{loginEnabled ? 'New Password (leave blank to keep current)' : 'Temporary Password *'}</label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={17} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                className="form-input"
                style={{ paddingLeft: '38px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                required={!loginEnabled}
                placeholder={loginEnabled ? '••••••••  (unchanged)' : 'Minimum 6 characters'}
              />
            </div>
            {loginEnabled && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Password status: • secured by Firebase. Leave blank to keep it, or type a new password to replace it.
              </span>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', fontWeight: 600 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Account active
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <KeyRound size={16} /> {loading ? 'Saving...' : 'Save Member Access'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default EditMemberLoginModal;
