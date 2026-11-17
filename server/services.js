// Core care actions, shared by the HTTP routes, the monitor, and the seed script.
import { all, get, run, json, tx } from './db.js';
import { now } from './clock.js';
import { CATEGORIES, ACTIVE_ASSIGNMENT, ASSIGNMENT_LABELS } from './constants.js';
import { analyzeRequest, suggestMatches, suggestResources } from './ai.js';
import { firstName } from './util.js';

export function logActivity(requestId, actorId, type, message, { memberVisible = false, at = now() } = {}) {
  run('INSERT INTO activity(request_id, actor_id, type, message, member_visible, created_at) VALUES (?,?,?,?,?,?)',
    requestId, actorId ?? null, type, message, memberVisible ? 1 : 0, at);
}

export function touchRequest(requestId, at = now()) {
  run('UPDATE requests SET last_activity_at = ? WHERE id = ?', at, requestId);
}

export function notify(userId, { type, title, body = null, link = null, dedupeKey = null, at = now() }) {
  run('INSERT INTO notifications(user_id, type, title, body, link, dedupe_key, created_at) VALUES (?,?,?,?,?,?,?)',
    userId, type, title, body, link, dedupeKey, at);
}

export function careTeam() {
  return all("SELECT id, name FROM users WHERE role IN ('coordinator','admin')");
}

export function notifyCareTeam(payload) {
  for (const u of careTeam()) notify(u.id, payload);
}

/** Store AI analysis + fresh suggestions for a request. Replaces old un-acted suggestions. */
export function storeSuggestions(request, analysis, at = now()) {
  const used = all("SELECT volunteer_id FROM assignments WHERE request_id = ? AND status IN ('declined','withdrawn')", request.id).map((r) => r.volunteer_id);
  // Safeguarding concerns go to a pastor personally — never suggest delegating them to a volunteer.
  const vols = analysis?.safeguarding ? [] : suggestMatches(request, analysis, { excludeVolunteerIds: used });
  const res = suggestResources(request, analysis?.safeguarding ? { ...analysis, categories: ['emotional'] } : analysis, 1);
  run("DELETE FROM suggestions WHERE request_id = ? AND status = 'suggested'", request.id);
  for (const v of vols) {
    run("INSERT INTO suggestions(request_id, kind, volunteer_id, score, reasons, created_at) VALUES (?, 'volunteer', ?, ?, ?, ?)",
      request.id, v.volunteer_id, v.score, JSON.stringify(v.reasons), at);
  }
  for (const r of res) {
    run("INSERT INTO suggestions(request_id, kind, resource_id, score, reasons, created_at) VALUES (?, 'resource', ?, ?, ?, ?)",
      request.id, r.resource_id, r.score, JSON.stringify(r.reasons), at);
  }
  return { volunteers: vols.length, resources: res.length };
}

export async function createRequest(memberId, input, { at = now(), analysis = null, quiet = false } = {}) {
  const member = get('SELECT id, name, area FROM users WHERE id = ?', memberId);
  const result = analysis || (await analyzeRequest(input));
  const area = input.area || member?.area || null;
  const id = tx(() => {
    const r = run(`INSERT INTO requests(member_id, category, description, urgency, contact_method, contact_detail,
        followup_availability, area, status, ai, ai_source, created_at, last_activity_at)
        VALUES (?,?,?,?,?,?,?,?, 'pending', ?, ?, ?, ?)`,
      memberId, input.category, input.description, input.urgency, input.contact_method, input.contact_detail || null,
      input.followup_availability || null, area, JSON.stringify(result), result.source, at, at);
    const rid = Number(r.lastInsertRowid);
    logActivity(rid, memberId, 'submitted', 'Request submitted privately', { memberVisible: true, at });
    const cats = result.categories.map((c) => CATEGORIES[c]).join(', ');
    logActivity(rid, null, 'ai_analysis', `AI suggested categories: ${cats}. Suggested urgency: ${result.suggested_urgency}.`, { at });
    const counts = storeSuggestions({ id: rid, category: input.category, urgency: input.urgency, area }, result, at);
    if (result.safeguarding) logActivity(rid, null, 'ai_safeguarding', 'AI flagged a possible safeguarding concern — no volunteer suggestions made; a pastor should respond personally.', { at });
    else logActivity(rid, null, 'ai_suggestions', `AI suggested ${counts.volunteers} volunteer match${counts.volunteers === 1 ? '' : 'es'} and ${counts.resources} resource${counts.resources === 1 ? '' : 's'} — awaiting coordinator review.`, { at });
    return rid;
  });
  if (!quiet) {
    const high = result.suggested_urgency === 'high' || input.urgency === 'high';
    notifyCareTeam({
      type: result.safeguarding ? 'safeguarding' : 'new_request',
      title: result.safeguarding
        ? `Safeguarding concern in new request #${id}`
        : `New ${high ? 'high-urgency ' : ''}request #${id}: ${CATEGORIES[result.primary_category]}`,
      body: result.summary,
      link: `/care/requests/${id}`,
      at,
    });
  }
  return id;
}

