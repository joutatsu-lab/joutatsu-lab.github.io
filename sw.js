// Service Worker — オフラインでも開けるようにアプリ一式をキャッシュする。
// データ本体はlocalStorageにあるため、ここでは静的ファイルだけを扱う。
const CACHE = 'tc-v1';
const ASSETS = [
  './',
  './index.html',
  './core.js',
  './ui-core.js',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// キャッシュ優先＋バックグラウンド更新（stale-while-revalidate）。
// 古い版が一瞬表示されても、次に開いたときには最新になっている。
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((res) => {
          if (res.ok && new URL(e.request.url).origin === location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
