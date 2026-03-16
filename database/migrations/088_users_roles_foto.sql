PRAGMA foreign_keys=OFF;

ALTER TABLE users RENAME TO users_old;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (
    role IN (
      'ADMIN','DIRECAO','DIRETORIA','RH','COMPRAS',
      'ENCARREGADO_PRODUCAO','PRODUCAO','MECANICO',
      'ALMOXARIFE','ALMOXARIFADO','MANUTENCAO'
    )
  ),
  photo_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users (id, name, email, password_hash, role, photo_path, created_at)
SELECT id, name, email, password_hash, role, NULL, created_at
FROM users_old;

DROP TABLE users_old;

PRAGMA foreign_keys=ON;
