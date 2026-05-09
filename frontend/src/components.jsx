import React from 'react';

/* ── Badge ─────────────────────────────────────────────────────────── */
export function Badge({ status }) {
  const map = {
    pass:    { label: 'Succès',     bg: 'var(--green-bg)', color: 'var(--green)'  },
    fail:    { label: 'Échec',      bg: 'var(--red-bg)',   color: 'var(--red)'    },
    pending: { label: 'En attente', bg: 'var(--amber-bg)', color: 'var(--amber)'  },
    running: { label: 'En cours…',  bg: 'var(--accent-bg)',color: 'var(--accent2)'},
  };
  const { label, bg, color } = map[status] || map.pending;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'3px 10px',
      borderRadius:100, fontSize:11, fontWeight:600, fontFamily:'var(--mono)',
      background: bg, color
    }}>
      {label}
    </span>
  );
}

/* ── Button ─────────────────────────────────────────────────────────── */
export function Btn({ children, onClick, variant='default', size='md', disabled, style={} }) {
  const base = {
    display:'inline-flex', alignItems:'center', gap:6,
    fontFamily:'var(--sans)', fontWeight:600, borderRadius:'var(--radius)',
    border:'1px solid', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, transition:'all 0.15s',
  };
  const sizes = {
    sm: { padding:'4px 12px', fontSize:12 },
    md: { padding:'8px 18px', fontSize:13 },
    lg: { padding:'11px 24px', fontSize:14 },
  };
  const variants = {
    default: { background:'var(--bg4)', borderColor:'var(--border2)', color:'var(--txt)' },
    primary: { background:'var(--accent)', borderColor:'var(--accent)', color:'#fff' },
    danger:  { background:'var(--red-bg)', borderColor:'var(--red)', color:'var(--red)' },
    ghost:   { background:'transparent', borderColor:'transparent', color:'var(--txt2)' },
  };
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

/* ── Card ─────────────────────────────────────────────────────────── */
export function Card({ children, style={}, onClick }) {
  return (
    <div 
      onClick={onClick}
      style={{
      background:'var(--bg2)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', padding:'20px',
      ...style
    }}>
      {children}
    </div>
  );
}

/* ── Input ─────────────────────────────────────────────────────────── */
export function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={{ display:'block', fontSize:11, fontWeight:600,
        color:'var(--txt2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>
        {label}
      </label>}
      {children}
      {hint && <p style={{ fontSize:11, color:'var(--txt3)', marginTop:4 }}>{hint}</p>}
    </div>
  );
}

/* ── Spinner ─────────────────────────────────────────────────────────── */
export function Spinner({ size=18 }) {
  return (
    <span style={{
      display:'inline-block', width:size, height:size,
      border:`2px solid var(--border2)`,
      borderTopColor:'var(--accent)',
      borderRadius:'50%',
      animation:'spin 0.7s linear infinite',
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}

/* ── StepDot ─────────────────────────────────────────────────────────── */
export function StepBar({ current, total }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:0, marginBottom:24 }}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={n}>
            <div style={{
              width:30, height:30, borderRadius:'50%', display:'flex',
              alignItems:'center', justifyContent:'center',
              fontSize:12, fontWeight:700,
              background: done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--bg4)',
              color: (done || active) ? '#fff' : 'var(--txt3)',
              border:`1px solid ${done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--border2)'}`,
              flexShrink:0,
            }}>
              {done ? '✓' : n}
            </div>
            {n < total && (
              <div style={{ flex:1, height:1, background: done ? 'var(--green)' : 'var(--border2)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── CodeBlock ─────────────────────────────────────────────────────────── */
export function CodeBlock({ code, maxHeight=320 }) {
  const copy = () => navigator.clipboard.writeText(code || '');
  return (
    <div style={{ position:'relative' }}>
      <pre style={{
        background:'var(--bg)',
        border:'1px solid var(--border)',
        borderRadius:'var(--radius)',
        padding:'14px 16px',
        fontFamily:'var(--mono)',
        fontSize:11,
        color:'var(--txt2)',
        whiteSpace:'pre-wrap',
        wordBreak:'break-all',
        lineHeight:1.7,
        maxHeight,
        overflowY:'auto',
        margin:0,
      }}>
        {code || '// Aucun script généré.'}
      </pre>
      <button onClick={copy} style={{
        position:'absolute', top:8, right:8,
        background:'var(--bg3)', border:'1px solid var(--border2)',
        borderRadius:'var(--radius)', padding:'3px 10px',
        fontSize:11, color:'var(--txt2)', cursor:'pointer',
      }}>
        Copier
      </button>
    </div>
  );
}

/* ── SectionTitle ─────────────────────────────────────────────────────────── */
export function SectionTitle({ children }) {
  return (
    <h3 style={{
      fontSize:11, fontWeight:700, color:'var(--txt3)',
      textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12,
    }}>
      {children}
    </h3>
  );
}

/* ── EmptyState ─────────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--txt3)' }}>
      <div style={{ fontSize:40, marginBottom:12 }}>{icon}</div>
      <p style={{ fontSize:15, fontWeight:600, color:'var(--txt2)', marginBottom:6 }}>{title}</p>
      {subtitle && <p style={{ fontSize:13, marginBottom:16 }}>{subtitle}</p>}
      {action}
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, children, width=680 }) {
  if (!open) return null;
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
        padding:20,
      }}>
      <div style={{
        background:'var(--bg2)', border:'1px solid var(--border2)',
        borderRadius:'var(--radius-lg)', padding:24, width, maxWidth:'100%',
        maxHeight:'85vh', overflowY:'auto',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontSize:17, fontWeight:700 }}>{title}</h2>
          <Btn onClick={onClose} variant='ghost' size='sm'>✕</Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Notification toast ─────────────────────────────────────────────────── */
export function Toast({ message, type='info', onClose }) {
  const colors = {
    info:    { bg:'var(--accent-bg)', border:'var(--accent)', color:'var(--accent2)' },
    success: { bg:'var(--green-bg)',  border:'var(--green)',  color:'var(--green)'   },
    error:   { bg:'var(--red-bg)',    border:'var(--red)',    color:'var(--red)'     },
  };
  const { bg, border, color } = colors[type] || colors.info;
  return (
    <div style={{
      position:'fixed', bottom:24, right:24, zIndex:2000,
      background:bg, border:`1px solid ${border}`, borderRadius:'var(--radius-lg)',
      padding:'12px 18px', display:'flex', alignItems:'center', gap:12,
      maxWidth:360, boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <span style={{ fontSize:13, color, flex:1 }}>{message}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', color, cursor:'pointer', fontSize:16 }}>×</button>
    </div>
  );
}
