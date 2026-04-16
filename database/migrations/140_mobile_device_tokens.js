module.exports.up = ({ db }) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mobile_device_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'android',
      device_label TEXT,
      app_version TEXT,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mobile_device_tokens_user ON mobile_device_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_mobile_device_tokens_platform ON mobile_device_tokens(platform);
    CREATE INDEX IF NOT EXISTS idx_mobile_device_tokens_revoked ON mobile_device_tokens(revoked_at);

    CREATE TRIGGER IF NOT EXISTS trg_mobile_device_tokens_updated
    AFTER UPDATE ON mobile_device_tokens
    BEGIN
      UPDATE mobile_device_tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);
};
