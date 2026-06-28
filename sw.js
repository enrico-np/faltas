/*
 * Service Worker — faz o app funcionar offline.
 * Estratégia: cacheia os arquivos do app na instalação e serve do cache.
 * Como tudo é local (sem chamadas de rede), isto basta para abrir sem internet.
 */
const CACHE = "faltas-v5";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./app.js",
  "./db.js",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((resp) => resp || fetch(e.request))
  );
});
