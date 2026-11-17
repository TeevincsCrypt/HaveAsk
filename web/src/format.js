const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

export function relTime(ts, now) {
  const d = now - ts;
  if (d < MIN) return 'just now';
  if (d < HOUR) return `${Math.round(d / MIN)} min ago`;
  if (d < DAY) { const h = Math.round(d / HOUR); return `${h} hour${h === 1 ? '' : 's'} ago`; }
  const days = Math.floor(d / DAY);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function duration(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}
export const fmtDate = (ts) => new Date(ts).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const initials = (n = '') => n.split(' ').filter((w) => /^[A-Za-z]/.test(w) && !w.endsWith('.')).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const DAY_MS = DAY;
