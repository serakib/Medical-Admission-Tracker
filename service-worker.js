/* Medical Admission Pro service worker.
 * Only same-origin static files and the public question bank are cached.
 * Authentication, Firebase, Apps Script and all POST requests always use the network.
 */
const CACHE_PREFIX = 'mat-pwa-';
const SHELL_CACHE = CACHE_PREFIX + 'shell-v2';
const DATA_CACHE = CACHE_PREFIX + 'data-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './public/assets/favicon.svg',
  './public/assets/pwa-icon.svg',
  './js/features/offline-study.js',
  './data/questions.json',
  './data/question-bank-info.json'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) &&
      key !== SHELL_CACHE && key !== DATA_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (_) {
        return (await caches.match(request)) ||
          (await caches.match('./offline.html')) ||
          new Response('অফলাইন পৃষ্ঠা পাওয়া যায়নি। আগে একবার ইন্টারনেটসহ ওয়েবসাইট খুলুন।', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  const isQuestionData = url.pathname.endsWith('/data/questions.json') ||
    url.pathname.endsWith('/data/question-bank-info.json');

  if (isQuestionData) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response('প্রশ্নব্যাংক offline cache-এ নেই। ইন্টারনেট চালু করে ওয়েবসাইটটি আবার খুলুন।', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Cache-first for same-origin static assets; never intercept external APIs.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && (request.destination === 'script' ||
        request.destination === 'style' || request.destination === 'image' ||
        request.destination === 'font')) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  })());
});
