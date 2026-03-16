-- Guarda de compatibilidade para ambientes sem tabela anexos
CREATE TABLE IF NOT EXISTS anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referencia_tipo TEXT NOT NULL,
  referencia_id INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'COTACAO',
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  uploaded_by INTEGER,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_anexos_ref ON anexos (referencia_tipo, referencia_id);
