import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ---------- icons (inline SVG, stroke-based) ----------
const P = {
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  check: 'M20 6 9 17l-5-5',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  back: 'M19 12H5M12 19l-7-7 7-7',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  note: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  fwd: 'M13 17l5-5-5-5M6 17l5-5-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  map: 'M12 22s-8-5.6-8-12a8 8 0 0 1 16 0c0 6.4-8 12-8 12zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};
export function Icon({ name, size = 16, stroke = 2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }} aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export const CAT_ICON = { food: '🍞', accommodation: '🏠', medical: '🩺', transportation: '🚗', emotional: '💬', financial: '💵', childcare: '🧸', other: '🤝' };

export function Category({ cat, meta, label = true }) {
  return <span className="cat"><span aria-hidden>{CAT_ICON[cat]}</span>{label && (meta?.categories?.[cat] || cat)}</span>;
}

const URG = { high: ['crit', 'High'], medium: ['warn', 'Medium'], low: ['neutral', 'Low'] };
export function Urgency({ level, prefix = '' }) {
  const [c, l] = URG[level] || URG.low;
  return <span className={`badge ${c}`}><span className="pip" />{prefix}{l}</span>;
}

const STATUS = { pending: ['info', 'Pending'], in_progress: ['primary', 'In progress'], resolved: ['ok', 'Resolved'], closed: ['neutral', 'Closed'] };
export function Status({ status }) {
  const [c, l] = STATUS[status] || ['neutral', status];
  return <span className={`badge ${c}`}>{l}</span>;
}

const ASTAT = { offered: 'warn', accepted: 'info', contacted: 'info', helping: 'primary', needs_support: 'crit', completed: 'ok', declined: 'neutral', withdrawn: 'neutral' };
export function AssignmentStatus({ status, label }) {
  return <span className={`badge ${ASTAT[status] || 'neutral'}`}>{label || status}</span>;
}

export function AIBadge({ children = 'AI suggestion' }) {
  return <span className="badge ai"><Icon name="sparkle" size={12} />{children}</span>;
}

export function Severity({ severity }) {
  return severity === 'critical'
    ? <span className="badge crit"><Icon name="alert" size={12} />Urgent</span>
    : <span className="badge warn"><Icon name="clock" size={12} />Needs attention</span>;
}

export function Confidence({ score }) {
  return (
    <span className="conf" title="Match confidence — an AI estimate, not a decision">
      <span className="conf-bar"><i style={{ width: `${score}%` }} /></span>{score}% match
    </span>
  );
}

export function LoadMeter({ load, max }) {
  return (
    <span className={`load ${load >= max ? 'full' : ''}`} title={`${load} of ${max} active assignments`}>
      {Array.from({ length: Math.max(max, 1) }, (_, i) => <i key={i} className={i < load ? 'on' : ''} />)}
    </span>
  );
}

export function Empty({ icon = '🌿', title, children, action }) {
  return (
    <div className="empty">
      <div className="ico" aria-hidden>{icon}</div>
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Loading() {
  return <div className="empty faint">Loading…</div>;
}

export function Modal({ title, children, onClose, footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ResponsibleAINote({ compact }) {
  return (
    <span className="ai-note">
      <Icon name="shield" size={15} />
      <span><b>AI helps surface needs and suggestions. Humans make all care decisions.</b>{!compact && ' AI never contacts members or assigns volunteers on its own.'}</span>
    </span>
  );
}

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => { setMsg(m); clearTimeout(window.__toastT); window.__toastT = setTimeout(() => setMsg(null), 3200); }, []);
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);
