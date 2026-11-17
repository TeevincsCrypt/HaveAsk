// AI layer: categorization, need extraction, and volunteer/resource matching.
//
// Responsible-AI guardrails baked in here:
//  - Output is ALWAYS a suggestion. Nothing in this module assigns, contacts, or notifies anyone.
//  - If ANTHROPIC_API_KEY is configured, Claude analyzes the request text; otherwise (or on any
//    error/timeout) a transparent rule-based analyzer is used, so the app always works offline.
//  - Matching is a deterministic, explainable score so coordinators can see *why* a match is suggested.
import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES, AREAS, distanceKm, ACTIVE_ASSIGNMENT, DAYS } from './constants.js';
import { all, json } from './db.js';

const MODEL = process.env.HAVEASK_MODEL || 'claude-opus-5-5';
const CATEGORY_KEYS = Object.keys(CATEGORIES);

// ---------------------------------------------------------------- rule-based analyzer
const KEYWORDS = {
  food: ['food', 'groceries', 'grocery', 'meal', 'meals', 'hungry', 'eat', 'pantry', 'fridge', 'cook', 'formula', 'nappies', 'diapers'],
  accommodation: ['housing', 'rent', 'evict', 'eviction', 'homeless', 'shelter', 'place to stay', 'roof', 'landlord', 'sleep', 'accommodation', 'room', 'move out', 'moving'],
  medical: ['doctor', 'hospital', 'medical', 'medication', 'medicine', 'prescription', 'surgery', 'appointment', 'clinic', 'pharmacy', 'recovering', 'recovery', 'injury', 'sick', 'illness', 'chemo', 'diagnosis'],
  transportation: ['ride', 'lift', 'drive', 'transport', 'car', 'bus', 'appointment', 'pick up', 'pickup', 'drop off', 'airport', 'get to'],
  emotional: ['lonely', 'alone', 'grief', 'grieving', 'loss', 'passed away', 'died', 'depressed', 'anxious', 'anxiety', 'struggling', 'overwhelmed', 'pray', 'prayer', 'talk to', 'isolated', 'sad', 'stress', 'funeral'],
  financial: ['money', 'bill', 'bills', 'rent', 'debt', 'job', 'unemployed', 'laid off', 'pay', 'electric', 'utility', 'budget', 'afford', 'income', 'loan'],
  childcare: ['child', 'children', 'kids', 'baby', 'babysit', 'childcare', 'school run', 'nursery', 'son', 'daughter', 'toddler'],
};

