class PushNotificationClient {
  constructor() {
    this.publicKey = document.querySelector('meta[name="vapid-public-key"]')?.content || '';
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.subscription = null;
    this.initialized = false;
    this.registration = null;
  }

  async init() {
    if (!this.isSupported) return false;
    if (this.initialized) return true;

    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      this.registration = registration;
      this.initialized = true;
      await this.checkSubscription();
      return true;
    } catch (err) {
      console.error('Erro ao inicializar push:', err);
      return false;
    }
  }

  async checkSubscription() {
    if (!this.registration) return null;
    this.subscription = await this.registration.pushManager.getSubscription();
    return this.subscription;
  }

  async subscribe() {
    if (!this.initialized) {
      const initialized = await this.init();
      if (!initialized) throw new Error('Falha na inicialização');
    }

    if (!this.publicKey) throw new Error('Chave pública VAPID não configurada');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permissão negada pelo usuário');

    const applicationServerKey = this.urlBase64ToUint8Array(this.publicKey);

    this.subscription = await this.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    try {
      const response = await fetch('/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': this.getCsrfToken(),
        },
        body: JSON.stringify({ subscription: this.subscription }),
      });

      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Erro ao salvar assinatura');

      this.updateUI(true);
      return { success: true, message: 'Notificações ativadas!' };
    } catch (err) {
      if (this.subscription) await this.subscription.unsubscribe();
      throw err;
    }
  }

  async unsubscribe() {
    if (!this.subscription) await this.checkSubscription();
    if (!this.subscription) return { success: true, message: 'Não estava inscrito' };

    await fetch('/push/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.getCsrfToken(),
      },
      body: JSON.stringify({ endpoint: this.subscription.endpoint }),
    });

    await this.subscription.unsubscribe();
    this.subscription = null;
    this.updateUI(false);

    return { success: true, message: 'Notificações desativadas' };
  }

  async toggle() {
    const isSubscribed = await this.checkSubscription();
    return isSubscribed ? this.unsubscribe() : this.subscribe();
  }

  updateUI(isSubscribed) {
    const buttons = document.querySelectorAll('[data-push-toggle]');
    buttons.forEach((btn) => {
      if (isSubscribed) {
        btn.innerHTML = '🔔 Notificações Ativas';
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-success');
      } else {
        btn.innerHTML = '🔕 Ativar Notificações';
        btn.classList.remove('btn-success');
        btn.classList.add('btn-outline');
      }
    });

    window.dispatchEvent(new CustomEvent('pushSubscriptionChanged', { detail: { isSubscribed } }));
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
  }

  static checkSupport() {
    return {
      supported: 'serviceWorker' in navigator && 'PushManager' in window,
      permission: Notification.permission,
      serviceWorker: 'serviceWorker' in navigator,
    };
  }
}

window.PushNotificationClient = PushNotificationClient;
window.pushClient = new PushNotificationClient();

document.addEventListener('DOMContentLoaded', () => {
  const pushButtons = document.querySelectorAll('[data-push-toggle]');

  if (pushButtons.length > 0) {
    window.pushClient.init().then(() => {
      window.pushClient.checkSubscription().then((sub) => {
        window.pushClient.updateUI(!!sub);
      });
    });
  }
});
