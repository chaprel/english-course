// Spaced repetition: Leitner boxes. A phrase moves up one box on success and waits longer each time.
import { state, today, addDays, daysBetween } from './store.js';

const INTERVAL = [0, 1, 2, 4, 8, 16];

export function introduce(ids) {
  const t = today();
  for (const id of ids) {
    if (!state.srs[id]) state.srs[id] = { b: 1, due: addDays(t, 1), last: t };
  }
}

export function dueItems(catalog, cap = 12) {
  const t = today();
  return Object.keys(state.srs)
    .filter((id) => catalog.items[id] && state.srs[id].due <= t)
    .sort((a, b) => (state.srs[a].due < state.srs[b].due ? -1 : 1))
    .slice(0, cap);
}

// Returns the number of days since the phrase was last recalled successfully (the evidence of delay).
export function grade(id, ok) {
  const c = state.srs[id], t = today();
  const days = daysBetween(c.last, t);
  if (ok) { c.b = Math.min(5, c.b + 1); c.last = t; } else { c.b = 1; }
  c.due = addDays(t, ok ? INTERVAL[c.b] : 1);
  return days;
}

export function nextDue() {
  const dues = Object.values(state.srs).map((c) => c.due).sort();
  return dues[0] || null;
}
