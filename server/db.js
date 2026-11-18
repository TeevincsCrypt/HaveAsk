// SQLite storage using Node's built-in driver (no native build step needed).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.HAVEASK_DATA_DIR || path.resolve(process.cwd(), 'data');
const DB_FILE = process.env.HAVEASK_DB || path.join(DATA_DIR, 'haveask.db');

if (DB_FILE !== ':memory:') fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('member','volunteer','coordinator','admin')),
  phone TEXT,
  area TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS volunteers (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  skills TEXT NOT NULL DEFAULT '[]',
  availability_days TEXT NOT NULL DEFAULT '[]',
  availability_note TEXT,
  max_load INTEGER NOT NULL DEFAULT 2,
  has_vehicle INTEGER NOT NULL DEFAULT 0,
  bio TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  categories TEXT NOT NULL,
  area TEXT,
  contact TEXT,
  hours TEXT,
  description TEXT
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('low','medium','high')),
  contact_method TEXT NOT NULL,
  contact_detail TEXT,
  followup_availability TEXT,
  area TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','resolved','closed')),
  escalated INTEGER NOT NULL DEFAULT 0,
  ai TEXT,
  ai_source TEXT,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  last_member_contact_at INTEGER,
  resolved_at INTEGER
);
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('volunteer','resource')),
  volunteer_id INTEGER REFERENCES users(id),
  resource_id INTEGER REFERENCES resources(id),
  score INTEGER NOT NULL,
  reasons TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','approved','dismissed')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  volunteer_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('offered','accepted','contacted','helping','needs_support','completed','declined','withdrawn')),
  assigned_by INTEGER REFERENCES users(id),
  brief TEXT,
  decline_reason TEXT,
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  last_update_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  member_visible INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  assignment_id INTEGER,
  rule TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical','warning','info')),
  summary TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','snoozed','resolved')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  snoozed_until INTEGER,
  resolved_at INTEGER,
  resolved_reason TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  dedupe_key TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('yes','somewhat','no')),
  comment TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  request_id INTEGER REFERENCES requests(id) ON DELETE SET NULL,
  assignment_id INTEGER REFERENCES assignments(id) ON DELETE SET NULL,
  payee_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('financial_help','reimbursement','service')),
  amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
  note TEXT,
  status TEXT NOT NULL CHECK (status IN ('requested','approved','submitted','confirmed','failed','declined','cancelled')),
  requested_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  payee_address TEXT,
  payer_address TEXT,
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  tx_hash TEXT UNIQUE,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  confirmed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_requests_member ON requests(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_payee ON payments(payee_id);
CREATE INDEX IF NOT EXISTS idx_payments_req ON payments(request_id);
CREATE INDEX IF NOT EXISTS idx_assign_req ON assignments(request_id);
CREATE INDEX IF NOT EXISTS idx_assign_vol ON assignments(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_alerts_req ON alerts(request_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
`);

// Lightweight migrations for databases created before Privy sign-in existed.
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
for (const [col, ddl] of [
  ['privy_id', 'ALTER TABLE users ADD COLUMN privy_id TEXT'],
  ['wallet_address', 'ALTER TABLE users ADD COLUMN wallet_address TEXT'],
  ['onboarded', 'ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 1'],
  ['volunteer_status', 'ALTER TABLE users ADD COLUMN volunteer_status TEXT'],
]) if (!userCols.includes(col)) db.exec(ddl);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_privy ON users(privy_id) WHERE privy_id IS NOT NULL');

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const json = (s, fallback = null) => {
  if (s == null) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};

// ---------- Settings (care thresholds + demo clock) ----------
export const DEFAULT_SETTINGS = {
  clock_offset_ms: 0,
  stale_days: 5,               // open request with no activity
  volunteer_silent_days: 3,    // accepted assignment with no progress update
  high_urgency_unassigned_hours: 12,
  member_followup_days: 2,     // nobody has contacted the member yet
  offer_response_hours: 48,    // volunteer hasn't accepted/declined
  reminder_cooldown_days: 3,   // gentle reminders: at most one per assignment per N days
  payment_max_usdc: 500,       // largest single payment a coordinator can send
};

export function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = Number(r.value);
  return s;
}
export function setSetting(key, value) {
  run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}
