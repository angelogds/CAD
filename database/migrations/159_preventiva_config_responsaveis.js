module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS preventiva_config_responsaveis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mecanico_1_id INTEGER NOT NULL REFERENCES colaboradores(id),
      mecanico_2_id INTEGER REFERENCES colaboradores(id),
      atualizado_por INTEGER REFERENCES users(id),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (mecanico_2_id IS NULL OR mecanico_1_id <> mecanico_2_id)
    );

    CREATE INDEX IF NOT EXISTS idx_prev_cfg_resp_atualizado_em
      ON preventiva_config_responsaveis(atualizado_em);
  `);
};
