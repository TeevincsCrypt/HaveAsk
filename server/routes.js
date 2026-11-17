import express from 'express';
import { all, get, run, json, tx, getSettings, setSetting, DEFAULT_SETTINGS } from './db.js';
import { now, DAY } from './clock.js';
import { hashPassword, verifyPassword, createSession, destroySession, requireRole, isCare } from './auth.js';
import { CATEGORIES, CONTACT_METHODS, AREAS, DAYS, ACTIVE_ASSIGNMENT, ASSIGNMENT_LABELS } from './constants.js';
import {
  createRequest, assignVolunteer, respondToAssignment, updateAssignmentStatus, resolveRequest,
  logActivity, touchRequest, notifyCareTeam, storeSuggestions, activeAssignment, httpError, VOLUNTEER_STATUSES,
} from './services.js';
import { analyzeRequest, aiMode } from './ai.js';
import { runMonitor, RULES } from './monitor.js';
import { firstName } from './util.js';

export const api = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const id = (v) => Number.parseInt(v, 10);

// ------------------------------------------------------------------ meta / auth
api.get('/meta', (req, res) => {
  const s = getSettings();
  res.json({
    categories: CATEGORIES, contactMethods: CONTACT_METHODS, areas: Object.keys(AREAS), days: DAYS,
    assignmentLabels: ASSIGNMENT_LABELS, rules: RULES, aiMode: aiMode(),
    now: now(), clockOffsetMs: s.clock_offset_ms,
  });
});

api.get('/me', (req, res) => res.json({ user: req.user }));

api.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = get('SELECT * FROM users WHERE email = ?', String(email || '').trim().toLowerCase());
  if (!u || !verifyPassword(String(password || ''), u.password_hash)) return res.status(401).json({ error: 'That email and password don’t match our records.' });
  createSession(res, u.id);
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, area: u.area } });
});

api.post('/auth/signup', (req, res) => {
  const { name, email, password, area } = req.body || {};
  const e = String(email || '').trim().toLowerCase();
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(e) || String(password || '').length < 8)
    return res.status(400).json({ error: 'Please enter your name, a valid email, and a password of at least 8 characters.' });
  if (get('SELECT id FROM users WHERE email = ?', e)) return res.status(409).json({ error: 'An account with that email already exists.' });
  const r = run("INSERT INTO users(name, email, password_hash, role, area, created_at) VALUES (?,?,?, 'member', ?, ?)",
    name.trim(), e, hashPassword(password), AREAS[area] ? area : null, now());
  createSession(res, Number(r.lastInsertRowid));
  res.json({ user: { id: Number(r.lastInsertRowid), name: name.trim(), email: e, role: 'member', area } });
});

api.post('/auth/logout', (req, res) => { destroySession(req, res); res.json({ ok: true }); });

