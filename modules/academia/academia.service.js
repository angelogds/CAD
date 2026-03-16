const db = require('../../database/db');

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getDashboardData(userId) {
  const indicadores = db.prepare(`
    SELECT
      (SELECT COUNT(DISTINCT usuario_id) FROM academia_progresso WHERE status='CONCLUIDO') AS funcionarios_treinados,
      (SELECT COUNT(*) FROM academia_progresso WHERE status='CONCLUIDO') AS cursos_concluidos,
      (SELECT COALESCE(SUM(horas_concluidas),0) FROM academia_progresso WHERE status='CONCLUIDO') AS horas_treinamento,
      (SELECT COUNT(*) FROM academia_cursos WHERE ativo=1) AS cursos_ativos
  `).get();

  const trilhas = db.prepare(`
    SELECT t.*, COUNT(c.id) AS total_cursos
    FROM trilhas_conhecimento t
    LEFT JOIN academia_cursos c ON c.trilha_id=t.id AND c.ativo=1
    GROUP BY t.id
    ORDER BY t.nome
  `).all();

  const cursosDestaque = db.prepare(`
    SELECT c.*, t.nome AS trilha_nome,
      COALESCE((SELECT COUNT(*) FROM academia_progresso p WHERE p.curso_id=c.id),0) AS total_acessos
    FROM academia_cursos c
    LEFT JOIN trilhas_conhecimento t ON t.id=c.trilha_id
    WHERE c.ativo=1
    ORDER BY c.pontos DESC, c.criado_em DESC
    LIMIT 6
  `).all();

  const cursosMaisAcessados = db.prepare(`
    SELECT c.id, c.titulo, c.plataforma, COUNT(p.id) AS total_acessos
    FROM academia_cursos c
    LEFT JOIN academia_progresso p ON p.curso_id=c.id
    WHERE c.ativo=1
    GROUP BY c.id
    ORDER BY total_acessos DESC, c.titulo
    LIMIT 5
  `).all();

  return {
    indicadores,
    trilhas,
    cursosDestaque,
    cursosMaisAcessados,
    ranking: getRanking(),
    meuResumo: getResumoUsuario(userId),
  };
}

function getResumoUsuario(userId) {
  if (!userId) return { em_andamento: 0, concluidos: 0, pontos: 0 };
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN p.status='EM_ANDAMENTO' THEN 1 ELSE 0 END) AS em_andamento,
      SUM(CASE WHEN p.status='CONCLUIDO' THEN 1 ELSE 0 END) AS concluidos,
      COALESCE(SUM(CASE WHEN p.status='CONCLUIDO' THEN c.pontos ELSE 0 END),0) AS pontos
    FROM academia_progresso p
    JOIN academia_cursos c ON c.id=p.curso_id
    WHERE p.usuario_id=?
  `).get(userId) || {};

  return {
    em_andamento: toInt(row.em_andamento),
    concluidos: toInt(row.concluidos),
    pontos: toInt(row.pontos),
  };
}

function listCursos(filters = {}, userId = null) {
  const trilhaId = filters.trilha_id ? Number(filters.trilha_id) : null;
  const nivel = String(filters.nivel || '').trim();
  const busca = String(filters.busca || '').trim();

  let sql = `
    SELECT c.*, t.nome AS trilha_nome,
      p.status AS meu_status,
      p.data_conclusao,
      p.horas_concluidas,
      p.certificado_url
    FROM academia_cursos c
    LEFT JOIN trilhas_conhecimento t ON t.id=c.trilha_id
    LEFT JOIN academia_progresso p ON p.curso_id=c.id AND p.usuario_id=@usuario_id
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

  return db.prepare(sql).all(params).map((row) => ({ ...row, meu_status: row.meu_status || 'NAO_INICIADO' }));
}

function getCursoDetalhe(cursoId, userId = null) {
  const curso = db.prepare(`
    SELECT c.*, t.nome AS trilha_nome,
      p.status AS meu_status,
      p.data_inicio,
      p.data_conclusao,
      p.certificado_url,
      p.horas_concluidas
    FROM academia_cursos c
    LEFT JOIN trilhas_conhecimento t ON t.id=c.trilha_id
    LEFT JOIN academia_progresso p ON p.curso_id=c.id AND p.usuario_id=?
    WHERE c.id=?
  `).get(userId || 0, cursoId);

  if (!curso) return null;

  const aulas = db.prepare(`
    SELECT * FROM academia_aulas WHERE curso_id=? ORDER BY ordem ASC, id ASC
  `).all(cursoId);

  return {
    ...curso,
    meu_status: curso.meu_status || 'NAO_INICIADO',
    aulas,
  };
}

function getMinhasAulas(userId) {
  return db.prepare(`
    SELECT p.*, c.titulo, c.plataforma, c.pontos, c.carga_horaria, c.link_curso
    FROM academia_progresso p
    JOIN academia_cursos c ON c.id=p.curso_id
    WHERE p.usuario_id=?
    ORDER BY CASE p.status
      WHEN 'EM_ANDAMENTO' THEN 1
      WHEN 'NAO_INICIADO' THEN 2
      WHEN 'CONCLUIDO' THEN 3
      ELSE 4 END,
      c.titulo
  `).all(userId);
}

