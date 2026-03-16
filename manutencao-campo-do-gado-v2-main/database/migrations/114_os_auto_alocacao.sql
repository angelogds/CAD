PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS os_pares_equipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mecanico_user_id INTEGER NOT NULL,
  auxiliar_user_id INTEGER NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (mecanico_user_id) REFERENCES users(id),
  FOREIGN KEY (auxiliar_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_os_pares_mecanico ON os_pares_equipes(mecanico_user_id);

CREATE TABLE IF NOT EXISTS config_sistema (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

INSERT OR IGNORE INTO config_sistema(chave, valor) VALUES ('ultimo_mecanico_id','');
