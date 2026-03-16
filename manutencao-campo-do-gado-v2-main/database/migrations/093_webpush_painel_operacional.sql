PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notificacoes_os (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL,
  user_id INTEGER,
  titulo TEXT NOT NULL,
  corpo TEXT NOT NULL,
  grau TEXT,
  enviado_em TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  erro TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (os_id) REFERENCES os(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS os_execucoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL,
  mecanico_user_id INTEGER NOT NULL,
  iniciado_em TEXT NOT NULL DEFAULT (datetime('now')),
  finalizado_em TEXT,
  observacao TEXT,
  FOREIGN KEY (os_id) REFERENCES os(id),
  FOREIGN KEY (mecanico_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_push_user ON web_push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_os ON notificacoes_os(os_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_os ON os_execucoes(os_id, iniciado_em DESC);
