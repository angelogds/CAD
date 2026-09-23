module.exports = ({ db }) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tv_configuracoes (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mascote_os_ativo INTEGER NOT NULL DEFAULT 1,
      mascote_os_path TEXT,
      midias_intervalo_ativas INTEGER NOT NULL DEFAULT 0,
      atualizado_por INTEGER,
      atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO tv_configuracoes (
      id,
      mascote_os_ativo,
      mascote_os_path,
      midias_intervalo_ativas
    ) VALUES (
      1,
      1,
      '/media/mascote/mascote-tv-01.mp4',
      0
    );

    CREATE TABLE IF NOT EXISTS tv_midias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('IMAGEM','VIDEO')),
      caminho TEXT NOT NULL,
      posicao_depois_tela INTEGER NOT NULL DEFAULT 0 CHECK (posicao_depois_tela BETWEEN 0 AND 7),
      duracao_segundos INTEGER NOT NULL DEFAULT 8 CHECK (duracao_segundos BETWEEN 3 AND 60),
      ordem INTEGER NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_por INTEGER,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tv_midias_posicao_ativo
      ON tv_midias(posicao_depois_tela, ativo, ordem, id);
  `);
};
