const db = require('../../database/db');

function visibilityWhere(user, alias = 'd') {
  const role = String(user?.role || '').toUpperCase();
  if (role === 'ADMIN') return { sql: '1=1', params: {} };
  return { sql: `${alias}.created_by = @uid`, params: { uid: Number(user?.id || 0) } };
}

function list(filters = {}, user) {
  const visibility = visibilityWhere(user);
  let where = visibility.sql;
  const params = { ...visibility.params };

  const status = String(filters.status || '').toUpperCase();
  const prioridade = String(filters.prioridade || '').toUpperCase();
  const tab = String(filters.tab || 'ATIVAS').toUpperCase();
  const q = String(filters.q || '').trim();
  const responsavel = Number(filters.responsavel_user_id || 0);
  const limit = [10, 20, 50].includes(Number(filters.limit)) ? Number(filters.limit) : 20;

  if (status) {
    where += ' AND d.status = @status';
    params.status = status;
  } else if (tab === 'HISTORICO') {
    where += " AND d.status IN ('CONCLUIDA', 'CANCELADA')";
  } else if (tab !== 'TODAS') {
    where += " AND d.status NOT IN ('CONCLUIDA', 'CANCELADA')";
  }

  if (prioridade === 'ELEVADA') {
    where += " AND d.prioridade IN ('URGENTE', 'ALTA')";
  } else if (prioridade) {
    where += ' AND d.prioridade = @prioridade';
    params.prioridade = prioridade;
  }
  if (responsavel) {
    where += ' AND d.responsavel_user_id = @responsavel';
    params.responsavel = responsavel;
  }
  if (q) {
    where += ` AND (
      d.titulo LIKE @q OR d.descricao LIKE @q OR
      u.name LIKE @q OR r.name LIKE @q OR CAST(d.id AS TEXT) LIKE @q
    )`;
    params.q = `%${q}%`;
  }
  params.limit = limit;

  return db.prepare(`
    SELECT d.*, u.name AS created_by_nome, r.name AS responsavel_nome
    FROM demandas d
    LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN users r ON r.id = d.responsavel_user_id
    WHERE ${where}
    ORDER BY
      CASE d.prioridade WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
      CASE d.status WHEN 'PARADA' THEN 0 WHEN 'EM_ANDAMENTO' THEN 1 WHEN 'EM_ANALISE' THEN 2 ELSE 3 END,
      datetime(COALESCE(d.updated_at, d.created_at)) DESC,
      d.id DESC
    LIMIT @limit
  `).all(params);
}