const URGENCY_SIGNALS = [
  { re: /\b(tonight|today|right now|immediately|asap|urgent|emergency)\b/i, label: 'Time-critical language', weight: 2 },
  { re: /\b(evict\w*|homeless|nowhere to (stay|sleep|go)|on the street)\b/i, label: 'Risk of losing housing', weight: 3 },
  { re: /\b(no food|nothing to eat|haven'?t eaten|empty fridge|run out of food)\b/i, label: 'No food available', weight: 3 },
  { re: /\b(shut ?off|disconnect\w*|cut off)\b/i, label: 'Utility disconnection risk', weight: 2 },
  { re: /\b(hospital|surgery|discharged?|chemo)\b/i, label: 'Recent or upcoming medical event', weight: 1 },
  { re: /\b(alone|nobody|no one|isolated)\b/i, label: 'Limited support network', weight: 1 },
  { re: /\b(baby|newborn|infant|pregnan\w*)\b/i, label: 'Infant or pregnancy involved', weight: 1 },
  { re: /\b(elderly|wheelchair|disab\w*|mobility)\b/i, label: 'Mobility or age-related vulnerability', weight: 1 },
];

// Phrases that require a pastor's immediate personal attention. We never auto-respond to these;
// we only surface them to humans.
const SAFEGUARDING = /\b(suicid\w*|kill(ing)? myself|end it all|self[- ]harm\w*|hurt(ing)? myself|harm(ing)? myself|don'?t want to (live|be here)|unsafe at home|abus\w*|violent|domestic violence)\b/i;

function splitSentences(text) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

export function heuristicAnalyze({ category, description, urgency }) {
  const text = `${description}`.toLowerCase();
  const scores = {};
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    scores[cat] = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
  }
  if (category && category !== 'other') scores[category] = (scores[category] || 0) + 2;
  const ranked = Object.entries(scores).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  let categories = ranked.slice(0, 3).map(([c]) => c);
  if (!categories.length) categories = [category || 'other'];
  // Keep the member's own choice in the list, first if they chose something specific.
  if (category && category !== 'other') categories = [category, ...categories.filter((c) => c !== category)].slice(0, 3);

  const signals = URGENCY_SIGNALS.filter((s) => s.re.test(description));
  const weight = signals.reduce((n, s) => n + s.weight, 0);
  let suggested = weight >= 3 ? 'high' : weight >= 1 ? 'medium' : 'low';
  const order = { low: 0, medium: 1, high: 2 };
  if (order[urgency] > order[suggested]) suggested = urgency; // never down-rank what the member told us

  const sentences = splitSentences(description);
  const needWords = Object.values(KEYWORDS).flat();
  const keyNeeds = sentences
    .filter((s) => needWords.some((w) => s.toLowerCase().includes(w)) || /\b(need|help|could|would|can someone)\b/i.test(s))
    .slice(0, 3)
    .map((s) => (s.length > 110 ? s.slice(0, 107) + '…' : s));

  const safeguarding = SAFEGUARDING.test(description);
  const label = categories.map((c) => CATEGORIES[c].toLowerCase()).join(' and ');
  const summary = `Request for ${label}${signals.length ? ` with ${signals.map((s) => s.label.toLowerCase()).slice(0, 2).join(' and ')}` : ''}.`;

  return {
    categories,
    primary_category: categories[0],
    summary,
    key_needs: keyNeeds.length ? keyNeeds : [sentences[0] || description.slice(0, 100)],
    urgency_signals: signals.map((s) => s.label),
    suggested_urgency: safeguarding ? 'high' : suggested,
    safeguarding,
    safeguarding_note: safeguarding
      ? 'Language suggests the person may be at risk. A pastor should reach out personally and share crisis-line details. Do not delegate to a volunteer.'
      : null,
    // Need-to-know only: never quote the member's own words here; they are shared after the volunteer accepts.
    volunteer_brief: `Practical help needed with ${label}${signals.length ? ` (${signals.map((x) => x.label.toLowerCase()).slice(0, 2).join('; ')})` : ''}. Full details are shared once you accept.`,
    source: 'rules',
  };
}

// ---------------------------------------------------------------- Claude analyzer
const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    categories: { type: 'array', items: { type: 'string', enum: CATEGORY_KEYS } },
    summary: { type: 'string' },
    key_needs: { type: 'array', items: { type: 'string' } },
    urgency_signals: { type: 'array', items: { type: 'string' } },
    suggested_urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
    safeguarding: { type: 'boolean' },
    safeguarding_note: { type: 'string' },
    volunteer_brief: { type: 'string' },
  },
  required: ['categories', 'summary', 'key_needs', 'urgency_signals', 'suggested_urgency', 'safeguarding', 'safeguarding_note', 'volunteer_brief'],
  additionalProperties: false,
};

const SYSTEM = `You support a church care coordinator by triaging private help requests from church members.
You produce suggestions only; a human coordinator reviews everything and makes every decision. You never contact anyone.

For each request, return:
- categories: 1-3 of ${CATEGORY_KEYS.join(', ')}, most relevant first.
- summary: one calm, factual sentence for the coordinator (max 25 words).
- key_needs: 1-4 short concrete needs, in plain words.
- urgency_signals: short phrases naming anything that suggests time pressure or vulnerability; empty if none.
- suggested_urgency: low, medium or high. Never rate lower than the urgency the member chose.
- safeguarding: true only if there are signs of risk of self-harm, abuse, or danger at home. safeguarding_note then says, in one sentence, that a pastor should reach out personally; otherwise an empty string.
- volunteer_brief: what an assigned volunteer needs to know to help, in at most two sentences. Leave out names, medical or financial specifics, and anything not needed for the practical task.`;

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  if (!client) client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  return client;
}
export const aiMode = () => (getClient() ? 'claude' : 'rules');

