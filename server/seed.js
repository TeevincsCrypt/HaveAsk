// Synthetic demo data. Every person, place, and organization here is fictional.
import { pathToFileURL } from 'node:url';
import { db, run, get, setSetting, DEFAULT_SETTINGS } from './db.js';
import { hashPassword } from './auth.js';
import { DAY, HOUR } from './clock.js';
import { heuristicAnalyze } from './ai.js';
import { createRequest, assignVolunteer, respondToAssignment, updateAssignmentStatus, resolveRequest, logActivity } from './services.js';
import { runMonitor } from './monitor.js';

export const DEMO_PASSWORD = 'demo1234';

const VOLUNTEERS = [
  { name: 'Daniel Reyes', email: 'daniel@haveask.demo', area: 'Riverside', skills: ['transportation', 'food'], days: ['mon', 'wed', 'fri', 'sat'], note: 'Evenings and Saturday mornings', max: 3, car: 1, bio: 'Retired bus driver. Happy to drive anywhere in town.' },
  { name: 'Grace Liu', email: 'volunteer@haveask.demo', area: 'Old Town', skills: ['emotional', 'childcare', 'food'], days: ['tue', 'thu', 'sat', 'sun'], note: 'Afternoons; can do short notice on weekends', max: 2, car: 0, bio: 'Leads the Tuesday prayer group. Trained in grief support.' },
  { name: 'Tom Brennan', email: 'tom@haveask.demo', area: 'Northside', skills: ['transportation', 'medical'], days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], note: 'Flexible, short notice OK', max: 3, car: 1, bio: 'Works from home; owns a wheelchair-accessible van.' },
  { name: 'Aisha Bello', email: 'aisha@haveask.demo', area: 'Eastgate', skills: ['food', 'financial'], days: ['mon', 'tue', 'wed', 'thu', 'fri'], note: 'Weekday lunchtimes', max: 2, car: 0, bio: 'Accountant. Helps with budgeting and benefit applications.' },
  { name: 'Hannah Kim', email: 'hannah@haveask.demo', area: 'Hillcrest', skills: ['childcare', 'food'], days: ['wed', 'sat', 'sun'], note: 'Weekends', max: 2, car: 1, bio: 'Primary school teacher, mum of three.' },
  { name: 'Marcus Webb', email: 'marcus@haveask.demo', area: 'Southbank', skills: ['accommodation', 'financial', 'transportation'], days: ['mon', 'tue', 'thu', 'fri'], note: 'After 5pm', max: 2, car: 1, bio: 'Property manager. Has a van for moves.' },
  { name: 'Ruth Mensah', email: 'ruth@haveask.demo', area: 'Westfield', skills: ['emotional', 'medical'], days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], note: 'Retired nurse — short notice OK', max: 3, car: 1, bio: 'Retired community nurse. Hospital visits and home check-ins.' },
  { name: 'Joel Park', email: 'joel@haveask.demo', area: 'Old Town', skills: ['food', 'transportation', 'other'], days: ['sat', 'sun'], note: 'Weekends only', max: 1, car: 1, bio: 'Youth group leader. Good with flat-pack furniture.' },
];

const MEMBERS = [
  { name: 'Sarah Thompson', email: 'member@haveask.demo', area: 'Riverside', phone: '555-0101' },
  { name: 'James Carter', email: 'james@haveask.demo', area: 'Northside', phone: '555-0102' },
  { name: 'Linda Alvarez', email: 'linda@haveask.demo', area: 'Old Town', phone: '555-0103' },
  { name: 'Peter Novak', email: 'peter@haveask.demo', area: 'Southbank', phone: '555-0104' },
  { name: 'Esther Nwosu', email: 'esther@haveask.demo', area: 'Hillcrest', phone: '555-0105' },
  { name: 'Michael Grant', email: 'michael@haveask.demo', area: 'Westfield', phone: '555-0106' },
  { name: 'Olivia Brooks', email: 'olivia@haveask.demo', area: 'Eastgate', phone: '555-0107' },
  { name: 'Frank Whitaker', email: 'frank@haveask.demo', area: 'Old Town', phone: '555-0108' },
  { name: 'Naomi Fischer', email: 'naomi@haveask.demo', area: 'Riverside', phone: '555-0109' },
  { name: 'Ben Okoro', email: 'ben@haveask.demo', area: 'Eastgate', phone: '555-0110' },
];

