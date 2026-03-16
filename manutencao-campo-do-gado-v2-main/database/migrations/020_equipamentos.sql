PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS equipamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT,                 -- ex: DIG-LAR, CAL-01, PRE-P50
  nome TEXT NOT NULL,          -- ex: Digestor Laranja, Caldeira 1
  setor TEXT,                  -- ex: Digestores, Caldeiras, Prensas
  tipo TEXT,                   -- ex: digestor, caldeira, prensa, moinho
  criticidade TEXT DEFAULT 'media', -- baixa|media|alta
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_equipamentos_codigo ON equipamentos(codigo);
CREATE INDEX IF NOT EXISTS idx_equipamentos_setor ON equipamentos(setor);
CREATE INDEX IF NOT EXISTS idx_equipamentos_tipo ON equipamentos(tipo);
CREATE INDEX IF NOT EXISTS idx_equipamentos_ativo ON equipamentos(ativo);
