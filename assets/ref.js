// Reference pages: any <button data-play="k0201"> plays that phrase.
import { loadCatalog, registerSW, state } from './store.js';
import { play } from './audio.js';

registerSW();
loadCatalog().then((catalog) => {
  for (const b of document.querySelectorAll('[data-play]')) {
    const it = catalog.items[b.dataset.play];
    if (!it) { b.hidden = true; continue; }
    b.addEventListener('click', () => {
      const a = it.audio[state.settings.voice] || Object.values(it.audio)[0];
      play(a.n);
    });
  }
}).catch(() => {
  document.querySelectorAll('[data-play]').forEach((b) => { b.hidden = true; });
});
