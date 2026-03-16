module.exports = function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  if (tableExists("os_execucoes")) {
    addColumnIfMissing("os_execucoes", "executor_user_id", "executor_user_id INTEGER REFERENCES users(id)");
    addColumnIfMissing("os_execucoes", "auxiliar_user_id", "auxiliar_user_id INTEGER REFERENCES users(id)");
    addColumnIfMissing("os_execucoes", "alocado_por", "alocado_por INTEGER REFERENCES users(id)");
    addColumnIfMissing("os_execucoes", "turno_alocacao", "turno_alocacao TEXT CHECK (turno_alocacao IN ('DIA','NOITE'))");

    const cols = db.prepare("PRAGMA table_info(os_execucoes)").all().map((c) => c.name);
    if (cols.includes("mecanico_user_id") && cols.includes("executor_user_id")) {
      db.exec(`
        UPDATE os_execucoes
        SET executor_user_id = COALESCE(executor_user_id, mecanico_user_id)
        WHERE executor_user_id IS NULL
      `);
    }
  }

  if (!tableExists("os_pares_equipes")) {
    db.exec(`
      CREATE TABLE os_pares_equipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mecanico_user_id INTEGER NOT NULL,
        auxiliar_user_id INTEGER NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (mecanico_user_id) REFERENCES users(id),
        FOREIGN KEY (auxiliar_user_id) REFERENCES users(id)
      )
    `);
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uidx_os_pares_mecanico ON os_pares_equipes(mecanico_user_id)");
  }

  if (tableExists("colaboradores")) {
    addColumnIfMissing("colaboradores", "eh_reserva", "eh_reserva INTEGER NOT NULL DEFAULT 0");
  }

  if (tableExists("os")) {
    addColumnIfMissing("os", "permitir_reserva", "permitir_reserva INTEGER NOT NULL DEFAULT 0");
  }
};