export function activeAssignment(requestId) {
  return get(`SELECT * FROM assignments WHERE request_id = ? AND status IN (${ACTIVE_ASSIGNMENT.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 1`,
    requestId, ...ACTIVE_ASSIGNMENT);
}

/** Human-approved assignment. Withdraws any current active assignment (reassignment). */
export function assignVolunteer(requestId, volunteerId, coordinatorId, { suggestionId = null, brief = null, at = now() } = {}) {
  const request = get('SELECT * FROM requests WHERE id = ?', requestId);
  if (!request) throw httpError(404, 'Request not found.');
  if (['resolved', 'closed'].includes(request.status)) throw httpError(400, 'This request is already resolved or closed.');
  const vol = get("SELECT u.id, u.name FROM users u JOIN volunteers v ON v.user_id = u.id WHERE u.id = ? AND u.role = 'volunteer'", volunteerId);
  if (!vol) throw httpError(400, 'Volunteer not found.');
  const coordinator = coordinatorId ? get('SELECT name FROM users WHERE id = ?', coordinatorId) : null;
  const analysis = json(request.ai, {});
  const finalBrief = (brief && brief.trim()) || analysis.volunteer_brief || `Help needed: ${CATEGORIES[request.category]}.`;

  return tx(() => {
    const current = activeAssignment(requestId);
    if (current) {
      if (current.volunteer_id === volunteerId) throw httpError(400, `${vol.name} is already assigned to this request.`);
      run("UPDATE assignments SET status = 'withdrawn', last_update_at = ? WHERE id = ?", at, current.id);
      const prev = get('SELECT name FROM users WHERE id = ?', current.volunteer_id);
      notify(current.volunteer_id, {
        type: 'assignment_withdrawn', title: `Request #${requestId} has been reassigned`,
        body: 'Thank you for your care. A coordinator has passed this request to someone else — nothing more is needed from you.',
        link: '/volunteer', at,
      });
      logActivity(requestId, coordinatorId, 'reassigned', `Reassigned from ${prev?.name} to ${vol.name}`, { at });
    }
    const r = run(`INSERT INTO assignments(request_id, volunteer_id, status, assigned_by, brief, created_at, last_update_at)
      VALUES (?, ?, 'offered', ?, ?, ?, ?)`, requestId, volunteerId, coordinatorId, finalBrief, at, at);
    const aid = Number(r.lastInsertRowid);
    if (suggestionId) run("UPDATE suggestions SET status = 'approved' WHERE id = ? AND request_id = ?", suggestionId, requestId);
    run("UPDATE requests SET status = 'in_progress', last_activity_at = ? WHERE id = ?", at, requestId);
    logActivity(requestId, coordinatorId,
      'assigned', `${coordinator?.name || 'Coordinator'} ${suggestionId ? 'approved the AI-suggested match and ' : ''}offered this request to ${vol.name}`, { at });
    logActivity(requestId, coordinatorId, 'member_status', 'A care volunteer is being arranged for you', { memberVisible: true, at });
    notify(volunteerId, {
      type: 'assignment', title: `New care assignment: ${CATEGORIES[request.category]}`,
      body: `${coordinator?.name || 'The care team'} has asked if you can help. Please accept or decline when you can.`,
      link: `/volunteer/assignments/${aid}`, at,
    });
    return aid;
  });
}

export function respondToAssignment(assignmentId, volunteerId, accept, reason, at = now()) {
  const a = get('SELECT * FROM assignments WHERE id = ? AND volunteer_id = ?', assignmentId, volunteerId);
  if (!a) throw httpError(404, 'Assignment not found.');
  if (a.status !== 'offered') throw httpError(400, 'You have already responded to this assignment.');
  const vol = get('SELECT name FROM users WHERE id = ?', volunteerId);
  tx(() => {
    if (accept) {
      run("UPDATE assignments SET status = 'accepted', responded_at = ?, last_update_at = ? WHERE id = ?", at, at, a.id);
      logActivity(a.request_id, volunteerId, 'accepted', `${vol.name} accepted the assignment`, { at });
      logActivity(a.request_id, volunteerId, 'member_status', `${firstName(vol.name)} from the care team will be in touch with you`, { memberVisible: true, at });
    } else {
      run("UPDATE assignments SET status = 'declined', responded_at = ?, last_update_at = ?, decline_reason = ? WHERE id = ?", at, at, reason || null, a.id);
      run("UPDATE suggestions SET status = 'dismissed' WHERE request_id = ? AND volunteer_id = ?", a.request_id, volunteerId);
      logActivity(a.request_id, volunteerId, 'declined', `${vol.name} declined${reason ? `: “${reason}”` : ''}`, { at });
      notifyCareTeam({
        type: 'declined', title: `${vol.name} declined request #${a.request_id}`,
        body: reason ? `Reason: ${reason}. Please choose another volunteer.` : 'Please choose another volunteer.',
        link: `/care/requests/${a.request_id}`, at,
      });
      const req = get('SELECT * FROM requests WHERE id = ?', a.request_id);
      storeSuggestions(req, json(req.ai, {}), at); // refresh suggestions without this volunteer
    }
    touchRequest(a.request_id, at);
  });
}

