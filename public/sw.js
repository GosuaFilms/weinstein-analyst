// Service Worker — handles Web Push notifications for Weinstein Analyst
// Located at /sw.js (registered from root scope)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
