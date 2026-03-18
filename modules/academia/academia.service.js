const crypto = require('crypto');
const db = require('../../database/db');

const NOTA_MINIMA_PADRAO = Number(process.env.ACADEMIA_NOTA_MINIMA || 70);

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function tableExists(name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

function columnExists(table, column) {
  if (!tableExists(table)) return false;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function ensureAcademiaSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS academia_cursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trilha_id INTEGER,
      titulo TEXT NOT NULL,
      descricao TEXT,
      tipo TEXT DEFAULT 'INTERNO',
      plataforma TEXT DEFAULT 'INTERNO',
      link_externo TEXT,
      link_curso TEXT,
      nivel TEXT DEFAULT 'BÁSICO',
      carga_horaria INTEGER DEFAULT 0,
      nota_minima REAL DEFAULT 70,
      imagem TEXT,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_aulas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso_id INTEGER,
      titulo TEXT,
      descricao TEXT,
      tipo_conteudo TEXT DEFAULT 'VIDEO',
      video_url TEXT,
      arquivo_url TEXT,
      ordem INTEGER,
      ativo INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS academia_blocos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      conteudo_texto TEXT,
      checklist_json TEXT,
      imagem_url TEXT,
      resumo TEXT,
      ordem INTEGER DEFAULT 1,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_ebooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso_id INTEGER NOT NULL,
      bloco_id INTEGER,
      titulo TEXT NOT NULL,
      resumo TEXT,
      conteudo_html TEXT,
      arquivo_url TEXT,
      versao TEXT,
      publicado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_biblioteca (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT,
      descricao TEXT,
      categoria TEXT,
      tipo TEXT,
      arquivo_url TEXT,
      equipamento_id INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
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
      etapa_externa_liberada_em DATETIME,
      etapa_externa_liberada_por INTEGER,
      UNIQUE (usuario_id, curso_id)
    );
    CREATE TABLE IF NOT EXISTS academia_avaliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      tipo_avaliacao TEXT DEFAULT 'OBJETIVA',
      nota REAL,
      percentual REAL,
      status TEXT DEFAULT 'REVISAR',
      feedback TEXT,
      recomendacao_ia TEXT,
      respostas_json TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_certificados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'INTERNO',
      arquivo_url TEXT,
      codigo_validacao TEXT,
      emitido_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_documentos_internos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      tipo_documento TEXT NOT NULL,
      codigo_validacao TEXT NOT NULL,
      observacao_institucional TEXT,
      carga_horaria_interna INTEGER DEFAULT 0,
      arquivo_url TEXT,
      emitido_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_etapas_externas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      plataforma TEXT NOT NULL DEFAULT 'CURSA',
      link_externo TEXT,
      certificado_url TEXT,
      certificado_nome_arquivo TEXT,
      data_conclusao DATETIME,
      status_validacao TEXT DEFAULT 'PENDENTE',
      validado_por INTEGER,
      validado_em DATETIME,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_interacoes_ia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      curso_id INTEGER,
      tipo_interacao TEXT,
      pergunta TEXT,
      resposta TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_pontos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      origem TEXT NOT NULL,
      pontos INTEGER NOT NULL DEFAULT 0,
      detalhe TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (!columnExists('academia_cursos', 'nota_minima')) db.exec("ALTER TABLE academia_cursos ADD COLUMN nota_minima REAL DEFAULT 70");
  if (!columnExists('academia_usuario_cursos', 'etapa_externa_liberada_em')) db.exec("ALTER TABLE academia_usuario_cursos ADD COLUMN etapa_externa_liberada_em DATETIME");
  if (!columnExists('academia_usuario_cursos', 'etapa_externa_liberada_por')) db.exec("ALTER TABLE academia_usuario_cursos ADD COLUMN etapa_externa_liberada_por INTEGER");

  if (!columnExists('academia_avaliacoes', 'tipo_avaliacao')) db.exec("ALTER TABLE academia_avaliacoes ADD COLUMN tipo_avaliacao TEXT DEFAULT 'OBJETIVA'");
  if (!columnExists('academia_avaliacoes', 'recomendacao_ia')) db.exec("ALTER TABLE academia_avaliacoes ADD COLUMN recomendacao_ia TEXT");
  if (!columnExists('academia_avaliacoes', 'respostas_json')) db.exec("ALTER TABLE academia_avaliacoes ADD COLUMN respostas_json TEXT");

  if (tableExists('trilhas_conhecimento')) {
    db.exec(`
      INSERT OR IGNORE INTO academia_trilhas (id, nome, descricao, icone, nivel, ativo, criado_em)
      SELECT id, nome, descricao, icone, 'BÁSICO', 1, criado_em
      FROM trilhas_conhecimento;
    `);
  }

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
    `);
  }
}

ensureAcademiaSchema();

function getDashboardData(userId) {
  const indicadores = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM academia_usuario_cursos WHERE status='EM_ANDAMENTO' AND usuario_id=@user_id) AS cursos_em_andamento,
      (SELECT COUNT(*) FROM academia_usuario_cursos WHERE status='CONCLUIDO' AND usuario_id=@user_id) AS cursos_concluidos,
      (SELECT COUNT(*) FROM academia_documentos_internos WHERE usuario_id=@user_id) AS documentos_internos,
      (SELECT COUNT(*) FROM academia_etapas_externas WHERE usuario_id=@user_id AND status_validacao='VALIDADO') AS etapas_externas_validadas,
      (SELECT COALESCE(SUM(c.carga_horaria),0)
        FROM academia_usuario_cursos uc
        JOIN academia_cursos c ON c.id=uc.curso_id
        WHERE uc.usuario_id=@user_id AND uc.status='CONCLUIDO') AS horas_treinamento
  `).get({ user_id: userId || 0 });

  const ranking = getRanking();
  const minhaPosicao = getMinhaPosicaoRanking(userId, ranking);
  const trilhaRecomendada = getProximaTrilhaRecomendada(userId);

  return {
    indicadores,
    minhaPosicao,
    trilhaRecomendada,
    continuarEstudando: getContinuarEstudando(userId),
    cursosDestaque: getCursosDestaque(),
    trilhas: listTrilhas(userId),
    ultimosCertificados: listCertificados(userId, 4),
    avisosAcademia: getAvisosAcademia(),
    recomendacaoIA: getRecomendacaoIA(userId),
    ranking: ranking.slice(0, 5),
  };
}

