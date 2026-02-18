/* BALANZA GM — SW v0.1.0 Etapa 2 */
const CACHE_NAME = 'balanzagm-v0.1.0-etapa2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './assets/escudo/escudo.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/hero/hero_resumen.webp',
  './assets/hero/hero_ingresos.webp',
  './assets/hero/hero_gastos_fijos.webp',
  './assets/hero/hero_gastos_varios.webp',
  './assets/hero/hero_transferencias.webp',
  './assets/hero/hero_presupuesto.webp',
  './assets/hero/hero_presupssnto.webp',
  './assets/hero/hero_analitica.webp',
  './assets/hero/hero_alertas.webp',
  './assets/hero/hero_catalogo.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Navegación SPA: siempre sirve index.html offline
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(cached => cached || fetch(req))
    );
    return;
  }

  // Cache-first para assets
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => cached);
    })
  );
});
