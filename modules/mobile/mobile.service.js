const db = require('../../database/db');

class MobileService {
  registerDevice({ userId, token, platform = 'android', appVersion = null, deviceLabel = null }) {
    if (!userId || !token) throw new Error('userId e token são obrigatórios.');

    return db.prepare(`
      INSERT INTO mobile_device_tokens (user_id, token, platform, app_version, device_label, revoked_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(token) DO UPDATE SET
        user_id = excluded.user_id,
        platform = excluded.platform,
        app_version = excluded.app_version,
        device_label = excluded.device_label,
        revoked_at = NULL,
        last_seen_at = CURRENT_TIMESTAMP
    `).run(Number(userId), String(token), String(platform || 'android'), appVersion || null, deviceLabel || null);
  }

  revokeDevice({ userId, token }) {
    if (!userId || !token) throw new Error('userId e token são obrigatórios.');
    return db.prepare(`
      UPDATE mobile_device_tokens
      SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND token = ?
    `).run(Number(userId), String(token));
  }

  listActiveTokensByUsers(userIds = []) {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    const placeholders = userIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT *
      FROM mobile_device_tokens
      WHERE revoked_at IS NULL
        AND user_id IN (${placeholders})
    `).all(...userIds.map((id) => Number(id)));
  }
}

module.exports = new MobileService();
