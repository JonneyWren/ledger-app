// sw.js —— 应用壳缓存（离线可用）。仅缓存同源静态资源；GitHub API 请求始终走网络。
const CACHE = 'ledger-shell-v3';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './icon.svg',
  './js/main.js',
  './js/pages.js',
  './js/manage.js',
  './js/entry.js',
  './js/dom.js',
  './js/store.js',
  './js/stats.js',
  './js/sync.js',
  './js/merge.js',
  './js/db.js',
  './js/money.js',
  './js/i18n.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // 非同源/非 GET 一律走网络
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
