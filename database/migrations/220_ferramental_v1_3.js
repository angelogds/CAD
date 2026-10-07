module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ferramental_ocorrencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      ferramenta_id INTEGER NOT NULL REFERENCES ferramental_itens(id),
      custodia_id INTEGER REFERENCES ferramental_custodias(id),
      equipe_id INTEGER REFERENCES ferramental_equipes(id),
      aberta_por_user_id INTEGER NOT NULL REFERENCES users(id),
      tipo TEXT NOT NULL
        CHECK (tipo IN ('DEVOLUCAO','MANUTENCAO','DANO','EXTRAVIO','BAIXA','OUTRO')),
      origem TEXT NOT NULL DEFAULT 'MEU_PORTAL'
        CHECK (origem IN ('MEU_PORTAL','PCM','QR')),
      status TEXT NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA','EM_ANALISE','EM_ACOMPANHAMENTO','RESOLVIDA','CANCELADA')),
      descricao TEXT NOT NULL,
      status_ferramenta_abertura TEXT,
      condicao_abertura TEXT,
      acao_pcm TEXT,
      resolucao TEXT,
      resolvido_por_user_id INTEGER REFERENCES users(id),
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ferramental_ocorrencias_status
      ON ferramental_ocorrencias(status, tipo, created_at);
    CREATE INDEX IF NOT EXISTS idx_ferramental_ocorrencias_ferramenta
      ON ferramental_ocorrencias(ferramenta_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ferramental_ocorrencias_equipe
      ON ferramental_ocorrencias(equipe_id, status, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ferramental_ocorrencia_aberta_por_ferramenta
      ON ferramental_ocorrencias(ferramenta_id)
      WHERE status IN ('ABERTA','EM_ANALISE','EM_ACOMPANHAMENTO');
  `);
};
