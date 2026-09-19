import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Loader from '../common/Loader';
import { useLicense } from '../../context/LicenseContext';
import LicenseScreen from './LicenseScreen';

export default function LicenseGate({ children }) {
  const { loading, valid, warning, dismissWarning } = useLicense();

  if (loading) return <Loader fullScreen text="Verifying licence..." />;
  if (!valid) return <LicenseScreen />;

  return (
    <>
      {warning && (
        <div className="licence-warning" role="status" data-testid="licence-warning">
          <AlertTriangle size={20} />
          <span>
            Licence expires on <strong>{warning.expiryDate}</strong>. {warning.daysRemaining} day(s) remaining.
          </span>
          <button type="button" onClick={dismissWarning}>Dismiss</button>
        </div>
      )}
      {children}
    </>
  );
}
