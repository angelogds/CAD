PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS escala_publicacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_escala_publicacoes_ativo ON escala_publicacoes(ativo);
