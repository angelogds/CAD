module.exports = function up({ db, tableExists, columnExists }) {
  const usersTable = tableExists("users") ? "users" : (tableExists("usuarios") ? "usuarios" : null);

  if (usersTable) {
    if (!columnExists(usersTable, "funcao")) {
      db.exec(
        `ALTER TABLE ${usersTable} ADD COLUMN funcao TEXT NOT NULL DEFAULT 'AUXILIAR' CHECK (funcao IN ('MECANICO','MONTADOR','AUXILIAR'))`
      );
    }
    if (!columnExists(usersTable, "ativo")) {
      db.exec(`ALTER TABLE ${usersTable} ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))`);
    }
    if (!columnExists(usersTable, "especialidades")) {
      db.exec(`ALTER TABLE ${usersTable} ADD COLUMN especialidades TEXT`);
    }
  }

  if (!tableExists("os_alocacoes")) {
    db.exec(`
      CREATE TABLE os_alocacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        os_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        papel TEXT NOT NULL CHECK (papel IN ('RESPONSAVEL','AUXILIAR')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_os_alocacoes_os_id ON os_alocacoes(os_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_os_alocacoes_user_id ON os_alocacoes(user_id)`);
  }

  if (tableExists("os")) {
    if (!columnExists("os", "categoria_servico")) {
      db.exec(`ALTER TABLE os ADD COLUMN categoria_servico TEXT`);
    }
    if (!columnExists("os", "responsavel_user_id")) {
      db.exec(`ALTER TABLE os ADD COLUMN responsavel_user_id INTEGER REFERENCES users(id)`);
    }
  }
};
