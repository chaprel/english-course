// The result report: two lines for a human, then a compact block the teacher's tools can parse.
// Characters that messengers turn into formatting are avoided on purpose.
import { state, streakNow } from './store.js';

let table = null;
function crc32(str) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of new TextEncoder().encode(str)) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

// Free text typed by the learner, made safe for one line inside parentheses.
export function clean(text, max = 140) {
  return String(text || '').replace(/[()*_~`<>=\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function pending() {
  return state.outbox.length;
}

export function buildReport(catalog) {
  const code = [];
  const titles = [];
  let reviews = 0;
  for (const e of state.outbox) {
    let head = `ENG1 n=${e.n}`;
    if (e.k === 'L') {
      head += ` L=${e.id}.${e.hash}`;
      const l = catalog.lessons.find((x) => x.id === e.id);
      titles.push(l ? l.title : e.id);
    } else if (e.k === 'R') { head += ' R'; reviews++; } else { head += ' HM'; }
    head += ` d=${e.d}`;
    if (e.t != null) head += ` t=${e.t}`;
    if (state.ctx) head += ` ctx=${state.ctx}`;
    code.push(head, ...e.lines);
  }
  const done = Object.keys(state.lessons).sort();
  const boxes = catalog.lessons.flatMap((l) => l.items).map((id) => (state.srs[id] ? state.srs[id].b : 0)).join('');
  code.push(`B l=${done.join('.') || '-'} s=${streakNow()} b=${boxes || '-'}`);
  const sum = crc32(code.join('').replace(/\s+/g, ''));

  const parts = [];
  if (titles.length) parts.push(`уроки: ${titles.join(', ')}`);
  if (reviews) parts.push(`повторений: ${reviews}`);
  if (state.level) parts.push(`на слух около ${state.level}`);
  const human = `Английский, отчёт для учителя. ${parts.join('; ') || 'без новых занятий'}. Серия дней: ${streakNow()}.`;
  return [human, 'Перешли это сообщение целиком, ничего не меняя:', ...code, `crc=${sum}`].join('\n');
}

// Returns 'shared', 'copied' or 'manual' (the caller then shows the text for manual copying).
export async function send(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return 'shared'; } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'manual'; }
}
