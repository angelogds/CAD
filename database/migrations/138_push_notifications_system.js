module.exports.up = ({ db, tableExists, columnExists, addColumnIfMissing }) => {
  if (tableExists('push_subscriptions')) {
    addColumnIfMissing('push_subscriptions', 'user_agent', 'user_agent TEXT');
    addColumnIfMissing('push_subscriptions', 'updated_at', "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    addColumnIfMissing('push_subscriptions', 'is_active', 'is_active INTEGER DEFAULT 1');
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS push_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      os_critica INTEGER DEFAULT 1,
      os_alta INTEGER DEFAULT 1,
      os_media INTEGER DEFAULT 1,
      os_baixa INTEGER DEFAULT 0,
      preventivas_atrasadas INTEGER DEFAULT 1,
      preventivas_hoje INTEGER DEFAULT 1,
      mudanca_status_os INTEGER DEFAULT 1,
      lembretes_compliance INTEGER DEFAULT 1,
      alertas_emergencia INTEGER DEFAULT 1,
      quiet_hours_start TEXT DEFAULT '22:00',
      quiet_hours_end TEXT DEFAULT '07:00',
      timezone TEXT DEFAULT 'America/Sao_Paulo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS push_notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER,
      user_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      sent_at DATETIME,
      delivered_at DATETIME,
      clicked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active);
    CREATE INDEX IF NOT EXISTS idx_push_logs_status ON push_notification_logs(status);
    CREATE INDEX IF NOT EXISTS idx_push_logs_user ON push_notification_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_push_logs_created ON push_notification_logs(created_at);

    CREATE TRIGGER IF NOT EXISTS trg_push_subscriptions_updated
    AFTER UPDATE ON push_subscriptions
    BEGIN
      UPDATE push_subscriptions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_push_preferences_updated
    AFTER UPDATE ON push_preferences
    BEGIN
      UPDATE push_preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);
};
