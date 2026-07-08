import React from 'react';

/* ── Badge (dot + label) ───────────────────────────────────────────────── */
export function Badge({ status, children }) {
  const map = {
    pass:    { label: 'Succès',     color: 'var(--green)' },
    fail:    { label: 'Échec',      color: 'var(--red)'   },
    pending: { label: 'En attente', color: 'var(--amber)' },
    running: { label: 'En cours',   color: 'var(--accent2)' },
  };
  const cfg = map[status] || map.pending;
  const label = children || cfg.label;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6, padding:'3px 10px 3px 8px',
      borderRadius:100, fontSize:11, fontWeight:600, fontFamily:'var(--sans)',
      background: 'color-mix(in srgb, ' + cfg.color + ' 13%, transparent)',
      color: cfg.color, border: '1px solid color-mix(in srgb, ' + cfg.color + ' 30%, transparent)',
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:cfg.color,
        boxShadow: status==='running' ? '0 0 0 3px color-mix(in srgb, '+cfg.color+' 25%, transparent)' : 'none' }} />
      {label}
    </span>
  );
}

/* ── Button ────────────────────────────────────────────────────────────── */
export function Btn({ children, onClick, variant='default', size='md', disabled, style={}, title, type='button' }) {
  const [hover, setHover] = React.useState(false);
  const base = {
    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7,
    fontFamily:'var(--sans)', fontWeight:600, borderRadius:'var(--radius)',
    border:'1px solid transparent', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, transition:'all 0.15s ease', whiteSpace:'nowrap',
  };
  const sizes = {
    sm: { padding:'5px 12px', fontSize:12 },
    md: { padding:'9px 16px', fontSize:13 },
    lg: { padding:'12px 22px', fontSize:14 },
  };
  const variants = {
    default: { background: hover ? 'var(--bg-elev-3)' : 'var(--bg-elev-2)', borderColor:'var(--border2)', color:'var(--txt)' },
    primary: { background: hover ? 'var(--accent-hover)' : 'var(--accent)', borderColor:'transparent', color:'#fff', boxShadow: hover ? '0 4px 14px var(--accent-ring)' : 'var(--shadow-sm)' },
    success: { background: hover ? 'color-mix(in srgb, var(--green) 22%, transparent)' : 'var(--green-bg)', borderColor:'color-mix(in srgb, var(--green) 35%, transparent)', color:'var(--green)' },
    danger:  { background: hover ? 'color-mix(in srgb, var(--red) 20%, transparent)' : 'var(--red-bg)', borderColor:'color-mix(in srgb, var(--red) 32%, transparent)', color:'var(--red)' },
    ghost:   { background: hover ? 'var(--surface-hover)' : 'transparent', borderColor:'transparent', color:'var(--txt2)' },
  };
  return (
    <button type={type} title={title} onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

/* ── Card ──────────────────────────────────────────────────────────────── */
export function Card({ children, style={}, onClick, hover=false }) {
  const [h, setH] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setH(true)}
      onMouseLeave={() => hover && setH(false)}
      style={{
        background:'var(--bg-elev-1)', border:'1px solid var(--border)',
        borderRadius:'var(--radius-lg)', padding:'20px',
        boxShadow: h ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        borderColor: h ? 'var(--border2)' : 'var(--border)',
        transform: h ? 'translateY(-2px)' : 'none',
        transition:'all 0.18s ease',
        ...style,
      }}>
      {children}
    </div>
  );
}

/* ── Field ─────────────────────────────────────────────────────────────── */
export function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom:16 }}>
      {label && <label style={{ display:'block', fontSize:11.5, fontWeight:600,
        color:'var(--txt2)', marginBottom:6 }}>{label}</label>}
      {children}
      {hint && <p style={{ fontSize:11, color:'var(--txt3)', marginTop:5 }}>{hint}</p>}
    </div>
  );
}

/* ── Spinner ───────────────────────────────────────────────────────────── */
export function Spinner({ size=18 }) {
  return (
    <span style={{
      display:'inline-block', width:size, height:size,
      border:`2px solid var(--border2)`, borderTopColor:'var(--accent)',
      borderRadius:'50%', animation:'spin 0.7s linear infinite',
    }} />
  );
}

