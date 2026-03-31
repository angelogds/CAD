module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ia_interacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      equipamento_id INTEGER,
      user_id INTEGER,
      transcricao_bruta TEXT,
      texto_melhorado TEXT,
      json_estruturado TEXT,
      confianca REAL,
      origem TEXT NOT NULL DEFAULT 'texto' CHECK (origem IN ('audio', 'foto', 'audio_foto', 'texto')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE,
      FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ia_interacoes_os_created ON ia_interacoes(os_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ia_interacoes_equipamento_created ON ia_interacoes(equipamento_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ia_interacoes_user_created ON ia_interacoes(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ia_contexto_os (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      ia_interacao_id INTEGER,
      contexto_json TEXT NOT NULL,
      resumo_contexto TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE,
      FOREIGN KEY (ia_interacao_id) REFERENCES ia_interacoes(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ia_contexto_os_lookup ON ia_contexto_os(os_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ia_sugestoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      ia_interacao_id INTEGER,
      sugestao_json TEXT NOT NULL,
      tipo_sugestao TEXT,
      confianca REAL,
      status TEXT NOT NULL DEFAULT 'ATIVA',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE,
      FOREIGN KEY (ia_interacao_id) REFERENCES ia_interacoes(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ia_sugestoes_os_status ON ia_sugestoes(os_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS os_fechamento_midias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      ia_interacao_id INTEGER,
      caminho_arquivo TEXT NOT NULL,
      legenda TEXT,
      origem TEXT NOT NULL DEFAULT 'foto' CHECK (origem IN ('audio', 'foto', 'audio_foto', 'texto')),
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE,
      FOREIGN KEY (ia_interacao_id) REFERENCES ia_interacoes(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (os_id, caminho_arquivo)
    );

    CREATE INDEX IF NOT EXISTS idx_os_fechamento_midias_os_created ON os_fechamento_midias(os_id, created_at DESC);
  `);
};
