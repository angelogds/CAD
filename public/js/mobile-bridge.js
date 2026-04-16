(function () {
  function isCapacitorApp() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  async function postJSON(url, payload) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload || {}),
      });
    } catch (err) {
      console.warn('[mobile-bridge] erro de rede:', err?.message || err);
    }
  }

  function normalizeDeepLink(raw) {
    if (!raw) return '/dashboard';
    try {
      const u = new URL(raw);
      return `${u.pathname}${u.search || ''}${u.hash || ''}` || '/dashboard';
    } catch (_e) {
      if (String(raw).startsWith('/')) return String(raw);
      return '/dashboard';
    }
  }

  async function bootstrapCapacitor() {
    if (!isCapacitorApp()) return;

    const { Capacitor } = window;
    const App = Capacitor.Plugins?.App;
    const PushNotifications = Capacitor.Plugins?.PushNotifications;

    if (App?.addListener) {
      App.addListener('appUrlOpen', (event) => {
        const path = normalizeDeepLink(event?.url);
        window.location.assign(path);
      });
    }

    if (!PushNotifications) return;

    try {
      await PushNotifications.requestPermissions();
      await PushNotifications.register();

      PushNotifications.addListener('registration', async (token) => {
        await postJSON('/mobile/devices/register', {
          token: token?.value,
          platform: Capacitor.getPlatform?.() || 'android',
          appVersion: window.__APP_VERSION__ || null,
        });
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.warn('[mobile-bridge] erro no registro do push:', error);
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const deepLink = action?.notification?.data?.deepLink || action?.notification?.data?.url || '/dashboard';
        window.location.assign(normalizeDeepLink(deepLink));
      });
    } catch (err) {
      console.warn('[mobile-bridge] falha ao iniciar recursos nativos:', err?.message || err);
    }
  }

  window.addEventListener('load', () => {
    bootstrapCapacitor();
  });
})();
