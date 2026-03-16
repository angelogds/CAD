CREATE TABLE IF NOT EXISTS compras_anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referencia_tipo TEXT NOT NULL DEFAULT 'SOLICITACAO',
  referencia_id INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'COTACAO',
  original_name TEXT,
  filename TEXT NOT NULL,
  mimetype TEXT,
  size INTEGER,
  uploaded_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_compras_anexos_ref ON compras_anexos (referencia_tipo, referencia_id);
