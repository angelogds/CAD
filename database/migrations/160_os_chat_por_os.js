module.exports.up = ({ db, tableExists, addColumnIfMissing }) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS os_chat_mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      solicitacao_id INTEGER NULL,
      user_id INTEGER NULL,
      perfil TEXT,
      autor_nome TEXT,
      tipo TEXT NOT NULL DEFAULT 'MENSAGEM',
      mensagem TEXT NOT NULL,
      anexo_path TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      deleted_at DATETIME NULL,
      FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_os_chat_mensagens_os_created ON os_chat_mensagens (os_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_os_chat_mensagens_tipo ON os_chat_mensagens (tipo, created_at);

    CREATE TABLE IF NOT EXISTS os_chat_leituras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      ultima_mensagem_lida_id INTEGER NULL,
      lido_em DATETIME,
      UNIQUE(os_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_os_chat_leituras_user ON os_chat_leituras (user_id, os_id);

    CREATE TABLE IF NOT EXISTS os_solicitacoes_vinculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      solicitacao_id INTEGER NOT NULL,
      created_by INTEGER NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(os_id, solicitacao_id)
    );

    CREATE INDEX IF NOT EXISTS idx_os_solicitacoes_vinculos_os ON os_solicitacoes_vinculos (os_id);
    CREATE INDEX IF NOT EXISTS idx_os_solicitacoes_vinculos_solicitacao ON os_solicitacoes_vinculos (solicitacao_id);

    CREATE TABLE IF NOT EXISTS notificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      origem_tipo TEXT NOT NULL,
      origem_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      status_referencia TEXT,
      lida INTEGER NOT NULL DEFAULT 0,
      lida_em DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notificacoes_user_lida ON notificacoes (user_id, lida, created_at);
    CREATE INDEX IF NOT EXISTS idx_notificacoes_origem ON notificacoes (origem_tipo, origem_id);
  `);

  if (tableExists('solicitacoes')) {
    addColumnIfMissing('solicitacoes', 'os_id', 'os_id INTEGER');
    addColumnIfMissing('solicitacoes', 'tipo_origem', "tipo_origem TEXT DEFAULT 'OS'");
  }
};
