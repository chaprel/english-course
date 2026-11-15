// Service worker. Pages, scripts and data: network first (so a newly published lesson shows up at once),
// falling back to the cache when offline. Audio: cache first (file names are content hashes).
// Cache names are prefixed because every GitHub Pages site of one account shares the same origin.
const P = 'ec1';
const SHELL = `${P}-shell-v1`;
const AUDIO = `${P}-audio-v1`;
const SCOPE = new URL('./', self.location).pathname;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(`${P}-`) && k !== SHELL && k !== AUDIO).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function cacheFirst(req) {
  const cache = await caches.open(AUDIO);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req.url);
  if (res.ok) cache.put(req.url, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  const url = new URL(req.url);
  const key = url.origin + url.pathname;
  try {
    const res = await fetch(key, { cache: 'no-cache' });
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key) || (url.pathname.endsWith('/') && await cache.match(key + 'index.html'));
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const home = await cache.match(new URL(SCOPE, self.location).href);
      if (home) return home;
    }
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (/\/audio\/[0-9a-f]+\.mp3$/.test(url.pathname)) e.respondWith(cacheFirst(req));
  else e.respondWith(networkFirst(req));
});
