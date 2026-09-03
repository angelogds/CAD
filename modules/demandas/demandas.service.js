const db = require('../../database/db');
const { normalizeRole, canAccessModule } = require('../../config/rbac');
const solicitacoesService = require('../solicitacoes/solicitacoes.service');
const osService = require('../os/os.service');

const STATUS = ['NOVA', 'EM_ANALISE', 'PLANEJAMENTO', 'AGUARDANDO_APROVACAO', 'EM_ANDAMENTO', 'PARADA', 'CONCLUIDA', 'CANCELADA'];
const CATEGORIAS = ['MANUTENCAO', 'PRODUCAO', 'NR', 'SEGURANCA', 'AUDITORIA', 'MELHORIA', 'PROJETO', 'DIRETORIA'];
const RH_CATEGORIAS = new Set(['NR', 'SEGURANCA', 'AUDITORIA']);

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch { return false; }
}

function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name); } catch { return false; }
}

function sanitizePositiveId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeCategory(value) {
  const categoria = String(value || 'MANUTENCAO').trim().toUpperCase();
  return CATEGORIAS.includes(categoria) ? categoria : 'MANUTENCAO';
}

function visibilityWhere(user) {
  const role = normalizeRole(user?.role);
  if (canAccessModule(role, 'demandas_view')) return { sql: '1=1', params: {} };
  return { sql: '1=0', params: {} };
}

function canViewDemand(user, demanda) {
  if (!user || !demanda) return false;
  return canAccessModule(normalizeRole(user.role), 'demandas_view');
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
      u.name LIKE @q OR r.name LIKE @q OR CAST(d.id AS TEXT) LIKE @q OR
      COALESCE(e.nome, '') LIKE @q OR COALESCE(d.nr_referencia, '') LIKE @q
    )`;
    params.q = `%${q}%`;
  }
  params.limit = limit;

  return db.prepare(`
    SELECT d.*, u.name AS created_by_nome, r.name AS responsavel_nome,
           e.nome AS equipamento_nome,
           (SELECT COUNT(*) FROM demandas sd WHERE sd.demanda_pai_id = d.id) AS subdemandas_count,
           (SELECT COUNT(*) FROM solicitacoes s WHERE s.demanda_id = d.id) AS solicitacoes_count,
           (SELECT COUNT(*) FROM os o WHERE o.demanda_id = d.id) AS os_count
    FROM demandas d
    LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN users r ON r.id = d.responsavel_user_id
    LEFT JOIN equipamentos e ON e.id = d.equipamento_id
    WHERE ${where}
    ORDER BY
      CASE d.prioridade WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
      CASE d.status WHEN 'PARADA' THEN 0 WHEN 'EM_ANDAMENTO' THEN 1 WHEN 'AGUARDANDO_APROVACAO' THEN 2 WHEN 'PLANEJAMENTO' THEN 3 WHEN 'EM_ANALISE' THEN 4 ELSE 5 END,
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
      SUM(CASE WHEN status IN ('PLANEJAMENTO','AGUARDANDO_APROVACAO') THEN 1 ELSE 0 END) AS planejamento,
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
    SELECT d.*, u.name AS created_by_nome, r.name AS responsavel_nome,
           e.nome AS equipamento_nome, p.titulo AS demanda_pai_titulo
    FROM demandas d
    LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN users r ON r.id = d.responsavel_user_id
    LEFT JOIN equipamentos e ON e.id = d.equipamento_id
    LEFT JOIN demandas p ON p.id = d.demanda_pai_id
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

  const subdemandas = db.prepare(`
    SELECT d.*, r.name AS responsavel_nome, e.nome AS equipamento_nome
    FROM demandas d
    LEFT JOIN users r ON r.id = d.responsavel_user_id
    LEFT JOIN equipamentos e ON e.id = d.equipamento_id
    WHERE d.demanda_pai_id = ?
    ORDER BY CASE d.prioridade WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END, d.id
  `).all(id);

  let solicitacoes = [];
  if (tableExists('solicitacoes')) {
    const quotedExpr = tableExists('solicitacao_itens') && hasColumn('solicitacao_itens', 'status_cotacao')
      ? "SUM(CASE WHEN COALESCE(si.status_cotacao,'PENDENTE') <> 'PENDENTE' THEN 1 ELSE 0 END)"
      : '0';
    solicitacoes = db.prepare(`
      SELECT s.id, s.numero, s.titulo, s.status, s.os_id, s.created_at,
             COUNT(si.id) AS itens_count,
             ${quotedExpr} AS itens_cotados
      FROM solicitacoes s
      LEFT JOIN solicitacao_itens si ON si.solicitacao_id = s.id
      WHERE s.demanda_id = ?
      GROUP BY s.id
      ORDER BY s.id DESC
    `).all(id);
  }

  let ordens = [];
  if (tableExists('os') && hasColumn('os', 'demanda_id')) {
    ordens = db.prepare(`
      SELECT id, status, tipo, descricao, opened_at, closed_at
      FROM os
      WHERE demanda_id = ?
      ORDER BY id DESC
    `).all(id);
  }

  return { ...demanda, logs, subdemandas, solicitacoes, ordens };
}

