self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) {}

  const title = data.title || 'Novo alerta';
  const body = data.body || 'Você recebeu um novo alerta de manutenção.';
  const url = data.url || data.data?.url || '/dashboard';

  function soundByType(type) {
    const normalizedType = String(type || '').toUpperCase();
    if (normalizedType === 'NEW_OS') return '/audio/os-nova.mp3';
    if (normalizedType === 'STATUS_CHANGE') return '/audio/os-status.mp3';
    if (normalizedType === 'OS_FINALIZADA') return '/audio/os-finalizada.mp3';
    return '/audio/notification.mp3';
  }

  const sound = data.sound || data.data?.sound || soundByType(data.data?.type || data.type);

  const payload = {
    body,
    data: { url, sound },
    tag: data.tag || `alerta-${Date.now()}`,
    renotify: true,
    vibrate: [200, 120, 200],
    requireInteraction: false,
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, payload);
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clientsList.forEach((client) => client.postMessage({ type: 'PUSH_NOTIFICATION_RECEIVED', sound: payload.data.sound }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    })
  );
});
