// Stand-alone device check page.
import { state, save, loadCatalog, registerSW, BASE } from './store.js';
import { h } from './engine.js';
import { deviceCheck } from './devcheck.js';

const root = document.getElementById('check-root');

async function main() {
  registerSW();
  let catalog;
  try { catalog = await loadCatalog(); } catch {
    root.replaceChildren(h('h1', {}, 'Нет связи'), h('p', {}, h('a', { href: BASE }, 'На главный экран')));
    return;
  }
  const box = h('div', {});
  root.replaceChildren(box);
  const code = await deviceCheck(box, catalog);
  state.ctx = code;
  save();
  const line = `ENGCHECK ${code}`;
  const copy = h('button', { class: 'btn', type: 'button' }, 'Скопировать строку');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(line); copy.textContent = 'Скопировано'; } catch { copy.textContent = 'Выдели и скопируй вручную'; }
  });
  box.append(h('div', { class: 'card' }, h('h2', {}, 'Строка для учителя'),
    h('p', { class: 'muted' }, 'Если что-то выше отмечено «Нет», отправь эту строку родителю.'),
    h('p', { class: 'code' }, line), copy),
    h('p', {}, h('a', { class: 'btn primary', href: BASE }, 'На главный экран')));
}

main();
