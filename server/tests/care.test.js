// Run with: npm test   (uses an in-memory database with synthetic data)
process.env.HAVEASK_DB = ':memory:';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { seed } = await import('../seed.js');
const { all, get, run, setSetting } = await import('../db.js');
const { heuristicAnalyze, suggestMatches } = await import('../ai.js');
const { createRequest, assignVolunteer, respondToAssignment, updateAssignmentStatus } = await import('../services.js');
const { runMonitor, detectRisks } = await import('../monitor.js');
const { DAY, HOUR } = await import('../clock.js');

await seed({ quiet: true });
const coord = get("SELECT id FROM users WHERE email = 'care@haveask.demo'").id;
const member = get("SELECT id FROM users WHERE email = 'member@haveask.demo'").id;

test('seed gives the coordinator alerts of several kinds on login', () => {
  const rules = new Set(all("SELECT rule FROM alerts WHERE status = 'open'").map((r) => r.rule));
  for (const r of ['high_unassigned', 'volunteer_silent', 'offer_unanswered', 'safeguarding', 'needs_support']) assert.ok(rules.has(r), r);
});

test('rule-based analyzer categorizes and never down-ranks member urgency', () => {
  const a = heuristicAnalyze({ category: 'food', urgency: 'high', description: 'We have no food left and the kids are hungry.' });
  assert.equal(a.primary_category, 'food');
  assert.equal(a.suggested_urgency, 'high');
  assert.ok(!a.volunteer_brief.includes('kids are hungry'), 'brief must not quote the member');
});

test('safeguarding language is flagged and gets no volunteer suggestions', async () => {
  const id = await createRequest(member, { category: 'emotional', urgency: 'low', description: 'Honestly some days I want to end it all.', contact_method: 'phone' }, { quiet: true });
  assert.equal(get("SELECT COUNT(*) AS n FROM suggestions WHERE request_id = ? AND kind = 'volunteer'", id).n, 0);
  runMonitor();
  assert.ok(get("SELECT id FROM alerts WHERE request_id = ? AND rule = 'safeguarding'", id));
  assert.ok(!get("SELECT id FROM alerts WHERE request_id = ? AND rule = 'high_unassigned'", id));
});

test('AI only suggests; nothing is assigned until a coordinator approves', async () => {
  const id = await createRequest(member, { category: 'transportation', urgency: 'medium', description: 'Need a lift to the clinic on Monday.', contact_method: 'text' }, { quiet: true });
  assert.ok(get("SELECT COUNT(*) AS n FROM suggestions WHERE request_id = ?", id).n >= 1);
  assert.equal(get('SELECT COUNT(*) AS n FROM assignments WHERE request_id = ?', id).n, 0);
});

test('matching skips volunteers who are at capacity', () => {
  const joel = get("SELECT id FROM users WHERE email = 'joel@haveask.demo'").id; // max_load 1, already busy
  const m = suggestMatches({ category: 'food', area: 'Old Town', urgency: 'low' }, { categories: ['food'] }, { limit: 10 });
  assert.ok(!m.some((x) => x.volunteer_id === joel));
});

test('accepted assignment that goes quiet is flagged, then cleared by an update', async () => {
  const id = await createRequest(member, { category: 'food', urgency: 'low', description: 'Could someone drop off groceries?', contact_method: 'phone' }, { quiet: true });
  const vol = get("SELECT id FROM users WHERE email = 'aisha@haveask.demo'").id;
  run("UPDATE volunteers SET max_load = 5 WHERE user_id = ?", vol);
  const aid = assignVolunteer(id, vol, coord);
  respondToAssignment(aid, vol, true, null);
  setSetting('clock_offset_ms', 4 * DAY);
  runMonitor();
  assert.ok(get("SELECT id FROM alerts WHERE request_id = ? AND rule = 'volunteer_silent' AND status = 'open'", id));
  assert.ok(get("SELECT id FROM notifications WHERE user_id = ? AND type = 'reminder'", vol), 'volunteer gets a gentle reminder');
  updateAssignmentStatus(aid, vol, 'helping', 'Dropped off groceries');
  runMonitor();
  assert.ok(!get("SELECT id FROM alerts WHERE request_id = ? AND rule = 'volunteer_silent' AND status = 'open'", id));
  setSetting('clock_offset_ms', 0);
});

test('detectRisks: high urgency unassigned past threshold is critical', () => {
  const t = Date.now();
  const s = { high_urgency_unassigned_hours: 12, member_followup_days: 2, offer_response_hours: 48, volunteer_silent_days: 3, stale_days: 5 };
  const r = { category: 'food', urgency: 'high', ai: '{}', created_at: t - 13 * HOUR, last_activity_at: t - 13 * HOUR, member_name: 'Test Person', last_member_contact_at: null };
  const risks = detectRisks(r, { active: null, declined: 0, suggestions: 2 }, s, t);
  assert.equal(risks[0].rule, 'high_unassigned');
  assert.equal(risks[0].severity, 'critical');
});
