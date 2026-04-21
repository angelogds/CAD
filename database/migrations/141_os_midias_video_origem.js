module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ia_interacoes_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      equipamento_id INTEGER,
      user_id INTEGER,
      transcricao_bruta TEXT,
      texto_melhorado TEXT,
      json_estruturado TEXT,
      confianca REAL,
      origem TEXT NOT NULL DEFAULT 'texto' CHECK (origem IN ('audio', 'foto', 'video', 'audio_foto', 'audio_video', 'texto')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE,
      FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    INSERT INTO ia_interacoes_new (
      id, os_id, equipamento_id, user_id, transcricao_bruta, texto_melhorado, json_estruturado, confianca, origem, created_at, updated_at
    )
    SELECT
      id,
      os_id,
      equipamento_id,
      user_id,
      transcricao_bruta,
      texto_melhorado,
      json_estruturado,
      confianca,
      CASE
        WHEN lower(origem) IN ('audio', 'foto', 'video', 'audio_foto', 'audio_video', 'texto') THEN lower(origem)
        ELSE 'texto'
      END,
      created_at,
      updated_at
    FROM ia_interacoes;

    DROP TABLE ia_interacoes;
    ALTER TABLE ia_interacoes_new RENAME TO ia_interacoes;

    CREATE INDEX IF NOT EXISTS idx_ia_interacoes_os_created ON ia_interacoes(os_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ia_interacoes_equipamento_created ON ia_interacoes(equipamento_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ia_interacoes_user_created ON ia_interacoes(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS os_fechamento_midias_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      ia_interacao_id INTEGER,
      caminho_arquivo TEXT NOT NULL,
      legenda TEXT,
      origem TEXT NOT NULL DEFAULT 'foto' CHECK (origem IN ('audio', 'foto', 'video', 'audio_foto', 'audio_video', 'texto')),
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE,
      FOREIGN KEY (ia_interacao_id) REFERENCES ia_interacoes(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (os_id, caminho_arquivo)
    );

    INSERT INTO os_fechamento_midias_new (
      id, os_id, ia_interacao_id, caminho_arquivo, legenda, origem, user_id, created_at, updated_at
    )
    SELECT
      id,
      os_id,
      ia_interacao_id,
      caminho_arquivo,
      legenda,
      CASE
        WHEN lower(origem) IN ('audio', 'foto', 'video', 'audio_foto', 'audio_video', 'texto') THEN lower(origem)
        WHEN lower(caminho_arquivo) LIKE '%.mp4' OR lower(caminho_arquivo) LIKE '%.mov' OR lower(caminho_arquivo) LIKE '%.webm' OR lower(caminho_arquivo) LIKE '%.m4v' THEN 'video'
        ELSE 'foto'
      END,
      user_id,
      created_at,
      updated_at
    FROM os_fechamento_midias;

    DROP TABLE os_fechamento_midias;
    ALTER TABLE os_fechamento_midias_new RENAME TO os_fechamento_midias;

    CREATE INDEX IF NOT EXISTS idx_os_fechamento_midias_os_created ON os_fechamento_midias(os_id, created_at DESC);
  `);
};
