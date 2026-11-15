// Home screen.
import { state, save, replaceState, loadCatalog, registerSW, addEntry, streakNow, today, BASE } from './store.js';
import { h } from './engine.js';
import { dueItems, nextDue } from './srs.js';
import { pending } from './summary.js';
import { shareBox } from './share.js';
import { isStandalone, osCode } from './devcheck.js';

const root = document.getElementById('home-root');
let installEvent = null;
let catalog = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; if (catalog) render(); });

function installCard() {
  if (isStandalone()) return null;
  const os = osCode();
  const how = os === 'i'
    ? 'В Safari нажми «Поделиться», затем «На экран Домой». Потом открой приложение с экрана и начинай уже там.'
    : os === 'a'
      ? 'В Chrome открой меню (три точки) и выбери «Установить приложение» или «Добавить на главный экран».'
      : 'На телефоне открой эту страницу в Chrome или Safari и добавь её на главный экран.';
  const card = h('div', { class: 'card warn' }, h('h2', {}, 'Сначала установи, потом начинай'),
    h('p', {}, how),
    h('p', { class: 'muted' }, 'Если ссылка открылась внутри мессенджера, сначала открой её в обычном браузере. Иначе прогресс может потеряться.'));
  if (installEvent) {
    card.append(h('button', { class: 'btn primary', type: 'button', onclick: async () => { installEvent.prompt(); installEvent = null; } }, 'Установить'));
  }
  return card;
}

function missionCards() {
  return Object.entries(state.missions).filter(([, m]) => m.status === 'open' && m.snooze !== today()).map(([id, m]) => {
    const answer = (status) => () => {
      m.status = status;
      addEntry({ k: 'M', lines: [`M ${id}=${status}`] });
      save();
      render();
    };
    return h('div', { class: 'card' }, h('h2', {}, 'Задание из урока'), h('p', {}, m.text),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: answer('done') }, 'Сделал'),
        h('button', { class: 'btn', type: 'button', onclick: answer('done.w') }, 'Сделал при родителе'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { m.snooze = today(); save(); render(); } }, 'Ещё нет')));
  });
}

function render() {
  const next = catalog.lessons.find((l) => !state.lessons[l.id]);
  const due = dueItems(catalog).length;
  const nodes = [
    h('header', { class: 'home-head' }, h('h1', {}, catalog.app),
      h('p', { class: 'streak' }, `Серия: ${streakNow()} дн.`, state.level ? ` На слух: ${state.level}` : '')),
    installCard(),
    ...missionCards(),
  ];
  if (next) {
    const resuming = state.cur && state.cur.key.startsWith(next.id + '.');
    nodes.push(h('div', { class: 'card hero' }, h('p', { class: 'eyebrow' }, `Урок ${Number(next.id)}, около ${next.minutes} минут`),
      h('h2', {}, next.title), h('p', {}, next.win),
      h('a', { class: 'btn primary', href: BASE + next.file }, resuming ? 'Продолжить урок' : 'Начать урок')));
  } else {
    nodes.push(h('div', { class: 'card hero' }, h('h2', {}, 'Новый урок готовится'),
      h('p', {}, 'Ты прошёл всё, что есть. Отправь отчёт, чтобы следующий урок подобрали под тебя, и не пропускай повторение.')));
  }
  const nd = nextDue();
  nodes.push(h('div', { class: 'card' }, h('h2', {}, 'Повторение дня'),
    due ? h('p', {}, `Фраз на сегодня: ${due}. Это три-четыре минуты.`)
      : h('p', { class: 'muted' }, nd ? `На сегодня всё. Следующее: ${nd.split('-').reverse().join('.')}.` : 'Фразы появятся после первого урока.'),
    due ? h('a', { class: 'btn', href: `${BASE}review.html` }, 'Повторить') : null));
  if (pending()) nodes.push(shareBox(catalog));
  const done = catalog.lessons.filter((l) => state.lessons[l.id]);
  if (done.length) {
    nodes.push(h('div', { class: 'card' }, h('h2', {}, 'Пройденные уроки'),
      h('ul', { class: 'plain' }, done.map((l) => h('li', {}, h('a', { href: BASE + l.file }, `${Number(l.id)}. ${l.title}`))))));
  }
  const refresh = h('button', { class: 'linkbtn', type: 'button' }, 'Обновить');
  refresh.addEventListener('click', async () => {
    refresh.textContent = 'Обновляю…';
    await update();
    refresh.textContent = 'Обновить';
  });
  nodes.push(h('footer', { class: 'home-foot' },
    h('a', { href: `${BASE}reference/phrasebook.html` }, 'Разговорник'),
    h('a', { href: `${BASE}check.html` }, 'Проверка телефона'), refresh,
    h('span', { class: 'muted' }, `версия ${catalog.rev}`)));
  root.replaceChildren(...nodes.filter(Boolean));
}

async function update() {
  try {
    const reg = await navigator.serviceWorker.getRegistration(BASE);
    if (reg) await reg.update();
  } catch { /* ignore */ }
  try {
    catalog = await loadCatalog(true);
  } catch { /* offline: keep what we have */ }
  render();
}

function restore() {
  const code = new URLSearchParams(location.search).get('restore');
  if (!code) return;
  history.replaceState(null, '', location.pathname);
  try {
    const p = JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/')));
    if (!confirm('Восстановить прогресс из резервной копии? Текущий прогресс на этом телефоне будет заменён.')) return;
    const t = today();
    replaceState({
      lessons: Object.fromEntries(p.l.map((id) => [id, { done: t }])),
      srs: Object.fromEntries(Object.entries(p.b).map(([id, b]) => [id, { b, due: t, last: t }])),
      streak: { last: t, n: p.s || 1, best: p.s || 1 },
    });
  } catch { alert('Код восстановления повреждён.'); }
}

// Fetch everything once so the service worker caches it and the course works without a connection.
async function warm() {
  if (!('serviceWorker' in navigator)) return;
  await navigator.serviceWorker.ready;
  const next = catalog.lessons.find((l) => !state.lessons[l.id]);
  const ids = [...(next ? Object.keys(catalog.items).filter((id) => catalog.items[id].lesson === next.id) : []), ...Object.keys(state.srs)];
  const audio = ids.filter((id) => catalog.items[id]).flatMap((id) => Object.values(catalog.items[id].audio).flatMap((a) => [a.n, a.s].filter(Boolean)));
  for (const f of [...catalog.files, ...new Set(audio)]) {
    try { await fetch(BASE + f); } catch { return; }
  }
}

async function main() {
  registerSW();
  restore();
  try { catalog = await loadCatalog(); } catch {
    root.replaceChildren(h('div', { class: 'card' }, h('h1', {}, 'Нет связи'),
      h('p', {}, 'Для первого запуска нужен интернет. Потом курс работает и без него.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, 'Повторить')));
    return;
  }
  render();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  warm();
}

main();
