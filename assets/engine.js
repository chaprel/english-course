// The step engine. A lesson is a list of steps; each step is one screen with immediate feedback.
// Step functions return { tag, val, ok } records that end up in the result report.
import { state, save, BASE } from './store.js';
import { play, stop, preload } from './audio.js';
import { canRecord, start } from './recorder.js';
import { clean } from './summary.js';
import { deviceCheck } from './devcheck.js';

export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

export function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const normEn = (s) => s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const VOICE_LABEL = (v) => `${v[0] === 'b' ? 'Британия' : 'США'}, ${v[1] === 'f' ? 'женский' : 'мужской'}`;
const LEVEL_NOTE = {
  'A0': 'Пока трудно даже с простыми фразами. Это нормально: начнём с самых коротких и медленных.',
  'A1': 'Ты понимаешь простые медленные фразы. Будем наращивать длину и скорость.',
  'A2': 'Ты понимаешь короткие бытовые фразы. Дальше: обычная скорость речи и разговор.',
  'B1+': 'Ты понимаешь обычную речь на знакомые темы. Дальше: быстрая речь и живые диалоги.',
};

export class Runner {
  constructor(root, catalog, { title = '', exitHref = BASE } = {}) {
    this.catalog = catalog;
    this.bad = new Set();
    this.plays = 0;
    this.seconds = 0;
    this.bar = h('div', { class: 'progress' }, h('div', { class: 'progress-fill' }));
    this.body = h('div', { class: 'step' });
    this.next = h('button', { class: 'btn primary', type: 'button' }, 'Дальше');
    this.dock = h('div', { class: 'dock' }, this.next);
    const close = h('a', { class: 'close', href: exitHref, 'aria-label': 'Выйти на главный экран' }, 'Выйти');
    close.addEventListener('click', (e) => { if (!confirm('Выйти? Урок можно будет продолжить с этого места.')) e.preventDefault(); });
    root.replaceChildren(h('header', { class: 'topbar' }, close, h('span', { class: 'topbar-title' }, title), this.bar),
      this.body, this.dock);
    let last = Date.now();
    this.tick = setInterval(() => {
      const now = Date.now();
      if (!document.hidden && now - last < 5000) this.seconds += (now - last) / 1000;
      last = now;
    }, 1000);
  }

  progress(i, n) {
    this.bar.firstChild.style.width = `${Math.round((i / n) * 100)}%`;
  }

  // Shows a screen. With dock=true resolves when "Дальше" is pressed.
  show(nodes, { ready = false, label = 'Дальше', dock = true } = {}) {
    stop();
    this.body.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
    this.dock.hidden = !dock;
    this.next.textContent = label;
    this.next.disabled = !ready;
    window.scrollTo(0, 0);
    return new Promise((resolve) => { this.next.onclick = () => { stop(); resolve(); }; });
  }

  ready(v = true) { this.next.disabled = !v; }

  clip(id, { slow = false, vary = false } = {}) {
    const it = this.catalog.items[id];
    const voices = Object.keys(it.audio);
    let v = vary ? voices[Math.floor(Math.random() * voices.length)] : state.settings.voice;
    if (!it.audio[v]) v = voices[0];
    return (slow && it.audio[v].s) || it.audio[v].n;
  }

  hasSlow(id) {
    return Object.values(this.catalog.items[id].audio).some((a) => a.s);
  }

  playBtn(pathFn, { label = 'Слушать', onDone } = {}) {
    const b = h('button', { class: 'btn play', type: 'button' }, h('span', { class: 'ico-play' }), label);
    b.addEventListener('click', async () => {
      b.classList.add('on');
      const t0 = Date.now();
      this.plays++;
      const paths = [].concat(typeof pathFn === 'function' ? pathFn() : pathFn);
      let ok = true;
      for (const p of paths) { ok = await play(p); if (!ok) break; }
      b.classList.remove('on');
      // A refusal by the phone comes back at once; a late false is just an interrupted clip.
      b.lastChild.textContent = !ok && Date.now() - t0 < 8000 ? 'Не сыграло. Нажми ещё раз' : label;
      if (onDone) onDone(ok);
    });
    return b;
  }

