// Device check: can this phone play the course audio and record a voice? Produces a short capability code.
import { h } from './engine.js';
import { play } from './audio.js';
import { canRecord, start } from './recorder.js';

export function isStandalone() {
  return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}

export function osCode() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'a';
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'i';
  return 'd';
}

function choice(box, question, yes = 'Да', no = 'Нет') {
  return new Promise((resolve) => {
    const row = h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => { row.remove(); q.remove(); resolve(true); } }, yes),
      h('button', { class: 'btn', type: 'button', onclick: () => { row.remove(); q.remove(); resolve(false); } }, no));
    const q = h('p', {}, question);
    box.append(q, row);
  });
}

function line(box, ok, text) {
  box.append(h('p', { class: ok ? 'res ok' : 'res bad' }, (ok ? 'Да: ' : 'Нет: ') + text));
}

// Renders into `box`, resolves to a code like "a.S.m1.a1.s1.p1".
export async function deviceCheck(box, catalog) {
  box.replaceChildren(h('h1', {}, 'Проверка телефона'),
    h('p', { class: 'muted' }, 'Полминуты: убедимся, что слышно звук и работает микрофон.'));
  const sample = catalog.items[catalog.sample];
  const samplePath = Object.values(sample.audio)[0].n;

  // 1. Sound
  const heard = await new Promise((resolve) => {
    const step = h('div', { class: 'card' }, h('h2', {}, '1. Звук'),
      h('p', {}, 'Прибавь громкость и нажми кнопку.'));
    const btn = h('button', { class: 'btn play', type: 'button' }, h('span', { class: 'ico-play' }), 'Слушать');
    let asked = false;
    btn.addEventListener('click', async () => {
      await play(samplePath);
      if (asked) return;
      asked = true;
      resolve(await choice(step, 'Было слышно английскую речь?'));
    });
    step.append(btn);
    box.append(step);
  });
  line(box, heard, 'звук');

  // 2. Microphone
  let mic = 'mn';
  if (canRecord()) {
    mic = await new Promise((resolve) => {
      const step = h('div', { class: 'card' }, h('h2', {}, '2. Микрофон'),
        h('p', {}, 'Нажми кнопку, разреши доступ и скажи «Hello». Запись идёт три секунды и остаётся только на телефоне.'));
      const rec = h('button', { class: 'btn', type: 'button' }, 'Записать 3 секунды');
      const skip = h('button', { class: 'btn ghost', type: 'button', onclick: () => resolve('ms') }, 'Пропустить');
      rec.addEventListener('click', async () => {
        rec.disabled = true;
        skip.remove();
        try {
          rec.textContent = 'Идёт запись…';
          const handle = await start(3000);
          const url = await handle.stopped;
          if (!url) return resolve('m0');
          rec.textContent = 'Воспроизвожу…';
          await play(url);
          rec.remove();
          resolve((await choice(step, 'Ты услышал свой голос?')) ? 'm1' : 'm0');
        } catch { resolve('md'); }
      });
      step.append(h('div', { class: 'row' }, rec, skip));
      box.append(step);
    });
  }
  line(box, mic === 'm1', mic === 'm1' ? 'микрофон'
    : mic === 'md' ? 'микрофон (нет доступа). Ничего страшного: будешь говорить вслух без записи'
      : 'микрофон. Ничего страшного: будешь говорить вслух без записи');

  // 3. Everything else is detected silently.
  const standalone = isStandalone();
  let persisted = false;
  try { persisted = !!(navigator.storage && navigator.storage.persist && await navigator.storage.persist()); } catch { /* ignore */ }
  line(box, standalone, standalone ? 'установлено как приложение'
    : 'не установлено как приложение. Установи с главного экрана, иначе прогресс может потеряться');
  return [osCode(), standalone ? 'S' : 'T', mic, heard ? 'a1' : 'a0', navigator.share ? 's1' : 's0', persisted ? 'p1' : 'p0'].join('.');
}
