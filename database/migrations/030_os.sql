-- 030_os.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS os (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipamento TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'CORRETIVA', -- CORRETIVA | PREVENTIVA | NR12 | OUTRA
  status TEXT NOT NULL DEFAULT 'ABERTA',  -- ABERTA | ANDAMENTO | PAUSADA | CONCLUIDA | CANCELADA
  custo_total REAL NOT NULL DEFAULT 0,

  opened_by INTEGER,
  closed_by INTEGER,

  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,

  FOREIGN KEY (opened_by) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL, -- 'os' | 'solicitacao' | 'cotacao' | 'nc'
  owner_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  uploaded_by INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_os_status ON os(status);
CREATE INDEX IF NOT EXISTS idx_os_opened_at ON os(opened_at);
CREATE INDEX IF NOT EXISTS idx_anexos_owner ON anexos(owner_type, owner_id);
