import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import StatusPopup from '../components/common/StatusPopup';

const PopupContext = createContext(null);

/**
 * Normalizes raw error objects, Firebase exceptions, and strings into human-readable messages.
 * Strict Rule: Never expose raw stack traces, undefined messages, or cryptic internal error codes.
 */
export function formatErrorMessage(err, fallbackMessage = 'Something went wrong. Please try again.') {
  if (!err) return fallbackMessage;

  const raw = typeof err === 'string'
    ? err
    : err.response?.data?.message || err.message || '';

  if (!raw) return fallbackMessage;

  // Firebase Auth Error Codes
  if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password') || raw.includes('auth/user-not-found')) {
    return 'Invalid credentials. Please verify your email and password.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'This email address is already registered in the system.';
  }
  if (raw.includes('auth/weak-password')) {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (raw.includes('auth/too-many-requests')) {
    return 'Too many unsuccessful attempts. Please wait a few moments and try again.';
  }

  // Firestore & Network Errors
  if (raw.includes('permission-denied') || raw.includes('PERMISSION_DENIED')) {
    return 'You do not have permission to perform this action.';
  }
  if (raw.includes('unavailable') || raw.includes('network-request-failed') || raw.includes('Network Error')) {
    return 'Unable to save data. Please check your connection and try again.';
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('Quota exceeded')) {
    return 'Database operation limit reached. Please try again in a few moments.';
  }

  // Financial & Business Rule Errors (Pass through clean business messages)
  if (raw.includes('Savings already recorded') || raw.includes('already recorded for this member')) {
    return 'Savings already recorded for this member for this month.';
  }
  if (raw.includes('already fully settled') || raw.includes('already closed')) {
    return 'This loan is already closed. No further payment is allowed.';
  }
  if (raw.includes('cannot exceed outstanding') || raw.includes('cannot exceed outstanding amount') || raw.includes('exceed outstanding balance')) {
    return raw; // Already clear
  }
  if (raw.includes('Insufficient available balance')) {
    return raw; // Contains exact available and requested amounts
  }

  return raw;
}

export const PopupProvider = ({ children }) => {
  const [popupState, setPopupState] = useState({
    isOpen: false,
    type: 'error',
    title: '',
    message: '',
    details: null,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    confirmVariant: 'primary',
    loading: false,
    onConfirm: null,
    onCancel: null,
    onClose: null,
  });

  const resolverRef = useRef(null);

  const closePopup = useCallback(() => {
    setPopupState((prev) => {
      if (prev.onClose) {
        try {
          prev.onClose();
        } catch (e) {
          console.error(e);
        }
      }
      return { ...prev, isOpen: false, loading: false };
    });

    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  }, []);

  const showError = useCallback(
    ({ title = 'Validation Error', message, error, details = null, buttonText = 'Close', onClose = null }) => {
      const finalMsg = message || formatErrorMessage(error);
      setPopupState({
        isOpen: true,
        type: 'error',
        title,
        message: finalMsg,
        details,
        confirmText: '',
        cancelText: buttonText,
        confirmVariant: 'danger',
        loading: false,
        onConfirm: null,
        onCancel: null,
        onClose: () => {
          if (onClose) onClose();
          closePopup();
        },
      });
    },
    [closePopup]
  );

  const showWarning = useCallback(
    ({ title = 'Attention Required', message, details = null, buttonText = 'Acknowledge', onClose = null }) => {
      setPopupState({
        isOpen: true,
        type: 'warning',
        title,
        message,
        details,
        confirmText: '',
        cancelText: buttonText,
        confirmVariant: 'primary',
        loading: false,
        onConfirm: null,
        onCancel: null,
        onClose: () => {
          if (onClose) onClose();
          closePopup();
        },
      });
    },
    [closePopup]
  );

  const showSuccess = useCallback(
    ({ title = 'Success', message, details = null, buttonText = 'Done', onClose = null }) => {
      setPopupState({
        isOpen: true,
        type: 'success',
        title,
        message,
        details,
        confirmText: '',
        cancelText: buttonText,
        confirmVariant: 'success',
        loading: false,
        onConfirm: null,
        onCancel: null,
        onClose: () => {
          if (onClose) onClose();
          closePopup();
        },
      });
    },
    [closePopup]
  );

  const showConfirm = useCallback(
    ({
      title = 'Confirm Action',
      message = 'Are you sure you want to proceed?',
      details = null,
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      confirmVariant = 'primary',
      onConfirm,
      onCancel,
    }) => {
      setPopupState({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        details,
        confirmText,
        cancelText,
        confirmVariant,
        loading: false,
        onConfirm: async () => {
          if (onConfirm) {
            try {
              setPopupState((prev) => ({ ...prev, loading: true }));
              await onConfirm();
              closePopup();
            } catch (err) {
              setPopupState((prev) => ({ ...prev, loading: false }));
              showError({
                title: 'Transaction Failed',
                message: formatErrorMessage(err),
              });
            }
          } else {
            closePopup();
          }
        },
        onCancel: () => {
          if (onCancel) onCancel();
          closePopup();
        },
        onClose: () => {
          if (onCancel) onCancel();
          closePopup();
        },
      });
    },
    [closePopup, showError]
  );

  /**
   * Promise-based confirmation dialog.
   * Usage:
   * const confirmed = await askConfirm({
   *   title: 'Confirm Payment',
   *   message: 'Are you sure you want to record this payment?',
   *   details: [{ label: 'Total', value: '₹1,580' }]
   * });
   * if (!confirmed) return; // 0 writes!
   */
  const askConfirm = useCallback(
    ({
      title = 'Confirm Action',
      message = 'Are you sure you want to proceed?',
      details = null,
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      confirmVariant = 'primary',
    }) => {
      return new Promise((resolve) => {
        resolverRef.current = resolve;
        setPopupState({
          isOpen: true,
          type: 'confirm',
          title,
          message,
          details,
          confirmText,
          cancelText,
          confirmVariant,
          loading: false,
          onConfirm: () => {
            if (resolverRef.current) {
              resolverRef.current(true);
              resolverRef.current = null;
            }
            setPopupState((prev) => ({ ...prev, isOpen: false, loading: false }));
          },
          onCancel: () => {
            if (resolverRef.current) {
              resolverRef.current(false);
              resolverRef.current = null;
            }
            setPopupState((prev) => ({ ...prev, isOpen: false, loading: false }));
          },
          onClose: () => {
            if (resolverRef.current) {
              resolverRef.current(false);
              resolverRef.current = null;
            }
            setPopupState((prev) => ({ ...prev, isOpen: false, loading: false }));
          },
        });
      });
    },
    []
  );

  return (
    <PopupContext.Provider
      value={{
        showError,
        showWarning,
        showSuccess,
        showConfirm,
        askConfirm,
        closePopup,
        formatErrorMessage,
      }}
    >
      {children}
      <StatusPopup
        isOpen={popupState.isOpen}
        type={popupState.type}
        title={popupState.title}
        message={popupState.message}
        details={popupState.details}
        confirmText={popupState.confirmText}
        cancelText={popupState.cancelText}
        confirmVariant={popupState.confirmVariant}
        loading={popupState.loading}
        onConfirm={popupState.onConfirm}
        onCancel={popupState.onCancel}
        onClose={popupState.onClose}
      />
    </PopupContext.Provider>
  );
};

export const usePopup = () => {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  return context;
};

export default PopupContext;
