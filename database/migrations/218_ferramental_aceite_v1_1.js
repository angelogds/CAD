module.exports = function up({ db }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ferramental_aceites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      custodia_id INTEGER NOT NULL REFERENCES ferramental_custodias(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (status IN ('PENDENTE','ACEITO','RECUSADO','CANCELADO')),
      selfie_path TEXT,
      assinatura_path TEXT,
      observacao TEXT,
      aceite_termo_versao TEXT NOT NULL DEFAULT 'V1.1',
      confirmado_em TEXT,
      recusado_em TEXT,
      ip_origem TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(custodia_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ferramental_aceites_user_status
      ON ferramental_aceites(user_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_ferramental_aceites_custodia
      ON ferramental_aceites(custodia_id, status);

    INSERT OR IGNORE INTO ferramental_aceites (custodia_id, user_id, status)
    SELECT c.id, m.user_id, 'PENDENTE'
    FROM ferramental_custodias c
    JOIN ferramental_equipe_membros m ON m.equipe_id = c.equipe_id
    WHERE c.ativo = 1;
  `);
};
