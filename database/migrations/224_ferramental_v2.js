module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ferramental_usos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      ferramenta_id INTEGER NOT NULL REFERENCES ferramental_itens(id),
      custodia_id INTEGER REFERENCES ferramental_custodias(id),
      retirado_por_user_id INTEGER NOT NULL REFERENCES users(id),
      registrado_por_user_id INTEGER REFERENCES users(id),
      devolvido_por_user_id INTEGER REFERENCES users(id),
      origem TEXT NOT NULL DEFAULT 'QR'
        CHECK (origem IN ('QR','PCM','MEU_PORTAL')),
      status TEXT NOT NULL DEFAULT 'EM_USO'
        CHECK (status IN ('EM_USO','DEVOLVIDO','CANCELADO')),
      retirada_em TEXT NOT NULL DEFAULT (datetime('now')),
      previsao_devolucao TEXT,
      devolvido_em TEXT,
      local_uso TEXT,
      condicao_saida TEXT,
      condicao_retorno TEXT,
      observacao_saida TEXT,
      observacao_retorno TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ferramental_uso_ativo
      ON ferramental_usos(ferramenta_id)
      WHERE status='EM_USO';
    CREATE INDEX IF NOT EXISTS idx_ferramental_usos_usuario
      ON ferramental_usos(retirado_por_user_id,status,retirada_em);
    CREATE INDEX IF NOT EXISTS idx_ferramental_usos_previsao
      ON ferramental_usos(status,previsao_devolucao);

    CREATE TABLE IF NOT EXISTS ferramental_inventario_scan_sessoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      titulo TEXT NOT NULL,
      equipe_id INTEGER REFERENCES ferramental_equipes(id),
      status TEXT NOT NULL DEFAULT 'ABERTO'
        CHECK (status IN ('ABERTO','CONCLUIDO','CANCELADO')),
      total_esperado INTEGER NOT NULL DEFAULT 0,
      total_localizado INTEGER NOT NULL DEFAULT 0,
      total_nao_localizado INTEGER NOT NULL DEFAULT 0,
      total_fora_escopo INTEGER NOT NULL DEFAULT 0,
      observacao TEXT,
      created_by INTEGER REFERENCES users(id),
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ferramental_inventario_scan_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessao_id INTEGER NOT NULL REFERENCES ferramental_inventario_scan_sessoes(id) ON DELETE CASCADE,
      ferramenta_id INTEGER NOT NULL REFERENCES ferramental_itens(id),
      custodia_id INTEGER REFERENCES ferramental_custodias(id),
      esperado INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (status IN ('PENDENTE','LOCALIZADO','NAO_LOCALIZADO','FORA_ESCOPO')),
      local_esperado TEXT,
      lido_por_user_id INTEGER REFERENCES users(id),
      lido_em TEXT,
      observacao TEXT,
      UNIQUE(sessao_id,ferramenta_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ferramental_scan_sessoes_status
      ON ferramental_inventario_scan_sessoes(status,opened_at);
    CREATE INDEX IF NOT EXISTS idx_ferramental_scan_itens_status
      ON ferramental_inventario_scan_itens(sessao_id,status,esperado);
  `);
};
