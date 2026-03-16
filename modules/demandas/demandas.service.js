const db = require('../../database/db');

function list({ status } = {}, user) {
  const role = String(user?.role || '').toUpperCase();
  const isAdmin = role === 'ADMIN';

  let where = '1=1';
  const params = {};
  if (status) {
    where += ' AND d.status = @status';
    params.status = String(status).toUpperCase();
  }
  if (!isAdmin) {
    where += ' AND d.created_by = @uid';
    params.uid = Number(user?.id || 0);
  }

  return db.prepare(`
    SELECT d.*, u.name AS created_by_nome, r.name AS responsavel_nome
    FROM demandas d
    LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN users r ON r.id = d.responsavel_user_id
    WHERE ${where}
    ORDER BY d.id DESC
  `).all(params);
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
  const info = db.prepare(`
    INSERT INTO demandas (titulo, descricao, prioridade, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'NOVA', ?, datetime('now'), datetime('now'))
  `).run(String(titulo).trim(), descricao || null, String(prioridade || 'NORMAL').toUpperCase(), created_by);

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

module.exports = { list, getById, create, updateStatus, addUpdate, convertToOS, getResumoDashboard, listResponsaveis };
