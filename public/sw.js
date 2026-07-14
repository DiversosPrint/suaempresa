// Service Worker - Controle de Patio Print
// Desenvolvido por Ramalho Sistemas e Software

const CACHE_NAME = 'patio-sua-empresa-v3-app-icon-cache';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/seminovos',
  '/seminovos.html',
  '/css/seminovos.css',
  '/js/seminovos.js',
  '/images/logo-sua-empresa.png',
  '/images/logo-sua-empresa-transparente.png',
  '/images/login-sua-empresa.jpg',
  '/images/logo-sua-empresa.jpg',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch((err) => console.error('[SW] Erro ao cachear assets:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const noCachePaths = ['/frota', '/frota.html', '/js/frota.js', '/sw.js'];
  if (noCachePaths.some((path) => requestUrl.pathname === path)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status < 400 && ['basic', 'cors', 'opaque'].includes(response.type)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const pathname = new URL(event.request.url).pathname;
          if (pathname.startsWith('/seminovos')) {
            return (await caches.match('/seminovos')) || (await caches.match('/seminovos.html')) || (await caches.match('/index.html'));
          }
          return caches.match('/index.html');
        }
        return Response.error();
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
