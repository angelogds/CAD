module.exports = function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  if (!tableExists("colaboradores")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS colaboradores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        funcao TEXT NOT NULL DEFAULT 'AUXILIAR',
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  addColumnIfMissing("colaboradores", "apelido", "apelido TEXT");
  addColumnIfMissing("colaboradores", "setor", "setor TEXT DEFAULT 'MANUTENCAO'");
  addColumnIfMissing("colaboradores", "data_admissao", "data_admissao TEXT");
  addColumnIfMissing("colaboradores", "status", "status TEXT DEFAULT 'ATIVO'");
  addColumnIfMissing("colaboradores", "telefone", "telefone TEXT");
  addColumnIfMissing("colaboradores", "foto_url", "foto_url TEXT");
  addColumnIfMissing("colaboradores", "lider_id", "lider_id INTEGER REFERENCES colaboradores(id)");
  addColumnIfMissing("colaboradores", "deleted_at", "deleted_at TEXT");
  addColumnIfMissing("colaboradores", "deleted_by", "deleted_by INTEGER REFERENCES users(id)");
  addColumnIfMissing("colaboradores", "updated_at", "updated_at TEXT DEFAULT (datetime('now'))");
  addColumnIfMissing("colaboradores", "created_at", "created_at TEXT DEFAULT (datetime('now'))");

  db.exec(`
    CREATE TABLE IF NOT EXISTS colaborador_detalhes (
      colaborador_id INTEGER PRIMARY KEY,
      tipo_sanguineo TEXT,
      contato_emergencia TEXT,
      restricao_operacional TEXT,
      observacoes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      deleted_by INTEGER REFERENCES users(id),
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
    );

    CREATE TABLE IF NOT EXISTS ferramentas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      codigo_patrimonio TEXT NOT NULL UNIQUE,
      categoria TEXT,
      valor REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      deleted_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS movimentacoes_ferramentas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      ferramenta_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrega','devolucao','transferencia','extravio')),
      data TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmado','ativo','devolvido','extraviado','transferido')),
      observacao TEXT,
      responsavel TEXT,
      confirmado_em TEXT,
      confirmado_por INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      deleted_by INTEGER REFERENCES users(id),
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
      FOREIGN KEY (ferramenta_id) REFERENCES ferramentas(id)
    );

    CREATE TABLE IF NOT EXISTS epis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      ca TEXT,
      validade TEXT,
      categoria TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      deleted_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS entregas_epi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      epi_id INTEGER NOT NULL,
      quantidade REAL NOT NULL DEFAULT 1,
      data_entrega TEXT NOT NULL DEFAULT (datetime('now')),
      validade TEXT,
      status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmado','ativo','devolvido','trocado','vencido')),
      observacao TEXT,
      confirmado_em TEXT,
      confirmado_por INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      deleted_by INTEGER REFERENCES users(id),
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
      FOREIGN KEY (epi_id) REFERENCES epis(id)
    );

    CREATE TABLE IF NOT EXISTS materiais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      unidade TEXT NOT NULL DEFAULT 'UN',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      deleted_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS retiradas_materiais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      material_id INTEGER NOT NULL,
      quantidade REAL NOT NULL,
      data TEXT NOT NULL DEFAULT (datetime('now')),
      destino TEXT NOT NULL,
      equipamento TEXT,
      os_id INTEGER,
      autorizado_por TEXT,
      entregue_por TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      deleted_by INTEGER REFERENCES users(id),
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
      FOREIGN KEY (material_id) REFERENCES materiais(id),
      CHECK (length(trim(destino)) > 0)
    );

    CREATE TABLE IF NOT EXISTS certificados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('interno','externo')),
      titulo TEXT NOT NULL,
      instituicao TEXT,
      carga_horaria REAL,
      data_emissao TEXT,
      validade TEXT,
      arquivo_url TEXT,
      status_validacao TEXT NOT NULL DEFAULT 'pendente' CHECK (status_validacao IN ('pendente','aprovado','reprovado','vencido')),
      validado_por INTEGER REFERENCES users(id),
      validado_em TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      deleted_by INTEGER REFERENCES users(id),
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
    );

    CREATE TABLE IF NOT EXISTS documentos_colaborador (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      arquivo_url TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT (datetime('now')),
      confirmado_em TEXT,
      confirmado_por INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      deleted_by INTEGER REFERENCES users(id),
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
    );

    CREATE TABLE IF NOT EXISTS colaborador_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER,
      entidade TEXT NOT NULL,
      entidade_id INTEGER,
      acao TEXT NOT NULL,
      detalhe_json TEXT,
      responsavel_id INTEGER REFERENCES users(id),
      responsavel_nome TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
    );

    CREATE INDEX IF NOT EXISTS idx_colab_status ON colaboradores(status, setor);
    CREATE INDEX IF NOT EXISTS idx_movf_colab ON movimentacoes_ferramentas(colaborador_id, status, data);
    CREATE INDEX IF NOT EXISTS idx_entepi_colab ON entregas_epi(colaborador_id, status, data_entrega);
    CREATE INDEX IF NOT EXISTS idx_retmat_colab ON retiradas_materiais(colaborador_id, data);
    CREATE INDEX IF NOT EXISTS idx_cert_colab ON certificados(colaborador_id, tipo, status_validacao);
    CREATE INDEX IF NOT EXISTS idx_docs_colab ON documentos_colaborador(colaborador_id, tipo);
    CREATE INDEX IF NOT EXISTS idx_logs_colab ON colaborador_logs(colaborador_id, created_at DESC);
  `);

  db.exec(`
    UPDATE colaboradores
      SET status = CASE
        WHEN status IS NULL OR trim(status) = '' THEN (CASE WHEN IFNULL(ativo,1)=1 THEN 'ATIVO' ELSE 'INATIVO' END)
        ELSE upper(status)
      END,
      setor = COALESCE(NULLIF(trim(setor), ''), 'MANUTENCAO');
  `);
};
