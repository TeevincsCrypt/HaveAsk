// A demo-aware clock. "Fast-forward" in Demo Controls shifts this offset so the
// unresolved-request monitor can be shown working without waiting real days.
import { getSettings } from './db.js';

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export function now() {
  return Date.now() + (getSettings().clock_offset_ms || 0);
}