/* ── Toggle switch ─────────────────────────────────────────────────────── */
export function Toggle({ checked, onChange, label, title }) {
  return (
    <label title={title} style={{ display:'inline-flex', alignItems:'center', gap:9, cursor:'pointer', userSelect:'none', fontSize:12.5, color:'var(--txt2)' }}>
      <span onClick={() => onChange(!checked)} style={{
        width:36, height:20, borderRadius:100, position:'relative', flexShrink:0,
        background: checked ? 'var(--accent)' : 'var(--bg-elev-3)',
        border:`1px solid ${checked ? 'var(--accent)' : 'var(--border2)'}`,
        transition:'all 0.18s ease',
      }}>
        <span style={{
          position:'absolute', top:2, left: checked ? 17 : 2, width:14, height:14,
          borderRadius:'50%', background:'#fff', transition:'left 0.18s ease', boxShadow:'var(--shadow-sm)',
        }} />
      </span>
      {label}
    </label>
  );
}

/* ── Segmented control ─────────────────────────────────────────────────── */
export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display:'inline-flex', gap:3, padding:3, background:'var(--bg-elev-2)',
      border:'1px solid var(--border)', borderRadius:'var(--radius)', flexWrap:'wrap' }}>
      {options.map(opt => {
        const active = value === opt.key;
        return (
          <button key={opt.key} onClick={() => onChange(opt.key)} style={{
            padding:'5px 13px', fontSize:12.5, fontWeight:600, borderRadius:7,
            background: active ? 'var(--accent)' : 'transparent',
            color: active ? '#fff' : 'var(--txt2)', border:'none',
          }}>
            {opt.label}{opt.count != null && (
              <span style={{ marginLeft:6, opacity:0.75, fontSize:11 }}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── StatTile ──────────────────────────────────────────────────────────── */
export function StatTile({ label, value, sub, color, icon, children }) {
  return (
    <div style={{
      background:'var(--bg-elev-1)', borderRadius:'var(--radius-lg)', padding:'18px 20px',
      border:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:4,
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:11, color:'var(--txt3)', fontWeight:600, letterSpacing:'0.3px' }}>{label}</span>
        {icon && <span style={{ fontSize:15, opacity:0.85 }}>{icon}</span>}
      </div>
      <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
        <span style={{ fontSize:30, fontWeight:800, color: color || 'var(--txt)', fontFamily:'var(--display)', lineHeight:1.1 }}>{value}</span>
        {sub && <span style={{ fontSize:12, color:'var(--txt3)' }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

/* ── ProgressBar ───────────────────────────────────────────────────────── */
export function ProgressBar({ value, total, color='var(--accent)' }) {
  const pct = total ? Math.round(100 * value / total) : 0;
  return (
    <div style={{ width:'100%', height:6, borderRadius:100, background:'var(--bg-elev-3)', overflow:'hidden' }}>
      <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:100, transition:'width 0.3s ease' }} />
    </div>
  );
}

/* ── Table ─────────────────────────────────────────────────────────────── */
export function Table({ columns, children }) {
  return (
    <div style={{ overflowX:'auto', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', background:'var(--bg-elev-1)' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={{
                textAlign: c.align || 'left', padding:'11px 16px', fontSize:11, fontWeight:600,
                color:'var(--txt3)', letterSpacing:'0.4px', textTransform:'uppercase',
                borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', width: c.width,
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, onClick, danger }) {
  const [h, setH] = React.useState(false);
  return (
    <tr onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        background: h ? 'var(--surface-hover)' : 'transparent',
        borderLeft: danger ? '2px solid var(--red)' : '2px solid transparent',
        transition:'background 0.12s',
      }}>
      {children}
    </tr>
  );
}

export function Cell({ children, align='left', style={}, colSpan }) {
  return (
    <td colSpan={colSpan} style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', textAlign:align, verticalAlign:'middle', ...style }}>
      {children}
    </td>
  );
}

/* ── Sparkline (single series line) ────────────────────────────────────── */
export function Sparkline({ data, width=120, height=32, color='var(--accent2)' }) {
  if (!data || data.length < 2) return <div style={{ height, color:'var(--txt3)', fontSize:11 }}>—</div>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 4) + 2;
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display:'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── MiniBars — pass/fail par jour (status stacked) ────────────────────── */
export function MiniBars({ days, height=64 }) {
  // days: [{ label, pass, fail }]
  if (!days || !days.length) return <div style={{ color:'var(--txt3)', fontSize:12 }}>Aucune donnée d'exécution.</div>;
  const max = Math.max(...days.map(d => d.pass + d.fail), 1);
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:6, height }}>
        {days.map((d, i) => {
          const totalH = ((d.pass + d.fail) / max) * (height - 4);
          const passH = (d.pass + d.fail) ? (d.pass / (d.pass + d.fail)) * totalH : 0;
          const failH = totalH - passH;
          return (
            <div key={i} title={`${d.label} · ${d.pass} succès, ${d.fail} échecs`}
              style={{ flex:1, display:'flex', flexDirection:'column-reverse', justifyContent:'flex-start', minWidth:0 }}>
              {failH > 0 && <div style={{ height:failH, background:'var(--red)', borderRadius:'0 0 3px 3px' }} />}
              {passH > 0 && <div style={{ height:passH, background:'var(--green)', borderRadius: failH>0 ? '3px 3px 0 0' : '3px', marginBottom: failH>0 ? '2px' : 0 }} />}
              {totalH === 0 && <div style={{ height:3, background:'var(--bg-elev-3)', borderRadius:3 }} />}
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:10, color:'var(--txt3)', fontFamily:'var(--mono)' }}>
        <span>{days[0]?.label}</span>
        <span>{days[days.length-1]?.label}</span>
      </div>
      <div style={{ display:'flex', gap:14, marginTop:10, fontSize:11, color:'var(--txt2)' }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:9, height:9, borderRadius:2, background:'var(--green)' }} /> Succès</span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:9, height:9, borderRadius:2, background:'var(--red)' }} /> Échecs</span>
      </div>
    </div>
  );
}

/* ── AiVerdict — verdict fonctionnel par IA visuelle ───────────────────── */
export function AiVerdict({ analysis, compact }) {
  if (!analysis) return null;
  const v = analysis.verdict;
  const color = v === 'pass' ? 'var(--green)' : v === 'fail' ? 'var(--red)' : 'var(--amber)';
  const label = v === 'pass' ? 'Succès fonctionnel' : v === 'fail' ? 'Échec fonctionnel' : 'Indéterminé';

  if (compact) {
    return (
      <span title={analysis.reason} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color, fontWeight: 600 }}>
        🔎 {label}
      </span>
    );
  }
  return (
    <div style={{
      border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
      background: `color-mix(in srgb, ${color} 8%, transparent)`,
      borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>🔎</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: '0.3px' }}>ANALYSE IA VISUELLE — {label.toUpperCase()}</span>
      </div>
      {analysis.reason && <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.5 }}>{analysis.reason}</div>}
      {analysis.functionalIssue && (
        <div style={{ fontSize: 12.5, color: 'var(--txt2)', marginTop: 6 }}>
          <strong style={{ color }}>Problème identifié :</strong> {analysis.functionalIssue}
        </div>
      )}
      {analysis.model && <div style={{ fontSize: 10, color: 'var(--txt3)', fontFamily: 'var(--mono)', marginTop: 8 }}>{analysis.model}</div>}
    </div>
  );
}

