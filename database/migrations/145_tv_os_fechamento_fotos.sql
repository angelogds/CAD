CREATE TABLE IF NOT EXISTS os_fechamento_fotos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL,
  usuario_id INTEGER,
  imagem_url TEXT NOT NULL,
  legenda TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_os_fechamento_fotos_os_id
ON os_fechamento_fotos(os_id);

CREATE INDEX IF NOT EXISTS idx_os_fechamento_fotos_created_at
ON os_fechamento_fotos(created_at);