function getPainel(user) {
  const visibility = visibilityWhere(user);
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status NOT IN ('CONCLUIDA', 'CANCELADA') THEN 1 ELSE 0 END) AS ativas,
      SUM(CASE WHEN status = 'NOVA' THEN 1 ELSE 0 END) AS novas,
      SUM(CASE WHEN status = 'EM_ANALISE' THEN 1 ELSE 0 END) AS em_analise,
      SUM(CASE WHEN status = 'EM_ANDAMENTO' THEN 1 ELSE 0 END) AS em_andamento,
      SUM(CASE WHEN status = 'PARADA' THEN 1 ELSE 0 END) AS paradas,
      SUM(CASE WHEN status = 'CONCLUIDA' THEN 1 ELSE 0 END) AS concluidas,
      SUM(CASE WHEN prioridade IN ('URGENTE', 'ALTA') AND status NOT IN ('CONCLUIDA', 'CANCELADA') THEN 1 ELSE 0 END) AS prioritarias
    FROM demandas d
    WHERE ${visibility.sql}
  `).get(visibility.params) || {};

  const distribution = db.prepare(`
    SELECT status, COUNT(*) AS total
    FROM demandas d
    WHERE ${visibility.sql}
    GROUP BY status
  `).all(visibility.params);

  const normalized = {};
  for (const [key, value] of Object.entries(row)) normalized[key] = Number(value || 0);

  return { ...normalized, distribution };
}

function getById(id) {
  const demanda = db.prepare(`
    SELECT d.*, u.name AS created_by_nome, r.name AS responsavel_nome
    FROM demandas d
    LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN users r ON r.id = d.responsavel_user_id
    WHERE d.id=?
  `).get(id);
  if (!demanda) return null;

  const logs = db.prepare(`
    SELECT l.*, u.name AS user_nome
    FROM demanda_logs l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE l.demanda_id=?
    ORDER BY l.id DESC
  `).all(id);

  return { ...demanda, logs };
}

function create({ titulo, descricao, prioridade, created_by }) {
  const title = String(titulo || '').trim();
  if (!title) throw new Error('Informe o título da demanda.');

  const info = db.prepare(`
    INSERT INTO demandas (titulo, descricao, prioridade, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'NOVA', ?, datetime('now'), datetime('now'))
  `).run(title, descricao || null, String(prioridade || 'NORMAL').toUpperCase(), created_by);

  return Number(info.lastInsertRowid);
}

function updateStatus(id, { status, responsavel_user_id, user_id }) {
  const st = String(status || '').toUpperCase();
  const allowed = ['NOVA', 'EM_ANALISE', 'EM_ANDAMENTO', 'PARADA', 'CONCLUIDA', 'CANCELADA'];
  if (!allowed.includes(st)) throw new Error('Status inválido');

  const current = getById(id);
  if (!current) throw new Error('Demanda não encontrada');

  let startedAt = current.started_at;
  let finishedAt = current.finished_at;
  if (st === 'EM_ANDAMENTO' && !startedAt) startedAt = new Date().toISOString();
  if (st === 'CONCLUIDA' && !finishedAt) finishedAt = new Date().toISOString();

  db.prepare(`
    UPDATE demandas
    SET status=?, responsavel_user_id=?, started_at=?, finished_at=?, updated_at=datetime('now')
    WHERE id=?
  `).run(st, responsavel_user_id ? Number(responsavel_user_id) : null, startedAt, finishedAt, id);

  db.prepare(`
    INSERT INTO demanda_logs (demanda_id, user_id, texto, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(id, user_id || null, `Status atualizado para ${st}`);
}

function addUpdate(id, texto, user_id) {
  if (!String(texto || '').trim()) throw new Error('Atualização vazia.');

  db.transaction(() => {
    db.prepare(`
      INSERT INTO demanda_logs (demanda_id, user_id, texto, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(id, user_id || null, String(texto).trim());

    db.prepare(`
      UPDATE demandas
      SET ultima_atualizacao=?, updated_at=datetime('now')
      WHERE id=?
    `).run(String(texto).trim(), id);
  })();
}

function convertToOS(id, openedBy) {
  const d = getById(id);
  if (!d) throw new Error('Demanda não encontrada');

  const info = db.prepare(`
    INSERT INTO os (equipamento, descricao, tipo, status, opened_by)
    VALUES (?, ?, 'OUTRA', 'ABERTA', ?)
  `).run('DEMANDA DIREÇÃO', `[Demanda #${d.id}] ${d.titulo}\n${d.descricao || ''}`, openedBy || null);

  db.prepare(`
    INSERT INTO demanda_logs (demanda_id, user_id, texto, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(id, openedBy || null, `Convertida para OS #${info.lastInsertRowid}`);

  return Number(info.lastInsertRowid);
}

function getResumoDashboard() {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN status='NOVA' THEN 1 ELSE 0 END) AS novas,
      SUM(CASE WHEN status='EM_ANDAMENTO' THEN 1 ELSE 0 END) AS em_andamento,
      SUM(CASE WHEN status='PARADA' THEN 1 ELSE 0 END) AS paradas
    FROM demandas
  `).get() || {};

  const emTrabalhoAgora = db.prepare(`
    SELECT id, titulo, prioridade, updated_at
    FROM demandas
    WHERE status='EM_ANDAMENTO'
    ORDER BY datetime(updated_at) DESC
    LIMIT 8
  `).all();

  return {
    novas: Number(row.novas || 0),
    em_andamento: Number(row.em_andamento || 0),
    paradas: Number(row.paradas || 0),
    emTrabalhoAgora,
  };
}

function listResponsaveis() {
  return db.prepare(`SELECT id, name FROM users WHERE active=1 ORDER BY name`).all();
}

module.exports = {
  list,
  getPainel,
  getById,
  create,
  updateStatus,
  addUpdate,
  convertToOS,
  getResumoDashboard,
  listResponsaveis,
};
