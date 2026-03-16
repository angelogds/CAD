PRAGMA foreign_keys=OFF;

ALTER TABLE users RENAME TO users_legacy_roles_tmp;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (
    role IN (
      'ADMIN','DIRECAO','DIRETORIA','RH','COMPRAS',
      'ENCARREGADO_PRODUCAO','PRODUCAO','MECANICO',
      'ALMOXARIFE','ALMOXARIFADO','MANUTENCAO','MANUTENCAO_SUPERVISOR'
    )
  ),
  photo_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users (id, name, email, password_hash, role, photo_path, created_at)
SELECT id, name, email, password_hash, role, photo_path, created_at
FROM users_legacy_roles_tmp;

DROP TABLE users_legacy_roles_tmp;

PRAGMA foreign_keys=ON;
