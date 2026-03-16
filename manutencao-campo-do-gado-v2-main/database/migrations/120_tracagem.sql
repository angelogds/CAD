CREATE TABLE IF NOT EXISTS tracagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  titulo TEXT,
  equipamento_id INTEGER,
  os_id INTEGER,
  usuario_id INTEGER,
  parametros_json TEXT NOT NULL,
  resultado_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE SET NULL,
  FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tracagem_anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracagem_id INTEGER NOT NULL,
  filename TEXT,
  original_name TEXT,
  mime_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tracagem_id) REFERENCES tracagens(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tracagens_tipo ON tracagens(tipo);
CREATE INDEX IF NOT EXISTS idx_tracagens_os ON tracagens(os_id);
CREATE INDEX IF NOT EXISTS idx_tracagens_equipamento ON tracagens(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_tracagens_created_at ON tracagens(created_at);