const RESOURCES = [
  { name: 'Riverside Community Pantry', categories: ['food'], area: 'Riverside', contact: '555-0200', hours: 'Tue & Fri 10am–2pm', description: 'Free groceries, no referral needed. Fictional demo resource.' },
  { name: 'Eastgate Family Hub', categories: ['childcare', 'financial'], area: 'Eastgate', contact: '555-0201', hours: 'Weekdays 9am–5pm', description: 'After-school club and benefits advice drop-in.' },
  { name: 'Old Town Housing Advice Line', categories: ['accommodation', 'financial'], area: 'Old Town', contact: '555-0202', hours: 'Weekdays 9am–7pm', description: 'Tenancy rights, emergency housing referrals.' },
  { name: 'Northside Volunteer Drivers', categories: ['transportation', 'medical'], area: 'Northside', contact: '555-0203', hours: 'Book 48h ahead', description: 'Free rides to medical appointments for over-60s.' },
  { name: 'Hope Listening Line', categories: ['emotional'], area: null, contact: '555-0204', hours: '24/7', description: 'Confidential listening service. Fictional demo resource.' },
];

// Hand-written AI analysis for seeded requests, so the demo reads naturally.
const A = (input, extra) => ({ ...heuristicAnalyze(input), ...extra, source: 'demo' });

