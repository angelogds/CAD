function up({ db, addColumnIfMissing }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS academia_perguntas_bloco (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bloco_id INTEGER NOT NULL,
      pergunta TEXT NOT NULL,
      tipo TEXT DEFAULT 'OBJETIVA',
      alternativa_a TEXT,
      alternativa_b TEXT,
      alternativa_c TEXT,
      alternativa_d TEXT,
      resposta_correta TEXT,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS academia_respostas_bloco (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      bloco_id INTEGER NOT NULL,
      pergunta_id INTEGER NOT NULL,
      resposta_usuario TEXT,
      correta INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS academia_avaliacao_final (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      nota REAL,
      percentual REAL,
      status TEXT DEFAULT 'REVISAR',
      respostas_json TEXT,
      finalizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS academia_beneficios_planejamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      curso_id INTEGER,
      campanha_nome TEXT,
      meta_mensal INTEGER,
      pontos_periodo INTEGER DEFAULT 0,
      periodo_ref TEXT,
      status TEXT DEFAULT 'PLANEJADO',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  addColumnIfMissing('academia_usuario_blocos', 'status', "status TEXT NOT NULL DEFAULT 'BLOQUEADO'");
  addColumnIfMissing('academia_usuario_blocos', 'nota', 'nota REAL');
  addColumnIfMissing('academia_usuario_blocos', 'percentual', 'percentual REAL');
}

module.exports = { up };