async function claudeAnalyze(input) {
  const c = getClient();
  if (!c) return null;
  const response = await c.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Member-selected type: ${input.category}\nMember-selected urgency: ${input.urgency}\n\nRequest text:\n"""${input.description}"""`,
    }],
  });
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) return null;
  const out = JSON.parse(text);
  const cats = out.categories.filter((c) => CATEGORY_KEYS.includes(c));
  if (!cats.length) cats.push(input.category || 'other');
  const order = { low: 0, medium: 1, high: 2 };
  let suggested = out.suggested_urgency;
  if (order[input.urgency] > order[suggested]) suggested = input.urgency;
  if (out.safeguarding) suggested = 'high';
  return {
    categories: cats.slice(0, 3),
    primary_category: cats[0],
    summary: out.summary,
    key_needs: out.key_needs.slice(0, 4),
    urgency_signals: out.urgency_signals.slice(0, 5),
    suggested_urgency: suggested,
    safeguarding: !!out.safeguarding,
    safeguarding_note: out.safeguarding ? out.safeguarding_note : null,
    volunteer_brief: out.volunteer_brief,
    source: 'claude',
  };
}

export async function analyzeRequest(input) {
  try {
    const r = await claudeAnalyze(input);
    if (r) {
      // Safety net: keep the rule-based safeguarding check even when Claude is used.
      const rules = heuristicAnalyze(input);
      if (rules.safeguarding && !r.safeguarding) {
        r.safeguarding = true;
        r.safeguarding_note = rules.safeguarding_note;
        r.suggested_urgency = 'high';
      }
      return r;
    }
  } catch (err) {
    console.warn('[ai] Claude analysis unavailable, using rule-based analyzer:', err?.message || err);
  }
  return heuristicAnalyze(input);
}

// ---------------------------------------------------------------- matching
// Weighted, explainable score: skills 45, capacity 20, availability 20, proximity 15.
export function suggestMatches(request, analysis, { limit = 3, excludeVolunteerIds = [] } = {}) {
  const cats = analysis?.categories?.length ? analysis.categories : [request.category];
  const urgency = analysis?.suggested_urgency || request.urgency;
  const vols = all(`
    SELECT u.id, u.name, u.area, v.skills, v.availability_days, v.availability_note, v.max_load, v.has_vehicle,
      (SELECT COUNT(*) FROM assignments a WHERE a.volunteer_id = u.id AND a.status IN (${ACTIVE_ASSIGNMENT.map(() => '?').join(',')})) AS load,
      (SELECT COUNT(*) FROM assignments a WHERE a.volunteer_id = u.id AND a.status = 'completed') AS completed
    FROM users u JOIN volunteers v ON v.user_id = u.id
    WHERE u.role = 'volunteer' AND v.active = 1`, ...ACTIVE_ASSIGNMENT);

  const scored = [];
  for (const v of vols) {
    if (excludeVolunteerIds.includes(v.id)) continue;
    const skills = json(v.skills, []);
    const days = json(v.availability_days, []);
    const reasons = [];

    const matched = cats.filter((c) => skills.includes(c));
    if (!matched.length) continue; // never suggest someone without a relevant skill
    const primaryHit = skills.includes(cats[0]);
    const skillScore = (primaryHit ? 0.7 : 0.4) + 0.3 * (matched.length / cats.length);
    reasons.push(`Skilled in ${matched.map((c) => CATEGORIES[c].toLowerCase()).join(', ')}`);

    const free = Math.max(0, v.max_load - v.load);
    if (free <= 0) continue; // avoid overloading people
    const capScore = free / v.max_load;
    reasons.push(v.load === 0 ? 'No active assignments right now' : `${v.load} of ${v.max_load} assignments in progress`);

    let availScore = Math.min(1, days.length / 5);
    if (urgency === 'high') {
      const weekend = days.includes('sat') || days.includes('sun');
      availScore = Math.min(1, days.length / 4) * (v.availability_note?.toLowerCase().includes('short notice') ? 1 : 0.8);
      if (v.availability_note?.toLowerCase().includes('short notice')) reasons.push('Available at short notice');
      else if (weekend) reasons.push('Available weekends');
    }
    reasons.push(`Usually free ${days.length === 7 ? 'every day' : days.map((d) => d[0].toUpperCase() + d.slice(1)).join(', ')}`);

    let proxScore = 0.5;
    const dist = distanceKm(v.area, request.area);
    if (dist != null) {
      proxScore = Math.max(0, 1 - dist / 12);
      reasons.push(dist === 0 ? `Lives in ${request.area}` : `About ${dist} km away (${v.area})`);
    }
    if (cats.includes('transportation') && v.has_vehicle) { proxScore = Math.min(1, proxScore + 0.2); reasons.push('Has a car'); }
    if (v.completed >= 3) reasons.push(`Has completed ${v.completed} care assignments`);

    const total = 0.45 * skillScore + 0.2 * capScore + 0.2 * availScore + 0.15 * proxScore;
    scored.push({ volunteer_id: v.id, name: v.name, score: Math.round(Math.min(0.98, total) * 100), reasons });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function suggestResources(request, analysis, limit = 1) {
  const cats = analysis?.categories?.length ? analysis.categories : [request.category];
  const resources = all('SELECT * FROM resources');
  return resources
    .map((r) => {
      const rc = json(r.categories, []);
      const hit = cats.filter((c) => rc.includes(c));
      if (!hit.length) return null;
      const dist = distanceKm(r.area, request.area);
      const score = Math.round((0.55 + 0.25 * (hit.length / cats.length) + (dist == null ? 0.05 : 0.15 * Math.max(0, 1 - dist / 12))) * 100);
      const reasons = [`Provides ${hit.map((c) => CATEGORIES[c].toLowerCase()).join(', ')}`];
      if (r.hours) reasons.push(`Open ${r.hours}`);
      if (dist != null) reasons.push(dist === 0 ? `Located in ${r.area}` : `About ${dist} km away`);
      return { resource_id: r.id, name: r.name, score: Math.min(95, score), reasons };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export { AREAS, DAYS };
