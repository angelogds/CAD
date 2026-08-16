module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_pending_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      conversation_id TEXT,
      action_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      expires_at DATETIME NOT NULL DEFAULT (datetime('now', '+15 minutes')),
      confirmed_at DATETIME,
      executed_at DATETIME,
      cancelled_at DATETIME,
      result_json TEXT,
      error_text TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_user_status
      ON ai_pending_actions(user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_expires
      ON ai_pending_actions(expires_at);
  `);
};