function getProximaTrilhaRecomendada(userId) {
  return db.prepare(`
    SELECT
      t.id,
      t.nome,
      t.descricao,
      t.icone,
      COUNT(c.id) AS total_cursos,
      COALESCE(SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END), 0) AS concluidos
    FROM academia_trilhas t
    LEFT JOIN academia_cursos c ON c.trilha_id=t.id AND c.ativo=1
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id AND uc.usuario_id=@user_id
    WHERE t.ativo=1
    GROUP BY t.id
    ORDER BY
      CASE WHEN COUNT(c.id)=0 THEN 1 ELSE 0 END ASC,
      (COALESCE(SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END), 0) * 1.0) / NULLIF(COUNT(c.id),0) ASC,
      t.nome ASC
    LIMIT 1
  `).get({ user_id: userId || 0 }) || null;
}

function getContinuarEstudando(userId) {
  return db.prepare(`
    SELECT
      c.id,
      c.titulo,
      c.nivel,
      c.carga_horaria,
      t.nome AS trilha_nome,
      uc.progresso_percentual,
      uc.status
    FROM academia_usuario_cursos uc
    JOIN academia_cursos c ON c.id=uc.curso_id
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    WHERE uc.usuario_id=? AND uc.status='EM_ANDAMENTO'
    ORDER BY uc.iniciado_em DESC
    LIMIT 4
  `).all(userId || 0);
}

function getCursosDestaque() {
  return db.prepare(`
    SELECT
      c.id,
      c.titulo,
      c.nivel,
      c.carga_horaria,
      c.plataforma,
      c.tipo,
      t.nome AS trilha_nome,
      COUNT(uc.id) AS total_inscritos
    FROM academia_cursos c
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id
    WHERE c.ativo=1
    GROUP BY c.id
    ORDER BY total_inscritos DESC, c.criado_em DESC
    LIMIT 6
  `).all();
}

function getAvisosAcademia() {
  return [
    { titulo: 'Capacitação institucional', descricao: 'Documentos emitidos pela Academia são internos e não configuram formação técnica oficial.' },
    { titulo: 'Etapa complementar externa', descricao: 'Após aprovação interna, o sistema libera o curso complementar no Cursa para validação externa.' },
  ];
}

