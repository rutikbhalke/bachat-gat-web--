import React, { useEffect, useState } from 'react';
import { User, Phone, CheckCircle2, AlertCircle, Save, BadgeCheck } from 'lucide-react';
import Modal from '../common/Modal';
import { memberService } from '../../services/memberService';
import { usePopup } from '../../context/PopupContext';

const EditMemberModal = ({ isOpen, onClose, onSuccess, member }) => {
  const { showError, askConfirm, showSuccess } = usePopup();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Pre-fill existing values when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const existingName = member?.name || member?.fullName || '';
    const existingPhone = member?.mobileNumber || member?.phone || '';
    setName(existingName);
    setPhone(existingPhone);
    setError('');
    setSuccess('');
    setLoading(false);
  }, [isOpen, member]);

  const handlePhoneChange = (e) => {
    // Only allow digits, max 10 digits
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(digitsOnly);
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanName = name.trim();
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) cleanPhone = cleanPhone.slice(2);
    else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) cleanPhone = cleanPhone.slice(1);

    // 1. Validation checks
    if (!cleanName) {
      setError('Member Name is required.');
      showError({
        title: 'Validation Error',
        message: 'Member Name is required.',
      });
      return;
    }

    if (cleanName.length < 2) {
      setError('Member Name must be at least 2 characters.');
      showError({
        title: 'Validation Error',
        message: 'Member Name must be at least 2 characters.',
      });
      return;
    }

    if (!cleanPhone || cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      showError({
        title: 'Validation Error',
        message: 'Please enter a valid 10-digit mobile number.',
      });
      return;
    }

    // 2. Double Confirmation Dialog
    const memberCode = member?.member_code || member?.memberCode || member?.id || '—';
    const confirmed = await askConfirm({
      title: 'Confirm Member Update',
      message: `Are you sure you want to update details for "${cleanName}"?`,
      details: [
        { label: 'Member Name', value: cleanName },
        { label: 'Mobile Number', value: cleanPhone },
        { label: 'Member Code', value: memberCode },
      ],
      confirmText: 'Save Changes',
      confirmVariant: 'primary',
    });

    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const memberId = member?.member_id || member?.id;
      const result = await memberService.updateMember(memberId, {
        name: cleanName,
        fullName: cleanName,
        phone: cleanPhone,
        mobileNumber: cleanPhone,
      });

      setSuccess(result?.message || 'Member details updated successfully.');
      showSuccess({
        title: 'Member Updated',
        message: result?.message || `Member "${cleanName}" was updated successfully.`,
      });

      if (onSuccess) {
        await onSuccess();
      }

      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to update member.');
      showError({
        title: 'Update Failed',
        error: err,
        details: [
          { label: 'Member Name', value: cleanName },
          { label: 'Mobile Number', value: cleanPhone },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const memberCode = member?.member_code || member?.memberCode || member?.id || '—';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Member" maxWidth="480px">
      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--danger-light, #FEE2E2)',
            color: 'var(--danger-text, #991B1B)',
            borderRadius: 'var(--radius-md, 8px)',
            marginBottom: '16px',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            fontSize: '0.875rem',
          }}
        >
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--success-light, #DCFCE7)',
            color: 'var(--success-text, #166534)',
            borderRadius: 'var(--radius-md, 8px)',
            marginBottom: '16px',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            fontSize: '0.875rem',
          }}
        >
          <CheckCircle2 size={16} /> {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Read-only Member Code Context Badge */}
        <div
          style={{
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--bg-secondary, #F8FAFC)',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--border-color, #E2E8F0)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BadgeCheck size={17} style={{ color: 'var(--primary, #2563EB)' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>
              Member Code
            </span>
          </div>
          <span
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--text-primary, #0F172A)',
              fontFamily: 'monospace',
              letterSpacing: '0.5px',
            }}
          >
            {memberCode}
          </span>
        </div>

        {/* 1. Member Name – Editable */}
        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>
            Member Name *
          </label>
          <div style={{ position: 'relative' }}>
            <User
              size={17}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted, #94A3B8)',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ width: '100%', paddingLeft: '38px' }}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="Enter member full name"
              data-autofocus
              required
              disabled={loading}
            />
          </div>
        </div>

        {/* 2. Mobile Number – Editable */}
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>
            Mobile Number *
          </label>
          <div style={{ position: 'relative' }}>
            <Phone
              size={17}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted, #94A3B8)',
              }}
            />
            <input
              type="tel"
              inputMode="numeric"
              className="form-input"
              style={{ width: '100%', paddingLeft: '38px' }}
              value={phone}
              onChange={handlePhoneChange}
              placeholder="10-digit mobile number"
              maxLength={10}
              required
              disabled={loading}
            />
          </div>
          <span style={{ color: 'var(--text-muted, #64748B)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
            Enter a valid 10-digit Indian mobile number (e.g. 9876543210).
          </span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            <Save size={16} /> {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditMemberModal;