function create(data = {}, user = {}) {
  const title = String(data.titulo || '').trim();
  if (!title) throw new Error('Informe o título da demanda.');

  const categoria = normalizeCategory(data.categoria);
  const role = normalizeRole(user.role);
  if (role === 'RH' && !RH_CATEGORIAS.has(categoria)) {
    throw new Error('O RH pode registrar demandas somente de NR, Segurança ou Auditoria.');
  }

  const parentId = sanitizePositiveId(data.demanda_pai_id);
  if (parentId && !db.prepare('SELECT 1 FROM demandas WHERE id=?').get(parentId)) {
    throw new Error('Demanda principal não encontrada.');
  }

  const equipamentoId = sanitizePositiveId(data.equipamento_id);
  if (equipamentoId && !db.prepare('SELECT 1 FROM equipamentos WHERE id=?').get(equipamentoId)) {
    throw new Error('Equipamento selecionado não foi encontrado.');
  }

  const info = db.prepare(`
    INSERT INTO demandas (
      titulo, descricao, prioridade, status, created_by, demanda_pai_id, equipamento_id,
      categoria, setor_origem, nr_referencia, prazo_previsto, custo_servicos_estimado,
      aprovacao_status, created_at, updated_at
    ) VALUES (?, ?, ?, 'NOVA', ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', datetime('now'), datetime('now'))
  `).run(
    title,
    data.descricao || null,
    String(data.prioridade || 'NORMAL').toUpperCase(),
    Number(user.id || data.created_by || 0),
    parentId,
    equipamentoId,
    categoria,
    String(data.setor_origem || '').trim() || null,
    String(data.nr_referencia || '').trim() || null,
    String(data.prazo_previsto || '').trim() || null,
    Math.max(0, Number(data.custo_servicos_estimado || 0))
  );

  const id = Number(info.lastInsertRowid);
  db.prepare(`INSERT INTO demanda_logs (demanda_id, user_id, texto, created_at) VALUES (?, ?, ?, datetime('now'))`)
    .run(id, user.id || null, parentId ? `Subdemanda criada vinculada à demanda #${parentId}` : 'Demanda criada');
  return id;
}