function getRanking() {
  return db.prepare(`
    SELECT
      u.id AS usuario_id,
      u.name AS funcionario,
      u.role,
      COALESCE(SUM(CASE WHEN p.status='CONCLUIDO' THEN c.pontos ELSE 0 END),0) AS pontos,
      COALESCE(SUM(CASE WHEN p.status='CONCLUIDO' THEN p.horas_concluidas ELSE 0 END),0) AS horas,
      SUM(CASE WHEN p.status='CONCLUIDO' THEN 1 ELSE 0 END) AS cursos_concluidos
    FROM users u
    LEFT JOIN academia_progresso p ON p.usuario_id=u.id
    LEFT JOIN academia_cursos c ON c.id=p.curso_id
    GROUP BY u.id
    HAVING pontos > 0 OR cursos_concluidos > 0
    ORDER BY pontos DESC, cursos_concluidos DESC, funcionario ASC
    LIMIT 20
  `).all();
}

function listTrilhas() {
  return db.prepare(`
    SELECT t.*, COUNT(c.id) AS total_cursos
    FROM trilhas_conhecimento t
    LEFT JOIN academia_cursos c ON c.trilha_id=t.id AND c.ativo=1
    GROUP BY t.id
    ORDER BY t.nome
  `).all();
}

function listBiblioteca() {
  return db.prepare(`
    SELECT * FROM academia_biblioteca ORDER BY criado_em DESC, id DESC
  `).all();
}

function iniciarCurso({ cursoId, userId }) {
  const curso = db.prepare('SELECT id, carga_horaria FROM academia_cursos WHERE id=? AND ativo=1').get(cursoId);
  if (!curso) throw new Error('Curso não encontrado ou inativo.');

  const existente = db.prepare('SELECT * FROM academia_progresso WHERE usuario_id=? AND curso_id=?').get(userId, cursoId);
  if (!existente) {
    db.prepare(`
      INSERT INTO academia_progresso (usuario_id, curso_id, status, data_inicio, horas_concluidas)
      VALUES (?, ?, 'EM_ANDAMENTO', datetime('now'), 0)
    `).run(userId, cursoId);
    return;
  }

  if (existente.status === 'CONCLUIDO') return;

  db.prepare(`
    UPDATE academia_progresso
    SET status='EM_ANDAMENTO',
        data_inicio=COALESCE(data_inicio, datetime('now'))
    WHERE id=?
  `).run(existente.id);
}

function concluirCurso({ cursoId, userId }) {
  const curso = db.prepare('SELECT id, carga_horaria FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso não encontrado.');

  const horas = toInt(curso.carga_horaria, 0);
  const existente = db.prepare('SELECT id FROM academia_progresso WHERE usuario_id=? AND curso_id=?').get(userId, cursoId);

  if (!existente) {
    db.prepare(`
      INSERT INTO academia_progresso (usuario_id, curso_id, status, data_inicio, data_conclusao, horas_concluidas)
      VALUES (?, ?, 'CONCLUIDO', datetime('now'), datetime('now'), ?)
    `).run(userId, cursoId, horas);
    return;
  }

  db.prepare(`
    UPDATE academia_progresso
    SET status='CONCLUIDO',
        data_conclusao=datetime('now'),
        horas_concluidas=CASE WHEN horas_concluidas > 0 THEN horas_concluidas ELSE ? END
    WHERE id=?
  `).run(horas, existente.id);
}

function salvarCertificado({ cursoId, userId, certificadoUrl }) {
  if (!certificadoUrl) throw new Error('Informe o link do certificado.');
  const existente = db.prepare('SELECT id FROM academia_progresso WHERE usuario_id=? AND curso_id=?').get(userId, cursoId);
  if (!existente) throw new Error('Inicie o curso antes de enviar certificado.');

  db.prepare(`
    UPDATE academia_progresso
    SET certificado_url=?
    WHERE id=?
  `).run(certificadoUrl, existente.id);
}

function criarCurso(payload = {}) {
  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw new Error('Título do curso é obrigatório.');

  const info = db.prepare(`
    INSERT INTO academia_cursos (titulo, descricao, trilha_id, plataforma, link_curso, carga_horaria, pontos, nivel, imagem, ativo)
    VALUES (@titulo, @descricao, @trilha_id, @plataforma, @link_curso, @carga_horaria, @pontos, @nivel, @imagem, 1)
  `).run({
    titulo,
    descricao: payload.descricao || null,
    trilha_id: payload.trilha_id ? Number(payload.trilha_id) : null,
    plataforma: String(payload.plataforma || 'INTERNO').toUpperCase(),
    link_curso: payload.link_curso || null,
    carga_horaria: toInt(payload.carga_horaria, 0),
    pontos: toInt(payload.pontos, 10),
    nivel: payload.nivel || 'BÁSICO',
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
    INSERT INTO academia_aulas (curso_id, titulo, descricao, video_url, ordem)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    cursoId,
    titulo,
    payload.descricao || null,
    payload.video_url || null,
    toInt(payload.ordem, 1)
  );

  return Number(info.lastInsertRowid);
}

module.exports = {
  getDashboardData,
  listCursos,
  getCursoDetalhe,
  getMinhasAulas,
  getRanking,
  listTrilhas,
  listBiblioteca,
  iniciarCurso,
  concluirCurso,
  salvarCertificado,
  criarCurso,
  criarAula,
};
