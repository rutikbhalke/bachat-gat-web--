import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  LICENSE_POLICY,
  LICENSE_STORAGE_KEYS,
  getBusinessDate,
  getOrCreateMachineId,
  licenseApi,
  shouldReplaceStoredLicence,
  shouldShowDailyWarning,
} from '../services/licenseService';

const LicenseContext = createContext(null);

export function LicenseProvider({ children }) {
  const [machineIdentity] = useState(() => {
    try {
      return { machineId: getOrCreateMachineId(), machineError: '' };
    } catch (error) {
      return { machineId: '', machineError: error.message };
    }
  });
  const { machineId, machineError } = machineIdentity;
  const [state, setState] = useState({
    loading: true,
    valid: false,
    expiryDate: localStorage.getItem(LICENSE_STORAGE_KEYS.expiry) || '',
    daysRemaining: null,
    message: '',
  });
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    let active = true;
    async function verifyStoredLicence() {
      const key = localStorage.getItem(LICENSE_STORAGE_KEYS.activationKey);
      if (!machineId || !key) {
        if (active) {
          setState((current) => ({
            ...current,
            loading: false,
            valid: false,
            message: machineError || 'Enter a valid licence key to continue.',
          }));
        }
        return;
      }

      try {
        const result = await licenseApi.verify(machineId, key);
        if (!active) return;
        localStorage.setItem(LICENSE_STORAGE_KEYS.expiry, result.expiryDate);
        localStorage.setItem(LICENSE_STORAGE_KEYS.policy, LICENSE_POLICY);
        setState({ loading: false, valid: true, ...result });
      } catch (error) {
        if (!active) return;
        setState((current) => ({
          ...current,
          loading: false,
          valid: false,
          daysRemaining: null,
          message: error.message,
        }));
      }
    }
    verifyStoredLicence();
    return () => { active = false; };
  }, [machineId, machineError]);

  useEffect(() => {
    if (!state.valid || !shouldShowDailyWarning(
      state.daysRemaining,
      localStorage.getItem(LICENSE_STORAGE_KEYS.warningLastShown)
    )) return;

    const today = getBusinessDate();
    localStorage.setItem(LICENSE_STORAGE_KEYS.warningLastShown, today);
    setWarning({ expiryDate: state.expiryDate, daysRemaining: state.daysRemaining });
  }, [state.valid, state.daysRemaining, state.expiryDate]);

  async function activate(key) {
    const trimmedKey = String(key || '').trim();
    if (!machineId || !trimmedKey) throw new Error('Machine ID and licence key are required.');
    const result = await licenseApi.activate(machineId, trimmedKey);
    const existingExpiry = localStorage.getItem(LICENSE_STORAGE_KEYS.expiry);
    if (!shouldReplaceStoredLicence(existingExpiry, result.expiryDate, state.valid)) {
      throw new Error(`The current licence already expires later on ${existingExpiry}.`);
    }
    localStorage.setItem(LICENSE_STORAGE_KEYS.activationKey, trimmedKey);
    localStorage.setItem(LICENSE_STORAGE_KEYS.expiry, result.expiryDate);
    localStorage.setItem(LICENSE_STORAGE_KEYS.policy, LICENSE_POLICY);
    setState({ loading: false, valid: true, ...result });
    return result;
  }

  const value = useMemo(() => ({
    ...state,
    machineId,
    machineError,
    warning,
    dismissWarning: () => setWarning(null),
    activate,
  }), [state, machineId, machineError, warning]);

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense() {
  const context = useContext(LicenseContext);
  if (!context) throw new Error('useLicense must be used within LicenseProvider');
  return context;
}
