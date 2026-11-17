export const CATEGORIES = {
  food: 'Food',
  accommodation: 'Accommodation',
  medical: 'Medical assistance',
  transportation: 'Transportation',
  emotional: 'Emotional support',
  financial: 'Financial help',
  childcare: 'Childcare',
  other: 'Other',
};

export const CONTACT_METHODS = { phone: 'Phone call', text: 'Text message', email: 'Email', in_person: 'In person at church' };

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// A fictional town. Coordinates are in km on a simple grid, used for proximity.
export const AREAS = {
  'Northside': [2, 9],
  'Old Town': [5, 5],
  'Riverside': [8, 6],
  'Eastgate': [11, 4],
  'Hillcrest': [3, 2],
  'Westfield': [0, 5],
  'Southbank': [7, 1],
};

export function distanceKm(a, b) {
  const pa = AREAS[a], pb = AREAS[b];
  if (!pa || !pb) return null;
  return Math.round(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) * 10) / 10;
}

export const ACTIVE_ASSIGNMENT = ['offered', 'accepted', 'contacted', 'helping', 'needs_support'];
export const ACCEPTED_ASSIGNMENT = ['accepted', 'contacted', 'helping', 'needs_support'];

export const ASSIGNMENT_LABELS = {
  offered: 'Awaiting volunteer response',
  accepted: 'Accepted',
  contacted: 'Contacted member',
  helping: 'Helping',
  needs_support: 'Needs more support',
  completed: 'Completed',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};
