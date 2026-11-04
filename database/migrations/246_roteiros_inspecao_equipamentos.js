module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inspecao_roteiros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      data_prevista TEXT NOT NULL,
      responsavel_user_id INTEGER NOT NULL REFERENCES users(id),
      instrucoes TEXT,
      status TEXT NOT NULL DEFAULT 'ABERTO' CHECK(status IN ('ABERTO','ENVIADO_PCM','CONCLUIDO')),
      criado_por INTEGER NOT NULL REFERENCES users(id),
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      enviado_em TEXT,
      concluido_em TEXT,
      concluido_por INTEGER REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_inspecao_roteiros_responsavel ON inspecao_roteiros(responsavel_user_id,status,data_prevista);

    CREATE TABLE IF NOT EXISTS inspecao_roteiro_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roteiro_id INTEGER NOT NULL REFERENCES inspecao_roteiros(id),
      equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id),
      resultado TEXT CHECK(resultado IN ('SEM_NECESSIDADE','PREVENTIVA','CORRETIVA','AMBAS')),
      orientacao_preventiva TEXT,
      orientacao_corretiva TEXT,
      observacao TEXT,
      prioridade_sugerida TEXT NOT NULL DEFAULT 'MEDIA' CHECK(prioridade_sugerida IN ('BAIXA','MEDIA','ALTA','CRITICA')),
      inspecionado_em TEXT,
      inspecionado_por INTEGER REFERENCES users(id),
      preventiva_decisao TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(preventiva_decisao IN ('PENDENTE','PROGRAMADA','DISPENSADA')),
      preventiva_os_id INTEGER REFERENCES os(id),
      preventiva_data TEXT,
      preventiva_responsavel_id INTEGER REFERENCES users(id),
      preventiva_parecer TEXT,
      corretiva_decisao TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(corretiva_decisao IN ('PENDENTE','PROGRAMADA','DISPENSADA')),
      corretiva_os_id INTEGER REFERENCES os(id),
      corretiva_data TEXT,
      corretiva_responsavel_id INTEGER REFERENCES users(id),
      corretiva_parecer TEXT,
      UNIQUE(roteiro_id,equipamento_id)
    );
    CREATE INDEX IF NOT EXISTS idx_inspecao_itens_roteiro ON inspecao_roteiro_itens(roteiro_id,id);
    CREATE INDEX IF NOT EXISTS idx_inspecao_itens_equipamento ON inspecao_roteiro_itens(equipamento_id,inspecionado_em);

    CREATE TABLE IF NOT EXISTS inspecao_roteiro_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roteiro_id INTEGER NOT NULL REFERENCES inspecao_roteiros(id),
      item_id INTEGER REFERENCES inspecao_roteiro_itens(id),
      acao TEXT NOT NULL,
      usuario_id INTEGER NOT NULL REFERENCES users(id),
      detalhes_json TEXT NOT NULL DEFAULT '{}',
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_inspecao_roteiro_logs ON inspecao_roteiro_logs(roteiro_id,id);
  `);
};
