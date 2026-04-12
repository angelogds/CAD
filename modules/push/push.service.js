const webPush = require('web-push');
const pushRepository = require('./push.repository');

function decodeBase64Url(value) {
  if (!value) return Buffer.alloc(0);
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLength), 'base64');
}

function hasValidVapidKeyLength(publicKey, privateKey) {
  try {
    const publicKeyBytes = decodeBase64Url(publicKey);
    const privateKeyBytes = decodeBase64Url(privateKey);
    return publicKeyBytes.length === 65 && privateKeyBytes.length === 32;
  } catch (_err) {
    return false;
  }
}

class PushService {
  constructor() {
    this.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
    this.vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
    this.vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@campodogado.local';

    if (this.vapidPublicKey && this.vapidPrivateKey) {
      if (!hasValidVapidKeyLength(this.vapidPublicKey, this.vapidPrivateKey)) {
        console.warn('⚠️ WebPush não configurado: VAPID keys inválidas (esperado: public=65 bytes, private=32 bytes)');
        this.vapidPublicKey = '';
        this.vapidPrivateKey = '';
      } else {
        try {
          webPush.setVapidDetails(this.vapidSubject, this.vapidPublicKey, this.vapidPrivateKey);
          console.log('✅ WebPush configurado com sucesso');
        } catch (err) {
          console.error('❌ Erro ao configurar WebPush:', err.message);
        }
      }
    } else {
      console.warn('⚠️ WebPush não configurado: VAPID keys não encontradas');
    }
  }

  getVapidPublicKey() {
    return this.vapidPublicKey;
  }

  isConfigured() {
    return !!(this.vapidPublicKey && this.vapidPrivateKey);
  }

  async subscribe(userId, subscription, userAgent) {
    const result = pushRepository.createSubscription(userId, subscription, userAgent);

    await this.sendNotification(subscription, {
      title: '🔔 Notificações Ativadas',
      body: 'Você receberá alertas de OS críticas e preventivas.',
      type: 'WELCOME',
      requireInteraction: false,
    });

    return { success: true, id: result.lastInsertRowid };
  }

  async unsubscribe(endpoint) {
    pushRepository.deactivateSubscription(endpoint);
    return { success: true };
  }

  async sendNotification(subscription, payload) {
    if (!this.isConfigured()) throw new Error('WebPush não configurado');

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/images/notification-icon.png',
      badge: payload.badge || '/images/badge.png',
      tag: payload.tag || `notif-${Date.now()}`,
      requireInteraction: payload.requireInteraction || false,
      actions: payload.actions || [],
      data: payload.data || {},
      url: payload.url || '/dashboard',
      type: payload.type || 'GENERIC',
    });

    try {
      await webPush.sendNotification(subscription, pushPayload);
      return { success: true };
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        pushRepository.deactivateSubscription(subscription.endpoint);
      }
      throw err;
    }
  }

  async sendToUser(userId, payload) {
    if (!pushRepository.shouldNotify(userId, payload.type)) {
      return { skipped: true, reason: 'user_preferences' };
    }

    const subscriptions = pushRepository.getSubscriptionsByUser(userId);
    if (!subscriptions.length) return { skipped: true, reason: 'no_subscriptions' };

    const results = [];

    for (const sub of subscriptions) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      const logId = pushRepository.createLog({
        subscriptionId: sub.id,
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        payload: payload.data,
        status: 'pending',
      }).lastInsertRowid;

      try {
        await this.sendNotification(subscription, payload);
        pushRepository.updateLogStatus(logId, 'sent');
        results.push({ endpoint: sub.endpoint, status: 'sent' });
      } catch (err) {
        pushRepository.updateLogStatus(logId, 'failed', err.message);
        results.push({ endpoint: sub.endpoint, status: 'failed', error: err.message });
      }
    }

    return { success: true, results };
  }

  async sendToAll(payload, filterFn = null) {
    const subscriptions = pushRepository.getAllActiveSubscriptions();
    const results = [];

    for (const sub of subscriptions) {
      if (filterFn && !filterFn(sub)) continue;
      if (!pushRepository.shouldNotify(sub.user_id, payload.type)) continue;

      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        await this.sendNotification(subscription, payload);
        results.push({ userId: sub.user_id, status: 'sent' });
      } catch (err) {
        results.push({ userId: sub.user_id, status: 'failed', error: err.message });
      }
    }

    return {
      success: true,
      sent: results.filter((result) => result.status === 'sent').length,
      failed: results.filter((result) => result.status === 'failed').length,
    };
  }

  async notifyNewOS(osData) {
    const priority = osData.prioridade?.toUpperCase() || 'MEDIA';

    const payload = {
      title: `🚨 Nova OS ${priority}`,
      body: `OS #${osData.id}: ${osData.equipamento} - ${osData.descricao?.substring(0, 50)}...`,
      type: `OS_${priority}`,
      requireInteraction: ['CRITICA', 'EMERGENCIAL', 'ALTA'].includes(priority),
      tag: `os-${osData.id}`,
      url: `/os/${osData.id}`,
      data: { osId: osData.id, type: 'NEW_OS', priority },
    };

    if (osData.tecnico_id) {
      return this.sendToUser(osData.tecnico_id, payload);
    }

    return this.sendToAll(payload, () => true);
  }

  async notifyOSStatusChange(osData, oldStatus, newStatus) {
    const payload = {
      title: `📋 OS #${osData.id} - ${newStatus}`,
      body: `${osData.equipamento}: Status alterado de ${oldStatus} para ${newStatus}`,
      type: 'MUDANCA_STATUS',
      tag: `os-status-${osData.id}`,
      url: `/os/${osData.id}`,
      data: { osId: osData.id, oldStatus, newStatus, type: 'STATUS_CHANGE' },
    };

    if (osData.tecnico_id) await this.sendToUser(osData.tecnico_id, payload);
    if (osData.solicitante_id && osData.solicitante_id !== osData.tecnico_id) {
      await this.sendToUser(osData.solicitante_id, payload);
    }
  }

  async notifyPreventivaAtrasada(preventiva) {
    const payload = {
      title: '⚠️ Preventiva Atrasada',
      body: `${preventiva.equipamento}: ${preventiva.tipo} - Prevista para ${preventiva.data_prevista}`,
      type: 'PREVENTIVA_ATRASADA',
      requireInteraction: true,
      tag: `preventiva-${preventiva.id}`,
      url: `/preventivas/${preventiva.id}`,
      data: { preventivaId: preventiva.id, type: 'PREVENTIVA_ATRASADA' },
    };

    if (preventiva.responsavel_id) {
      await this.sendToUser(preventiva.responsavel_id, payload);
    }
  }

  async notifyEmergency(message, url = '/dashboard') {
    return this.sendToAll({
      title: '🆘 ALERTA DE EMERGÊNCIA',
      body: message,
      type: 'EMERGENCIA',
      requireInteraction: true,
      tag: `emergency-${Date.now()}`,
      url,
      data: { type: 'EMERGENCY', timestamp: Date.now() },
    });
  }

  getStats(userId = null) {
    return pushRepository.getStats(userId);
  }

  getPreferences(userId) {
    return pushRepository.getPreferences(userId);
  }

  updatePreferences(userId, preferences) {
    return pushRepository.updatePreferences(userId, preferences);
  }
}

module.exports = new PushService();
