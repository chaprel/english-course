// One shared <audio> element for everything. It is unlocked by the first tap and then reused,
// which is what phone browsers require. Web Audio is deliberately not used for speech:
// on iPhone it is silenced by the ringer switch.
import { BASE } from './store.js';

const el = new Audio();
el.preload = 'auto';
const blobs = new Map();
let unlocked = false;
let token = 0;
let silent = null;

function silentUrl() {
  if (silent) return silent;
  const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  silent = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return silent;
}

export function unlock() {
  if (unlocked) return;
  unlocked = true;
  const s = silentUrl();
  el.src = s;
  const p = el.play();
  if (p) p.then(() => { if (el.src === s) el.pause(); }).catch(() => { unlocked = false; });
}
document.addEventListener('pointerdown', unlock, { capture: true, once: true });

export const abs = (path) => (/^(blob:|https?:)/.test(path) ? path : BASE + path);

async function load(path) {
  if (blobs.has(path)) return blobs.get(path);
  const r = await fetch(abs(path));
  if (!r.ok) throw new Error('audio ' + r.status);
  const u = URL.createObjectURL(await r.blob());
  blobs.set(path, u);
  return u;
}

export function preload(paths) {
  return Promise.allSettled([...new Set(paths)].map(load));
}

// Resolves true when the clip played to the end, false if it failed or was interrupted.
export async function play(path) {
  const my = ++token;
  let src;
  try { src = path.startsWith('blob:') ? path : await load(path); } catch { return false; }
  if (my !== token) return false;
  el.pause();
  el.src = src;
  return new Promise((resolve) => {
    let done = false;
    const fin = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      el.onended = el.onerror = null;
      resolve(ok);
    };
    const watchdog = setTimeout(() => fin(false), 30000);
    el.onended = () => fin(my === token);
    el.onerror = () => fin(false);
    el.play().catch(() => fin(false));
  });
}

export function stop() {
  token++;
  el.pause();
}
