/* Ratio — service worker : coque applicative hors-ligne + polices en cache */
const VERSION = 'ratio-v3.7.0';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css', 'css/base.css', 'css/components.css', 'css/views.css', 'css/editor.css', 'css/print.css',
  'js/util.js', 'js/icons.js', 'js/store.js', 'js/colors.js', 'js/mark.js', 'js/markdown.js', 'js/ui.js', 'js/layout.js', 'js/organize.js', 'js/seed.js',
  'js/views/library.js', 'js/views/course.js', 'js/views/editor.js', 'js/views/outline.js', 'js/views/review.js', 'js/views/revhub.js',
  'js/search.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'ratio-fonts').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Polices Google : cache d'abord (stale-while-revalidate)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('ratio-fonts').then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // Coque : réseau d'abord pour rester à jour, cache en secours (hors-ligne)
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
