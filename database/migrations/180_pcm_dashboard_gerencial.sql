PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pcm_dashboard_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  cards_json TEXT NOT NULL DEFAULT '[]',
  graficos_json TEXT NOT NULL DEFAULT '[]',
  periodo_padrao TEXT NOT NULL DEFAULT 'mes_atual',
  ordem_json TEXT NOT NULL DEFAULT '[]',
  limites_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pcm_dashboard_report_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  tipo TEXT NOT NULL,
  filtros_json TEXT NOT NULL DEFAULT '{}',
  emitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pcm_dashboard_preferences_user ON pcm_dashboard_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_pcm_dashboard_report_logs_user ON pcm_dashboard_report_logs(user_id, emitted_at);
CREATE INDEX IF NOT EXISTS idx_pcm_dashboard_os_filters ON os(opened_at, status, tipo, equipamento_id);
CREATE INDEX IF NOT EXISTS idx_pcm_dashboard_planos_proxima ON pcm_planos(proxima_data_prevista, tipo_manutencao, equipamento_id);
