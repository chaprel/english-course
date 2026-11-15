// Entry point of every lesson page: reads the lesson data block, runs the steps, records the result.
import { state, save, loadCatalog, registerSW, addEntry, touchStreak, today, BASE } from './store.js';
import { Runner, toLines, h, preload } from './engine.js';
import { introduce } from './srs.js';
import { clean } from './summary.js';
import { shareBox } from './share.js';

const root = document.getElementById('lesson-root');
const extra = document.getElementById('lesson-extra');
const data = JSON.parse(document.getElementById('lesson').textContent);

async function main() {
  registerSW();
  let catalog;
  try { catalog = await loadCatalog(); } catch {
    root.replaceChildren(h('div', { class: 'step' }, h('h1', {}, 'Нет связи'),
      h('p', {}, 'Не получилось загрузить урок. Проверь интернет и попробуй ещё раз.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, 'Повторить')));
    return;
  }
  const meta = data.meta;
  const entry = catalog.lessons.find((l) => l.id === meta.id);
  const key = `${meta.id}.${entry.hash}`;
  const resuming = state.cur && state.cur.key === key;

  // Start screen doubles as the first tap that unlocks audio.
  await new Promise((resolve) => {
    root.replaceChildren(h('div', { class: 'step' },
      h('p', { class: 'eyebrow' }, `Урок ${Number(meta.id)}, около ${meta.minutes} минут`),
      h('h1', {}, meta.title), h('p', { class: 'lead' }, meta.win),
      h('p', { class: 'muted' }, 'Понадобится звук. Лучше наушники и место, где можно говорить вслух.'),
      h('button', { class: 'btn primary', type: 'button', onclick: resolve }, resuming ? 'Продолжить' : 'Начать'),
      h('p', {}, h('a', { href: BASE }, 'На главный экран'))));
  });

  const voice = state.settings.voice;
  preload(data.items.flatMap((it) => {
    const a = catalog.items[it.id].audio;
    const v = a[voice] || Object.values(a)[0];
    return [v.n, v.s].filter(Boolean);
  }));

  const R = new Runner(root, catalog, { title: meta.title });
  const results = await R.run(data.steps, { resumeKey: key });

  let difficulty = null;
  const question = h('textarea', { class: 'field', rows: '2', maxlength: '140', placeholder: 'Что осталось непонятным? Необязательно' });
  const row = h('div', { class: 'row' }, ['Легко', 'В самый раз', 'Тяжело'].map((t, i) => {
    const b = h('button', { class: 'btn', type: 'button' }, t);
    b.addEventListener('click', () => {
      difficulty = i + 1;
      row.querySelectorAll('button').forEach((x) => x.classList.remove('picked'));
      b.classList.add('picked');
      R.ready();
    });
    return b;
  }));
  await R.show([h('p', { class: 'eyebrow' }, 'Почти всё'), h('h1', {}, 'Как тебе урок?'), row,
    h('h2', {}, 'Вопрос учителю'),
    h('p', { class: 'muted' }, 'Учитель прочитает его в отчёте и ответит в следующем уроке или через родителя.'), question], { label: 'Завершить' });

  const lines = toLines(results);
  lines.push(`F ${difficulty}${clean(question.value) ? ` q=(${clean(question.value)})` : ''}`);
  if (R.bad.size) lines.push(`A ${[...R.bad].join(' ')}`);
  addEntry({ k: 'L', id: meta.id, hash: entry.hash, t: Math.round(R.seconds), lines });
  state.lessons[meta.id] = { done: today() };
  introduce(entry.items);
  touchStreak();
  if (R.missionText) state.missions[meta.id] = { text: R.missionText, status: 'open' };
  state.cur = null;
  save();

  if (extra) extra.hidden = false;
  R.dock.hidden = true;
  R.body.replaceChildren(...[h('p', { class: 'eyebrow' }, 'Урок пройден'), h('h1', {}, 'Готово'), h('p', { class: 'lead' }, meta.win),
    entry.items.length ? h('p', { class: 'muted' }, 'Фразы из урока попали в повторение. Завтра они появятся на главном экране: именно повторение через день-два переносит их в долгую память.') : null,
    shareBox(catalog), extra, h('p', {}, h('a', { class: 'btn', href: BASE }, 'На главный экран'))].filter(Boolean));
  window.scrollTo(0, 0);
}

main();
