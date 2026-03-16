module.exports = function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  if (!tableExists("os")) return;

  addColumnIfMissing("os", "executor_colaborador_id", "executor_colaborador_id INTEGER REFERENCES colaboradores(id)");
  addColumnIfMissing("os", "auxiliar_colaborador_id", "auxiliar_colaborador_id INTEGER REFERENCES colaboradores(id)");
  addColumnIfMissing("os", "turno_alocado", "turno_alocado TEXT CHECK (turno_alocado IN ('DIA','NOITE'))");
  addColumnIfMissing("os", "alocado_em", "alocado_em TEXT");
  addColumnIfMissing("os", "alocacao_modo", "alocacao_modo TEXT NOT NULL DEFAULT 'AUTO' CHECK (alocacao_modo IN ('AUTO','MANUAL'))");

  db.exec("CREATE INDEX IF NOT EXISTS idx_os_executor_status ON os(executor_colaborador_id, status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_os_auxiliar_status ON os(auxiliar_colaborador_id, status)");

  if (!tableExists("colaboradores")) return;

  if (!tableExists("equipe_pares")) {
    db.exec(`
      CREATE TABLE equipe_pares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mecanico_colaborador_id INTEGER NOT NULL,
        auxiliar_colaborador_id INTEGER NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
        ordem INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (mecanico_colaborador_id) REFERENCES colaboradores(id),
        FOREIGN KEY (auxiliar_colaborador_id) REFERENCES colaboradores(id),
        UNIQUE (mecanico_colaborador_id)
      )
    `);
  } else {
    addColumnIfMissing("equipe_pares", "mecanico_colaborador_id", "mecanico_colaborador_id INTEGER REFERENCES colaboradores(id)");
    addColumnIfMissing("equipe_pares", "auxiliar_colaborador_id", "auxiliar_colaborador_id INTEGER REFERENCES colaboradores(id)");
    addColumnIfMissing("equipe_pares", "ordem", "ordem INTEGER NOT NULL DEFAULT 0");

    if (columnExists("equipe_pares", "mecanico_user_id")) {
      db.exec(`
        UPDATE equipe_pares
        SET mecanico_colaborador_id = (
          SELECT c.id FROM colaboradores c WHERE c.user_id = equipe_pares.mecanico_user_id LIMIT 1
        )
        WHERE mecanico_colaborador_id IS NULL
          AND mecanico_user_id IS NOT NULL
      `);
    }
    if (columnExists("equipe_pares", "auxiliar_user_id")) {
      db.exec(`
        UPDATE equipe_pares
        SET auxiliar_colaborador_id = (
          SELECT c.id FROM colaboradores c WHERE c.user_id = equipe_pares.auxiliar_user_id LIMIT 1
        )
        WHERE auxiliar_colaborador_id IS NULL
          AND auxiliar_user_id IS NOT NULL
      `);
    }
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_equipe_pares_ordem ON equipe_pares(ativo, ordem, id)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uidx_equipe_pares_mecanico_colab ON equipe_pares(mecanico_colaborador_id) WHERE mecanico_colaborador_id IS NOT NULL");

  const pairs = [
    ["Diogo", "Emanuel", 1],
    ["Salviano", "Luís", 2],
    ["Rodolfo", "Júnior", 3],
    ["Fábio", "Léo", 4],
  ];

  const findColab = db.prepare(`SELECT id FROM colaboradores WHERE nome LIKE ? COLLATE NOCASE LIMIT 1`);
  const insertPar = db.prepare(`
    INSERT OR IGNORE INTO equipe_pares (mecanico_colaborador_id, auxiliar_colaborador_id, ativo, ordem)
    VALUES (?, ?, 1, ?)
  `);

  for (const [mecanicoNome, auxiliarNome, ordem] of pairs) {
    const mecanico = findColab.get(`%${mecanicoNome}%`);
    const auxiliar = findColab.get(`%${auxiliarNome}%`);
    if (mecanico?.id && auxiliar?.id) {
      insertPar.run(Number(mecanico.id), Number(auxiliar.id), Number(ordem));
    }
  }

  if (columnExists("os", "mecanico_user_id")) {
    db.exec(`
      UPDATE os
      SET executor_colaborador_id = (
        SELECT c.id FROM colaboradores c WHERE c.user_id = os.mecanico_user_id LIMIT 1
      )
      WHERE executor_colaborador_id IS NULL
        AND mecanico_user_id IS NOT NULL
    `);
  }

  if (columnExists("os", "auxiliar_user_id")) {
    db.exec(`
      UPDATE os
      SET auxiliar_colaborador_id = (
        SELECT c.id FROM colaboradores c WHERE c.user_id = os.auxiliar_user_id LIMIT 1
      )
      WHERE auxiliar_colaborador_id IS NULL
        AND auxiliar_user_id IS NOT NULL
    `);
  }
};
