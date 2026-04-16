const db = require('../../database/db');

class PushRepository {
  createSubscription(userId, subscription, userAgent) {
    const stmt = db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        user_agent = excluded.user_agent,
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP
    `);

    return stmt.run(
      userId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      userAgent || null
    );
  }

  getSubscriptionsByUser(userId) {
    return db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ? AND is_active = 1').all(userId);
  }

  getAllActiveSubscriptions() {
    return db.prepare('SELECT * FROM push_subscriptions WHERE is_active = 1').all();
  }

  deactivateSubscription(endpoint) {
    return db.prepare('UPDATE push_subscriptions SET is_active = 0 WHERE endpoint = ?').run(endpoint);
  }

  getPreferences(userId) {
    let prefs = db.prepare('SELECT * FROM push_preferences WHERE user_id = ?').get(userId);

    if (!prefs) {
      db.prepare('INSERT INTO push_preferences (user_id) VALUES (?)').run(userId);
      prefs = db.prepare('SELECT * FROM push_preferences WHERE user_id = ?').get(userId);
    }

    return prefs;
  }

  updatePreferences(userId, preferences) {
    const fields = Object.keys(preferences).filter((field) => field !== 'user_id');
    if (fields.length === 0) return null;

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => preferences[field]);
    values.push(userId);

    return db.prepare(`UPDATE push_preferences SET ${setClause} WHERE user_id = ?`).run(...values);
  }

  createLog(data) {
    return db.prepare(`
      INSERT INTO push_notification_logs
      (subscription_id, user_id, type, title, body, data, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.subscriptionId,
      data.userId,
      data.type,
      data.title,
      data.body,
      JSON.stringify(data.payload || {}),
      data.status || 'pending'
    );
  }

  updateLogStatus(logId, status, errorMessage = null) {
    const timestampField = status === 'sent' ? 'sent_at' : 'delivered_at';

    return db.prepare(`
      UPDATE push_notification_logs
      SET status = ?, error_message = ?, ${timestampField} = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, errorMessage, logId);
  }

  getStats(userId = null) {
    if (userId) {
      return db.prepare(`
        SELECT status, COUNT(*) AS count
        FROM push_notification_logs
        WHERE user_id = ?
        GROUP BY status
      `).all(userId);
    }

    return db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM push_notification_logs
      GROUP BY status
    `).all();
  }

  shouldNotify(userId, type) {
    const prefs = this.getPreferences(userId);
    if (!prefs) return false;

    const typeMap = {
      OS_CRITICA: 'os_critica',
      NOVA_OS_ABERTA: 'os_media',
      OS_ALTA: 'os_alta',
      OS_MEDIA: 'os_media',
      OS_BAIXA: 'os_baixa',
      PREVENTIVA_ATRASADA: 'preventivas_atrasadas',
      PREVENTIVA_HOJE: 'preventivas_hoje',
      MUDANCA_STATUS: 'mudanca_status_os',
      OS_FECHADA: 'mudanca_status_os',
      OS_ATRIBUIDA_MECANICO: 'mudanca_status_os',
      COMPLIANCE: 'lembretes_compliance',
      EMERGENCIA: 'alertas_emergencia',
      AVISO_OPERACIONAL: 'alertas_emergencia',
    };

    const prefField = typeMap[type];
    if (prefField && !prefs[prefField]) return false;

    if (prefs.quiet_hours_start && prefs.quiet_hours_end) {
      const currentTime = new Date().toTimeString().slice(0, 5);
      const start = prefs.quiet_hours_start;
      const end = prefs.quiet_hours_end;

      if (start > end) {
        if (currentTime >= start || currentTime <= end) return false;
      } else if (currentTime >= start && currentTime <= end) {
        return false;
      }
    }

    return true;
  }
}

module.exports = new PushRepository();
