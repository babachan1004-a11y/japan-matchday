// オフラインでも最後に見たデータを表示するための Service Worker。
// どのファイルもまずネットから取り、取れなければキャッシュを返す（常に最新を優先）。
const CACHE = 'jpm-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'clubs.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // data.json は ?t= 付きで毎回違う URL になるので、クエリを外した URL でキャッシュする
  const key = url.pathname.endsWith('/data.json') ? url.pathname : e.request;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
        return res;
      })
      .catch(() => caches.match(key).then((hit) => hit ?? Response.error())),
  );
});