export const VOLUNTEER_STATUSES = ['contacted', 'helping', 'needs_support', 'completed'];

export function updateAssignmentStatus(assignmentId, volunteerId, status, note, at = now()) {
  if (!VOLUNTEER_STATUSES.includes(status)) throw httpError(400, 'Unknown status.');
  const a = get('SELECT * FROM assignments WHERE id = ? AND volunteer_id = ?', assignmentId, volunteerId);
  if (!a) throw httpError(404, 'Assignment not found.');
  if (!['accepted', 'contacted', 'helping', 'needs_support'].includes(a.status)) throw httpError(400, 'This assignment is not active.');
  const vol = get('SELECT name FROM users WHERE id = ?', volunteerId);
  tx(() => {
    run('UPDATE assignments SET status = ?, last_update_at = ? WHERE id = ?', status, at, a.id);
    logActivity(a.request_id, volunteerId, 'volunteer_update',
      `${vol.name}: ${ASSIGNMENT_LABELS[status]}${note ? ` — “${note}”` : ''}`, { at });
    if (note) run('INSERT INTO notes(request_id, author_id, body, created_at) VALUES (?,?,?,?)', a.request_id, volunteerId, note, at);
    if (status === 'contacted' || status === 'helping') {
      run('UPDATE requests SET last_member_contact_at = COALESCE(last_member_contact_at, ?) WHERE id = ?', at, a.request_id);
    }
    if (status === 'helping') logActivity(a.request_id, volunteerId, 'member_status', 'Help is under way', { memberVisible: true, at });
    if (status === 'needs_support') {
      notifyCareTeam({ type: 'needs_support', title: `${vol.name} needs more support on request #${a.request_id}`, body: note || null, link: `/care/requests/${a.request_id}`, at });
    }
    if (status === 'completed') {
      notifyCareTeam({ type: 'completed', title: `${vol.name} marked request #${a.request_id} complete`, body: 'Please review and resolve the request.', link: `/care/requests/${a.request_id}`, at });
    }
    touchRequest(a.request_id, at);
  });
}

export function resolveRequest(requestId, actorId, status, note, at = now()) {
  const r = get('SELECT * FROM requests WHERE id = ?', requestId);
  if (!r) throw httpError(404, 'Request not found.');
  const actor = get('SELECT name FROM users WHERE id = ?', actorId);
  tx(() => {
    if (status === 'resolved' || status === 'closed') {
      run('UPDATE requests SET status = ?, resolved_at = ?, last_activity_at = ? WHERE id = ?', status, at, at, requestId);
      const act = activeAssignment(requestId);
      if (act) run(`UPDATE assignments SET status = ?, last_update_at = ? WHERE id = ?`, status === 'resolved' ? 'completed' : 'withdrawn', at, act.id);
      logActivity(requestId, actorId, status, `${actor?.name} marked the request ${status}${note ? ` — “${note}”` : ''}`, { at });
      if (status === 'resolved') {
        logActivity(requestId, actorId, 'member_status', 'Your request has been marked as resolved', { memberVisible: true, at });
        // Gentle, optional check-in with the member. A human-written message; AI never contacts members.
        notify(r.member_id, {
          type: 'checkin', title: 'Was the help useful?',
          body: 'Your request has been marked resolved. If you have a moment, let the care team know how it went — it’s completely optional.',
          link: `/member/requests/${requestId}`, at,
        });
      } else {
        logActivity(requestId, actorId, 'member_status', 'Your request has been closed', { memberVisible: true, at });
      }
    } else if (status === 'pending' || status === 'in_progress') {
      run('UPDATE requests SET status = ?, resolved_at = NULL, last_activity_at = ? WHERE id = ?', status, at, requestId);
      logActivity(requestId, actorId, 'reopened', `${actor?.name} reopened the request`, { at });
    } else throw httpError(400, 'Unknown status.');
    if (note) run('INSERT INTO notes(request_id, author_id, body, created_at) VALUES (?,?,?,?)', requestId, actorId, note, at);
  });
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