// ------------------------------------------------------------------ notifications
api.get('/notifications', requireRole('member', 'volunteer', 'coordinator'), (req, res) => {
  const items = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 40', req.user.id);
  const unread = get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', req.user.id).n;
  res.json({ items, unread });
});
api.post('/notifications/read-all', requireRole('member', 'volunteer', 'coordinator'), (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
});
api.post('/notifications/:id/read', requireRole('member', 'volunteer', 'coordinator'), (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', id(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ member
const memberStatusLabel = { pending: 'Pending', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };

function memberView(r) {
  const act = activeAssignment(r.id);
  const helper = act && act.status !== 'offered' ? get('SELECT name FROM users WHERE id = ?', act.volunteer_id) : null;
  return {
    id: r.id, category: r.category, description: r.description, urgency: r.urgency,
    contact_method: r.contact_method, contact_detail: r.contact_detail, followup_availability: r.followup_availability,
    status: r.status, status_label: memberStatusLabel[r.status], created_at: r.created_at, resolved_at: r.resolved_at,
    helper_first_name: helper ? firstName(helper.name) : null,
  };
}

api.get('/my/requests', requireRole('member'), (req, res) => {
  const rows = all('SELECT * FROM requests WHERE member_id = ? ORDER BY created_at DESC', req.user.id);
  res.json({ requests: rows.map(memberView) });
});

api.post('/my/requests', requireRole('member'), wrap(async (req, res) => {
  const b = req.body || {};
  const errors = [];
  if (!CATEGORIES[b.category]) errors.push('Please choose the type of help you need.');
  if (!b.description || String(b.description).trim().length < 10) errors.push('Please describe what you need in a sentence or two.');
  if (String(b.description || '').length > 2000) errors.push('Please keep the description under 2000 characters.');
  if (!['low', 'medium', 'high'].includes(b.urgency)) errors.push('Please choose how urgent this is.');
  if (!CONTACT_METHODS[b.contact_method]) errors.push('Please choose how you’d like to be contacted.');
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const input = {
    category: b.category, description: String(b.description).trim(), urgency: b.urgency,
    contact_method: b.contact_method, contact_detail: String(b.contact_detail || '').trim().slice(0, 200) || req.user.phone || req.user.email,
    followup_availability: String(b.followup_availability || '').trim().slice(0, 200) || null,
    area: AREAS[b.area] ? b.area : req.user.area,
  };
  const rid = await createRequest(req.user.id, input);
  runMonitor();
  res.json({ request: memberView(get('SELECT * FROM requests WHERE id = ?', rid)) });
}));

api.get('/my/requests/:id', requireRole('member'), (req, res) => {
  const r = get('SELECT * FROM requests WHERE id = ? AND member_id = ?', id(req.params.id), req.user.id);
  if (!r) return res.status(404).json({ error: 'Request not found.' });
  const timeline = all('SELECT id, message, created_at FROM activity WHERE request_id = ? AND member_visible = 1 ORDER BY created_at, id', r.id);
  const feedback = get('SELECT rating, comment, created_at FROM feedback WHERE request_id = ?', r.id) || null;
  res.json({ request: memberView(r), timeline, feedback });
});

api.post('/my/requests/:id/feedback', requireRole('member'), (req, res) => {
  const r = get('SELECT * FROM requests WHERE id = ? AND member_id = ?', id(req.params.id), req.user.id);
  if (!r) return res.status(404).json({ error: 'Request not found.' });
  if (!['resolved', 'closed'].includes(r.status)) return res.status(400).json({ error: 'Feedback opens once the request is resolved.' });
  const { rating, comment } = req.body || {};
  if (!['yes', 'somewhat', 'no'].includes(rating)) return res.status(400).json({ error: 'Please choose an answer.' });
  const t = now();
  run(`INSERT INTO feedback(request_id, rating, comment, created_at) VALUES (?,?,?,?)
    ON CONFLICT(request_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at`,
    r.id, rating, String(comment || '').slice(0, 1000) || null, t);
  logActivity(r.id, req.user.id, 'feedback', `Member feedback: ${rating === 'yes' ? 'help was useful' : rating === 'somewhat' ? 'help was somewhat useful' : 'help was not useful'}${comment ? ` — “${comment}”` : ''}`, { at: t });
  if (rating === 'no') notifyCareTeam({ type: 'feedback', title: `Request #${r.id}: member said the help wasn’t useful`, body: comment || 'Consider a pastoral follow-up.', link: `/care/requests/${r.id}`, at: t });
  res.json({ ok: true });
});

api.post('/my/requests/:id/withdraw', requireRole('member'), (req, res) => {
  const r = get('SELECT * FROM requests WHERE id = ? AND member_id = ?', id(req.params.id), req.user.id);
  if (!r) return res.status(404).json({ error: 'Request not found.' });
  if (!['pending', 'in_progress'].includes(r.status)) return res.status(400).json({ error: 'This request is already closed.' });
  resolveRequest(r.id, req.user.id, 'closed', 'Withdrawn by member — no longer needed');
  notifyCareTeam({ type: 'withdrawn', title: `Request #${r.id} withdrawn by member`, link: `/care/requests/${r.id}` });
  runMonitor();
  res.json({ ok: true });
});

// ------------------------------------------------------------------ volunteer
function volunteerView(a, full) {
  const r = get('SELECT * FROM requests WHERE id = ?', a.request_id);
  const member = get('SELECT name, phone, email FROM users WHERE id = ?', r.member_id);
  const ai = json(r.ai, {});
  const accepted = !['offered', 'declined', 'withdrawn'].includes(a.status);
  const base = {
    id: a.id, request_id: r.id, status: a.status, status_label: ASSIGNMENT_LABELS[a.status],
    category: r.category, urgency: ai.suggested_urgency || r.urgency, area: r.area,
    brief: a.brief, created_at: a.created_at, responded_at: a.responded_at, last_update_at: a.last_update_at,
    request_status: r.status, member_first_name: firstName(member.name),
  };
  // Need-to-know: contact details and the member's own words only after the volunteer accepts.
  if (full && accepted && !['withdrawn'].includes(a.status)) {
    Object.assign(base, {
      member_name: member.name, description: r.description,
      contact_method: r.contact_method, contact_detail: r.contact_detail || member.phone || member.email,
      followup_availability: r.followup_availability, key_needs: ai.key_needs || [],
    });
  }
  return base;
}

api.get('/vol/assignments', requireRole('volunteer'), (req, res) => {
  const rows = all('SELECT * FROM assignments WHERE volunteer_id = ? ORDER BY created_at DESC', req.user.id);
  res.json({ assignments: rows.map((a) => volunteerView(a, false)) });
});

api.get('/vol/assignments/:id', requireRole('volunteer'), (req, res) => {
  const a = get('SELECT * FROM assignments WHERE id = ? AND volunteer_id = ?', id(req.params.id), req.user.id);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  const updates = all(`SELECT message, created_at FROM activity WHERE request_id = ? AND actor_id = ? AND type IN ('accepted','volunteer_update') AND created_at >= ? ORDER BY created_at`,
    a.request_id, req.user.id, a.created_at);
  res.json({ assignment: volunteerView(a, true), updates, statuses: VOLUNTEER_STATUSES });
});

api.post('/vol/assignments/:id/respond', requireRole('volunteer'), (req, res) => {
  const { accept, reason } = req.body || {};
  respondToAssignment(id(req.params.id), req.user.id, !!accept, String(reason || '').slice(0, 300));
  runMonitor();
  res.json({ ok: true });
});

api.post('/vol/assignments/:id/status', requireRole('volunteer'), (req, res) => {
  const { status, note } = req.body || {};
  updateAssignmentStatus(id(req.params.id), req.user.id, status, String(note || '').trim().slice(0, 1000));
  runMonitor();
  res.json({ ok: true });
});

api.get('/vol/profile', requireRole('volunteer'), (req, res) => {
  const v = get('SELECT * FROM volunteers WHERE user_id = ?', req.user.id);
  const load = get(`SELECT COUNT(*) AS n FROM assignments WHERE volunteer_id = ? AND status IN (${ACTIVE_ASSIGNMENT.map(() => '?').join(',')})`, req.user.id, ...ACTIVE_ASSIGNMENT).n;
  res.json({ profile: { ...v, skills: json(v.skills, []), availability_days: json(v.availability_days, []), area: req.user.area, phone: req.user.phone, load } });
});

api.put('/vol/profile', requireRole('volunteer'), (req, res) => {
  const b = req.body || {};
  const skills = (b.skills || []).filter((s) => CATEGORIES[s]);
  const days = (b.availability_days || []).filter((d) => DAYS.includes(d));
  const maxLoad = Math.min(6, Math.max(0, id(b.max_load) || 0));
  run('UPDATE volunteers SET skills = ?, availability_days = ?, availability_note = ?, max_load = ?, has_vehicle = ?, bio = ?, active = ? WHERE user_id = ?',
    JSON.stringify(skills), JSON.stringify(days), String(b.availability_note || '').slice(0, 200), maxLoad, b.has_vehicle ? 1 : 0,
    String(b.bio || '').slice(0, 500), b.active === false ? 0 : 1, req.user.id);
  if (AREAS[b.area]) run('UPDATE users SET area = ? WHERE id = ?', b.area, req.user.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ care coordinator
const care = express.Router();
api.use('/care', requireRole('coordinator'), care);

function requestRow(r, t) {
  const ai = json(r.ai, {});
  const act = activeAssignment(r.id);
  const vol = act ? get('SELECT name FROM users WHERE id = ?', act.volunteer_id) : null;
  const alerts = all("SELECT id, rule, severity FROM alerts WHERE request_id = ? AND status IN ('open','acknowledged')", r.id);
  const sugg = get("SELECT COUNT(*) AS n FROM suggestions WHERE request_id = ? AND status = 'suggested'", r.id).n;
  return {
    id: r.id, member_name: r.member_name, category: r.category, categories: ai.categories || [r.category],
    summary: ai.summary || r.description.slice(0, 120), urgency: r.urgency, ai_urgency: ai.suggested_urgency || r.urgency,
    safeguarding: !!ai.safeguarding, status: r.status, escalated: !!r.escalated, area: r.area,
    created_at: r.created_at, last_activity_at: r.last_activity_at, age_days: (t - r.created_at) / DAY,
    idle_days: (t - r.last_activity_at) / DAY,
    assignment: act ? { id: act.id, status: act.status, label: ASSIGNMENT_LABELS[act.status], volunteer_name: vol?.name } : null,
    alert_count: alerts.length, top_severity: alerts.some((a) => a.severity === 'critical') ? 'critical' : alerts.length ? 'warning' : null,
    pending_suggestions: sugg,
  };
}

const NEW_WINDOW = 2 * DAY;

care.get('/overview', (req, res) => {
  const t = now();
  const rows = all('SELECT r.*, u.name AS member_name FROM requests r JOIN users u ON u.id = r.member_id').map((r) => requestRow(r, t));
  const open = rows.filter((r) => ['pending', 'in_progress'].includes(r.status));
  const s = getSettings();
  const stats = {
    open: open.length,
    new: open.filter((r) => t - r.created_at < NEW_WINDOW && !r.assignment).length,
    unassigned: open.filter((r) => !r.assignment).length,
    high: open.filter((r) => r.ai_urgency === 'high').length,
    aging: open.filter((r) => r.idle_days >= s.stale_days || r.alert_count > 0).length,
    resolved_30d: rows.filter((r) => r.status === 'resolved' && t - r.last_activity_at < 30 * DAY).length,
    awaiting_review: open.filter((r) => !r.assignment && r.pending_suggestions > 0).length,
  };
  const alerts = alertList("a.status IN ('open','acknowledged')", t).slice(0, 8);
  const feedback = all(`SELECT f.rating, COUNT(*) AS n FROM feedback f GROUP BY f.rating`);
  const volunteers = volunteerList();
  res.json({ stats, alerts, feedback, capacity: {
    total: volunteers.length,
    available: volunteers.filter((v) => v.active && v.load < v.max_load).length,
    at_capacity: volunteers.filter((v) => v.active && v.load >= v.max_load).length,
  } });
});

care.get('/requests', (req, res) => {
  const t = now();
  const s = getSettings();
  const filter = String(req.query.filter || 'open');
  const q = String(req.query.q || '').trim().toLowerCase();
  const allRows = all('SELECT r.*, u.name AS member_name FROM requests r JOIN users u ON u.id = r.member_id ORDER BY r.created_at DESC').map((r) => requestRow(r, t));
  const isOpen = (r) => ['pending', 'in_progress'].includes(r.status);
  const filters = {
    open: isOpen,
    new: (r) => isOpen(r) && t - r.created_at < NEW_WINDOW && !r.assignment,
    aging: (r) => isOpen(r) && (r.idle_days >= s.stale_days || r.alert_count > 0),
    high: (r) => isOpen(r) && r.ai_urgency === 'high',
    unassigned: (r) => isOpen(r) && !r.assignment,
    assigned: (r) => isOpen(r) && !!r.assignment,
    escalated: (r) => isOpen(r) && r.escalated,
    resolved: (r) => !isOpen(r),
    all: () => true,
  };
  let rows = allRows.filter(filters[filter] || filters.open);
  if (req.query.category && CATEGORIES[req.query.category]) rows = rows.filter((r) => r.categories.includes(req.query.category));
  if (q) rows = rows.filter((r) => `#${r.id} ${r.member_name} ${r.summary} ${r.area} ${r.assignment?.volunteer_name || ''}`.toLowerCase().includes(q));
  const sev = { critical: 0, warning: 1 };
  const urg = { high: 0, medium: 1, low: 2 };
  rows.sort((a, b) => (sev[a.top_severity] ?? 2) - (sev[b.top_severity] ?? 2) || urg[a.ai_urgency] - urg[b.ai_urgency] || b.created_at - a.created_at);
  const counts = Object.fromEntries(Object.entries(filters).map(([k, f]) => [k, allRows.filter(f).length]));
  res.json({ requests: rows, counts });
});

care.get('/requests/:id', (req, res) => {
  const t = now();
  const r = get('SELECT r.*, u.name AS member_name, u.email AS member_email, u.phone AS member_phone FROM requests r JOIN users u ON u.id = r.member_id WHERE r.id = ?', id(req.params.id));
  if (!r) return res.status(404).json({ error: 'Request not found.' });
  const suggestions = all(`SELECT s.*, u.name AS volunteer_name, u.area AS volunteer_area, res.name AS resource_name, res.contact AS resource_contact,
      res.hours AS resource_hours, res.description AS resource_description,
      (SELECT COUNT(*) FROM assignments a WHERE a.volunteer_id = s.volunteer_id AND a.status IN (${ACTIVE_ASSIGNMENT.map(() => '?').join(',')})) AS load,
      v.max_load
    FROM suggestions s LEFT JOIN users u ON u.id = s.volunteer_id LEFT JOIN volunteers v ON v.user_id = s.volunteer_id
    LEFT JOIN resources res ON res.id = s.resource_id
    WHERE s.request_id = ? ORDER BY s.kind DESC, s.score DESC`, ...ACTIVE_ASSIGNMENT, r.id).map((s) => ({ ...s, reasons: json(s.reasons, []) }));
  const assignments = all(`SELECT a.*, u.name AS volunteer_name, u.phone AS volunteer_phone FROM assignments a JOIN users u ON u.id = a.volunteer_id
    WHERE a.request_id = ? ORDER BY a.created_at DESC`, r.id).map((a) => ({ ...a, label: ASSIGNMENT_LABELS[a.status] }));
  const notes = all('SELECT n.*, u.name AS author_name, u.role AS author_role FROM notes n JOIN users u ON u.id = n.author_id WHERE n.request_id = ? ORDER BY n.created_at DESC', r.id);
  const activity = all('SELECT a.*, u.name AS actor_name FROM activity a LEFT JOIN users u ON u.id = a.actor_id WHERE a.request_id = ? ORDER BY a.created_at DESC, a.id DESC', r.id);
  const alerts = alertList('a.request_id = ?', t, r.id);
  const feedback = get('SELECT * FROM feedback WHERE request_id = ?', r.id) || null;
  res.json({
    request: { ...requestRow(r, t), description: r.description, contact_method: r.contact_method, contact_detail: r.contact_detail,
      followup_availability: r.followup_availability, member_email: r.member_email, member_phone: r.member_phone,
      last_member_contact_at: r.last_member_contact_at, resolved_at: r.resolved_at, ai: json(r.ai, {}), ai_source: r.ai_source },
    suggestions, assignments, notes, activity, alerts, feedback, volunteers: volunteerList(),
  });
});

care.post('/requests/:id/assign', (req, res) => {
  const { volunteer_id, suggestion_id, brief } = req.body || {};
  assignVolunteer(id(req.params.id), id(volunteer_id), req.user.id, { suggestionId: suggestion_id ? id(suggestion_id) : null, brief });
  runMonitor();
  res.json({ ok: true });
});

care.post('/requests/:id/suggestions/:sid/dismiss', (req, res) => {
  run("UPDATE suggestions SET status = 'dismissed' WHERE id = ? AND request_id = ?", id(req.params.sid), id(req.params.id));
  logActivity(id(req.params.id), req.user.id, 'suggestion_dismissed', `${req.user.name} dismissed an AI suggestion`);
  res.json({ ok: true });
});

care.post('/requests/:id/reanalyze', wrap(async (req, res) => {
  const r = get('SELECT * FROM requests WHERE id = ?', id(req.params.id));
  if (!r) throw httpError(404, 'Request not found.');
  const analysis = await analyzeRequest(r);
  tx(() => {
    run('UPDATE requests SET ai = ?, ai_source = ? WHERE id = ?', JSON.stringify(analysis), analysis.source, r.id);
    storeSuggestions(r, analysis);
    logActivity(r.id, req.user.id, 'ai_analysis', `${req.user.name} refreshed the AI analysis and suggestions`);
  });
  res.json({ ok: true });
}));

care.post('/requests/:id/notes', (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Note is empty.' });
  const rid = id(req.params.id);
  if (!get('SELECT id FROM requests WHERE id = ?', rid)) throw httpError(404, 'Request not found.');
  const t = now();
  run('INSERT INTO notes(request_id, author_id, body, created_at) VALUES (?,?,?,?)', rid, req.user.id, body.slice(0, 2000), t);
  logActivity(rid, req.user.id, 'note', `${req.user.name} added a note`, { at: t });
  touchRequest(rid, t);
  runMonitor();
  res.json({ ok: true });
});

care.post('/requests/:id/contacted', (req, res) => {
  const rid = id(req.params.id);
  const note = String(req.body?.note || '').trim();
  const t = now();
  run('UPDATE requests SET last_member_contact_at = ?, last_activity_at = ? WHERE id = ?', t, t, rid);
  logActivity(rid, req.user.id, 'member_contacted', `${req.user.name} contacted the member${note ? ` — “${note}”` : ''}`, { at: t });
  logActivity(rid, req.user.id, 'member_status', 'The care team has been in touch with you', { memberVisible: true, at: t });
  if (note) run('INSERT INTO notes(request_id, author_id, body, created_at) VALUES (?,?,?,?)', rid, req.user.id, note, t);
  runMonitor();
  res.json({ ok: true });
});

care.post('/requests/:id/status', (req, res) => {
  resolveRequest(id(req.params.id), req.user.id, req.body?.status, String(req.body?.note || '').trim());
  runMonitor();
  res.json({ ok: true });
});

care.post('/requests/:id/escalate', (req, res) => {
  const rid = id(req.params.id);
  const r = get('SELECT * FROM requests WHERE id = ?', rid);
  if (!r) throw httpError(404, 'Request not found.');
  const reason = String(req.body?.reason || '').trim();
  const t = now();
  const on = !r.escalated;
  run('UPDATE requests SET escalated = ?, last_activity_at = ? WHERE id = ?', on ? 1 : 0, t, rid);
  logActivity(rid, req.user.id, on ? 'escalated' : 'deescalated', on ? `${req.user.name} escalated to pastoral team${reason ? ` — “${reason}”` : ''}` : `${req.user.name} removed escalation`, { at: t });
  if (on) {
    for (const p of all("SELECT id FROM users WHERE role = 'admin' AND id != ?", req.user.id)) {
      const n = { type: 'escalation', title: `Request #${rid} escalated to you`, body: reason || 'Please review this request personally.', link: `/care/requests/${rid}`, at: t };
      run('INSERT INTO notifications(user_id, type, title, body, link, created_at) VALUES (?,?,?,?,?,?)', p.id, n.type, n.title, n.body, n.link, n.at);
    }
  }
  res.json({ ok: true, escalated: on });
});

function alertList(where, t, ...params) {
  return all(`SELECT a.*, r.category, r.urgency, r.status AS request_status, u.name AS member_name, r.created_at AS request_created_at
    FROM alerts a JOIN requests r ON r.id = a.request_id JOIN users u ON u.id = r.member_id WHERE ${where}
    ORDER BY CASE a.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 WHEN 'snoozed' THEN 2 ELSE 3 END,
      CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.created_at ASC`, ...params)
    .map((a) => ({ ...a, rule_label: RULES[a.rule], age_ms: t - a.created_at }));
}

care.get('/alerts', (req, res) => {
  const t = now();
  const status = String(req.query.status || 'active');
  const where = status === 'active' ? "a.status IN ('open','acknowledged')" : status === 'snoozed' ? "a.status = 'snoozed'" : "a.status = 'resolved'";
  const counts = Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM alerts GROUP BY status').map((r) => [r.status, r.n]));
  res.json({ alerts: alertList(where, t).slice(0, 100), counts });
});

care.post('/alerts/:id/:action', (req, res) => {
  const a = get('SELECT * FROM alerts WHERE id = ?', id(req.params.id));
  if (!a) throw httpError(404, 'Alert not found.');
  const t = now();
  const action = req.params.action;
  if (action === 'acknowledge') {
    run("UPDATE alerts SET status = 'acknowledged', updated_at = ? WHERE id = ?", t, a.id);
    logActivity(a.request_id, req.user.id, 'alert_ack', `${req.user.name} acknowledged alert: ${RULES[a.rule]}`, { at: t });
  } else if (action === 'snooze') {
    const days = Math.min(7, Math.max(1, id(req.body?.days) || 1));
    run("UPDATE alerts SET status = 'snoozed', snoozed_until = ?, updated_at = ? WHERE id = ?", t + days * DAY, t, a.id);
    logActivity(a.request_id, req.user.id, 'alert_snooze', `${req.user.name} snoozed alert “${RULES[a.rule]}” for ${days} day${days > 1 ? 's' : ''}`, { at: t });
  } else if (action === 'dismiss') {
    run("UPDATE alerts SET status = 'resolved', resolved_at = ?, resolved_reason = ?, updated_at = ? WHERE id = ?", t, `Dismissed by ${req.user.name}`, t, a.id);
    logActivity(a.request_id, req.user.id, 'alert_dismiss', `${req.user.name} dismissed alert: ${RULES[a.rule]}`, { at: t });
  } else throw httpError(400, 'Unknown action.');
  res.json({ ok: true });
});

function volunteerList() {
  return all(`SELECT u.id, u.name, u.email, u.phone, u.area, v.skills, v.availability_days, v.availability_note, v.max_load, v.has_vehicle, v.bio, v.active,
      (SELECT COUNT(*) FROM assignments a WHERE a.volunteer_id = u.id AND a.status IN (${ACTIVE_ASSIGNMENT.map(() => '?').join(',')})) AS load,
      (SELECT COUNT(*) FROM assignments a WHERE a.volunteer_id = u.id AND a.status = 'completed') AS completed,
      (SELECT COUNT(*) FROM assignments a WHERE a.volunteer_id = u.id AND a.status = 'declined') AS declined
    FROM users u JOIN volunteers v ON v.user_id = u.id ORDER BY u.name`, ...ACTIVE_ASSIGNMENT)
    .map((v) => ({ ...v, skills: json(v.skills, []), availability_days: json(v.availability_days, []), active: !!v.active, has_vehicle: !!v.has_vehicle }));
}

care.get('/volunteers', (req, res) => {
  const vols = volunteerList();
  const active = all(`SELECT a.id, a.status, a.volunteer_id, a.request_id, a.last_update_at, r.category FROM assignments a JOIN requests r ON r.id = a.request_id
    WHERE a.status IN (${ACTIVE_ASSIGNMENT.map(() => '?').join(',')})`, ...ACTIVE_ASSIGNMENT);
  res.json({ volunteers: vols.map((v) => ({ ...v, assignments: active.filter((a) => a.volunteer_id === v.id).map((a) => ({ ...a, label: ASSIGNMENT_LABELS[a.status] })) })) });
});

care.get('/resources', (req, res) => {
  res.json({ resources: all('SELECT * FROM resources ORDER BY name').map((r) => ({ ...r, categories: json(r.categories, []) })) });
});

// ------------------------------------------------------------------ settings + demo controls
care.get('/settings', (req, res) => res.json({ settings: getSettings(), defaults: DEFAULT_SETTINGS }));

care.put('/settings', (req, res) => {
  const allowed = ['stale_days', 'volunteer_silent_days', 'high_urgency_unassigned_hours', 'member_followup_days', 'offer_response_hours', 'reminder_cooldown_days'];
  for (const k of allowed) {
    if (req.body?.[k] != null) {
      const v = Number(req.body[k]);
      if (!Number.isFinite(v) || v <= 0 || v > 90) return res.status(400).json({ error: `Invalid value for ${k}.` });
      setSetting(k, v);
    }
  }
  const stats = runMonitor();
  res.json({ settings: getSettings(), stats });
});

care.post('/monitor/run', (req, res) => res.json({ stats: runMonitor() }));

care.post('/demo/advance', (req, res) => {
  const days = Math.min(14, Math.max(0.25, Number(req.body?.days) || 1));
  const s = getSettings();
  setSetting('clock_offset_ms', s.clock_offset_ms + days * DAY);
  const stats = runMonitor();
  res.json({ ok: true, now: now(), stats });
});

care.post('/demo/reset', wrap(async (req, res) => {
  const email = req.user.email;
  const { seed } = await import('./seed.js');
  await seed({ quiet: true });
  const u = get('SELECT id FROM users WHERE email = ?', email);
  if (u) createSession(res, u.id); // keep the presenter signed in after a reset
  res.json({ ok: true });
}));
