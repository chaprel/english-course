// Progress lives only on this device. Every key is prefixed: all GitHub Pages sites of one account share storage.
const KEY = 'ec1:state';
export const BASE = new URL('..', import.meta.url).href;

const fresh = () => ({
  v: 1, settings: { voice: null, asr: false }, ctx: null, level: null,
  lessons: {}, srs: {}, streak: { last: null, n: 0, best: 0 },
  outbox: [], seq: 0, missions: {}, cur: null,
});

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch { /* private mode or blocked storage: keep going in memory */ }
  return fresh();
}

export const state = read();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* in-memory only */ }
}

export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh(), next);
  save();
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function today() {
  try {
    const fake = localStorage.getItem('ec1:debugdate');
    if (fake) return fake;
  } catch { /* ignore */ }
  return iso(new Date());
}

const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

export function touchStreak() {
  const t = today(), s = state.streak;
  if (s.last === t) return;
  s.n = s.last && daysBetween(s.last, t) === 1 ? s.n + 1 : 1;
  s.last = t;
  s.best = Math.max(s.best, s.n);
}

export function streakNow() {
  const s = state.streak;
  return s.last && daysBetween(s.last, today()) <= 1 ? s.n : 0;
}

export function addEntry(entry) {
  entry.n = ++state.seq;
  entry.d = today();
  state.outbox.push(entry);
  save();
}

export function applyAck(ack) {
  const before = state.outbox.length;
  state.outbox = state.outbox.filter((e) => e.n > ack);
  if (state.outbox.length !== before) save();
}

let catalogPromise = null;
export function loadCatalog(force = false) {
  if (!catalogPromise || force) {
    catalogPromise = fetch(`${BASE}data/catalog.json`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('catalog'); return r.json(); })
      .then((c) => { applyAck(c.ack || 0); return c; })
      .catch((e) => { catalogPromise = null; throw e; });
  }
  return catalogPromise;
}

export function registerSW() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => null);
}
