module.exports = function up({ db, tableExists }) {
  if (!tableExists('colaboradores') || !tableExists('users')) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS rh_atestados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      folga_id INTEGER,
      data_inicio TEXT NOT NULL,
      data_fim TEXT NOT NULL,
      observacao TEXT,
      arquivo_nome TEXT NOT NULL,
      arquivo_nome_original TEXT,
      arquivo_mime TEXT NOT NULL,
      arquivo_tamanho INTEGER,
      status TEXT NOT NULL DEFAULT 'ENVIADO',
      recebido_por_user_id INTEGER,
      recebido_em TEXT,
      arquivado_em TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (recebido_por_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_rh_atestados_colaborador
      ON rh_atestados(colaborador_id, data_inicio DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_rh_atestados_status
      ON rh_atestados(status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_rh_atestados_periodo
      ON rh_atestados(data_inicio, data_fim);
  `);
};
