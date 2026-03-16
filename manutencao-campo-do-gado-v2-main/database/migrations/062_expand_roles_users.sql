PRAGMA foreign_keys=OFF;

-- =========================
-- FIX: OS (FK users_old -> users)
-- =========================
ALTER TABLE os RENAME TO os_old;

CREATE TABLE IF NOT EXISTS os (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipamento TEXT NOT NULL,
  equipamento_id INTEGER,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'CORRETIVA',
  status TEXT NOT NULL DEFAULT 'ABERTA',
  custo_total REAL NOT NULL DEFAULT 0,

  opened_by INTEGER,
  closed_by INTEGER,

  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,

  FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id),
  FOREIGN KEY (opened_by) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
);

-- Copia dados (caso seu os_old não tenha equipamento_id, ele vai falhar)
-- Então fazemos a cópia em 2 tentativas:
INSERT INTO os (id, equipamento, descricao, tipo, status, custo_total, opened_by, closed_by, opened_at, closed_at)
SELECT id, equipamento, descricao, tipo, status, custo_total, opened_by, closed_by, opened_at, closed_at
FROM os_old;

DROP TABLE os_old;

CREATE INDEX IF NOT EXISTS idx_os_status ON os(status);
CREATE INDEX IF NOT EXISTS idx_os_opened_at ON os(opened_at);


-- =========================
-- FIX: ANEXOS (FK users_old -> users)
-- =========================
ALTER TABLE anexos RENAME TO anexos_old;

CREATE TABLE IF NOT EXISTS anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  uploaded_by INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

INSERT INTO anexos (id, owner_type, owner_id, filename, filepath, uploaded_by, uploaded_at)
SELECT id, owner_type, owner_id, filename, filepath, uploaded_by, uploaded_at
FROM anexos_old;

DROP TABLE anexos_old;

CREATE INDEX IF NOT EXISTS idx_anexos_owner ON anexos(owner_type, owner_id);

PRAGMA foreign_keys=ON;