function getRecomendacaoIA(userId) {
  const ultimoCurso = db.prepare(`
    SELECT c.titulo, t.nome AS trilha_nome
    FROM academia_usuario_cursos uc
    JOIN academia_cursos c ON c.id=uc.curso_id
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    WHERE uc.usuario_id=?
    ORDER BY COALESCE(uc.concluido_em, uc.iniciado_em) DESC
    LIMIT 1
  `).get(userId || 0);

  if (!ultimoCurso) {
    return 'Comece pela trilha “Conhecimento da Fábrica” para acelerar sua adaptação operacional.';
  }

  return `Com base no seu último curso (${ultimoCurso.titulo}), revise a trilha ${ultimoCurso.trilha_nome || 'principal'} e avance para um bloco prático com checklist.`;
}

function listTrilhas(userId = null) {
  return db.prepare(`
    SELECT
      t.id,
      t.nome,
      t.descricao,
      t.icone,
      t.nivel,
      COUNT(c.id) AS total_cursos,
      COALESCE(SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END),0) AS cursos_concluidos,
      COALESCE(ROUND((SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(c.id),0), 0),0) AS progresso_percentual
    FROM academia_trilhas t
    LEFT JOIN academia_cursos c ON c.trilha_id=t.id AND c.ativo=1
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id AND uc.usuario_id=@user_id
    WHERE t.ativo=1
    GROUP BY t.id
    ORDER BY t.nome ASC
  `).all({ user_id: userId || 0 });
}

function listCursos(filters = {}, userId = null) {
  const trilhaId = filters.trilha_id ? Number(filters.trilha_id) : null;
  const nivel = String(filters.nivel || '').trim();
  const busca = String(filters.busca || '').trim();

  let sql = `
    SELECT
      c.*,
      t.nome AS trilha_nome,
      COALESCE(uc.status, 'NAO_INICIADO') AS meu_status,
      COALESCE(uc.progresso_percentual, 0) AS progresso_percentual,
      uc.concluido_em,
      uc.iniciado_em,
      CASE
        WHEN uc.etapa_externa_liberada_em IS NOT NULL THEN 1
        ELSE 0
      END AS etapa_externa_liberada
    FROM academia_cursos c
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id AND uc.usuario_id=@usuario_id
    WHERE c.ativo=1
  `;

  const params = { usuario_id: userId || 0 };
  if (trilhaId) {
    sql += ' AND c.trilha_id=@trilha_id';
    params.trilha_id = trilhaId;
  }
  if (nivel) {
    sql += ' AND UPPER(c.nivel)=UPPER(@nivel)';
    params.nivel = nivel;
  }
  if (busca) {
    sql += ' AND (c.titulo LIKE @busca OR c.descricao LIKE @busca OR t.nome LIKE @busca)';
    params.busca = `%${busca}%`;
  }

  sql += ' ORDER BY c.titulo';

  return db.prepare(sql).all(params);
}

function getTrilhaDetalhe(trilhaId, userId = null) {
  const trilha = db.prepare(`
    SELECT id, nome, descricao, icone, nivel
    FROM academia_trilhas
    WHERE id=? AND ativo=1
  `).get(trilhaId);
  if (!trilha) return null;

  const cursos = listCursos({ trilha_id: trilhaId }, userId);
  const concluidos = cursos.filter((c) => c.meu_status === 'CONCLUIDO').length;
  const progresso = cursos.length ? Math.round((concluidos * 100) / cursos.length) : 0;

  return {
    ...trilha,
    cursos,
    total_cursos: cursos.length,
    concluidos,
    progresso_percentual: progresso,
  };
}

function listBlocos(cursoId) {
  return db.prepare(`
    SELECT id, curso_id, titulo, descricao, conteudo_texto, checklist_json, imagem_url, resumo, ordem, ativo
    FROM academia_blocos
    WHERE curso_id=? AND ativo=1
    ORDER BY ordem ASC, id ASC
  `).all(cursoId).map((b) => ({
    ...b,
    checklist: (() => {
      try { return b.checklist_json ? JSON.parse(b.checklist_json) : []; } catch (_e) { return []; }
    })(),
  }));
}

function listEbooks(cursoId) {
  return db.prepare(`
    SELECT id, curso_id, bloco_id, titulo, resumo, conteudo_html, arquivo_url, versao, publicado_em
    FROM academia_ebooks
    WHERE curso_id=?
    ORDER BY datetime(publicado_em) DESC, id DESC
  `).all(cursoId);
}

