const db = require('../../database/db');

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getDashboardData(userId) {
  const indicadores = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM academia_usuario_cursos WHERE status='EM_ANDAMENTO' AND usuario_id=@user_id) AS cursos_em_andamento,
      (SELECT COUNT(*) FROM academia_usuario_cursos WHERE status='CONCLUIDO' AND usuario_id=@user_id) AS cursos_concluidos,
      (SELECT COUNT(*) FROM academia_certificados WHERE usuario_id=@user_id) AS certificados,
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
    { titulo: 'Atualização de trilhas', descricao: 'Novos cursos de Segurança NR-12 e Lubrificação disponíveis nesta semana.' },
    { titulo: 'Campanha de certificação', descricao: 'Conclua 2 cursos no mês para ganhar bônus no ranking técnico.' },
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

  return `Com base no seu último curso (${ultimoCurso.titulo}), revise a trilha ${ultimoCurso.trilha_nome || 'principal'} e avance para um curso intermediário.`;
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
      uc.iniciado_em
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

function getCursoDetalhe(cursoId, userId = null) {
  const curso = db.prepare(`
    SELECT
      c.*,
      t.nome AS trilha_nome,
      COALESCE(uc.status, 'NAO_INICIADO') AS meu_status,
      COALESCE(uc.progresso_percentual, 0) AS progresso_percentual,
      uc.iniciado_em,
      uc.concluido_em
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

  const avaliacao = db.prepare(`
    SELECT nota, percentual, status, feedback, criado_em
    FROM academia_avaliacoes
    WHERE curso_id=? AND usuario_id=?
    ORDER BY criado_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);

  const certificado = db.prepare(`
    SELECT tipo, arquivo_url, emitido_em, codigo_validacao
    FROM academia_certificados
    WHERE curso_id=? AND usuario_id=?
    ORDER BY emitido_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);

  return {
    ...curso,
    aulas,
    avaliacao,
    certificado,
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
    ),
    trilhas AS (
      SELECT
        base.usuario_id,
        COUNT(CASE WHEN base.total > 0 AND base.concluidos = base.total THEN 1 END) AS trilhas_concluidas
      FROM (
        SELECT
          uc.usuario_id,
          c.trilha_id,
          COUNT(*) AS total,
          SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END) AS concluidos
        FROM academia_usuario_cursos uc
        JOIN academia_cursos c ON c.id=uc.curso_id
        WHERE c.trilha_id IS NOT NULL
        GROUP BY uc.usuario_id, c.trilha_id
      ) base
      GROUP BY base.usuario_id
    )
    SELECT
      u.id AS usuario_id,
      u.name AS funcionario,
      u.role,
      COALESCE(p.pontos, 0) AS pontos,
      COALESCE(c.cursos_concluidos, 0) AS cursos_concluidos,
      COALESCE(c.horas_estudadas, 0) AS horas_estudadas,
      COALESCE(cert.certificados, 0) AS certificados,
      COALESCE(t.trilhas_concluidas, 0) AS trilhas_concluidas
    FROM users u
    LEFT JOIN pontos p ON p.usuario_id=u.id
    LEFT JOIN cursos c ON c.usuario_id=u.id
    LEFT JOIN certs cert ON cert.usuario_id=u.id
    LEFT JOIN trilhas t ON t.usuario_id=u.id
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

  registrarPontuacao(userId, 'CONCLUSAO_CURSO', 100, `Curso #${cursoId} concluído`);

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

    registrarPontuacao(userId, 'CERTIFICADO_INTERNO', 30, `Certificado interno do curso #${cursoId}`);
  }
}

function salvarCertificado({ cursoId, userId, certificadoUrl }) {
  if (!certificadoUrl) throw new Error('Informe o link do certificado.');

  const curso = db.prepare('SELECT id FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso inválido.');

  const progress = db.prepare('SELECT id FROM academia_usuario_cursos WHERE usuario_id=? AND curso_id=?').get(userId, cursoId);
  if (!progress) {
    db.prepare(`
      INSERT INTO academia_usuario_cursos (usuario_id, curso_id, status, progresso_percentual, iniciado_em)
      VALUES (?, ?, 'EM_ANDAMENTO', 20, datetime('now'))
    `).run(userId, cursoId);
  }

  db.prepare(`
    INSERT INTO academia_certificados (usuario_id, curso_id, tipo, arquivo_url, codigo_validacao, emitido_em)
    VALUES (?, ?, 'EXTERNO', ?, ?, datetime('now'))
  `).run(userId, cursoId, certificadoUrl, `EXT-${cursoId}-${userId}-${Date.now()}`);

  registrarPontuacao(userId, 'CERTIFICADO_EXTERNO', 20, `Certificado externo do curso #${cursoId}`);
}

function registrarPontuacao(userId, origem, pontos, detalhe = null) {
  db.prepare(`
    INSERT INTO academia_pontos (usuario_id, origem, pontos, detalhe, criado_em)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(userId, origem, toInt(pontos, 0), detalhe);
}

function criarCurso(payload = {}) {
  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw new Error('Título do curso é obrigatório.');

  const info = db.prepare(`
    INSERT INTO academia_cursos (trilha_id, titulo, descricao, tipo, plataforma, link_externo, nivel, carga_horaria, imagem, ativo, criado_em)
    VALUES (@trilha_id, @titulo, @descricao, @tipo, @plataforma, @link_externo, @nivel, @carga_horaria, @imagem, 1, datetime('now'))
  `).run({
    trilha_id: payload.trilha_id ? Number(payload.trilha_id) : null,
    titulo,
    descricao: payload.descricao || null,
    tipo: String(payload.tipo || 'INTERNO').toUpperCase(),
    plataforma: String(payload.plataforma || 'INTERNO').toUpperCase(),
    link_externo: payload.link_curso || payload.link_externo || null,
    nivel: payload.nivel || 'BÁSICO',
    carga_horaria: toInt(payload.carga_horaria, 0),
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

module.exports = {
  getDashboardData,
  listTrilhas,
  listCursos,
  getTrilhaDetalhe,
  getCursoDetalhe,
  getMinhasAulas,
  listAvaliacoes,
  listCertificados,
  getRanking,
  getMinhaPosicaoRanking,
  listBiblioteca,
  listBibliotecaCategorias,
  iniciarCurso,
  concluirCurso,
  salvarCertificado,
  criarCurso,
  criarAula,
};
