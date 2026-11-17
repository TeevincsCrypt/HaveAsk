// Unresolved Request Detection — the heart of HaveAsk.
// Continuously scans open requests for signs they may be quietly slipping through the cracks,
// raises an alert for the care coordinator with a short summary and a recommended next action,
// and sends gentle, rate-limited reminders. It never assigns, reassigns or contacts members itself.
import { all, get, run, json, getSettings, tx } from './db.js';
import { now, DAY, HOUR } from './clock.js';
import { CATEGORIES, ACTIVE_ASSIGNMENT } from './constants.js';
import { notify, notifyCareTeam } from './services.js';
import { ago, firstName } from './util.js';

export const RULES = {
  safeguarding: 'Possible safeguarding concern',
  high_unassigned: 'High urgency, no volunteer',
  offer_unanswered: 'Volunteer hasn’t responded',
  volunteer_silent: 'No progress update from volunteer',
  needs_support: 'Volunteer asked for more support',
  no_member_contact: 'Member hasn’t heard from anyone',
  unassigned_aging: 'Waiting for a volunteer',
  stale: 'No activity on request',
};

/** Pure function: given a request + context, return the risk conditions currently true. */
export function detectRisks(r, ctx, s, t) {
  const out = [];
  const ai = json(r.ai, {});
  const age = t - r.created_at;
  const sinceActivity = t - r.last_activity_at;
  const member = firstName(r.member_name);
  const cat = CATEGORIES[r.category].toLowerCase();
  const high = r.urgency === 'high' || ai.suggested_urgency === 'high';
  const active = ctx.active; // most recent active assignment or null

  if (ai.safeguarding && !r.last_member_contact_at) {
    out.push({
      rule: 'safeguarding', severity: 'critical', since: r.created_at,
      summary: `AI flagged language in this ${cat} request that may indicate risk. No one has spoken with ${member} yet.`,
      action: 'Pastor to reach out personally today',
    });
  }

  // Safeguarding requests belong to a pastor, not a volunteer — don't nag to assign one.
  if (!active && !ai.safeguarding) {
    if (high && age > s.high_urgency_unassigned_hours * HOUR) {
      out.push({
        rule: 'high_unassigned', severity: 'critical', since: r.created_at + s.high_urgency_unassigned_hours * HOUR,
        summary: `High-urgency ${cat} request has waited ${ago(age)} with no volunteer assigned${ctx.declined ? ` (${ctx.declined} declined)` : ''}.`,
        action: ctx.suggestions ? 'Review AI-suggested matches and assign today' : 'Assign a volunteer or connect to a community resource',
      });
    } else if (!high && age > Math.max(s.member_followup_days + 1, 3) * DAY) {
      out.push({
        rule: 'unassigned_aging', severity: 'warning', since: r.created_at + Math.max(s.member_followup_days + 1, 3) * DAY,
        summary: `${CATEGORIES[r.category]} request open ${ago(age)} with no volunteer${ctx.declined ? ` — ${ctx.declined} volunteer${ctx.declined > 1 ? 's' : ''} declined` : ''}.`,
        action: ctx.declined ? 'Reassign to another volunteer' : 'Assign a volunteer',
      });
    }
  } else if (active && active.status === 'offered' && t - active.created_at > s.offer_response_hours * HOUR) {
    out.push({
      rule: 'offer_unanswered', severity: high ? 'critical' : 'warning', assignment_id: active.id, since: active.created_at + s.offer_response_hours * HOUR,
      summary: `${active.vol_name} was asked ${ago(t - active.created_at)} ago and hasn’t accepted or declined.`,
      action: `Call ${firstName(active.vol_name)} to confirm, or reassign`,
    });
  } else if (active && active.status === 'needs_support') {
    out.push({
      rule: 'needs_support', severity: 'warning', assignment_id: active.id, since: active.last_update_at,
      summary: `${active.vol_name} reported this ${cat} request needs more support than they can give.`,
      action: 'Add a second volunteer or escalate to a pastor',
    });
  } else if (active && ['accepted', 'contacted', 'helping'].includes(active.status) && t - active.last_update_at > s.volunteer_silent_days * DAY) {
    out.push({
      rule: 'volunteer_silent', severity: high ? 'critical' : 'warning', assignment_id: active.id, since: active.last_update_at + s.volunteer_silent_days * DAY,
      summary: `${active.vol_name} ${active.status === 'accepted' ? 'accepted' : 'last updated'} ${ago(t - active.last_update_at)} ago and hasn’t posted progress since.`,
      action: `Check in with ${firstName(active.vol_name)}`,
    });
  }

  if (!r.last_member_contact_at && age > s.member_followup_days * DAY && !out.some((o) => o.rule === 'safeguarding')) {
    out.push({
      rule: 'no_member_contact', severity: 'warning', since: r.created_at + s.member_followup_days * DAY,
      summary: `${member} asked for help ${ago(age)} ago and there is no record of anyone contacting them.`,
      action: `Contact ${member} to let them know they’ve been heard`,
    });
  }

  if (!out.length && sinceActivity > s.stale_days * DAY) {
    out.push({
      rule: 'stale', since: r.last_activity_at + s.stale_days * DAY, severity: sinceActivity > 2 * s.stale_days * DAY ? 'critical' : 'warning',
      summary: `No updates of any kind for ${ago(sinceActivity)}.`,
      action: active ? `Check in with ${firstName(active.vol_name)}` : 'Contact member and decide next step',
    });
  }
  return out;
}

