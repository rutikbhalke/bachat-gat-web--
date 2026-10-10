import React, { useState } from 'react';
import { KeyRound, Copy, ExternalLink, LockKeyhole } from 'lucide-react';
import { useLicense } from '../context/LicenseContext';

export default function LicenseScreen() {
  const { license, deviceId, activate } = useLicense();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
      setMessage('');
    } catch {
      setMessage(`Unable to copy ${label.toLowerCase()}. Please select and copy it manually.`);
      setNotice('');
    }
  };

  const activateLicence = async () => {
    if (!key.trim()) {
      setMessage('Enter the licence key supplied by BizFlow India.');
      return;
    }
    setBusy(true);
    setMessage('');
    setNotice('');
    try {
      await activate(key);
    } catch (error) {
      setMessage(error?.message || 'Licence activation failed.');
    } finally {
      setBusy(false);
    }
  };

  const heading = license.status === 'expired'
    ? 'Licence expired'
    : license.status === 'unavailable'
      ? 'Licence verification unavailable'
      : 'Licence required';

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.icon}><LockKeyhole size={42} /></div>
        <h1 style={styles.title}>{heading}</h1>
        <p style={styles.copy}>
          {license.expiryDate
            ? `The shared organisation licence expired on ${license.expiryDate}.`
            : 'A valid shared organisation licence is required to continue.'}
        </p>

        <p style={styles.businessName}>Sadubaba Bachat Gat</p>

        <label style={styles.label}>Machine ID</label>
        <div style={styles.machineBox}>
          <span style={styles.machineText}>{deviceId}</span>
          <button
            type="button"
            aria-label="Copy Machine ID"
            style={styles.iconButton}
            onClick={() => copyText(deviceId, 'Machine ID')}
          >
            <Copy size={18} />
          </button>
        </div>
        <p style={styles.meta}>
          Mobile and Web use the same business licence. The Machine ID is available for device support.
        </p>

        <label htmlFor="licence-key" style={styles.label}>Activation key</label>
        <textarea
          id="licence-key"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          rows={3}
          style={styles.input}
          placeholder="Paste the BizFlow licence key"
        />
        {notice && <p style={styles.notice}>{notice}</p>}
        {message && <p style={styles.error}>{message}</p>}
        <button type="button" style={styles.primary} disabled={busy} onClick={activateLicence}>
          <KeyRound size={18} /> {busy ? 'Activating...' : 'Activate licence'}
        </button>
        <a href="https://bizflowindia.cloud/" target="_blank" rel="noreferrer" style={styles.secondary}>
          <ExternalLink size={17} /> Contact BizFlow India
        </a>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    background: 'radial-gradient(circle at top, #fff1f5, #f3f6fa 55%)',
  },
  card: {
    width: 'min(560px, 100%)',
    padding: 'clamp(24px, 5vw, 42px)',
    borderRadius: 26,
    background: '#fff',
    boxShadow: '0 24px 70px rgba(42, 52, 70, .14)',
    display: 'flex',
    flexDirection: 'column',
    gap: 13,
  },
  icon: {
    width: 84,
    height: 84,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    margin: '0 auto',
    color: '#c2185b',
    background: '#ffe7ef',
  },
  title: { margin: '6px 0 0', textAlign: 'center', fontSize: 34, color: '#1f2937' },
  businessName: { margin: 0, textAlign: 'center', color: '#c2185b', fontSize: 18, fontWeight: 850 },
  copy: { margin: '0 0 8px', textAlign: 'center', color: '#64748b', lineHeight: 1.6 },
  label: { fontWeight: 800, color: '#273244', marginTop: 5 },
  iconButton: { border: 0, background: 'transparent', color: '#c2185b', cursor: 'pointer' },
  machineBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    padding: '13px 16px', border: '1px solid #d8dee8', borderRadius: 14,
    color: '#344054', background: '#f7f8fa', overflowWrap: 'anywhere',
  },
  machineText: { fontWeight: 750, overflowWrap: 'anywhere' },
  meta: { margin: 0, color: '#64748b', fontSize: 13, overflowWrap: 'anywhere' },
  input: { border: '1px solid #cbd5e1', borderRadius: 12, padding: 14, font: 'inherit', resize: 'vertical' },
  error: { margin: 0, color: '#b91c1c', fontWeight: 700 },
  notice: { margin: 0, color: '#047857', fontWeight: 700 },
  primary: {
    border: 0, borderRadius: 12, padding: 15, display: 'flex', justifyContent: 'center',
    alignItems: 'center', gap: 8, background: '#c2185b', color: '#fff', fontWeight: 800, cursor: 'pointer',
  },
  secondary: {
    border: '1px solid #cbd5e1', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'center',
    alignItems: 'center', gap: 8, color: '#334155', fontWeight: 750, textDecoration: 'none',
  },
};
