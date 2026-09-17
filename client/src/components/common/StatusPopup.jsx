import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  XCircle,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
  Loader2,
  X,
} from 'lucide-react';

const StatusPopup = ({
  isOpen,
  type = 'error', // 'error' | 'confirm' | 'warning' | 'success'
  title,
  message,
  details = null, // array of { label, value, highlight } or string or string[]
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary', // 'primary' | 'danger' | 'success'
  onConfirm,
  onCancel,
  onClose,
  loading = false,
  maxWidth = '480px',
}) => {
  const dialogRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) {
        if (type === 'confirm') {
          if (onCancel) onCancel();
        } else {
          if (onClose) onClose();
        }
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      if (type === 'confirm') {
        confirmBtnRef.current?.focus();
      } else {
        cancelBtnRef.current?.focus();
      }
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, type, loading, onCancel, onClose]);

  if (!isOpen) return null;

  const getThemeConfig = () => {
    switch (type) {
      case 'confirm':
        return {
          icon: <HelpCircle size={36} color="#2563EB" strokeWidth={2.2} />,
          iconBg: '#EFF6FF',
          iconBorder: '#BFDBFE',
          accentColor: '#2563EB',
          defaultTitle: 'Confirmation Required',
        };
      case 'warning':
        return {
          icon: <AlertTriangle size={36} color="#D97706" strokeWidth={2.2} />,
          iconBg: '#FFFBEB',
          iconBorder: '#FDE68A',
          accentColor: '#D97706',
          defaultTitle: 'Warning',
        };
      case 'success':
        return {
          icon: <CheckCircle2 size={36} color="#16A34A" strokeWidth={2.2} />,
          iconBg: '#F0FDF4',
          iconBorder: '#BBF7D0',
          accentColor: '#16A34A',
          defaultTitle: 'Success',
        };
      case 'error':
      default:
        return {
          icon: <AlertTriangle size={36} color="#DC2626" strokeWidth={2.2} />,
          iconBg: '#FEF2F2',
          iconBorder: '#FECACA',
          accentColor: '#DC2626',
          defaultTitle: 'Operation Failed',
        };
    }
  };

  const theme = getThemeConfig();
  const displayTitle = title || theme.defaultTitle;

  const handleBackdropClick = () => {
    if (loading) return;
    if (type === 'confirm') {
      if (onCancel) onCancel();
    } else {
      if (onClose) onClose();
    }
  };

  const renderDetails = () => {
    if (!details) return null;

    if (Array.isArray(details)) {
      if (details.length > 0 && typeof details[0] === 'object' && details[0] !== null) {
        return (
          <div
            style={{
              background: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              padding: '10px 14px',
              marginTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.86rem',
              textAlign: 'left',
            }}
          >
            {details.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '3px 0',
                  borderBottom: idx < details.length - 1 ? '1px dashed #E2E8F0' : 'none',
                }}
              >
                <span style={{ color: '#64748B', fontWeight: 600 }}>{item.label}:</span>
                <span
                  style={{
                    color: item.highlight ? theme.accentColor : '#0F172A',
                    fontWeight: item.highlight ? 800 : 700,
                  }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        );
      }

      return (
        <ul
          style={{
            background: '#F8FAFC',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '10px 14px 10px 28px',
            marginTop: '12px',
            fontSize: '0.85rem',
            color: '#334155',
            textAlign: 'left',
            margin: '12px 0 0 0',
          }}
        >
          {details.map((item, idx) => (
            <li key={idx} style={{ marginBottom: '4px' }}>
              {item}
            </li>
          ))}
        </ul>
      );
    }

    if (typeof details === 'string') {
      return (
        <div
          style={{
            background: '#F8FAFC',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '10px 14px',
            marginTop: '12px',
            fontSize: '0.85rem',
            color: '#334155',
            textAlign: 'left',
            whiteSpace: 'pre-wrap',
          }}
        >
          {details}
        </div>
      );
    }

    return null;
  };

  const modalElement = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={handleBackdropClick}
      data-testid="status-popup-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={displayTitle}
        className="fade-in status-popup-card"
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          textAlign: 'center',
          padding: '24px',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid={`status-popup-${type}`}
      >
        {!loading && (
          <button
            onClick={type === 'confirm' ? onCancel : onClose}
            style={{
              position: 'absolute',
              right: '14px',
              top: '14px',
              background: 'transparent',
              border: 'none',
              padding: '6px',
              borderRadius: '9999px',
              color: '#94A3B8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: theme.iconBg,
              border: `2px solid ${theme.iconBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {theme.icon}
          </div>
        </div>

        <h3
          style={{
            fontSize: '1.2rem',
            fontWeight: 800,
            color: '#0F172A',
            margin: '0 0 8px 0',
            lineHeight: 1.3,
          }}
          data-testid="status-popup-title"
        >
          {displayTitle}
        </h3>

        <p
          style={{
            fontSize: '0.92rem',
            color: '#475569',
            margin: 0,
            lineHeight: 1.5,
          }}
          data-testid="status-popup-message"
        >
          {message}
        </p>

        {renderDetails()}

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            marginTop: '20px',
            flexWrap: 'wrap',
          }}
        >
          {(type === 'confirm' || (Boolean(onConfirm) && Boolean(confirmText))) ? (
            <>
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="btn-secondary"
                style={{
                  padding: '10px 20px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  minWidth: '100px',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
                data-testid="status-popup-cancel-btn"
              >
                {cancelText}
              </button>

              <button
                ref={confirmBtnRef}
                type="button"
                onClick={onConfirm}
                disabled={loading}
                style={{
                  padding: '10px 22px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  minWidth: '120px',
                  borderRadius: '8px',
                  border: 'none',
                  background:
                    confirmVariant === 'danger'
                      ? '#DC2626'
                      : confirmVariant === 'success'
                      ? '#16A34A'
                      : 'var(--primary, #F57C00)',
                  color: '#FFFFFF',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  opacity: loading ? 0.8 : 1,
                }}
                data-testid="status-popup-confirm-btn"
              >
                {loading && <Loader2 size={16} className="spin" />}
                <span>{loading ? 'Processing...' : confirmText}</span>
              </button>
            </>
          ) : (
            <button
              ref={cancelBtnRef}
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 28px',
                fontSize: '0.9rem',
                fontWeight: 700,
                borderRadius: '8px',
                border: 'none',
                background: type === 'error' ? '#DC2626' : theme.accentColor,
                color: '#FFFFFF',
                cursor: 'pointer',
                minWidth: '110px',
              }}
              data-testid="status-popup-close-btn"
            >
              {cancelText || 'Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalElement, document.body);
};

export default StatusPopup;
