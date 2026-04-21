const CACHE_NAME = 'campo-do-gado-v2-mobile';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/css/app.css',
  '/js/app-layout.js',
  '/js/push.js',
  '/manifest.webmanifest',
  '/images/pwa/icon.png',
  '/images/pwa/maskable-icon.png',
  '/images/notification-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const bypassPrefixes = ['/push/', '/mobile/', '/auth/'];
  const shouldBypass = bypassPrefixes.some((prefix) => requestUrl.pathname.startsWith(prefix));
  if (shouldBypass) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkPromise = fetch(event.request)
        .then((response) => {
          if (response && response.ok && requestUrl.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkPromise;
    })
  );
});

function soundByType(type) {
  const normalizedType = String(type || '').toUpperCase();
  if (normalizedType === 'NOVA_OS_ABERTA') return '/audio/os-nova.mp3';
  if (normalizedType === 'OS_FECHADA') return '/audio/os-finalizada.mp3';
  if (normalizedType === 'OS_ATRIBUIDA_MECANICO') return '/audio/os-status.mp3';
  return '/audio/notification.mp3';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: 'Campo do Gado', body: 'Nova notificação operacional.' };
  }

  const deepLink = data.deepLink || data.url || data.data?.deepLink || data.data?.url || '/dashboard';
  const payload = {
    body: data.body || 'Nova notificação operacional.',
    icon: data.icon || '/images/notification-icon.png',
    badge: data.badge || '/images/badge.png',
    data: {
      ...data.data,
      deepLink,
      sound: data.sound || data.data?.sound || soundByType(data.type || data.data?.type),
    },
    tag: data.tag || `notif-${Date.now()}`,
    requireInteraction: !!data.requireInteraction,
    vibrate: data.vibrate || [220, 120, 220],
    actions: data.actions || [{ action: 'open', title: 'Abrir' }],
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'Campo do Gado', payload);
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clientsList.forEach((client) => {
      client.postMessage({ type: 'PUSH_NOTIFICATION_RECEIVED', sound: payload.data.sound });
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const url = data.deepLink || data.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
      return null;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
