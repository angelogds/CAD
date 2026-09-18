module.exports = function up({ db, tableExists, addColumnIfMissing }) {
  if (!tableExists("users")) return;

  addColumnIfMissing("users", "ativo", "ativo INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing("users", "deleted_at", "deleted_at TEXT");

  db.exec(`
    UPDATE users
    SET ativo = 1
    WHERE ativo IS NULL;

    CREATE INDEX IF NOT EXISTS idx_users_ativo
      ON users(ativo, deleted_at);
  `);
};
