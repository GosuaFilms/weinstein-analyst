// Service Worker — Weinstein Analyst
// Handles: PWA installability (fetch + cache), Web Push, notification clicks

const CACHE_NAME = 'weinstein-shell-v1';

// App shell assets to pre-cache on install
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first, fall back to cache for navigation ──────────────────
// API calls and edge functions always go to network.
// HTML navigation requests fall back to cached '/' if offline.
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Never intercept Supabase API / edge functions / external resources
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/functions/') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return; // let browser handle it normally
  }

  // For same-origin navigation: network-first, fall back to cached index, then 503
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .catch(() => caches.match('/').then(r => r ?? new Response('Offline', { status: 503 })))
    );
    return;
  }

  // For static assets (JS/CSS/images): cache-first
  if (
    url.pathname.match(/\.(js|css|png|svg|ico|webmanifest|woff2?)$/)
  ) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});

// ── Push event ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: '🔔 Alerta Weinstein', body: 'Una alerta ha sido disparada.' };
  try {
    if (event.data) data = event.data.json();
  } catch (_) {}

  const { title, body, icon = '/icon-192.png', tag, url } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icon-192.png',
      tag: tag ?? 'weinstein-alert',
      renotify: true,
      requireInteraction: false,
      data: { url: url ?? '/' },
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
