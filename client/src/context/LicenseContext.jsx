import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { licenseService } from '../services/licenseService';
import { daysRemaining, needsExpiryWarning } from '../services/licensePolicy';

const LicenseContext = createContext(null);

export function LicenseProvider({ children }) {
  const { firebaseUser, user, groupId } = useAuth();
  const organisationId = user?.groupId || groupId || '';
  const [license, setLicense] = useState({ valid: false, status: 'loading', expiryDate: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser || !organisationId) {
      setLicense({ valid: false, status: 'loading', expiryDate: null });
      setLoading(false);
      return undefined;
    }
    let active = true;
    let unsubscribe = null;
    setLoading(true);

    (async () => {
      try {
        let verified = await licenseService.verify(organisationId);
        verified = await licenseService.migrateIfNeeded(organisationId, verified);
        if (active) setLicense(verified);
      } catch {
        if (active) setLicense({ valid: false, status: 'unavailable', expiryDate: null });
      } finally {
        if (active) setLoading(false);
      }
      if (!active) return;
      unsubscribe = licenseService.subscribe(organisationId, (next) => {
        if (!active) return;
        setLicense(next);
        setLoading(false);
      });
    })();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [firebaseUser, organisationId]);

  useEffect(() => {
    if (!needsExpiryWarning(license.status, license.expiryDate)) return;
    if (!licenseService.consumeDailyWarning()) return;
    const remaining = daysRemaining(license.expiryDate);
    window.alert(`Licence expires on ${license.expiryDate}. ${remaining} day${remaining === 1 ? '' : 's'} remaining.`);
  }, [license.status, license.expiryDate]);

  useEffect(() => {
    if (!organisationId) return undefined;
    const timer = window.setInterval(() => {
      setLicense((current) => licenseService.revalidateLocalStatus(current, organisationId));
    }, 60000);
    return () => window.clearInterval(timer);
  }, [organisationId]);

  const value = useMemo(() => ({
    license,
    loading,
    organisationId,
    deviceId: licenseService.getDeviceId(),
    activate: async (key) => {
      const result = await licenseService.activate({ key, organisationId });
      setLicense(result);
      return result;
    },
  }), [license, loading, organisationId]);

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense() {
  const context = useContext(LicenseContext);
  if (!context) throw new Error('useLicense must be used within LicenseProvider');
  return context;
}