/* ── StepBar (wizard) ──────────────────────────────────────────────────── */
export function StepBar({ current, total, labels=[] }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:0, marginBottom:28 }}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={n}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flexShrink:0 }}>
              <div style={{
                width:32, height:32, borderRadius:'50%', display:'flex',
                alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700,
                background: done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--bg-elev-3)',
                color: (done || active) ? '#fff' : 'var(--txt3)',
                border:`1px solid ${done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--border2)'}`,
                boxShadow: active ? '0 0 0 4px var(--accent-ring)' : 'none',
                transition:'all 0.2s',
              }}>{done ? '✓' : n}</div>
              {labels[i] && <span style={{ fontSize:10.5, color: active ? 'var(--txt)' : 'var(--txt3)', fontWeight: active?600:500, whiteSpace:'nowrap' }}>{labels[i]}</span>}
            </div>
            {n < total && (
              <div style={{ flex:1, height:2, background: done ? 'var(--green)' : 'var(--border2)', margin:'0 8px', marginBottom: labels.length?20:0, borderRadius:2 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── CodeBlock ─────────────────────────────────────────────────────────── */
export function CodeBlock({ code, maxHeight=320 }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => { navigator.clipboard.writeText(code || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div style={{ position:'relative' }}>
      <pre style={{
        background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)',
        padding:'14px 16px', fontFamily:'var(--mono)', fontSize:11.5, color:'var(--txt2)',
        whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.7, maxHeight, overflowY:'auto', margin:0,
      }}>{code || '// Aucun script généré.'}</pre>
      <button onClick={copy} style={{
        position:'absolute', top:8, right:8, background:'var(--bg-elev-3)', border:'1px solid var(--border2)',
        borderRadius:'var(--radius-sm)', padding:'4px 10px', fontSize:11, color:'var(--txt2)', cursor:'pointer',
      }}>{copied ? '✓ Copié' : 'Copier'}</button>
    </div>
  );
}

/* ── SectionTitle ──────────────────────────────────────────────────────── */
export function SectionTitle({ children, action }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
      <h3 style={{ fontSize:11, fontWeight:700, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'0.8px', fontFamily:'var(--sans)' }}>
        {children}
      </h3>
      {action}
    </div>
  );
}

/* ── EmptyState ────────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div style={{ textAlign:'center', padding:'72px 20px', color:'var(--txt3)',
      border:'1px dashed var(--border2)', borderRadius:'var(--radius-lg)', background:'var(--bg-elev-1)' }}>
      <div style={{ fontSize:44, marginBottom:14, opacity:0.9 }}>{icon}</div>
      <p style={{ fontSize:16, fontWeight:700, color:'var(--txt2)', marginBottom:6, fontFamily:'var(--display)' }}>{title}</p>
      {subtitle && <p style={{ fontSize:13, marginBottom:18, maxWidth:380, marginLeft:'auto', marginRight:'auto' }}>{subtitle}</p>}
      {action}
    </div>
  );
}

/* ── Skeleton loaders ──────────────────────────────────────────────────── */
export function Skeleton({ height=16, width='100%', style={} }) {
  return <div className="skeleton" style={{ height, width, ...style }} />;
}

export function SkeletonList({ rows=4 }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={58} style={{ borderRadius:'var(--radius-lg)' }} />
      ))}
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, subtitle, children, width=680 }) {
  if (!open) return null;
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(4,6,10,0.72)', backdropFilter:'blur(4px)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
      <div className="fade-in" style={{
        background:'var(--bg-elev-1)', border:'1px solid var(--border2)', borderRadius:'var(--radius-xl)',
        padding:24, width, maxWidth:'100%', maxHeight:'88vh', overflowY:'auto', boxShadow:'var(--shadow-lg)',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:800 }}>{title}</h2>
            {subtitle && <div style={{ fontSize:12.5, color:'var(--txt3)', marginTop:3 }}>{subtitle}</div>}
          </div>
          <Btn onClick={onClose} variant="ghost" size="sm">✕</Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Toast ─────────────────────────────────────────────────────────────── */
export function Toast({ message, type='info', onClose }) {
  const colors = {
    info:    'var(--accent)',
    success: 'var(--green)',
    error:   'var(--red)',
  };
  const c = colors[type] || colors.info;
  return (
    <div className="fade-in" style={{
      position:'fixed', bottom:24, right:24, zIndex:2000,
      background:'var(--bg-elev-2)', border:`1px solid ${c}`, borderLeft:`3px solid ${c}`,
      borderRadius:'var(--radius-lg)', padding:'13px 18px', display:'flex', alignItems:'center', gap:12,
      maxWidth:380, boxShadow:'var(--shadow-lg)',
    }}>
      <span style={{ fontSize:13.5, color:'var(--txt)', flex:1 }}>{message}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--txt3)', cursor:'pointer', fontSize:16 }}>×</button>
    </div>
  );
}