function getCursoDetalhe(cursoId, userId = null) {
  const curso = db.prepare(`
    SELECT
      c.*,
      t.nome AS trilha_nome,
      COALESCE(uc.status, 'NAO_INICIADO') AS meu_status,
      COALESCE(uc.progresso_percentual, 0) AS progresso_percentual,
      uc.iniciado_em,
      uc.concluido_em,
      uc.etapa_externa_liberada_em,
      uc.etapa_externa_liberada_por
    FROM academia_cursos c
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id AND uc.usuario_id=?
    WHERE c.id=?
  `).get(userId || 0, cursoId);

  if (!curso) return null;

  const aulas = db.prepare(`
    SELECT *
    FROM academia_aulas
    WHERE curso_id=? AND ativo=1
    ORDER BY ordem ASC, id ASC
  `).all(cursoId);

  const blocos = listBlocos(cursoId);
  const ebooks = listEbooks(cursoId);

  const avaliacao = db.prepare(`
    SELECT id, nota, percentual, status, feedback, recomendacao_ia, tipo_avaliacao, criado_em
    FROM academia_avaliacoes
    WHERE curso_id=? AND usuario_id=?
    ORDER BY criado_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);

  const etapaExterna = db.prepare(`
    SELECT *
    FROM academia_etapas_externas
    WHERE curso_id=? AND usuario_id=?
    ORDER BY criado_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);

  const documentoInterno = db.prepare(`
    SELECT *
    FROM academia_documentos_internos
    WHERE curso_id=? AND usuario_id=?
    ORDER BY emitido_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);

  return {
    ...curso,
    aulas,
    blocos,
    ebooks,
    avaliacao,
    etapaExterna,
    documentoInterno,
    podeLiberarEtapaExterna: podeLiberarEtapaExterna({ cursoId, userId, forceCheckOnly: true }),
  };
}

function getMinhasAulas(userId) {
  const cursos = db.prepare(`
    SELECT
      uc.*,
      c.titulo,
      c.plataforma,
      c.tipo,
      c.nivel,
      c.carga_horaria,
      c.link_externo,
      t.nome AS trilha_nome
    FROM academia_usuario_cursos uc
    JOIN academia_cursos c ON c.id=uc.curso_id
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    WHERE uc.usuario_id=?
    ORDER BY CASE uc.status
      WHEN 'EM_ANDAMENTO' THEN 1
      WHEN 'CONCLUIDO' THEN 2
      ELSE 3 END,
      COALESCE(uc.iniciado_em, uc.concluido_em, uc.id) DESC
  `).all(userId || 0);

  const progressoTrilhas = db.prepare(`
    SELECT
      t.nome,
      COUNT(c.id) AS total,
      COALESCE(SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END), 0) AS concluidos
    FROM academia_trilhas t
    LEFT JOIN academia_cursos c ON c.trilha_id=t.id AND c.ativo=1
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id AND uc.usuario_id=?
    WHERE t.ativo=1
    GROUP BY t.id
    ORDER BY t.nome
  `).all(userId || 0);

  return {
    emAndamento: cursos.filter((c) => c.status === 'EM_ANDAMENTO'),
    concluidos: cursos.filter((c) => c.status === 'CONCLUIDO'),
    pendentes: cursos.filter((c) => c.status === 'PENDENTE' || c.status === 'NAO_INICIADO'),
    recentes: cursos.slice(0, 5),
    progressoTrilhas: progressoTrilhas.map((t) => ({
      ...t,
      percentual: t.total ? Math.round((t.concluidos * 100) / t.total) : 0,
    })),
  };
}

function listAvaliacoes(userId) {
  return db.prepare(`
    SELECT
      a.*,
      c.titulo AS curso_titulo,
      c.nivel AS curso_nivel,
      c.tipo AS curso_tipo
    FROM academia_avaliacoes a
    JOIN academia_cursos c ON c.id=a.curso_id
    WHERE a.usuario_id=?
    ORDER BY a.criado_em DESC
  `).all(userId || 0);
}

function listCertificados(userId, limit = null) {
  let sql = `
    SELECT
      cert.*,
      c.titulo AS curso_titulo,
      c.carga_horaria,
      c.tipo AS curso_tipo
    FROM academia_certificados cert
    JOIN academia_cursos c ON c.id=cert.curso_id
    WHERE cert.usuario_id=?
    ORDER BY cert.emitido_em DESC
  `;
  if (limit) sql += ` LIMIT ${toInt(limit, 4)}`;
  return db.prepare(sql).all(userId || 0);
}

function listDocumentosInternos(userId) {
  return db.prepare(`
    SELECT d.*, c.titulo AS curso_titulo
    FROM academia_documentos_internos d
    JOIN academia_cursos c ON c.id=d.curso_id
    WHERE d.usuario_id=?
    ORDER BY d.emitido_em DESC
  `).all(userId || 0);
}

function listEtapasExternas(userId) {
  return db.prepare(`
    SELECT e.*, c.titulo AS curso_titulo
    FROM academia_etapas_externas e
    JOIN academia_cursos c ON c.id=e.curso_id
    WHERE e.usuario_id=?
    ORDER BY e.criado_em DESC
  `).all(userId || 0);
}

function getRanking() {
  return db.prepare(`
    WITH pontos AS (
      SELECT usuario_id, COALESCE(SUM(pontos), 0) AS pontos
      FROM academia_pontos
      GROUP BY usuario_id
    ),
    cursos AS (
      SELECT
        uc.usuario_id,
        COUNT(CASE WHEN uc.status='CONCLUIDO' THEN 1 END) AS cursos_concluidos,
        COALESCE(SUM(CASE WHEN uc.status='CONCLUIDO' THEN c.carga_horaria ELSE 0 END), 0) AS horas_estudadas
      FROM academia_usuario_cursos uc
      JOIN academia_cursos c ON c.id=uc.curso_id
      GROUP BY uc.usuario_id
    ),
    certs AS (
      SELECT usuario_id, COUNT(*) AS certificados
      FROM academia_certificados
      GROUP BY usuario_id
    )
    SELECT
      u.id AS usuario_id,
      u.name AS funcionario,
      u.role,
      COALESCE(p.pontos, 0) AS pontos,
      COALESCE(c.cursos_concluidos, 0) AS cursos_concluidos,
      COALESCE(c.horas_estudadas, 0) AS horas_estudadas,
      COALESCE(cert.certificados, 0) AS certificados
    FROM users u
    LEFT JOIN pontos p ON p.usuario_id=u.id
    LEFT JOIN cursos c ON c.usuario_id=u.id
    LEFT JOIN certs cert ON cert.usuario_id=u.id
    WHERE COALESCE(p.pontos, 0) > 0 OR COALESCE(c.cursos_concluidos, 0) > 0 OR COALESCE(cert.certificados, 0) > 0
    ORDER BY pontos DESC, cursos_concluidos DESC, horas_estudadas DESC, funcionario ASC
    LIMIT 50
  `).all();
}

function getMinhaPosicaoRanking(userId, rankingList = null) {
  if (!userId) return null;
  const ranking = Array.isArray(rankingList) ? rankingList : getRanking();
  const idx = ranking.findIndex((item) => Number(item.usuario_id) === Number(userId));
  if (idx < 0) return null;
  return {
    posicao: idx + 1,
    ...ranking[idx],
  };
}

function listBiblioteca(filters = {}) {
  let sql = `
    SELECT id, titulo, descricao, categoria, tipo, arquivo_url, equipamento_id, criado_em
    FROM academia_biblioteca
    WHERE 1=1
  `;
  const params = {};

  if (filters.categoria) {
    sql += ' AND categoria=@categoria';
    params.categoria = filters.categoria;
  }

  if (filters.busca) {
    sql += ' AND (titulo LIKE @busca OR descricao LIKE @busca OR categoria LIKE @busca)';
    params.busca = `%${filters.busca}%`;
  }

  sql += ' ORDER BY criado_em DESC, id DESC';

  return db.prepare(sql).all(params);
}

function listBibliotecaCategorias() {
  return db.prepare(`
    SELECT DISTINCT categoria
    FROM academia_biblioteca
    WHERE categoria IS NOT NULL AND categoria <> ''
    ORDER BY categoria
  `).all().map((row) => row.categoria);
}

function iniciarCurso({ cursoId, userId }) {
  const curso = db.prepare('SELECT id FROM academia_cursos WHERE id=? AND ativo=1').get(cursoId);
  if (!curso) throw new Error('Curso não encontrado ou inativo.');

  const existente = db.prepare('SELECT id, status FROM academia_usuario_cursos WHERE usuario_id=? AND curso_id=?').get(userId, cursoId);
  if (!existente) {
    db.prepare(`
      INSERT INTO academia_usuario_cursos (usuario_id, curso_id, status, progresso_percentual, iniciado_em)
      VALUES (?, ?, 'EM_ANDAMENTO', 5, datetime('now'))
    `).run(userId, cursoId);
    return;
  }

  if (existente.status === 'CONCLUIDO') return;

  db.prepare(`
    UPDATE academia_usuario_cursos
    SET status='EM_ANDAMENTO',
        progresso_percentual=CASE WHEN progresso_percentual < 5 THEN 5 ELSE progresso_percentual END,
        iniciado_em=COALESCE(iniciado_em, datetime('now'))
    WHERE id=?
  `).run(existente.id);
}

function registrarPontuacao(userId, origem, pontos, detalhe = null) {
  db.prepare(`
    INSERT INTO academia_pontos (usuario_id, origem, pontos, detalhe, criado_em)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(userId, origem, toInt(pontos, 0), detalhe);
}

