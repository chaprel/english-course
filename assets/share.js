// "Send the result" control, shared by the home screen and the end of lessons and reviews.
import { h } from './engine.js';
import { buildReport, send, pending } from './summary.js';

export function shareBox(catalog) {
  const msg = h('p', { class: 'muted', 'aria-live': 'polite' });
  const manual = h('textarea', { class: 'field', rows: '6', readonly: true, hidden: true });
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Отправить итог');
  btn.addEventListener('click', async () => {
    const text = buildReport(catalog);
    const how = await send(text);
    if (how === 'shared') msg.textContent = 'Готово. По этому отчёту учитель подберёт следующий урок.';
    else if (how === 'copied') msg.textContent = 'Отчёт скопирован. Вставь его в сообщение родителю.';
    else if (how === 'manual') {
      manual.hidden = false;
      manual.value = text;
      manual.select();
      msg.textContent = 'Выдели весь текст, скопируй и отправь родителю.';
    }
  });
  return h('div', { class: 'card' }, h('h2', {}, 'Отчёт для учителя'),
    h('p', {}, `Не отправлено занятий: ${pending()}. Отправь отчёт родителю в мессенджере: по нему готовится следующий урок.`),
    btn, msg, manual);
}
