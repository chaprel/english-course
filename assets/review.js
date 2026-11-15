// Daily review: due phrases come back as a mix of objective tasks and spoken recall, from mixed lessons.
import { save, loadCatalog, registerSW, addEntry, touchStreak, state, BASE } from './store.js';
import { Runner, h, shuffled } from './engine.js';
import { dueItems, grade, nextDue } from './srs.js';
import { shareBox } from './share.js';

const root = document.getElementById('review-root');
const KIND = ['dictation', 'tiles', 'recall'];
const CODE = { dictation: 'd', tiles: 't', recall: 'r' };

async function main() {
  registerSW();
  let catalog;
  try { catalog = await loadCatalog(); } catch {
    root.replaceChildren(h('div', { class: 'step' }, h('h1', {}, 'Нет связи'), h('p', {}, h('a', { href: BASE }, 'На главный экран'))));
    return;
  }
  const due = dueItems(catalog);
  if (!due.length) {
    const next = nextDue();
    root.replaceChildren(h('div', { class: 'step' }, h('h1', {}, 'На сегодня всё'),
      h('p', {}, next ? `Следующее повторение: ${next.split('-').reverse().join('.')}.` : 'Фразы появятся здесь после первого урока.'),
      h('p', {}, h('a', { class: 'btn', href: BASE }, 'На главный экран'))));
    return;
  }
  await new Promise((resolve) => {
    root.replaceChildren(h('div', { class: 'step' }, h('p', { class: 'eyebrow' }, 'Повторение дня'),
      h('h1', {}, `Фраз сегодня: ${due.length}`),
      h('p', { class: 'lead' }, 'Вспоминать с усилием полезнее, чем перечитывать. Ошибаться здесь нормально.'),
      h('button', { class: 'btn primary', type: 'button', onclick: resolve }, 'Начать')));
  });
  const steps = shuffled(due).map((id) => ({ type: KIND[state.srs[id].b % 3], item: id }));
  const R = new Runner(root, catalog, { title: 'Повторение' });
  const vals = [];
  let right = 0;
  await R.run(steps, {
    onStep: (step, out) => {
      const ok = !!(out && out.ok);
      if (ok) right++;
      vals.push(`${step.item}=${ok ? 'ok' : 'x'}.${grade(step.item, ok)}d.${CODE[step.type]}`);
      save();
    },
  });
  const lines = [`V ${vals.join(' ')}`];
  if (R.bad.size) lines.push(`A ${[...R.bad].join(' ')}`);
  addEntry({ k: 'R', t: Math.round(R.seconds), lines });
  touchStreak();
  save();
  R.dock.hidden = true;
  R.body.replaceChildren(h('p', { class: 'eyebrow' }, 'Повторение пройдено'), h('h1', {}, `Вспомнил ${right} из ${due.length}`),
    h('p', { class: 'muted' }, 'То, что не вспомнилось, вернётся завтра. Остальное придёт позже, с растущими паузами.'),
    shareBox(catalog), h('p', {}, h('a', { class: 'btn', href: BASE }, 'На главный экран')));
}

main();