function emitirDocumentoInterno({ userId, cursoId, tipoDocumento = 'Declaração Interna de Conclusão de Capacitação' }) {
  const curso = db.prepare('SELECT id, titulo, carga_horaria FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso inválido para emissão de documento interno.');

  const codigo = `DOC-${cursoId}-${userId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  db.prepare(`
    INSERT INTO academia_documentos_internos (usuario_id, curso_id, tipo_documento, codigo_validacao, observacao_institucional, carga_horaria_interna, arquivo_url, emitido_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    userId,
    cursoId,
    tipoDocumento,
    codigo,
    'Documento institucional interno. Não representa formação técnica oficial nem certificação reconhecida por órgão educacional externo.',
    toInt(curso.carga_horaria, 0),
    `/academia/documentos-internos?codigo=${codigo}`
  );
}

function concluirCurso({ cursoId, userId }) {
  const curso = db.prepare('SELECT id, carga_horaria, tipo FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso não encontrado.');

  const existente = db.prepare('SELECT id FROM academia_usuario_cursos WHERE usuario_id=? AND curso_id=?').get(userId, cursoId);

  if (!existente) {
    db.prepare(`
      INSERT INTO academia_usuario_cursos (usuario_id, curso_id, status, progresso_percentual, iniciado_em, concluido_em)
      VALUES (?, ?, 'CONCLUIDO', 100, datetime('now'), datetime('now'))
    `).run(userId, cursoId);
  } else {
    db.prepare(`
      UPDATE academia_usuario_cursos
      SET status='CONCLUIDO',
          progresso_percentual=100,
          concluido_em=datetime('now')
      WHERE id=?
    `).run(existente.id);
  }

  registrarPontuacao(userId, 'CONCLUSAO_CURSO_INTERNO', 20, `Curso interno #${cursoId} concluído`);

  emitirDocumentoInterno({ userId, cursoId, tipoDocumento: 'Declaração Interna de Conclusão de Capacitação' });
  emitirDocumentoInterno({ userId, cursoId, tipoDocumento: 'Registro Interno de Treinamento' });

  const jaTemCertificado = db.prepare(`
    SELECT id FROM academia_certificados
    WHERE usuario_id=? AND curso_id=? AND tipo='INTERNO'
  `).get(userId, cursoId);

  if (!jaTemCertificado) {
    const codigo = `ACD-${cursoId}-${userId}-${Date.now()}`;
    db.prepare(`
      INSERT INTO academia_certificados (usuario_id, curso_id, tipo, arquivo_url, codigo_validacao, emitido_em)
      VALUES (?, ?, 'INTERNO', ?, ?, datetime('now'))
    `).run(userId, cursoId, `/academia/certificados?codigo=${codigo}`, codigo);
  }
}