  flagBtn(id) {
    const b = h('button', { class: 'linkbtn', type: 'button' }, 'плохой звук?');
    b.addEventListener('click', () => {
      if (this.bad.has(id)) { this.bad.delete(id); b.textContent = 'плохой звук?'; } else { this.bad.add(id); b.textContent = 'отмечено, спасибо'; }
    });
    return b;
  }

  // One question with options; resolves to the chosen original index after showing feedback.
  options(opts, answer, { enabled = true, onPick } = {}) {
    const order = shuffled(opts.map((_, i) => i));
    const box = h('div', { class: 'options' });
    const btns = order.map((i) => {
      const b = h('button', { class: 'btn option', type: 'button', disabled: !enabled }, opts[i]);
      b.addEventListener('click', () => {
        btns.forEach((x) => { x.disabled = true; });
        if (answer != null) {
          b.classList.add(i === answer ? 'right' : 'wrong');
          btns[order.indexOf(answer)].classList.add('right');
        }
        onPick(i);
      });
      return b;
    });
    box.append(...btns);
    box.enable = () => btns.forEach((x) => { x.disabled = false; });
    return box;
  }

  async run(steps, { resumeKey = null, onStep } = {}) {
    let i = 0, results = [];
    const cur = state.cur;
    if (resumeKey && cur && cur.key === resumeKey && cur.i < steps.length) {
      i = cur.i; results = cur.res || []; this.seconds = cur.t || 0;
    }
    for (; i < steps.length; i++) {
      this.progress(i, steps.length);
      const fn = STEPS[steps[i].type];
      const out = await fn(this, steps[i]);
      for (const r of [].concat(out || [])) results.push(r);
      if (onStep) onStep(steps[i], out);
      if (resumeKey) { state.cur = { key: resumeKey, i: i + 1, res: results, t: Math.round(this.seconds) }; save(); }
    }
    this.progress(1, 1);
    clearInterval(this.tick);
    return results;
  }
}

export function toLines(results) {
  const by = new Map();
  for (const r of results) {
    if (!by.has(r.tag)) by.set(r.tag, []);
    by.get(r.tag).push(r.val);
  }
  return [...by].map(([tag, vals]) => `${tag} ${vals.join(' ')}`);
}

