module.exports = ({ db, tableExists }) => {
  if (!tableExists('colaboradores')) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS rh_exames_ocupacionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      data_realizacao TEXT,
      validade_ate TEXT,
      clinica TEXT,
      observacao TEXT,
      arquivo_nome TEXT,
      arquivo_nome_original TEXT,
      arquivo_mime TEXT,
      criado_por_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      deleted_at TEXT,
      deleted_by INTEGER,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
      FOREIGN KEY (criado_por_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_rh_exames_colaborador
      ON rh_exames_ocupacionais(colaborador_id, deleted_at, id);

    CREATE INDEX IF NOT EXISTS idx_rh_exames_validade
      ON rh_exames_ocupacionais(validade_ate, deleted_at, id);
  `);
};
