import { DAY, HOUR } from './clock.js';

export function ago(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (ms < DAY) { const h = Math.round(ms / HOUR); return `${h} hour${h === 1 ? '' : 's'}`; }
  const d = Math.floor(ms / DAY);
  return `${d} day${d === 1 ? '' : 's'}`;
}
export const firstName = (n = '') => n.split(' ')[0];