function updateStatus(id, { status, responsavel_user_id, user_id }) {
  const st = String(status || '').toUpperCase();
  if (!STATUS.includes(st)) throw new Error('Status inválido');

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

function updateApproval(id, { aprovacao_status, user_id }) {
  const status = String(aprovacao_status || '').trim().toUpperCase();
  if (!['PENDENTE', 'APROVADA', 'REPROVADA'].includes(status)) throw new Error('Situação de aprovação inválida.');
  const current = getById(id);
  if (!current) throw new Error('Demanda não encontrada');

  db.transaction(() => {
    db.prepare('UPDATE demandas SET aprovacao_status=?, updated_at=datetime(\'now\') WHERE id=?').run(status, id);
    db.prepare(`INSERT INTO demanda_logs (demanda_id, user_id, texto, created_at) VALUES (?, ?, ?, datetime('now'))`)
      .run(id, user_id || null, `Aprovação atualizada para ${status}`);
  })();
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

function priorityForSolicitacao(prioridade) {
  const value = String(prioridade || '').toUpperCase();
  if (value === 'URGENTE') return 'CRITICA';
  if (value === 'ALTA') return 'ALTA';
  if (value === 'BAIXA') return 'BAIXA';
  return 'MEDIA';
}

function createMaterialPlanning(id, { user, itens }) {
  const demanda = getById(id);
  if (!demanda) throw new Error('Demanda não encontrada.');
  if (!Array.isArray(itens) || !itens.length) throw new Error('Informe ao menos um material válido.');

  const solicitacaoId = solicitacoesService.createSolicitacao({
    userId: user?.id,
    setor_origem: demanda.setor_origem || 'Manutenção',
    prioridade: priorityForSolicitacao(demanda.prioridade),
    titulo: `Materiais • Demanda #${demanda.id} - ${demanda.titulo}`,
    descricao: `Planejamento antecipado de materiais da Demanda #${demanda.id}. Cotação permitida antes da OS; compra liberada somente após a conversão da demanda em Ordem de Serviço.`,
    equipamento_id: demanda.equipamento_id || null,
    destino_uso: demanda.equipamento_id ? null : `Demanda #${demanda.id} - ${demanda.titulo}`,
    tipo_aplicacao: demanda.equipamento_id ? 'EQUIPAMENTO' : 'OUTRO',
    os_id: null,
    demanda_id: demanda.id,
    itens,
  });

  if (hasColumn('solicitacoes', 'tipo_origem')) {
    db.prepare("UPDATE solicitacoes SET tipo_origem='DEMANDA' WHERE id=?").run(solicitacaoId);
  }
  solicitacoesService.finalizarElaboracao(solicitacaoId, user?.id || null);

  db.transaction(() => {
    if (['NOVA', 'EM_ANALISE'].includes(String(demanda.status || '').toUpperCase())) {
      db.prepare("UPDATE demandas SET status='PLANEJAMENTO', updated_at=datetime('now') WHERE id=?").run(id);
    } else {
      db.prepare("UPDATE demandas SET updated_at=datetime('now') WHERE id=?").run(id);
    }
    db.prepare(`INSERT INTO demanda_logs (demanda_id, user_id, texto, created_at) VALUES (?, ?, ?, datetime('now'))`)
      .run(id, user?.id || null, `Planejamento de materiais criado na solicitação #${solicitacaoId} e disponibilizado para pré-cotação em Compras.`);
  })();

  return solicitacaoId;
}

function criticidadeForOS(prioridade) {
  const value = String(prioridade || '').toUpperCase();
  if (value === 'URGENTE') return 'CRITICA';
  if (value === 'ALTA') return 'ALTA';
  if (value === 'BAIXA') return 'BAIXA';
  return 'MEDIA';
}

async function convertToOS(id, openedBy) {
  const d = getById(id);
  if (!d) throw new Error('Demanda não encontrada');

  if (tableExists('os') && hasColumn('os', 'demanda_id')) {
    const existing = db.prepare("SELECT id FROM os WHERE demanda_id=? AND UPPER(COALESCE(status,'')) NOT IN ('CANCELADA') ORDER BY id DESC LIMIT 1").get(id);
    if (existing?.id) return Number(existing.id);
  }

  const relato = `[Demanda #${d.id}] ${d.titulo}. ${String(d.descricao || '').trim() || 'Serviço planejado a partir do banco de demandas.'}`;
  const criticidade = criticidadeForOS(d.prioridade);
  const osId = await osService.createOS({
    equipamento_id: d.equipamento_id || null,
    equipamento_manual: d.equipamento_id ? null : `DEMANDA - ${d.setor_origem || d.categoria || 'FÁBRICA'}`,
    nao_conformidade: relato,
    descricao: relato,
    tipo: normalizeCategory(d.categoria) === 'NR' ? 'NRS' : 'OUTROS',
    opened_by: openedBy || null,
    criticidade,
    grau: criticidade,
    sintoma_principal: 'outro',
  });

  db.transaction(() => {
    if (hasColumn('os', 'demanda_id')) {
      db.prepare('UPDATE os SET demanda_id=? WHERE id=?').run(id, osId);
    }
    if (tableExists('solicitacoes') && hasColumn('solicitacoes', 'demanda_id') && hasColumn('solicitacoes', 'os_id')) {
      db.prepare('UPDATE solicitacoes SET os_id=?, updated_at=datetime(\'now\') WHERE demanda_id=? AND os_id IS NULL').run(osId, id);
    }
    db.prepare(`
      UPDATE demandas
      SET status='EM_ANDAMENTO', aprovacao_status='APROVADA', started_at=COALESCE(started_at, datetime('now')), updated_at=datetime('now')
      WHERE id=?
    `).run(id);
    db.prepare(`
      INSERT INTO demanda_logs (demanda_id, user_id, texto, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(id, openedBy || null, `Convertida para OS #${osId}; solicitações de materiais existentes foram vinculadas à mesma OS sem duplicação.`);
  })();

  return Number(osId);
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
  return db.prepare('SELECT id, name FROM users WHERE ativo=1 ORDER BY name').all();
}

function listEquipamentos() {
  if (!tableExists('equipamentos')) return [];
  return db.prepare('SELECT id, nome FROM equipamentos ORDER BY nome').all();
}

function listParentCandidates(user, excludeId = null) {
  const visibility = visibilityWhere(user);
  const params = { ...visibility.params };
  let where = `${visibility.sql} AND d.status NOT IN ('CONCLUIDA','CANCELADA')`;
  if (excludeId) {
    where += ' AND d.id <> @excludeId';
    params.excludeId = Number(excludeId);
  }
  return db.prepare(`SELECT d.id, d.titulo, d.prioridade, d.status FROM demandas d WHERE ${where} ORDER BY d.id DESC LIMIT 100`).all(params);
}

module.exports = {
  STATUS,
  CATEGORIAS,
  list,
  getPainel,
  getById,
  canViewDemand,
  create,
  updateStatus,
  updateApproval,
  addUpdate,
  createMaterialPlanning,
  convertToOS,
  getResumoDashboard,
  listResponsaveis,
  listEquipamentos,
  listParentCandidates,
};