module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ferramental_equipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ferramental_equipe_membros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipe_id INTEGER NOT NULL REFERENCES ferramental_equipes(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      ordem INTEGER NOT NULL DEFAULT 1 CHECK (ordem IN (1, 2)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(equipe_id, user_id),
      UNIQUE(equipe_id, ordem)
    );

    CREATE TABLE IF NOT EXISTS ferramental_armarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL REFERENCES users(id),
      ativo INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ferramental_armario_compartimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      armario_id INTEGER NOT NULL REFERENCES ferramental_armarios(id) ON DELETE CASCADE,
      numero INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 8),
      finalidade TEXT NOT NULL DEFAULT 'FERRAMENTAL'
        CHECK (finalidade IN ('PESSOAL', 'FERRAMENTAL')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(armario_id, numero)
    );

    CREATE TABLE IF NOT EXISTS ferramental_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_interno TEXT NOT NULL UNIQUE,
      descricao TEXT NOT NULL,
      categoria TEXT,
      marca TEXT,
      modelo TEXT,
      numero_serie TEXT,
      patrimonio TEXT,
      condicao TEXT NOT NULL DEFAULT 'BOA'
        CHECK (condicao IN ('NOVA','BOA','USADA','COM_DESGASTE','DANIFICADA')),
      status TEXT NOT NULL DEFAULT 'DISPONIVEL'
        CHECK (status IN ('DISPONIVEL','EM_RESPONSABILIDADE','EM_MANUTENCAO','DANIFICADA','EXTRAVIADA','BAIXADA')),
      observacao TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ferramental_custodias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ferramenta_id INTEGER NOT NULL REFERENCES ferramental_itens(id),
      equipe_id INTEGER NOT NULL REFERENCES ferramental_equipes(id),
      compartimento_id INTEGER NOT NULL REFERENCES ferramental_armario_compartimentos(id),
      entregue_por_user_id INTEGER REFERENCES users(id),
      data_inicio TEXT NOT NULL DEFAULT (datetime('now')),
      data_fim TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      observacao TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ferramental_custodia_ativa
      ON ferramental_custodias(ferramenta_id)
      WHERE ativo = 1;

    CREATE TABLE IF NOT EXISTS ferramental_movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ferramenta_id INTEGER NOT NULL REFERENCES ferramental_itens(id),
      custodia_id INTEGER REFERENCES ferramental_custodias(id),
      tipo TEXT NOT NULL,
      origem_descricao TEXT,
      destino_descricao TEXT,
      equipe_id INTEGER REFERENCES ferramental_equipes(id),
      compartimento_id INTEGER REFERENCES ferramental_armario_compartimentos(id),
      actor_user_id INTEGER REFERENCES users(id),
      observacao TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ferramental_equipes_ativo
      ON ferramental_equipes(ativo, nome);
    CREATE INDEX IF NOT EXISTS idx_ferramental_membros_user
      ON ferramental_equipe_membros(user_id, equipe_id);
    CREATE INDEX IF NOT EXISTS idx_ferramental_armarios_owner
      ON ferramental_armarios(owner_user_id, ativo);
    CREATE INDEX IF NOT EXISTS idx_ferramental_itens_status
      ON ferramental_itens(status, ativo, descricao);
    CREATE INDEX IF NOT EXISTS idx_ferramental_custodias_equipe
      ON ferramental_custodias(equipe_id, ativo);
    CREATE INDEX IF NOT EXISTS idx_ferramental_movimentacoes_item
      ON ferramental_movimentacoes(ferramenta_id, created_at);
  `);
};
