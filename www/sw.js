/*
 * Service worker de la versión web instalable (iPhone y navegadores).
 * - Al instalarse guarda la app completa (todo lo que carga index.html), así
 *   funciona sin internet.
 * - Páginas: primero la red (para recibir versiones nuevas) y, sin conexión, la copia.
 * - Archivos (js, css, imágenes): la copia al instante y se actualiza en segundo plano.
 * - Nada de otros dominios (Firebase, Google) pasa por aquí.
 * No se registra dentro de la app nativa (Android/iOS), que ya trae los archivos.
 */
const VERSION = '1.10.0';
const CACHE = 'lifecoinquest-' + VERSION;

async function precache(){
  const cache = await caches.open(CACHE);
  const res = await fetch('./index.html', { cache: 'no-cache' });
  const html = await res.clone().text();
  await cache.put('./index.html', res);
  const urls = new Set(['./', './manifest.webmanifest', './img/apple-touch-icon.png', './img/logo-192.png', './img/logo-512.png', './img/maskable-512.png']);
  html.replace(/(?:src|href)="([^"#:]+)"/g, (_, url) => { urls.add('./' + url.replace(/^\.\//, '')); return _; });
  // Un archivo que falte no debe impedir instalar el resto.
  await Promise.all([...urls].map(u => cache.add(new Request(u, { cache: 'no-cache' })).catch(() => {})));
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('lifecoinquest-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate'){
    e.respondWith((async () => {
      try{
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      }catch(err){
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const update = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (cached){ e.waitUntil(update); return cached; }
    return (await update) || Response.error();
  })());
});
