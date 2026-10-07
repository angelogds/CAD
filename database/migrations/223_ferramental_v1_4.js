module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ferramental_inspecao_config (
      ferramenta_id INTEGER PRIMARY KEY REFERENCES ferramental_itens(id) ON DELETE CASCADE,
      obrigatoria INTEGER NOT NULL DEFAULT 1,
      periodicidade_dias INTEGER NOT NULL DEFAULT 30 CHECK (periodicidade_dias BETWEEN 1 AND 3650),
      alerta_dias INTEGER NOT NULL DEFAULT 7 CHECK (alerta_dias BETWEEN 0 AND 365),
      perfil_checklist TEXT NOT NULL DEFAULT 'PADRAO'
        CHECK (perfil_checklist IN ('PADRAO','ELETRICA','SOLDA','ABRASIVA','MANUAL')),
      proxima_data TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      updated_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ferramental_inspecoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      ferramenta_id INTEGER NOT NULL REFERENCES ferramental_itens(id),
      tipo TEXT NOT NULL DEFAULT 'PERIODICA'
        CHECK (tipo IN ('PERIODICA','EXTRAORDINARIA','RETORNO_MANUTENCAO')),
      status TEXT NOT NULL DEFAULT 'AGENDADA'
        CHECK (status IN ('AGENDADA','APROVADA','APROVADA_RESTRICAO','REPROVADA','CANCELADA')),
      data_programada TEXT NOT NULL,
      validade_ate TEXT,
      perfil_checklist TEXT NOT NULL DEFAULT 'PADRAO',
      executada_por_user_id INTEGER REFERENCES users(id),
      created_by INTEGER REFERENCES users(id),
      observacao TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      executed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ferramental_inspecao_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inspecao_id INTEGER NOT NULL REFERENCES ferramental_inspecoes(id) ON DELETE CASCADE,
      codigo_item TEXT NOT NULL,
      descricao TEXT NOT NULL,
      resultado TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (resultado IN ('PENDENTE','OK','NAO_CONFORME','NAO_APLICAVEL')),
      observacao TEXT,
      ordem INTEGER NOT NULL DEFAULT 1,
      UNIQUE(inspecao_id, codigo_item)
    );

    CREATE TABLE IF NOT EXISTS ferramental_bloqueios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ferramenta_id INTEGER NOT NULL REFERENCES ferramental_itens(id),
      origem_tipo TEXT NOT NULL DEFAULT 'INSPECAO'
        CHECK (origem_tipo IN ('INSPECAO','OCORRENCIA','MANUAL')),
      origem_id INTEGER,
      motivo TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      liberado_por_user_id INTEGER REFERENCES users(id),
      liberado_em TEXT,
      liberacao_observacao TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ferramental_inspecao_config_proxima
      ON ferramental_inspecao_config(ativo, proxima_data);
    CREATE INDEX IF NOT EXISTS idx_ferramental_inspecoes_status_data
      ON ferramental_inspecoes(status, data_programada, ferramenta_id);
    CREATE INDEX IF NOT EXISTS idx_ferramental_inspecao_itens_inspecao
      ON ferramental_inspecao_itens(inspecao_id, ordem);
    CREATE INDEX IF NOT EXISTS idx_ferramental_bloqueios_ferramenta
      ON ferramental_bloqueios(ferramenta_id, ativo);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ferramental_bloqueio_inspecao_ativo
      ON ferramental_bloqueios(ferramenta_id, origem_tipo)
      WHERE ativo=1 AND origem_tipo='INSPECAO';
  `);
};