export function runMonitor() {
  const t = now();
  const s = getSettings();
  const stats = { scanned: 0, created: 0, updated: 0, cleared: 0, reminders: 0 };

  tx(() => {
    // Close out alerts on requests that are no longer open.
    stats.cleared += Number(run(`UPDATE alerts SET status = 'resolved', resolved_at = ?, resolved_reason = 'Request resolved or closed', updated_at = ?
      WHERE status != 'resolved' AND request_id IN (SELECT id FROM requests WHERE status IN ('resolved','closed'))`, t, t).changes);

    const open = all(`SELECT r.*, u.name AS member_name FROM requests r JOIN users u ON u.id = r.member_id WHERE r.status IN ('pending','in_progress')`);
    for (const r of open) {
      stats.scanned++;
      const active = get(`SELECT a.*, u.name AS vol_name FROM assignments a JOIN users u ON u.id = a.volunteer_id
        WHERE a.request_id = ? AND a.status IN (${ACTIVE_ASSIGNMENT.map(() => '?').join(',')}) ORDER BY a.id DESC LIMIT 1`, r.id, ...ACTIVE_ASSIGNMENT) || null;
      const declined = get("SELECT COUNT(*) AS n FROM assignments WHERE request_id = ? AND status = 'declined'", r.id).n;
      const suggestions = get("SELECT COUNT(*) AS n FROM suggestions WHERE request_id = ? AND status = 'suggested' AND kind = 'volunteer'", r.id).n;
      const risks = detectRisks(r, { active, declined, suggestions }, s, t);

      const existing = all("SELECT * FROM alerts WHERE request_id = ? AND status != 'resolved'", r.id);
      const keep = new Set();
      for (const risk of risks) {
        const match = existing.find((e) => e.rule === risk.rule && (e.assignment_id ?? null) === (risk.assignment_id ?? null));
        if (match) {
          keep.add(match.id);
          const wake = match.status === 'snoozed' && match.snoozed_until && match.snoozed_until <= t;
          run(`UPDATE alerts SET summary = ?, recommended_action = ?, severity = ?, updated_at = ?, status = ?, snoozed_until = ? WHERE id = ?`,
            risk.summary, risk.action, risk.severity, t, wake ? 'open' : match.status, wake ? null : match.snoozed_until, match.id);
          stats.updated++;
        } else {
          const ins = run(`INSERT INTO alerts(request_id, assignment_id, rule, severity, summary, recommended_action, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?)`, r.id, risk.assignment_id ?? null, risk.rule, risk.severity, risk.summary, risk.action, Math.min(t, Math.round(risk.since ?? t)), t);
          stats.created++;
          notifyCareTeam({
            type: 'alert', title: `${risk.severity === 'critical' ? 'Urgent: ' : ''}${RULES[risk.rule]} — request #${r.id}`,
            body: `${risk.summary} Suggested next step: ${risk.action}.`,
            link: `/care/requests/${r.id}`, dedupeKey: `alert:${ins.lastInsertRowid}`, at: t,
          });
        }
      }
      for (const e of existing) {
        if (!keep.has(e.id)) {
          run("UPDATE alerts SET status = 'resolved', resolved_at = ?, resolved_reason = 'Condition cleared', updated_at = ? WHERE id = ?", t, t, e.id);
          stats.cleared++;
        }
      }
    }

    stats.reminders += sendVolunteerReminders(t, s);
  });
  return stats;
}

/** Gentle reminders to volunteers — at most one per assignment per cooldown window. */
function sendVolunteerReminders(t, s) {
  let sent = 0;
  const cooldown = s.reminder_cooldown_days * DAY;
  const rows = all(`SELECT a.*, r.category FROM assignments a JOIN requests r ON r.id = a.request_id
    WHERE a.status IN ('offered','accepted','contacted','helping') AND r.status IN ('pending','in_progress')`);
  for (const a of rows) {
    const quiet = t - a.last_update_at;
    const due = a.status === 'offered' ? quiet > (s.offer_response_hours / 2) * HOUR : quiet > s.volunteer_silent_days * DAY;
    if (!due) continue;
    const key = `remind:${a.id}`;
    const last = get('SELECT MAX(created_at) AS at FROM notifications WHERE dedupe_key = ?', key)?.at;
    if (last && t - last < cooldown) continue;
    const cat = CATEGORIES[a.category].toLowerCase();
    notify(a.volunteer_id, a.status === 'offered'
      ? { type: 'reminder', title: 'A care request is waiting for your reply', body: `When you have a moment, please let us know whether you can help with this ${cat} request. It’s completely fine to decline.`, link: `/volunteer/assignments/${a.id}`, dedupeKey: key, at: t }
      : { type: 'reminder', title: 'Gentle check-in on your assignment', body: `Thank you for helping with this ${cat} request. Could you share a quick update when you get a chance? If you need support, just say so.`, link: `/volunteer/assignments/${a.id}`, dedupeKey: key, at: t });
    sent++;
  }
  return sent;
}

let timer = null;
export function startMonitor(intervalMs = 60_000) {
  try { runMonitor(); } catch (e) { console.error('[monitor]', e); }
  timer = setInterval(() => { try { runMonitor(); } catch (e) { console.error('[monitor]', e); } }, intervalMs);
  timer.unref?.();
}
