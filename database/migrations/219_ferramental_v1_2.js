module.exports = function up({ db, columnExists }) {
  if (!columnExists('ferramental_itens', 'qr_token')) {
    db.exec("ALTER TABLE ferramental_itens ADD COLUMN qr_token TEXT");
  }
  if (!columnExists('ferramental_aceites', 'tratamento_status')) {
    db.exec("ALTER TABLE ferramental_aceites ADD COLUMN tratamento_status TEXT NOT NULL DEFAULT 'NAO_APLICAVEL'");
  }
  if (!columnExists('ferramental_aceites', 'tratado_por_user_id')) {
    db.exec("ALTER TABLE ferramental_aceites ADD COLUMN tratado_por_user_id INTEGER REFERENCES users(id)");
  }
  if (!columnExists('ferramental_aceites', 'tratado_em')) {
    db.exec("ALTER TABLE ferramental_aceites ADD COLUMN tratado_em TEXT");
  }
  if (!columnExists('ferramental_aceites', 'tratamento_observacao')) {
    db.exec("ALTER TABLE ferramental_aceites ADD COLUMN tratamento_observacao TEXT");
  }

  db.exec(`
    UPDATE ferramental_itens
    SET qr_token = lower(hex(randomblob(16)))
    WHERE qr_token IS NULL OR trim(qr_token) = '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ferramental_qr_token
      ON ferramental_itens(qr_token)
      WHERE qr_token IS NOT NULL;

    UPDATE ferramental_aceites
    SET tratamento_status = 'PENDENTE'
    WHERE status = 'RECUSADO'
      AND COALESCE(tratamento_status, 'NAO_APLICAVEL') = 'NAO_APLICAVEL';

    CREATE TABLE IF NOT EXISTS ferramental_inventarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      equipe_id INTEGER NOT NULL REFERENCES ferramental_equipes(id),
      titulo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ABERTO'
        CHECK (status IN ('ABERTO','CONCLUIDO','CANCELADO')),
      data_limite TEXT,
      observacao TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ferramental_inventario_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventario_id INTEGER NOT NULL REFERENCES ferramental_inventarios(id) ON DELETE CASCADE,
      custodia_id INTEGER NOT NULL REFERENCES ferramental_custodias(id),
      ferramenta_id INTEGER NOT NULL REFERENCES ferramental_itens(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      situacao TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (situacao IN ('PENDENTE','CONFIRMADO','DANIFICADO','NAO_LOCALIZADO','EM_MANUTENCAO')),
      observacao TEXT,
      conferido_em TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(inventario_id, custodia_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ferramental_inventarios_status
      ON ferramental_inventarios(status, data_limite, created_at);
    CREATE INDEX IF NOT EXISTS idx_ferramental_inventario_itens_user
      ON ferramental_inventario_itens(user_id, situacao, inventario_id);
    CREATE INDEX IF NOT EXISTS idx_ferramental_inventario_itens_inventario
      ON ferramental_inventario_itens(inventario_id, situacao);
  `);
};
