// Service worker: app shell offline, hashed assets cache-first, data/index files network-first, media on first use.
// Bump VERSION to drop old caches.
const VERSION = "v2";
const SHELL = "rc-shell-" + VERSION;
const MEDIA = "rc-media-" + VERSION;
const SHELL_FILES = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== MEDIA).map((k) => caches.delete(k)))));
  self.clients.claim();
});

const put = (cache, req, res) => {
  // 206 partial responses and opaque/error responses can't be cached
  if (res && res.status === 200 && res.type === "basic") caches.open(cache).then((c) => c.put(req, res.clone())).catch(() => {});
  return res;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.headers.has("range")) return; // let the browser stream audio directly

  // page navigations: network first, fall back to the cached shell (offline play)
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => put(SHELL, "/index.html", r)).catch(() => caches.match("/index.html")));
    return;
  }
  // small mutable indexes (voice/music lists), manifest, json: network first so re-baked audio shows up
  if (url.pathname.endsWith(".json") || url.pathname.endsWith(".webmanifest")) {
    e.respondWith(fetch(req).then((r) => put(SHELL, req, r)).catch(() => caches.match(req)));
    return;
  }
  // hashed build assets + models + audio + textures: cache first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => put(url.pathname.startsWith("/assets/") ? SHELL : MEDIA, req, r))));
});
