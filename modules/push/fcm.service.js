let admin = null;
try {
  admin = require('firebase-admin');
} catch (_err) {
  admin = null;
}

const mobileService = require('../mobile/mobile.service');

function parseFirebaseServiceAccount() {
  if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.FCM_SERVICE_ACCOUNT_BASE64) {
    const decoded = Buffer.from(process.env.FCM_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }
  return null;
}

class FcmService {
  constructor() {
    this.enabled = false;
    if (!admin) return;

    try {
      const creds = parseFirebaseServiceAccount();
      if (!creds) return;
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(creds),
        });
      }
      this.enabled = true;
    } catch (err) {
      console.warn('[fcm] não inicializado:', err?.message || err);
      this.enabled = false;
    }
  }

  isEnabled() {
    return this.enabled;
  }

  async sendToUsers(userIds, payload) {
    if (!this.enabled) return { skipped: true, reason: 'fcm_not_configured' };

    const tokens = mobileService.listActiveTokensByUsers(userIds);
    if (!tokens.length) return { skipped: true, reason: 'no_tokens' };

    const message = {
      tokens: tokens.map((item) => item.token),
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        type: String(payload.type || 'GENERIC'),
        deepLink: String(payload.deepLink || payload.url || '/dashboard'),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: String(payload.channelId || 'operacional_geral'),
          sound: String(payload.soundName || 'default'),
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    return {
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
    };
  }
}

module.exports = new FcmService();
