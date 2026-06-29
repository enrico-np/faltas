/*
 * Service Worker — modo offline COM atualização automática.
 *
 * Estratégia por tipo de arquivo:
 *  - Código (HTML/JS/manifest): NETWORK-FIRST. Tenta buscar a versão nova da
 *    internet; se conseguir, usa ela e atualiza o cache. Só cai no cache se
 *    estiver offline. Assim, novas versões do app aparecem sozinhas, sem
 *    precisar limpar cache manualmente.
 *  - Ícones: CACHE-FIRST. Quase nunca mudam, então servir do cache é mais
 *    rápido; busca da rede só se não estiver no cache.
 *
 * Isto resolve o problema de "a versão antiga fica presa": com network-first,
 * basta ter internet ao abrir o app para receber a atualização.
 */
const CACHE = "faltas-v9";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./app.js",
  "./db.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
];

// arquivos servidos cache-first (raramente mudam)
const SO_CACHE = ["icon-192.png", "icon-512.png", "icon-maskable-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();   // ativa a versão nova do SW imediatamente
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();  // assume o controle das abas abertas na hora
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;  // não mexe em POST etc.

  const url = new URL(req.url);
  const ehIcone = SO_CACHE.some((nome) => url.pathname.endsWith(nome));

  if (ehIcone) {
    // CACHE-FIRST para ícones
    e.respondWith(
      caches.match(req).then((resp) => resp || fetch(req))
    );
    return;
  }

  // NETWORK-FIRST para o resto (HTML/JS/manifest)
  e.respondWith(
    fetch(req)
      .then((resp) => {
        // guarda uma cópia atualizada no cache para uso offline futuro
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