function registrarAvaliacaoInterna({ cursoId, userId, tipoAvaliacao, nota, percentual, feedback, recomendacaoIA, respostas }) {
  const curso = db.prepare('SELECT id, nota_minima FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso não encontrado para avaliação.');

  const score = toFloat(nota, 0);
  const perc = toFloat(percentual, score);
  const notaMinima = toFloat(curso.nota_minima, NOTA_MINIMA_PADRAO);
  const status = score >= notaMinima ? 'APROVADO' : 'REVISAR';

  db.prepare(`
    INSERT INTO academia_avaliacoes (curso_id, usuario_id, tipo_avaliacao, nota, percentual, status, feedback, recomendacao_ia, respostas_json, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    cursoId,
    userId,
    String(tipoAvaliacao || 'OBJETIVA').toUpperCase(),
    score,
    perc,
    status,
    feedback || null,
    recomendacaoIA || null,
    respostas ? JSON.stringify(respostas) : null
  );

  if (status === 'APROVADO') registrarPontuacao(userId, 'AVALIACAO_INTERNA_APROVADA', 20, `Avaliação aprovada do curso #${cursoId}`);

  return { status, nota: score, notaMinima };
}

function podeLiberarEtapaExterna({ cursoId, userId, forceCheckOnly = false }) {
  const progresso = db.prepare(`
    SELECT status, progresso_percentual
    FROM academia_usuario_cursos
    WHERE curso_id=? AND usuario_id=?
  `).get(cursoId, userId || 0);

  const curso = db.prepare('SELECT nota_minima, link_externo FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) return false;

  const avaliacao = db.prepare(`
    SELECT nota, status
    FROM academia_avaliacoes
    WHERE curso_id=? AND usuario_id=?
    ORDER BY criado_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);

  const notaMinima = toFloat(curso.nota_minima, NOTA_MINIMA_PADRAO);
  const regraAutomatica = !!progresso
    && (progresso.status === 'CONCLUIDO' || toInt(progresso.progresso_percentual, 0) >= 100)
    && !!avaliacao
    && (avaliacao.status === 'APROVADO' || toFloat(avaliacao.nota, 0) >= notaMinima)
    && !!curso.link_externo;

  if (forceCheckOnly) return regraAutomatica;

  if (regraAutomatica) {
    db.prepare(`
      UPDATE academia_usuario_cursos
      SET etapa_externa_liberada_em=COALESCE(etapa_externa_liberada_em, datetime('now'))
      WHERE usuario_id=? AND curso_id=?
    `).run(userId, cursoId);
  }

  return regraAutomatica;
}

function liberarEtapaExternaManual({ cursoId, userId, adminId }) {
  const progresso = db.prepare('SELECT id FROM academia_usuario_cursos WHERE usuario_id=? AND curso_id=?').get(userId, cursoId);
  if (!progresso) {
    db.prepare(`
      INSERT INTO academia_usuario_cursos (usuario_id, curso_id, status, progresso_percentual, iniciado_em)
      VALUES (?, ?, 'EM_ANDAMENTO', 60, datetime('now'))
    `).run(userId, cursoId);
  }

  db.prepare(`
    UPDATE academia_usuario_cursos
    SET etapa_externa_liberada_em=datetime('now'),
        etapa_externa_liberada_por=?
    WHERE usuario_id=? AND curso_id=?
  `).run(adminId || null, userId, cursoId);
}

function registrarEtapaExterna({ cursoId, userId, certificadoUrl, dataConclusao, plataforma = 'CURSA', linkExterno, certificadoNomeArquivo = null }) {
  const curso = db.prepare('SELECT id, link_externo FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso inválido.');

  const etapaLiberada = db.prepare(`
    SELECT etapa_externa_liberada_em
    FROM academia_usuario_cursos
    WHERE usuario_id=? AND curso_id=?
  `).get(userId, cursoId);

  if (!etapaLiberada?.etapa_externa_liberada_em) {
    const automatico = podeLiberarEtapaExterna({ cursoId, userId });
    if (!automatico) {
      throw new Error('Etapa externa ainda não liberada. Conclua o interno e atinja a nota mínima, ou solicite liberação ao administrador.');
    }
  }

  const url = String(certificadoUrl || '').trim();
  if (!url) throw new Error('Informe o link ou upload do comprovante externo.');

  db.prepare(`
    INSERT INTO academia_etapas_externas (usuario_id, curso_id, plataforma, link_externo, certificado_url, certificado_nome_arquivo, data_conclusao, status_validacao, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE', datetime('now'))
  `).run(
    userId,
    cursoId,
    String(plataforma || 'CURSA').toUpperCase(),
    linkExterno || curso.link_externo || null,
    url,
    certificadoNomeArquivo,
    dataConclusao || null
  );

  registrarPontuacao(userId, 'ENVIO_CERTIFICADO_EXTERNO', 10, `Certificado externo enviado para o curso #${cursoId}`);
}

function validarEtapaExterna({ etapaId, statusValidacao, adminId }) {
  const etapa = db.prepare('SELECT id, usuario_id, curso_id, status_validacao FROM academia_etapas_externas WHERE id=?').get(etapaId);
  if (!etapa) throw new Error('Registro de etapa externa não encontrado.');

  const status = String(statusValidacao || '').toUpperCase() === 'VALIDADO' ? 'VALIDADO' : 'REPROVADO';

  db.prepare(`
    UPDATE academia_etapas_externas
    SET status_validacao=?, validado_por=?, validado_em=datetime('now')
    WHERE id=?
  `).run(status, adminId || null, etapaId);

  if (status === 'VALIDADO') {
    registrarPontuacao(etapa.usuario_id, 'ETAPA_EXTERNA_VALIDADA', 50, `Etapa externa validada no curso #${etapa.curso_id}`);
    emitirDocumentoInterno({ userId: etapa.usuario_id, cursoId: etapa.curso_id, tipoDocumento: 'Comprovante Institucional de Participação' });
  }
}

function salvarCertificado({ cursoId, userId, certificadoUrl }) {
  registrarEtapaExterna({ cursoId, userId, certificadoUrl });
}

function criarCurso(payload = {}) {
  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw new Error('Título do curso é obrigatório.');

  const info = db.prepare(`
    INSERT INTO academia_cursos (trilha_id, titulo, descricao, tipo, plataforma, link_externo, nivel, carga_horaria, nota_minima, imagem, ativo, criado_em)
    VALUES (@trilha_id, @titulo, @descricao, @tipo, @plataforma, @link_externo, @nivel, @carga_horaria, @nota_minima, @imagem, 1, datetime('now'))
  `).run({
    trilha_id: payload.trilha_id ? Number(payload.trilha_id) : null,
    titulo,
    descricao: payload.descricao || null,
    tipo: String(payload.tipo || 'INTERNO').toUpperCase(),
    plataforma: String(payload.plataforma || 'INTERNO').toUpperCase(),
    link_externo: payload.link_curso || payload.link_externo || null,
    nivel: payload.nivel || 'BÁSICO',
    carga_horaria: toInt(payload.carga_horaria, 0),
    nota_minima: toFloat(payload.nota_minima, NOTA_MINIMA_PADRAO),
    imagem: payload.imagem || null,
  });

  return Number(info.lastInsertRowid);
}

function criarAula(payload = {}) {
  const cursoId = Number(payload.curso_id);
  if (!cursoId) throw new Error('Curso inválido.');
  const curso = db.prepare('SELECT id FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso não encontrado.');

  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw new Error('Título da aula é obrigatório.');

  const info = db.prepare(`
    INSERT INTO academia_aulas (curso_id, titulo, descricao, tipo_conteudo, video_url, arquivo_url, ordem, ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    cursoId,
    titulo,
    payload.descricao || null,
    String(payload.tipo_conteudo || 'VIDEO').toUpperCase(),
    payload.video_url || null,
    payload.arquivo_url || null,
    toInt(payload.ordem, 1)
  );

  return Number(info.lastInsertRowid);
}

function criarBloco(payload = {}) {
  const cursoId = Number(payload.curso_id);
  if (!cursoId) throw new Error('Curso inválido para bloco.');
  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw new Error('Título do bloco é obrigatório.');

  const checklist = Array.isArray(payload.checklist)
    ? payload.checklist
    : String(payload.checklist || '').split('\n').map((l) => l.trim()).filter(Boolean);

  const info = db.prepare(`
    INSERT INTO academia_blocos (curso_id, titulo, descricao, conteudo_texto, checklist_json, imagem_url, resumo, ordem, ativo, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `).run(
    cursoId,
    titulo,
    payload.descricao || null,
    payload.conteudo_texto || null,
    JSON.stringify(checklist),
    payload.imagem_url || null,
    payload.resumo || null,
    toInt(payload.ordem, 1)
  );

  return Number(info.lastInsertRowid);
}

function criarEbook(payload = {}) {
  const cursoId = Number(payload.curso_id);
  if (!cursoId) throw new Error('Curso inválido para e-book.');

  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw new Error('Título do e-book é obrigatório.');

  const info = db.prepare(`
    INSERT INTO academia_ebooks (curso_id, bloco_id, titulo, resumo, conteudo_html, arquivo_url, versao, publicado_em, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))
  `).run(
    cursoId,
    payload.bloco_id ? Number(payload.bloco_id) : null,
    titulo,
    payload.resumo || null,
    payload.conteudo_html || null,
    payload.arquivo_url || null,
    payload.versao || '1.0',
    payload.publicado_em || null
  );

  return Number(info.lastInsertRowid);
}

module.exports = {
  getDashboardData,
  listTrilhas,
  listCursos,
  getTrilhaDetalhe,
  getCursoDetalhe,
  getMinhasAulas,
  listAvaliacoes,
  listCertificados,
  listDocumentosInternos,
  listEtapasExternas,
  getRanking,
  getMinhaPosicaoRanking,
  listBiblioteca,
  listBibliotecaCategorias,
  iniciarCurso,
  concluirCurso,
  salvarCertificado,
  registrarAvaliacaoInterna,
  podeLiberarEtapaExterna,
  liberarEtapaExternaManual,
  registrarEtapaExterna,
  validarEtapaExterna,
  criarCurso,
  criarAula,
  criarBloco,
  criarEbook,
  registrarPontuacao,
};
