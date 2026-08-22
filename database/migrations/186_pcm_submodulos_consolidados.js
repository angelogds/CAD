module.exports = function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pcm_falhas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL UNIQUE,
      equipamento_id INTEGER NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'OUTRA',
      modo_falha TEXT,
      causa_provavel TEXT,
      acao_corretiva TEXT,
      inicio_parada_em TEXT,
      fim_parada_em TEXT,
      impacto_producao INTEGER NOT NULL DEFAULT 3,
      impacto_seguranca INTEGER NOT NULL DEFAULT 3,
      impacto_ambiental INTEGER NOT NULL DEFAULT 3,
      custo_parada INTEGER NOT NULL DEFAULT 3,
      indice_criticidade REAL NOT NULL DEFAULT 3,
      observacao TEXT,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(os_id) REFERENCES os(id) ON DELETE CASCADE,
      FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id),
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(updated_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS pcm_falha_pecas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      falha_id INTEGER NOT NULL,
      estoque_item_id INTEGER,
      descricao_texto TEXT,
      quantidade REAL NOT NULL DEFAULT 1,
      custo_unitario REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(falha_id) REFERENCES pcm_falhas(id) ON DELETE CASCADE,
      FOREIGN KEY(estoque_item_id) REFERENCES estoque_itens(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pcm_falhas_equipamento_data
      ON pcm_falhas(equipamento_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pcm_falhas_categoria
      ON pcm_falhas(categoria, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pcm_falha_pecas_falha
      ON pcm_falha_pecas(falha_id);
  `);

  // Compatibilidade com instalações que já tenham uma versão inicial da tabela.
  if (tableExists('pcm_falhas')) {
    const columns = [
      ['categoria', "categoria TEXT NOT NULL DEFAULT 'OUTRA'"],
      ['modo_falha', 'modo_falha TEXT'],
      ['causa_provavel', 'causa_provavel TEXT'],
      ['acao_corretiva', 'acao_corretiva TEXT'],
      ['inicio_parada_em', 'inicio_parada_em TEXT'],
      ['fim_parada_em', 'fim_parada_em TEXT'],
      ['impacto_producao', 'impacto_producao INTEGER NOT NULL DEFAULT 3'],
      ['impacto_seguranca', 'impacto_seguranca INTEGER NOT NULL DEFAULT 3'],
      ['impacto_ambiental', 'impacto_ambiental INTEGER NOT NULL DEFAULT 3'],
      ['custo_parada', 'custo_parada INTEGER NOT NULL DEFAULT 3'],
      ['indice_criticidade', 'indice_criticidade REAL NOT NULL DEFAULT 3'],
      ['observacao', 'observacao TEXT'],
      ['updated_by', 'updated_by INTEGER REFERENCES users(id)'],
      ['updated_at', 'updated_at TEXT'],
    ];
    for (const [name, ddl] of columns) {
      if (!columnExists('pcm_falhas', name)) addColumnIfMissing('pcm_falhas', name, ddl);
    }
  }
};
