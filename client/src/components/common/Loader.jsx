import React from 'react';
import { Loader2 } from 'lucide-react';

const Loader = ({ fullScreen = false, text = 'Loading...' }) => {
  if (fullScreen) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        gap: '12px'
      }}>
        <Loader2 className="animate-spin" size={42} color="var(--primary)" />
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{text}</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      gap: '10px',
      minHeight: '160px',
    }}>
      <Loader2 className="animate-spin" size={32} color="var(--primary)" />
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500 }}>{text}</span>
    </div>
  );
};

export default Loader;