export async function seed({ quiet = false } = {}) {
  db.exec(`DELETE FROM notifications; DELETE FROM alerts; DELETE FROM feedback; DELETE FROM activity; DELETE FROM notes;
    DELETE FROM payments; DELETE FROM assignments; DELETE FROM suggestions; DELETE FROM requests; DELETE FROM resources;
    DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE privy_id IS NULL);
    DELETE FROM volunteers WHERE user_id IN (SELECT id FROM users WHERE privy_id IS NULL);
    DELETE FROM users WHERE privy_id IS NULL;`);
  // Real (Privy) accounts are kept; only the synthetic people and their data are replaced.
  setSetting('clock_offset_ms', 0);

  const T = Date.now();
  const pw = hashPassword(DEMO_PASSWORD);
  const user = (name, email, role, area = null, phone = null) =>
    get('SELECT id FROM users WHERE email = ?', email)?.id
    ?? Number(run('INSERT INTO users(name, email, password_hash, role, area, phone, created_at) VALUES (?,?,?,?,?,?,?)', name, email, pw, role, area, phone, T - 120 * DAY).lastInsertRowid);

  const coord = user('Pastor Miriam Hale', 'care@haveask.demo', 'coordinator', 'Old Town', '555-0001');
  user('Rev. Samuel Osei', 'pastor@haveask.demo', 'admin', 'Old Town', '555-0002');

  const V = {};
  for (const v of VOLUNTEERS) {
    const id = user(v.name, v.email, 'volunteer', v.area, `555-03${String(Object.keys(V).length + 10)}`);
    run('INSERT OR IGNORE INTO volunteers(user_id, skills, availability_days, availability_note, max_load, has_vehicle, bio) VALUES (?,?,?,?,?,?,?)',
      id, JSON.stringify(v.skills), JSON.stringify(v.days), v.note, v.max, v.car, v.bio);
    V[v.name.split(' ')[0]] = id;
  }
  const M = {};
  for (const m of MEMBERS) M[m.name.split(' ')[0]] = user(m.name, m.email, 'member', m.area, m.phone);
  for (const r of RESOURCES) run('INSERT INTO resources(name, categories, area, contact, hours, description) VALUES (?,?,?,?,?,?)', r.name, JSON.stringify(r.categories), r.area, r.contact, r.hours, r.description);

  const req = async (member, input, ago, analysis) => {
    const at = T - ago;
    const full = { contact_method: 'phone', ...input };
    return createRequest(member, full, { at, quiet: true, analysis: A(full, analysis) });
  };
  const sugg = (rid, vid) => get("SELECT id FROM suggestions WHERE request_id = ? AND volunteer_id = ?", rid, vid)?.id || null;
  const assign = (rid, vid, at) => assignVolunteer(rid, vid, coord, { suggestionId: sugg(rid, vid), at: T - at });
  const contacted = (rid, at, by = coord, note) => {
    run('UPDATE requests SET last_member_contact_at = ?, last_activity_at = MAX(last_activity_at, ?) WHERE id = ?', T - at, T - at, rid);
    logActivity(rid, by, 'member_contacted', `Pastor Miriam Hale contacted the member${note ? ` — “${note}”` : ''}`, { at: T - at });
    logActivity(rid, by, 'member_status', 'The care team has been in touch with you', { memberVisible: true, at: T - at });
  };
  const note = (rid, author, body, at) => run('INSERT INTO notes(request_id, author_id, body, created_at) VALUES (?,?,?,?)', rid, author, body, T - at);

  // ---- Resolved history (gives the dashboard some past) ----
  const h1 = await req(M.Sarah, { category: 'transportation', urgency: 'medium', description: 'I need a lift to the hospital for a scan on Thursday morning. My car is in the garage.', contact_method: 'text', contact_detail: '555-0101' }, 24 * DAY,
    { summary: 'One-off lift to a hospital scan on Thursday morning.', key_needs: ['Lift to hospital Thursday morning', 'Return trip'], volunteer_brief: 'One-off lift to the hospital Thursday morning and back home in Riverside.' });
  assign(h1, V.Daniel, 23.8 * DAY); respondToAssignment(get('SELECT id FROM assignments WHERE request_id=?', h1).id, V.Daniel, true, null, T - 23.5 * DAY);
  updateAssignmentStatus(get('SELECT id FROM assignments WHERE request_id=?', h1).id, V.Daniel, 'contacted', 'Arranged pickup at 8:15.', T - 23 * DAY);
  updateAssignmentStatus(get('SELECT id FROM assignments WHERE request_id=?', h1).id, V.Daniel, 'completed', 'Drove there and back. Scan went fine.', T - 21 * DAY);
  resolveRequest(h1, coord, 'resolved', null, T - 20.5 * DAY);
  run("INSERT INTO feedback(request_id, rating, comment, created_at) VALUES (?, 'yes', 'Daniel was so kind and on time. Thank you!', ?)", h1, T - 20 * DAY);

  const h2 = await req(M.James, { category: 'food', urgency: 'medium', description: 'Between pay cheques and the cupboards are bare. Could someone help with a week of groceries for two?' }, 34 * DAY,
    { summary: 'One week of groceries for two people while between pay cheques.', key_needs: ['Groceries for one week', 'Household of two'], volunteer_brief: 'Drop off a week of groceries for two adults in Northside.' });
  assign(h2, V.Aisha, 33.5 * DAY); const h2a = get('SELECT id FROM assignments WHERE request_id=?', h2).id;
  respondToAssignment(h2a, V.Aisha, true, null, T - 33 * DAY); updateAssignmentStatus(h2a, V.Aisha, 'completed', 'Delivered groceries and pantry info.', T - 31 * DAY);
  resolveRequest(h2, coord, 'resolved', null, T - 30 * DAY);
  run("INSERT INTO feedback(request_id, rating, comment, created_at) VALUES (?, 'yes', NULL, ?)", h2, T - 29 * DAY);

  const h3 = await req(M.Esther, { category: 'medical', urgency: 'low', description: 'Could someone collect my prescription from the pharmacy on Friday? I am on night shifts all week.' }, 14 * DAY,
    { summary: 'Collect a prescription on Friday while member works night shifts.', key_needs: ['Prescription pickup Friday'], volunteer_brief: 'Collect a prescription from the pharmacy on Friday and drop it at the member’s home in Hillcrest.' });
  assign(h3, V.Tom, 13.8 * DAY); const h3a = get('SELECT id FROM assignments WHERE request_id=?', h3).id;
  respondToAssignment(h3a, V.Tom, true, null, T - 13.5 * DAY); updateAssignmentStatus(h3a, V.Tom, 'completed', 'Done.', T - 12.5 * DAY);
  resolveRequest(h3, coord, 'resolved', null, T - 12 * DAY);

  const h4 = await req(M.Linda, { category: 'other', urgency: 'low', description: 'Could someone help me set up my new phone so I can join the online services?' }, 18 * DAY,
    { summary: 'Help setting up a new phone to join online services.', key_needs: ['Phone setup', 'Join livestream'], volunteer_brief: 'Help set up a new phone and show how to join the online service.' });
  resolveRequest(h4, coord, 'closed', 'Her grandson helped in the end — no longer needed.', T - 16 * DAY);

  // ---- Open requests: a realistic mix for the coordinator to see on login ----

  // 1) HIGH URGENCY, NO VOLUNTEER (critical alert). AI suggestions waiting for approval.
  const r1 = await req(M.Sarah, {
    category: 'food', urgency: 'high', contact_method: 'phone', contact_detail: '555-0101', followup_availability: 'Evenings after 6pm',
    description: 'I was laid off two weeks ago and our food runs out this week. I have two kids (6 and 9). Any help with groceries would mean a lot — I can’t get to the pantry because it is only open while I’m at job interviews.',
  }, 19 * HOUR, {
    summary: 'Single parent recently laid off; food runs out this week for a household with two children.',
    key_needs: ['Groceries for a family of three this week', 'Pantry hours clash with job interviews', 'Possible longer-term budgeting help'],
    urgency_signals: ['Food runs out this week', 'Children in household', 'Recent job loss'], suggested_urgency: 'high',
    volunteer_brief: 'Deliver groceries for a family of three (two school-age children) in Riverside this week, ideally in the evening.',
  });

  // 2) VOLUNTEER ACCEPTED BUT WENT QUIET (warning alert + member never contacted)
  const r2 = await req(M.James, {
    category: 'transportation', urgency: 'medium', followup_availability: 'Weekday mornings',
    description: 'I had knee surgery last month and can’t drive for six weeks. I need rides to physiotherapy on Tuesdays and Thursdays at 10am at the Northside clinic.',
  }, 7 * DAY, {
    summary: 'Twice-weekly rides to physiotherapy for six weeks after knee surgery.',
    key_needs: ['Rides Tue & Thu 10am to Northside clinic', 'Six-week period', 'Limited mobility'],
    urgency_signals: ['Recent surgery', 'Limited mobility'], suggested_urgency: 'medium',
    volunteer_brief: 'Recurring lifts on Tuesday and Thursday mornings to a physiotherapy clinic in Northside; member has limited mobility after surgery.',
  });
  assign(r2, V.Daniel, 6.5 * DAY);
  respondToAssignment(get('SELECT id FROM assignments WHERE request_id=?', r2).id, V.Daniel, true, null, T - 6 * DAY);

  // 3) NEW: AI suggestions awaiting review
  const r3 = await req(M.Linda, {
    category: 'emotional', urgency: 'medium', contact_method: 'in_person', followup_availability: 'After the Sunday service',
    description: 'My husband passed away last month. The days are fine but the evenings are very lonely. I would love someone to visit for a cup of tea now and then, or to pray with.',
  }, 22 * HOUR, {
    summary: 'Recently widowed member feeling lonely in the evenings; would value regular visits and prayer.',
    key_needs: ['Regular friendly visits', 'Someone to pray with', 'Evening loneliness'],
    urgency_signals: ['Recent bereavement', 'Isolation'], suggested_urgency: 'medium',
    volunteer_brief: 'Occasional friendly visits for tea and prayer with a recently bereaved member in Old Town.',
  });

  // 4) OFFERED, VOLUNTEER HASN'T RESPONDED (warning/critical)
  const r4 = await req(M.Peter, {
    category: 'accommodation', urgency: 'high', contact_method: 'email', contact_detail: 'peter@haveask.demo',
    description: 'My landlord is selling the flat and I have to move out in two weeks. I haven’t found anywhere yet and I don’t have anyone to help me move my things.',
  }, 3.2 * DAY, {
    summary: 'Must leave rented flat within two weeks; no new home found and no help to move.',
    key_needs: ['Help finding new accommodation', 'Help moving belongings', 'Tenancy advice'],
    urgency_signals: ['Risk of losing housing', 'Two-week deadline'], suggested_urgency: 'high',
    volunteer_brief: 'Support with house-hunting and moving belongings within two weeks; member in Southbank.',
  });
  assign(r4, V.Marcus, 3 * DAY);
  contacted(r4, 2.9 * DAY, coord, 'Called Peter, let him know Marcus may help. Shared housing advice line.');

  // 5) DECLINED, STILL UNASSIGNED AFTER 9 DAYS (warning)
  const r5 = await req(M.Esther, {
    category: 'childcare', urgency: 'low', followup_availability: 'Weekday afternoons',
    description: 'I’ve picked up Saturday morning nursing shifts for the next month. I need someone to watch my two kids (4 and 7) from 7am to 1pm on Saturdays.',
  }, 9 * DAY, {
    summary: 'Saturday-morning childcare for two young children for one month.',
    key_needs: ['Childcare Saturdays 7am–1pm', 'Two children aged 4 and 7', 'Four weeks'],
    urgency_signals: [], suggested_urgency: 'low',
    volunteer_brief: 'Saturday-morning childcare (7am–1pm) for two young children in Hillcrest for the next four weeks.',
  });
  contacted(r5, 8.5 * DAY);
  assign(r5, V.Hannah, 8.5 * DAY);
  respondToAssignment(get('SELECT id FROM assignments WHERE request_id=?', r5).id, V.Hannah, false, 'Away visiting family for three weeks — so sorry.', T - 7.8 * DAY);

  // 6) HEALTHY: volunteer actively helping
  const r6 = await req(M.Michael, {
    category: 'medical', urgency: 'medium',
    description: 'I’m recovering from chemo and too tired to get to the pharmacy. Could someone pick up my prescriptions each week for the next month?',
  }, 4 * DAY, {
    summary: 'Weekly prescription pickups for a month during chemotherapy recovery.',
    key_needs: ['Weekly prescription pickup', 'Four weeks'], urgency_signals: ['Ongoing medical treatment'], suggested_urgency: 'medium',
    volunteer_brief: 'Collect prescriptions weekly from the pharmacy and drop them off at the member’s home in Westfield.',
  });
  assign(r6, V.Ruth, 3.8 * DAY); const r6a = get('SELECT id FROM assignments WHERE request_id=?', r6).id;
  respondToAssignment(r6a, V.Ruth, true, null, T - 3.6 * DAY);
  updateAssignmentStatus(r6a, V.Ruth, 'contacted', 'Spoke with Michael. Pickups on Mondays.', T - 3.4 * DAY);
  updateAssignmentStatus(r6a, V.Ruth, 'helping', 'First pickup done, he is in good spirits.', T - 1 * DAY);

  // 7) HEALTHY: financial help, contacted yesterday
  const r7 = await req(M.Olivia, {
    category: 'financial', urgency: 'medium', contact_method: 'text', contact_detail: '555-0107',
    description: 'I received a disconnection notice for my electricity bill — it will be cut off next Friday. I’d like help working out a payment plan with the supplier.',
  }, 2 * DAY, {
    summary: 'Electricity disconnection notice for next Friday; wants help arranging a payment plan.',
    key_needs: ['Payment plan with energy supplier', 'Avoid disconnection next Friday'], urgency_signals: ['Utility disconnection risk', 'One-week deadline'], suggested_urgency: 'medium',
    volunteer_brief: 'Help the member contact their energy supplier to set up a payment plan before next Friday.',
  });
  assign(r7, V.Aisha, 1.8 * DAY); const r7a = get('SELECT id FROM assignments WHERE request_id=?', r7).id;
  respondToAssignment(r7a, V.Aisha, true, null, T - 1.6 * DAY);
  updateAssignmentStatus(r7a, V.Aisha, 'contacted', 'Texted Olivia, meeting Thursday lunchtime to call the supplier together.', T - 1 * DAY);

  // 8) VOLUNTEER NEEDS MORE SUPPORT (warning)
  const r8 = await req(M.Frank, {
    category: 'food', urgency: 'low',
    description: 'I’m 84 and can’t carry heavy shopping up the stairs anymore. A hand with a weekly grocery shop would be wonderful.',
  }, 12 * DAY, {
    summary: 'Elderly member needs help with weekly grocery shopping and carrying it upstairs.',
    key_needs: ['Weekly grocery shop', 'Carry shopping upstairs'], urgency_signals: ['Mobility or age-related vulnerability'], suggested_urgency: 'low',
    volunteer_brief: 'Weekly grocery shop for an elderly member in Old Town, including carrying bags up the stairs.',
  });
  assign(r8, V.Joel, 11.5 * DAY); const r8a = get('SELECT id FROM assignments WHERE request_id=?', r8).id;
  respondToAssignment(r8a, V.Joel, true, null, T - 11 * DAY);
  updateAssignmentStatus(r8a, V.Joel, 'contacted', 'Met Frank, lovely man.', T - 10.5 * DAY);
  updateAssignmentStatus(r8a, V.Joel, 'helping', 'Did the first two shops.', T - 4 * DAY);
  updateAssignmentStatus(r8a, V.Joel, 'needs_support', 'I can only do weekends and Frank is running low midweek. Could someone else cover Wednesdays?', T - 1.2 * DAY);

  // 9) SAFEGUARDING (critical) — shows the AI routes this to a pastor, never a volunteer
  await req(M.Naomi, {
    category: 'emotional', urgency: 'medium', contact_method: 'phone', followup_availability: 'Any time',
    description: 'I’ve been feeling really low since losing my job and sometimes I think about hurting myself. I don’t really know who to talk to.',
  }, 5 * HOUR, {
    summary: 'Member feeling very low after job loss and mentions thoughts of self-harm.',
    key_needs: ['Personal pastoral contact', 'Someone to talk to', 'Signposting to professional support'],
    urgency_signals: ['Mentions thoughts of self-harm', 'Recent job loss'], safeguarding: true,
  });

  // 10) BRAND NEW, low urgency
  await req(M.Ben, {
    category: 'other', urgency: 'low', contact_method: 'text', contact_detail: '555-0110', followup_availability: 'Weekends',
    description: 'We were given a bed frame for my son but I can’t assemble it on my own. Could someone with tools help one Saturday?',
  }, 40 * 60 * 1000, {
    categories: ['other'], primary_category: 'other', summary: 'Help assembling a donated bed frame on a Saturday.',
    key_needs: ['Assemble bed frame', 'Bring tools'], urgency_signals: [], suggested_urgency: 'low',
    volunteer_brief: 'Assemble a donated bed frame for a child on a Saturday in Eastgate; bring basic tools.',
  });

  note(r2, coord, 'Daniel said he would sort out a regular schedule with James — need to confirm it actually started.', 6 * DAY);
  note(r5, coord, 'Esther is flexible on the first Saturday if needed.', 8.4 * DAY);

  // Older notifications are marked read so the bell shows what's actually new.
  run('UPDATE notifications SET read = 1 WHERE created_at < ?', T - 2 * DAY);

  const stats = runMonitor();
  if (!quiet) {
    console.log(`Seeded demo data. Monitor: ${JSON.stringify(stats)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seed();
}
