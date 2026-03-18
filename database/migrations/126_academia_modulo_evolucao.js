function up({ db, tableExists, columnExists, addColumnIfMissing }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS academia_trilhas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      descricao TEXT,
      icone TEXT,
      nivel TEXT DEFAULT 'BÁSICO',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS academia_usuario_cursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'NAO_INICIADO',
      progresso_percentual INTEGER NOT NULL DEFAULT 0,
      iniciado_em DATETIME,
      concluido_em DATETIME,
      FOREIGN KEY (usuario_id) REFERENCES users(id),
      FOREIGN KEY (curso_id) REFERENCES academia_cursos(id),
      UNIQUE (usuario_id, curso_id)
    );

    CREATE TABLE IF NOT EXISTS academia_avaliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      nota REAL,
      percentual REAL,
      status TEXT DEFAULT 'REVISAR',
      feedback TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (curso_id) REFERENCES academia_cursos(id),
      FOREIGN KEY (usuario_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS academia_certificados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'INTERNO',
      arquivo_url TEXT,
      codigo_validacao TEXT,
      emitido_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES users(id),
      FOREIGN KEY (curso_id) REFERENCES academia_cursos(id)
    );

    CREATE TABLE IF NOT EXISTS academia_pontos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      origem TEXT NOT NULL,
      pontos INTEGER NOT NULL DEFAULT 0,
      detalhe TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES users(id)
    );
  `);

  addColumnIfMissing('academia_cursos', 'tipo', "tipo TEXT DEFAULT 'INTERNO'");
  addColumnIfMissing('academia_cursos', 'link_externo', 'link_externo TEXT');
  addColumnIfMissing('academia_aulas', 'tipo_conteudo', "tipo_conteudo TEXT DEFAULT 'VIDEO'");
  addColumnIfMissing('academia_aulas', 'arquivo_url', 'arquivo_url TEXT');
  addColumnIfMissing('academia_aulas', 'ativo', 'ativo INTEGER DEFAULT 1');
  addColumnIfMissing('academia_biblioteca', 'categoria', 'categoria TEXT');
  addColumnIfMissing('academia_biblioteca', 'equipamento_id', 'equipamento_id INTEGER');
  addColumnIfMissing('academia_biblioteca', 'tipo_item', 'tipo_item TEXT');

  db.exec(`
    INSERT OR IGNORE INTO academia_trilhas (nome, descricao, icone, nivel, ativo)
    VALUES
    ('Mecânica Industrial', 'Fundamentos e práticas de manutenção mecânica.', '🔧', 'BÁSICO', 1),
    ('Soldagem e Serralheria', 'Técnicas de solda e fabricação mecânica.', '🧰', 'INTERMEDIÁRIO', 1),
    ('Lubrificação Industrial', 'Rotinas e práticas para reduzir falhas e desgaste.', '🛢️', 'BÁSICO', 1),
    ('Elétrica Industrial', 'Comandos elétricos, motores e painéis.', '⚡', 'INTERMEDIÁRIO', 1),
    ('Segurança do Trabalho', 'Normas e bloqueios para intervenções seguras.', '🦺', 'BÁSICO', 1),
    ('Operação de Equipamentos', 'Operação correta e inspeções básicas.', '🏭', 'BÁSICO', 1),
    ('PCM / Gestão da Manutenção', 'Planejamento, indicadores e gestão.', '📊', 'AVANÇADO', 1),
    ('Conhecimento da Fábrica', 'Padrões, procedimentos e know-how interno.', '🏗️', 'BÁSICO', 1);
  `);

  if (tableExists('trilhas_conhecimento')) {
    db.exec(`
      INSERT OR IGNORE INTO academia_trilhas (id, nome, descricao, icone, nivel, ativo, criado_em)
      SELECT id, nome, descricao, icone, 'BÁSICO', 1, criado_em
      FROM trilhas_conhecimento;
    `);
  }

  db.exec(`
    UPDATE academia_cursos
    SET tipo = CASE WHEN UPPER(COALESCE(plataforma,'')) IN ('CURSA','YOUTUBE','PDF','OUTRO') THEN 'EXTERNO' ELSE 'INTERNO' END
    WHERE tipo IS NULL OR tipo='';

    UPDATE academia_cursos
    SET link_externo = COALESCE(link_externo, link_curso)
    WHERE link_externo IS NULL;
  `);

  if (tableExists('academia_progresso')) {
    db.exec(`
      INSERT OR IGNORE INTO academia_usuario_cursos (usuario_id, curso_id, status, progresso_percentual, iniciado_em, concluido_em)
      SELECT
        p.usuario_id,
        p.curso_id,
        COALESCE(p.status, 'NAO_INICIADO'),
        CASE WHEN p.status='CONCLUIDO' THEN 100 WHEN p.status='EM_ANDAMENTO' THEN 50 ELSE 0 END,
        p.data_inicio,
        p.data_conclusao
      FROM academia_progresso p;

      INSERT OR IGNORE INTO academia_certificados (usuario_id, curso_id, tipo, arquivo_url, codigo_validacao, emitido_em)
      SELECT
        p.usuario_id,
        p.curso_id,
        'EXTERNO',
        p.certificado_url,
        'MIGRADO-' || p.usuario_id || '-' || p.curso_id,
        COALESCE(p.data_conclusao, datetime('now'))
      FROM academia_progresso p
      WHERE p.certificado_url IS NOT NULL AND TRIM(p.certificado_url) <> '';

      INSERT INTO academia_pontos (usuario_id, origem, pontos, detalhe, criado_em)
      SELECT
        p.usuario_id,
        'MIGRACAO_CONCLUSAO',
        100,
        'Pontuação migrada de curso concluído',
        COALESCE(p.data_conclusao, datetime('now'))
      FROM academia_progresso p
      WHERE p.status='CONCLUIDO';
    `);
  }

  db.exec(`
    INSERT INTO academia_avaliacoes (curso_id, usuario_id, nota, percentual, status, feedback)
    SELECT
      uc.curso_id,
      uc.usuario_id,
      8.0,
      80,
      'APROVADO',
      'Avaliação inicial gerada automaticamente para demonstração.'
    FROM academia_usuario_cursos uc
    WHERE uc.status='CONCLUIDO'
      AND NOT EXISTS (
        SELECT 1 FROM academia_avaliacoes av
        WHERE av.curso_id=uc.curso_id AND av.usuario_id=uc.usuario_id
      );

    UPDATE academia_biblioteca
    SET categoria = COALESCE(categoria,
      CASE
        WHEN titulo LIKE '%Digestor%' THEN 'Digestores'
        WHEN titulo LIKE '%Prensa%' THEN 'Prensas'
        WHEN titulo LIKE '%Rosca%' THEN 'Roscas'
        WHEN titulo LIKE '%Moinho%' THEN 'Moinhos'
        WHEN titulo LIKE '%Caldeira%' THEN 'Caldeiras'
        WHEN titulo LIKE '%Redutor%' THEN 'Redutores'
        WHEN titulo LIKE '%Rolamento%' THEN 'Rolamentos'
        WHEN titulo LIKE '%Lubrifica%' THEN 'Lubrificação'
        ELSE 'Segurança'
      END
    ), tipo_item = COALESCE(tipo_item, tipo);
  `);

  const cursosSeed = [
    ['Mecânica Industrial', 'Fundamentos de Mecânica Industrial', 'Princípios técnicos para atuação em equipamentos industriais.', 'INTERNO', 'INTERNO', null, 'BÁSICO', 8],
    ['Fabricação Mecânica', 'Leitura e Interpretação de Desenho Técnico', 'Interpretação técnica para manutenção e fabricação.', 'INTERNO', 'INTERNO', null, 'BÁSICO', 6],
    ['Mecânica Industrial', 'Rolamentos Industriais', 'Inspeção, montagem e análise de falhas em rolamentos.', 'INTERNO', 'INTERNO', null, 'INTERMEDIÁRIO', 6],
    ['Mecânica Industrial', 'Alinhamento de Eixos', 'Técnicas de alinhamento e redução de vibração.', 'INTERNO', 'INTERNO', null, 'INTERMEDIÁRIO', 6],
    ['Lubrificação Industrial', 'Lubrificação Industrial', 'Boas práticas de lubrificação e periodicidade.', 'INTERNO', 'INTERNO', null, 'BÁSICO', 6],
    ['Soldagem e Serralheria', 'Soldagem MIG', 'Curso externo de soldagem MIG.', 'EXTERNO', 'CURSA', 'https://cursa.app', 'BÁSICO', 8],
    ['Soldagem e Serralheria', 'Soldagem TIG', 'Curso externo de soldagem TIG.', 'EXTERNO', 'CURSA', 'https://cursa.app', 'INTERMEDIÁRIO', 8],
    ['Segurança do Trabalho', 'Segurança NR-12', 'Conceitos e aplicação prática da NR-12.', 'INTERNO', 'INTERNO', null, 'BÁSICO', 4],
    ['Segurança do Trabalho', 'Segurança em Intervenção Mecânica', 'Bloqueio e etiquetagem para intervenção segura.', 'INTERNO', 'INTERNO', null, 'INTERMEDIÁRIO', 4],
    ['Operação de Equipamentos', 'Operação Segura de Equipamentos', 'Práticas operacionais seguras para chão de fábrica.', 'INTERNO', 'INTERNO', null, 'BÁSICO', 5],
  ];

  const insertCurso = db.prepare(`
    INSERT INTO academia_cursos (trilha_id, titulo, descricao, tipo, plataforma, link_externo, nivel, carga_horaria, ativo, criado_em)
    VALUES ((SELECT id FROM academia_trilhas WHERE nome=? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `);

  const existeCurso = db.prepare('SELECT id FROM academia_cursos WHERE titulo=? LIMIT 1');
  for (const curso of cursosSeed) {
    if (!existeCurso.get(curso[1])) insertCurso.run(...curso);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_academia_trilhas_ativo ON academia_trilhas(ativo);
    CREATE INDEX IF NOT EXISTS idx_academia_cursos_tipo ON academia_cursos(tipo);
    CREATE INDEX IF NOT EXISTS idx_academia_usuario_cursos_usuario ON academia_usuario_cursos(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_academia_usuario_cursos_status ON academia_usuario_cursos(status);
    CREATE INDEX IF NOT EXISTS idx_academia_avaliacoes_usuario ON academia_avaliacoes(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_academia_certificados_usuario ON academia_certificados(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_academia_pontos_usuario ON academia_pontos(usuario_id);
  `);
}

module.exports = { up };
