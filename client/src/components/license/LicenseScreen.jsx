import React, { useState } from 'react';
import { Check, Copy, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { useLicense } from '../../context/LicenseContext';

export default function LicenseScreen() {
  const { machineId, machineError, expiryDate, message: initialMessage, activate } = useLicense();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState({ type: 'error', text: machineError || initialMessage });

  async function copyMachineId() {
    if (!machineId) return;
    await navigator.clipboard.writeText(machineId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function submit(event) {
    event.preventDefault();
    if (!key.trim()) {
      setFeedback({ type: 'error', text: 'Please enter the licence key.' });
      return;
    }
    try {
      setBusy(true);
      setFeedback({ type: '', text: '' });
      const result = await activate(key);
      setFeedback({ type: 'success', text: result.message });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message || 'Licence activation failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="licence-page">
      <section className="licence-card" aria-labelledby="licence-heading">
        <div className="licence-brand"><span>₹</span> Bachat Gat</div>
        <div className="licence-icon"><ShieldAlert size={38} /></div>
        <p className="licence-eyebrow">SECURE ACCESS</p>
        <h1 id="licence-heading">Licence expired</h1>
        <p className="licence-description">
          Activate this installation with a key created by your authorised BizFlow licence administrator.
        </p>

        {expiryDate && (
          <div className="licence-expiry">
            Previous expiry date <strong>{expiryDate}</strong>
          </div>
        )}

        <div className="licence-machine-block">
          <span>Exact Machine ID</span>
          <div>
            <code data-testid="machine-id">{machineId || 'Unavailable'}</code>
            <button type="button" onClick={copyMachineId} disabled={!machineId} aria-label="Copy Machine ID">
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <form onSubmit={submit}>
          <label htmlFor="licence-key">Licence key</label>
          <div className="licence-input-wrap">
            <KeyRound size={19} />
            <input
              id="licence-key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Paste generated licence key"
              autoComplete="off"
              spellCheck="false"
              disabled={busy || !machineId}
            />
          </div>
          {feedback.text && (
            <p className={`licence-feedback ${feedback.type}`} role="alert">{feedback.text}</p>
          )}
          <button className="licence-activate" type="submit" disabled={busy || !machineId}>
            {busy ? <Loader2 className="spin" size={19} /> : <KeyRound size={19} />}
            {busy ? 'Validating...' : 'Activate Licence'}
          </button>
        </form>

        <p className="licence-footnote">
          Clearing browser/site data can remove this Machine ID and require a newly generated key.
        </p>
        <a className="licence-contact" href="https://bizflowindia.cloud/" target="_blank" rel="noreferrer">
          Contact BizFlow India
        </a>
      </section>
    </main>
  );
}