const STEPS = {
  async info(R, s) {
    await R.show([h('h1', {}, s.title), (s.body || []).map((p) => h('p', {}, p))], { ready: true, label: s.next });
  },

  async check(R) {
    const box = h('div', {});
    const done = R.show([box]);
    state.ctx = await deviceCheck(box, R.catalog);
    save();
    R.ready();
    await done;
  },

  async voice(R, s) {
    const voices = Object.keys(R.catalog.items[s.sample].audio);
    let picked = state.settings.voice;
    const rows = voices.map((v, n) => {
      const pick = h('button', { class: 'btn option' + (picked === v ? ' picked' : ''), type: 'button' },
        `Голос ${n + 1}: ${VOICE_LABEL(v)}`);
      pick.addEventListener('click', async () => {
        picked = v;
        rows.forEach((r) => r.classList.remove('picked'));
        pick.classList.add('picked');
        R.ready();
        await play(R.catalog.items[s.sample].audio[v].n);
      });
      return pick;
    });
    await R.show([h('h1', {}, 'Выбери голос диктора'),
      h('p', { class: 'muted' }, 'Нажимай и слушай. Оставь тот, что приятнее. В повторении будут звучать и другие голоса: так ухо привыкает к разным людям.'),
      h('div', { class: 'options' }, rows)], { ready: !!picked });
    state.settings.voice = picked;
    save();
    return { tag: 'S', val: `voice=${picked}` };
  },

  async placement(R, s) {
    const pass = s.pass || 3;
    const parts = [];
    let est = 'A0', replays = 0, n = 0;
    const total = s.tiers.reduce((a, t) => a + t.items.length, 0);
    await R.show([h('h1', {}, 'Тест: как ты понимаешь на слух'),
      h('p', {}, `До ${total} коротких фраз, от простых к сложным. Каждую можно прослушать два раза.`),
      h('p', {}, 'Не угадывай. Если не понял, жми «Не понял»: так курс точнее подстроится под тебя.')], { ready: true, label: 'Начать' });
    for (const tier of s.tiers) {
      let correct = 0;
      for (const q of tier.items) {
        n++;
        const ok = await new Promise((resolve) => {
          let left = 2;
          const opts = R.options(q.options, null, { enabled: false, onPick: (i) => resolve(i === q.answer) });
          const dunno = h('button', { class: 'btn ghost', type: 'button', disabled: true, onclick: () => resolve(false) }, 'Не понял');
          const btn = R.playBtn(() => R.clip(q.audio), {
            onDone: () => { left--; if (left < 1) btn.disabled = true; if (left === 0) replays++; opts.enable(); dunno.disabled = false; },
          });
          R.show([h('p', { class: 'eyebrow' }, `Фраза ${n}`), btn, h('h2', {}, q.q), opts, dunno], { dock: false });
        });
        if (ok) correct++;
      }
      parts.push(`${tier.level}=${correct}of${tier.items.length}`);
      if (correct < pass) break;
      est = tier.level;
    }
    if (est === s.tiers[s.tiers.length - 1].level) est += '+';
    state.level = est;
    save();
    await R.show([h('p', { class: 'eyebrow' }, 'Результат'), h('h1', {}, est === 'A0' ? 'Самое начало' : `Примерно ${est}`),
      h('p', {}, LEVEL_NOTE[est] || LEVEL_NOTE['B1+']),
      h('p', { class: 'muted' }, 'Это грубая оценка по короткому тесту. Она уточнится по твоим результатам в уроках.')], { ready: true });
    return { tag: 'PL', val: `${parts.join(' ')} r=${replays} est=${est}` };
  },

  async choose(R, s) {
    const picked = new Set();
    const chips = s.options.map((o) => {
      const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, o.label);
      b.addEventListener('click', () => {
        if (picked.has(o.id)) picked.delete(o.id);
        else if (s.max === 1) { picked.clear(); chips.forEach((c) => c.setAttribute('aria-pressed', 'false')); picked.add(o.id); }
        else if (!s.max || picked.size < s.max) picked.add(o.id);
        b.setAttribute('aria-pressed', String(picked.has(o.id)));
        R.ready(picked.size > 0);
      });
      return b;
    });
    const text = s.text ? h('textarea', { class: 'field', rows: '2', maxlength: '140', placeholder: s.text }) : null;
    await R.show([h('h1', {}, s.title), s.hint && h('p', { class: 'muted' }, s.hint), h('div', { class: 'chips' }, chips), text]);
    const out = [{ tag: 'S', val: `${s.id}=${[...picked].join(',')}` }];
    if (text && clean(text.value)) out.push({ tag: 'S', val: `${s.id}t=(${clean(text.value)})` });
    return out;
  },

  async listen(R, s) {
    const ids = [].concat(s.audio);
    let ok = false;
    const fb = h('p', { class: 'feedback', 'aria-live': 'polite' });
    const opts = R.options(s.options, s.answer, {
      enabled: false,
      onPick: (i) => { ok = i === s.answer; fb.textContent = (ok ? 'Верно. ' : 'Не совсем. ') + (s.explain || ''); R.ready(); },
    });
    const plays0 = R.plays;
    await R.show([h('p', { class: 'eyebrow' }, 'Послушай и пойми суть'), h('h1', {}, s.title || 'Что происходит?'),
      R.playBtn(() => ids.map((id) => R.clip(id)), { onDone: () => opts.enable() }), h('h2', {}, s.q), opts, fb]);
    return { tag: 'G', val: `${ids[0]}=${ok ? 'ok' : 'x'}.r${Math.max(0, R.plays - plays0 - 1)}`, ok };
  },

  async chunk(R, s) {
    const it = R.catalog.items[s.item];
    await R.show([h('p', { class: 'eyebrow' }, 'Новая фраза'), h('p', { class: 'phrase' }, it.en), h('p', { class: 'gloss' }, it.ru),
      it.note && h('p', { class: 'note' }, it.note),
      h('div', { class: 'row' }, R.playBtn(() => R.clip(s.item), { onDone: () => R.ready() }),
        R.hasSlow(s.item) && R.playBtn(() => R.clip(s.item, { slow: true }), { label: 'Медленно', onDone: () => R.ready() })),
      R.flagBtn(s.item)]);
  },

  async shadow(R, s) {
    const it = R.catalog.items[s.item];
    let rate = null, used = false, mine = null;
    const rateRow = h('div', { class: 'row' }, ['Не вышло', 'Почти', 'Как образец'].map((t, i) => {
      const b = h('button', { class: 'btn', type: 'button' }, t);
      b.addEventListener('click', () => {
        rate = i;
        rateRow.querySelectorAll('button').forEach((x) => x.classList.remove('picked'));
        b.classList.add('picked');
        R.ready();
      });
      return b;
    }));
    const micBox = h('div', {});
    if (canRecord()) {
      const rec = h('button', { class: 'btn', type: 'button' }, 'Записать себя');
      const compare = h('div', { class: 'row' });
      let handle = null;
      rec.addEventListener('click', async () => {
        if (handle) { rec.disabled = true; const hd = handle; handle = null; mine = await hd.stop(); return; }
        try {
          stop();
          handle = await start(8000);
          rec.textContent = 'Стоп';
          rec.classList.add('rec');
          handle.stopped.then((url) => {
            handle = null; mine = url; used = !!url;
            rec.textContent = 'Записать ещё раз'; rec.classList.remove('rec'); rec.disabled = false;
            if (url) compare.replaceChildren(R.playBtn(() => mine, { label: 'Моя запись' }), R.playBtn(() => R.clip(s.item), { label: 'Образец' }));
          });
        } catch {
          micBox.replaceChildren(h('p', { class: 'muted' }, 'Микрофон недоступен. Просто скажи фразу вслух три раза.'));
        }
      });
      micBox.append(rec, compare);
    } else {
      micBox.append(h('p', { class: 'muted' }, 'Скажи фразу вслух три раза, стараясь попасть в ритм образца.'));
    }
    await R.show([h('p', { class: 'eyebrow' }, 'Повтори вслух'), h('p', { class: 'phrase' }, it.en), h('p', { class: 'gloss' }, it.ru),
      h('h2', {}, '1. Послушай'), h('div', { class: 'row' }, R.playBtn(() => R.clip(s.item)),
        R.hasSlow(s.item) && R.playBtn(() => R.clip(s.item, { slow: true }), { label: 'Медленно' })),
      h('h2', {}, '2. Скажи так же'), micBox, h('h2', {}, '3. Оцени себя честно'), rateRow]);
    return { tag: 'H', val: `${s.item}=${rate}.${used ? 'm' : 'n'}`, ok: rate === 2 };
  },

  async tiles(R, s) {
    const it = R.catalog.items[s.item];
    const target = it.en.split(' ');
    let extra = s.distractors;
    if (!extra) {
      const have = new Set(target.map((w) => normEn(w)));
      const pool = [...new Set(Object.values(R.catalog.items).filter((x) => x.srs).flatMap((x) => x.en.split(' ')))]
        .filter((w) => !have.has(normEn(w)));
      extra = shuffled(pool).slice(0, 2);
    }
    let attempts = 0, firstOk = null, firstGot = '', lastOk = false;
    const answer = h('div', { class: 'tiles answer', 'aria-label': 'Твоя фраза' });
    const pool = h('div', { class: 'tiles' });
    const fb = h('p', { class: 'feedback', 'aria-live': 'polite' });
    const check = h('button', { class: 'btn', type: 'button', disabled: true }, 'Проверить');
    const sync = () => { check.disabled = answer.children.length !== target.length; };
    const fill = () => {
      answer.replaceChildren();
      pool.replaceChildren(...shuffled([...target, ...extra]).map((w) => {
        const t = h('button', { class: 'tile', type: 'button' }, w);
        t.addEventListener('click', () => { (t.parentNode === pool ? answer : pool).append(t); sync(); });
        return t;
      }));
      sync();
    };
    fill();
    check.addEventListener('click', () => {
      attempts++;
      const got = [...answer.children].map((t) => t.textContent).join(' ');
      const ok = got === it.en;
      if (firstOk === null) { firstOk = ok; firstGot = got; }
      lastOk = ok;
      if (ok || attempts >= 2) {
        fb.textContent = ok ? 'Верно.' : `Правильно так: ${it.en}`;
        check.disabled = true;
        pool.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        answer.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        play(R.clip(s.item, { vary: true }));
        R.ready();
      } else {
        fb.textContent = 'Не так. Попробуй ещё раз.';
        fill();
      }
    });
    await R.show([h('p', { class: 'eyebrow' }, 'Собери фразу'), h('h1', {}, it.ru),
      h('p', { class: 'muted' }, 'Нажимай слова по порядку. Лишние слова тоже есть.'), answer, pool, check, fb]);
    // ok = first try; x2 = right on the second try; xx = answer had to be shown. The first wrong order is kept for the teacher.
    return { tag: 'T', val: `${s.item}=${firstOk ? 'ok' : `${lastOk ? 'x' + attempts : 'xx'}(${clean(firstGot, 80)})`}`, ok: !!firstOk };
  },

  async pair(R, s) {
    let ok = false;
    const fb = h('p', { class: 'feedback', 'aria-live': 'polite' });
    const opts = R.options(s.options, s.answer, {
      enabled: false,
      onPick: (i) => { ok = i === s.answer; fb.textContent = (ok ? 'Верно. ' : 'Не совсем. ') + (s.explain || ''); R.ready(); },
    });
    await R.show([h('p', { class: 'eyebrow' }, 'Различи на слух'), h('h1', {}, s.title || 'Что именно прозвучало?'),
      R.playBtn(() => R.clip(s.audio), { onDone: () => opts.enable() }), opts, fb]);
    return { tag: 'P', val: `${s.audio}=${ok ? 'ok' : 'x'}`, ok };
  },

  async dictation(R, s) {
    const it = R.catalog.items[s.item];
    let ok = null, typed = '';
    const input = h('input', { class: 'field', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off',
      spellcheck: 'false', inputmode: 'text', lang: 'en', placeholder: 'Напиши, что услышал' });
    const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const check = h('button', { class: 'btn', type: 'button' }, 'Проверить');
    check.addEventListener('click', () => {
      if (!input.value.trim()) return;
      typed = input.value;
      // A missing apostrophe (im, dont) is a typing slip, not a listening mistake.
      ok = normEn(typed).replace(/'/g, '') === normEn(it.en).replace(/'/g, '');
      input.disabled = true;
      check.disabled = true;
      fb.replaceChildren(h('p', {}, ok ? 'Верно.' : 'Есть отличия. Правильно так:'), h('p', { class: 'phrase small' }, it.en), h('p', { class: 'gloss' }, it.ru));
      R.ready();
    });
    await R.show([h('p', { class: 'eyebrow' }, 'Диктант'), h('h1', {}, 'Запиши на слух'),
      h('div', { class: 'row' }, R.playBtn(() => R.clip(s.item, { vary: true })),
        R.hasSlow(s.item) && R.playBtn(() => R.clip(s.item, { slow: true }), { label: 'Медленно' })),
      input, check, fb, R.flagBtn(s.item)]);
    return { tag: 'D', val: `${s.item}=${ok ? 'ok' : `(${clean(typed, 80)})`}`, ok: !!ok };
  },

  async recall(R, s) {
    const it = R.catalog.items[s.item];
    const t0 = Date.now();
    let hinted = false, grade = null, latency = 0;
    const hint = h('p', { class: 'note' });
    const answer = h('div', {});
    const hintBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Подсказка');
    const reveal = h('button', { class: 'btn', type: 'button' }, 'Я сказал. Показать ответ');
    hintBtn.addEventListener('click', () => {
      hinted = true;
      hint.textContent = it.en.split(' ').map((w) => w[0] + '…').join(' ');
      hintBtn.disabled = true;
    });
    reveal.addEventListener('click', () => {
      latency = Math.min(999, Math.round((Date.now() - t0) / 100));
      reveal.remove(); hintBtn.remove();
      const row = h('div', { class: 'row' }, ['Не вспомнил', 'С ошибкой', 'Точно'].map((t, i) => {
        const b = h('button', { class: 'btn', type: 'button' }, t);
        b.addEventListener('click', () => {
          grade = i;
          row.querySelectorAll('button').forEach((x) => x.classList.remove('picked'));
          b.classList.add('picked');
          R.ready();
        });
        return b;
      }));
      answer.append(h('p', { class: 'phrase' }, it.en), R.playBtn(() => R.clip(s.item, { vary: true })), h('h2', {}, 'Как получилось?'), row);
      play(R.clip(s.item, { vary: true }));
    });
    await R.show([h('p', { class: 'eyebrow' }, 'Вспомни и скажи вслух'), h('h1', {}, s.prompt || `Скажи по-английски: «${it.ru}»`),
      hint, h('div', { class: 'row' }, reveal, hintBtn), answer]);
    const flag = grade === 0 ? 'x' : hinted ? 'h' : 'v';
    return { tag: 'R', val: `${s.item}=${grade}.${latency}.${flag}`, ok: grade === 2 && !hinted };
  },

  async dialogue(R, s) {
    const log = h('div', { class: 'chat' });
    let rate = null;
    const done = R.show([h('p', { class: 'eyebrow' }, 'Разговор по ролям'), h('h1', {}, s.title), s.intro && h('p', { class: 'muted' }, s.intro), log]);
    const tap = (label, cls = 'btn') => new Promise((resolve) => {
      const b = h('button', { class: cls, type: 'button' }, label);
      b.addEventListener('click', () => { b.remove(); resolve(); });
      log.append(b);
      b.scrollIntoView({ block: 'nearest' });
    });
    for (const turn of s.turns) {
      if (turn.who === 'them') {
        const it = R.catalog.items[turn.audio];
        const text = h('p', { class: 'gloss', hidden: true }, it.en);
        const show = h('button', { class: 'linkbtn', type: 'button', onclick: () => { text.hidden = false; show.remove(); } }, 'показать текст');
        await tap('Слушать собеседника', 'btn play');
        const bubble = h('div', { class: 'bubble them' }, R.playBtn(() => R.clip(turn.audio), { label: 'Ещё раз' }), show, text);
        log.append(bubble);
        await play(R.clip(turn.audio));
      } else {
        const it = R.catalog.items[turn.item];
        const bubble = h('div', { class: 'bubble you' }, h('p', {}, turn.prompt), h('p', { class: 'muted' }, 'Скажи это вслух по-английски.'));
        log.append(bubble);
        await tap('Я сказал. Показать, как надо');
        bubble.append(h('p', { class: 'phrase small' }, it.en));
        await play(R.clip(turn.item));
      }
    }
    const row = h('div', { class: 'row' }, ['Тяжело', 'С заминками', 'Уверенно'].map((t, i) => {
      const b = h('button', { class: 'btn', type: 'button' }, t);
      b.addEventListener('click', () => {
        rate = i;
        row.querySelectorAll('button').forEach((x) => x.classList.remove('picked'));
        b.classList.add('picked');
        R.ready();
      });
      return b;
    }));
    log.append(h('h2', {}, 'Как прошёл разговор?'), row);
    row.scrollIntoView({ block: 'nearest' });
    await done;
    return { tag: 'DG', val: `1=${rate}`, ok: rate === 2 };
  },

  async mission(R, s) {
    await R.show([h('p', { class: 'eyebrow' }, 'Задание на сегодня'), h('h1', {}, 'Вынеси это в реальную жизнь'),
      h('p', { class: 'phrase small' }, s.text),
      h('p', { class: 'muted' }, 'Завтра на главном экране спрошу, получилось ли. Если скажешь фразу при родителе, отметь это: так результат засчитывается надёжнее.')], { ready: true });
    R.missionText = s.text;
  },
};

export { preload };
