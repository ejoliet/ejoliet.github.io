// SnapSplit service worker — caches the app shell for offline reuse.
// Network-first for navigation, cache-first for static assets.
'use strict';

const CACHE_NAME = 'snapsplit-v1';
const APP_SHELL = [
  './',
  './index.html',
  './js/money.js',
  './js/calc.js',
  './js/parser.js',
  './js/db.js',
  './js/entitlements.js',
  './js/cloud-adapter.js',
  './js/crypto-backup.js',
  './js/image-processing.js',
  './js/ocr.js',
  './js/app.js',
  './js/step-scan.js',
  './js/step-review.js',
  './js/step-people.js',
  './js/step-assign.js',
  './js/step-settle.js',
  './js/history.js',
  './js/ledger.js',
  './js/settings.js',
  './js/debug.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok && req.url.startsWith(self.location.origin)) {
          caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
