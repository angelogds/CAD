PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS retirantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,        -- QR/ID
  nome TEXT NOT NULL,
  perfil TEXT NOT NULL DEFAULT 'MECANICO', -- MECANICO | PRODUCAO
  pin_hash TEXT,                      -- opcional
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS retiradas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  retirante_id INTEGER NOT NULL,
  registrado_por INTEGER,             -- users.id
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(retirante_id) REFERENCES retirantes(id),
  FOREIGN KEY(registrado_por) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS retirada_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  retirada_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  quantidade REAL NOT NULL,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(retirada_id) REFERENCES retiradas(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES estoque_itens(id)
);

CREATE INDEX IF NOT EXISTS idx_retiradas_created ON retiradas(created_at);
CREATE INDEX IF NOT EXISTS idx_retirada_itens_retirada ON retirada_itens(retirada_id);
CREATE INDEX IF NOT EXISTS idx_retirada_itens_item ON retirada_itens(item_id);
