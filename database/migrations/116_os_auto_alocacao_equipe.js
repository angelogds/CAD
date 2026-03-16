module.exports = function up({ db, tableExists, columnExists }) {
  if (!tableExists("users") && tableExists("usuarios")) return;

  if (tableExists("users")) {
    if (!columnExists("users", "funcao")) {
      db.exec("ALTER TABLE users ADD COLUMN funcao TEXT NOT NULL DEFAULT 'AUXILIAR'");
    }
    if (!columnExists("users", "ativo")) {
      db.exec("ALTER TABLE users ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1");
    }
  }

  if (!tableExists("equipe_pares")) {
    db.exec(`
      CREATE TABLE equipe_pares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mecanico_user_id INTEGER NOT NULL,
        auxiliar_user_id INTEGER NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (mecanico_user_id) REFERENCES users(id),
        FOREIGN KEY (auxiliar_user_id) REFERENCES users(id)
      )
    `);
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_equipe_pares_mecanico ON equipe_pares(mecanico_user_id)");
  }

  if (!tableExists("os_alocacoes")) {
    db.exec(`
      CREATE TABLE os_alocacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        os_id INTEGER NOT NULL,
        mecanico_user_id INTEGER NOT NULL,
        auxiliar_user_id INTEGER NOT NULL,
        alocado_por INTEGER,
        alocado_em TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (os_id) REFERENCES os(id) ON DELETE CASCADE,
        FOREIGN KEY (mecanico_user_id) REFERENCES users(id),
        FOREIGN KEY (auxiliar_user_id) REFERENCES users(id),
        FOREIGN KEY (alocado_por) REFERENCES users(id)
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_os_alocacoes_os_id_v2 ON os_alocacoes(os_id)");
  } else {
    if (!columnExists("os_alocacoes", "mecanico_user_id")) db.exec("ALTER TABLE os_alocacoes ADD COLUMN mecanico_user_id INTEGER");
    if (!columnExists("os_alocacoes", "auxiliar_user_id")) db.exec("ALTER TABLE os_alocacoes ADD COLUMN auxiliar_user_id INTEGER");
    if (!columnExists("os_alocacoes", "alocado_por")) db.exec("ALTER TABLE os_alocacoes ADD COLUMN alocado_por INTEGER");
    if (!columnExists("os_alocacoes", "alocado_em")) db.exec("ALTER TABLE os_alocacoes ADD COLUMN alocado_em TEXT");
  }

  if (tableExists("os")) {
    if (!columnExists("os", "mecanico_user_id")) db.exec("ALTER TABLE os ADD COLUMN mecanico_user_id INTEGER REFERENCES users(id)");
    if (!columnExists("os", "auxiliar_user_id")) db.exec("ALTER TABLE os ADD COLUMN auxiliar_user_id INTEGER REFERENCES users(id)");
  }

  if (!tableExists("config_sistema")) {
    db.exec(`
      CREATE TABLE config_sistema (
        chave TEXT PRIMARY KEY,
        valor TEXT
      )
    `);
  }

  db.prepare("INSERT OR IGNORE INTO config_sistema (chave, valor) VALUES ('ultimo_mecanico_id', NULL)").run();

  const seedPairs = [
    ["Diogo", "Emanuel"],
    ["Salviano", "Luís"],
    ["Rodolfo", "Júnior"],
    ["Fábio", "Léo"],
  ];

  const findByName = db.prepare("SELECT id FROM users WHERE lower(name)=lower(?) LIMIT 1");
  const upsertPar = db.prepare(`
    INSERT OR IGNORE INTO equipe_pares (mecanico_user_id, auxiliar_user_id, ativo)
    VALUES (?, ?, 1)
  `);

  for (const [mecanicoNome, auxiliarNome] of seedPairs) {
    const mecanico = findByName.get(mecanicoNome);
    const auxiliar = findByName.get(auxiliarNome);
    if (mecanico?.id && auxiliar?.id) {
      upsertPar.run(Number(mecanico.id), Number(auxiliar.id));
    }
  }
};

