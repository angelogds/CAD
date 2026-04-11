const CACHE_NAME = 'campo-do-gado-v1';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/css/main.css',
  '/js/main.js',
  '/images/logo.png',
  '/images/notification-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/') || event.request.url.includes('/push/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const cacheClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheClone));
          }
          return networkResponse;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data.json();
  } catch (_e) {
    data = { title: 'Campo do Gado', body: event.data.text(), type: 'GENERIC' };
  }

  const options = {
    body: data.body || 'Nova notificação',
    icon: data.icon || '/images/notification-icon.png',
    badge: data.badge || '/images/badge.png',
    tag: data.tag || `notif-${Date.now()}`,
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: { ...(data.data || {}), url: data.url || '/dashboard' },
    timestamp: Date.now(),
    vibrate: [200, 100, 200],
  };

  switch (data.type) {
    case 'OS_CRITICA':
    case 'OS_EMERGENCIAL':
    case 'EMERGENCY':
      options.requireInteraction = true;
      options.vibrate = [500, 200, 500, 200, 500];
      options.actions = [
        { action: 'view', title: '👁️ Ver Agora' },
        { action: 'dismiss', title: '✓ Entendido' },
      ];
      break;
    case 'OS_ALTA':
      options.vibrate = [300, 100, 300];
      options.actions = [{ action: 'view', title: '👁️ Ver' }];
      break;
    case 'PREVENTIVA_ATRASADA':
      options.actions = [
        { action: 'view', title: '👁️ Ver Preventiva' },
        { action: 'snooze', title: '⏰ Lembrar Depois' },
      ];
      break;
    default:
      break;
  }

  event.waitUntil(self.registration.showNotification(data.title || 'Campo do Gado', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};
  const url = data.url || '/dashboard';

  if (action === 'dismiss' || action === 'snooze') return;

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
