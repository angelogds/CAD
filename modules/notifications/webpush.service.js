const db = require('../../database/db');

let webPush = null;
try {
  webPush = require('web-push');
} catch (_e) {
  webPush = null;
}

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

function configureWebPush() {
  if (!webPush) return false;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@campodogado.local';
  if (!publicKey || !privateKey) return false;
  if (!hasValidVapidKeyLength(publicKey, privateKey)) return false;
  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch (_e) {
    return false;
  }
}

function saveSubscription({ userId, subscription, userAgent }) {
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys || {};
  if (!userId || !endpoint || !keys.p256dh || !keys.auth) {
    throw new Error('Subscription inválida.');
  }

  db.prepare(`
    INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      updated_at = datetime('now')
  `).run(Number(userId), endpoint, keys.p256dh, keys.auth, userAgent || null);

  return { ok: true };
}

function listSubscriptionsForUsers(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const placeholders = userIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT id, user_id, endpoint, p256dh, auth
    FROM web_push_subscriptions
    WHERE user_id IN (${placeholders})
  `).all(...userIds.map(Number));
}

function targetUserIdsForOS() {
  // TODO: ajustar regra por perfil/permissão quando matriz de notificações estiver finalizada.
  return db.prepare(`SELECT id FROM users WHERE ativo = 1`).all().map((u) => Number(u.id));
}

function createNotificationRows({ osId, title, body, grau }) {
  const userIds = targetUserIdsForOS();
  const stmt = db.prepare(`
    INSERT INTO notificacoes_os (os_id, user_id, titulo, corpo, grau, status)
    VALUES (?, ?, ?, ?, ?, 'PENDENTE')
  `);
  for (const userId of userIds) {
    stmt.run(Number(osId), userId, title, body, grau || null);
  }
  return userIds;
}

async function sendOSPushNotifications({ osId, equipamento, grau, descricao }) {
  const resumo = String(descricao || '').slice(0, 120);
  const titlePrefix = ['CRITICO', 'CRÍTICO', 'ALTO', 'EMERGENCIAL'].includes(String(grau || '').toUpperCase())
    ? 'OS CRÍTICA'
    : 'Nova OS';
  const title = `${titlePrefix} - ${equipamento || 'Equipamento'}`;
  const body = `OS #${osId} • Grau: ${grau || '-'} • ${resumo}`;

  const userIds = createNotificationRows({ osId, title, body, grau });
  const subscriptions = listSubscriptionsForUsers(userIds);

  if (!subscriptions.length) return { sent: 0, skipped: userIds.length };

  const enabled = configureWebPush();
  if (!enabled) {
    // TODO: configurar VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY para envio real de push.
    return { sent: 0, skipped: subscriptions.length };
  }

  let sent = 0;
  for (const sub of subscriptions) {
    const payload = JSON.stringify({
      title,
      body,
      data: { id_os: Number(osId), url: `/os/${osId}` },
    });
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      db.prepare(`
        UPDATE notificacoes_os
        SET status='ENVIADO', enviado_em=datetime('now')
        WHERE os_id=? AND user_id=?
      `).run(Number(osId), Number(sub.user_id));
      sent += 1;
    } catch (e) {
      db.prepare(`
        UPDATE notificacoes_os
        SET status='ERRO', erro=?
        WHERE os_id=? AND user_id=?
      `).run(String(e.message || e), Number(osId), Number(sub.user_id));
    }
  }

  return { sent, skipped: Math.max(0, subscriptions.length - sent) };
}

module.exports = { saveSubscription, sendOSPushNotifications, configureWebPush };
