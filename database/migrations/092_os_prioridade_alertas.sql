PRAGMA foreign_keys = ON;

ALTER TABLE os ADD COLUMN prioridade TEXT DEFAULT 'MEDIA';
ALTER TABLE os ADD COLUMN categoria_sugerida TEXT;
ALTER TABLE os ADD COLUMN alertar_imediatamente INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS os_alertas_reconhecimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL,
  prioridade TEXT,
  reconhecido_por INTEGER,
  reconhecido_em TEXT NOT NULL DEFAULT (datetime('now')),
  observacao TEXT,
  FOREIGN KEY (os_id) REFERENCES os(id),
  FOREIGN KEY (reconhecido_por) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_os_prioridade ON os(prioridade);
CREATE INDEX IF NOT EXISTS idx_os_alertar_imediatamente ON os(alertar_imediatamente);
CREATE INDEX IF NOT EXISTS idx_alertas_rec_os ON os_alertas_reconhecimentos(os_id, reconhecido_em DESC);
