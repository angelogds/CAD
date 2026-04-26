const webPush = require('web-push');
const pushRepository = require('./push.repository');
const fcmService = require('./fcm.service');

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

    if (fcmService.isEnabled()) {
      try {
        await fcmService.sendToUsers([Number(userId)], payload);
      } catch (err) {
        console.warn('[push] falha no envio FCM para usuário', userId, err?.message || err);
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

    const summary = {
      success: true,
      sent: results.filter((result) => result.status === 'sent').length,
      failed: results.filter((result) => result.status === 'failed').length,
    };

    if (fcmService.isEnabled()) {
      const userIds = [...new Set(subscriptions.map((sub) => Number(sub.user_id)).filter(Boolean))];
      try {
        await fcmService.sendToUsers(userIds, payload);
      } catch (err) {
        console.warn('[push] falha no envio FCM em massa:', err?.message || err);
      }
    }

    return summary;
  }

  /**
   * Backward-compatible alias used by older modules (e.g., OS service).
   * Keep until all callers are migrated to sendToAll.
   */
  async sendPushToAll(payload, filterFn = null) {
    return this.sendToAll(payload, filterFn);
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
      sound: ['CRITICA', 'EMERGENCIAL', 'ALTA'].includes(priority) ? '/audio/os-critica.mp3' : '/audio/os-nova.mp3',
      data: { osId: osData.id, type: 'NEW_OS', priority, sound: '/audio/os-nova.mp3' },
    };

    if (osData.tecnico_id) {
      return this.sendToUser(osData.tecnico_id, payload);
    }

    return this.sendToAll(payload, () => true);
  }

  async notifyIntelligentOSAlerts(osData = {}) {
    const prioridade = String(osData.prioridade || osData.grau || '').toUpperCase();
    const status = String(osData.status || '').toUpperCase();
    const osId = Number(osData.id || osData.osId || 0);
    if (!osId) return { skipped: true, reason: 'os_id_missing' };

    if (['CRITICA', 'CRITICO', 'ALTA', 'EMERGENCIAL'].includes(prioridade)) {
      await this.sendToAll({
        title: '🚨 OS crítica',
        body: `OS #${osId} requer atenção imediata.`,
        type: 'OS_CRITICA',
        requireInteraction: true,
        sound: '/audio/os-critica.mp3',
        url: `/os/${osId}`,
        data: { osId, type: 'OS_CRITICA' },
      });
    }

    if (status.includes('PARAD')) {
      await this.sendToAll({
        title: '⛔ OS parada',
        body: `OS #${osId} está parada e precisa de ação.`,
        type: 'OS_PARADA',
        requireInteraction: true,
        url: `/os/${osId}`,
        data: { osId, type: 'OS_PARADA' },
      });
    }

    if (osData.prazo_em_horas != null && Number(osData.prazo_em_horas) <= 4) {
      await this.sendToAll({
        title: '⏰ OS próxima do prazo',
        body: `OS #${osId} próxima do prazo limite.`,
        type: 'OS_PRAZO',
        url: `/os/${osId}`,
        data: { osId, type: 'OS_PRAZO' },
      });
    }

    return { ok: true };
  }

  async notifyOSStatusChange(osData, oldStatus, newStatus) {
    const normalizedStatus = String(newStatus || '').toUpperCase();
    const isFinalizada = ['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CONCLUÍDA'].includes(normalizedStatus);
    const payload = {
      title: `📋 OS #${osData.id} - ${newStatus}`,
      body: `${osData.equipamento}: Status alterado de ${oldStatus} para ${newStatus}`,
      type: 'MUDANCA_STATUS',
      tag: `os-status-${osData.id}`,
      url: `/os/${osData.id}`,
      sound: isFinalizada ? '/audio/os-finalizada.mp3' : '/audio/os-status.mp3',
      data: {
        osId: osData.id,
        oldStatus,
        newStatus,
        type: isFinalizada ? 'OS_FINALIZADA' : 'STATUS_CHANGE',
      },
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



  async sendEventNotification(eventKey, users, payloadOverrides = {}) {
    const map = {
      nova_os_aberta: { type: 'NOVA_OS_ABERTA', channelId: 'os_critica', title: 'Nova OS aberta', body: 'Uma nova ordem de serviço foi aberta.' },
      os_atribuida_mecanico: { type: 'OS_ATRIBUIDA_MECANICO', channelId: 'os_atribuicao', title: 'OS atribuída', body: 'Você recebeu uma nova OS para atendimento.' },
      os_fechada: { type: 'OS_FECHADA', channelId: 'os_status', title: 'OS fechada', body: 'Uma OS foi finalizada.' },
      preventiva_vencendo: { type: 'PREVENTIVA_VENCENDO', channelId: 'preventivas', title: 'Preventiva vencendo', body: 'Preventiva próxima do vencimento.' },
      solicitacao_criada: { type: 'SOLICITACAO_CRIADA', channelId: 'solicitacoes', title: 'Solicitação criada', body: 'Uma nova solicitação foi criada.' },
      solicitacao_comprada: { type: 'SOLICITACAO_COMPRADA', channelId: 'compras', title: 'Solicitação comprada', body: 'Uma solicitação foi comprada.' },
      material_recebido: { type: 'MATERIAL_RECEBIDO', channelId: 'almoxarifado', title: 'Material recebido', body: 'Material recebido no almoxarifado.' },
      aviso_operacional: { type: 'AVISO_OPERACIONAL', channelId: 'avisos', title: 'Aviso operacional', body: 'Novo aviso operacional.' },
    };

    const base = map[eventKey] || map.aviso_operacional;
    const payload = { ...base, ...payloadOverrides };

    for (const userId of users) {
      await this.sendToUser(userId, payload);
    }

    if (fcmService.isEnabled()) {
      await fcmService.sendToUsers(users, payload);
    }

    return { ok: true };
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
