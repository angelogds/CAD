const db = require('../../database/db');
const solicitacoesService = require('../solicitacoes/solicitacoes.service');
const { normalizeRole } = require('../../config/rbac');

const ORIGIN = 'PRE_SOLICITACAO_ALMOX';
const PRE_STATUS = Object.freeze({
  RASCUNHO: 'RASCUNHO',
  AGUARDANDO_APROVACAO: 'AGUARDANDO_APROVACAO',
  EM_ANALISE: 'EM_ANALISE',
  APROVADA: 'APROVADA',
  REPROVADA: 'REPROVADA',
  ENVIADA_COMPRAS: 'ENVIADA_COMPRAS',
});

const ITEM_STATUS = Object.freeze({
  PENDENTE: 'PENDENTE',
  APROVADO: 'APROVADO',
  AJUSTADO: 'AJUSTADO',
  REPROVADO: 'REPROVADO',
});

const SETORES = solicitacoesService.SETORES;
const SETOR_OPTIONS = Object.freeze([
  { value: SETORES.RECICLAGEM, label: 'Reciclagem', hint: 'Manutenção e produção' },
  { value: SETORES.LOGISTICA, label: 'Logística', hint: 'Frota e manutenção' },
  { value: SETORES.FRIGORIFICO, label: 'Frigorífico', hint: 'Manutenção e produção' },
  { value: SETORES.ADMINISTRATIVO, label: 'Administrativo', hint: 'RH, financeiro e apoio' },
]);

const SUBAREAS = Object.freeze({
  [SETORES.RECICLAGEM]: ['MANUTENÇÃO', 'PRODUÇÃO'],
  [SETORES.LOGISTICA]: ['MANUTENÇÃO / FROTA'],
  [SETORES.FRIGORIFICO]: ['MANUTENÇÃO', 'PRODUÇÃO'],
  [SETORES.ADMINISTRATIVO]: ['RH', 'FINANCEIRO', 'ADMINISTRATIVO'],
});

const APPROVER_ROLES = Object.freeze({
  [SETORES.RECICLAGEM]: ['ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'SUPERVISOR_MANUTENCAO'],
  [SETORES.LOGISTICA]: ['ENCARREGADO_LOGISTICA'],
  [SETORES.FRIGORIFICO]: ['ENCARREGADO_FRIGORIFICO'],
  [SETORES.ADMINISTRATIVO]: ['RH'],
});

function tableExists(name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function columns(table) {
  try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name)); }
  catch (_error) { return new Set(); }
}

function hasColumn(table, name) {
  return columns(table).has(name);
}

function normalizeSetor(value) {
  return solicitacoesService.normalizeSetor(value);
}

function validateSetor(value) {
  const setor = normalizeSetor(value);
  if (!SETOR_OPTIONS.some((option) => option.value === setor)) {
    throw new Error('Selecione um setor válido.');
  }
  return setor;
}

function validateSubarea(setor, value) {
  const subarea = String(value || '').trim().toUpperCase();
  const allowed = SUBAREAS[setor] || [];
  if (!allowed.includes(subarea)) throw new Error('Selecione uma subárea válida para o setor.');
  return subarea;
}

function validateSemana(value) {
  const semana = String(value || '').trim().toUpperCase();
  if (!/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(semana)) {
    throw new Error('Informe uma semana de referência válida.');
  }
  return semana;
}

function isAlmoxUser(user) {
  return ['ALMOXARIFADO', 'ADMIN'].includes(normalizeRole(user?.role));
}

function approverRolesForSetor(setor) {
  return APPROVER_ROLES[normalizeSetor(setor)] || [];
}

function setorForApprover(user) {
  const role = normalizeRole(user?.role);
  if (role === 'ADMIN') return null;
  return solicitacoesService.setorForRole(role);
}

function canReview(solicitacao, user) {
  if (!solicitacao || !user) return false;
  const role = normalizeRole(user.role);
  if (role === 'ADMIN') return true;
  if (role === 'ALMOXARIFADO' || role === 'COMPRAS') return false;
  const setor = setorForApprover(user);
  return Boolean(setor) && normalizeSetor(solicitacao.setor_origem) === setor;
}

function canView(solicitacao, user) {
  if (!solicitacao || !user) return false;
  const role = normalizeRole(user.role);
  if (role === 'ADMIN' || role === 'ALMOXARIFADO') return true;
  if (canReview(solicitacao, user)) return true;
  return Number(solicitacao.pre_criada_por_user_id || solicitacao.solicitante_user_id) === Number(user.id);
}

function canEditDraft(solicitacao, user) {
  if (!solicitacao || !user || String(solicitacao.pre_status) !== PRE_STATUS.RASCUNHO) return false;
  const role = normalizeRole(user.role);
  if (role === 'ADMIN') return true;
  return role === 'ALMOXARIFADO'
    && Number(solicitacao.pre_criada_por_user_id || solicitacao.solicitante_user_id) === Number(user.id);
}

function activeUserWhere(alias = 'u') {
  const userCols = columns('users');
  const clauses = [];
  if (userCols.has('ativo')) clauses.push(`COALESCE(${alias}.ativo,1)=1`);
  if (userCols.has('arquivado_em')) clauses.push(`${alias}.arquivado_em IS NULL`);
  return clauses.length ? clauses.join(' AND ') : '1=1';
}

function listApprovers(setor) {
  if (!tableExists('users')) return [];
  const roles = approverRolesForSetor(setor);
  if (!roles.length) return [];
  const placeholders = roles.map(() => '?').join(',');
  return db.prepare(`
    SELECT id,name,role
    FROM users u
    WHERE UPPER(COALESCE(role,'')) IN (${placeholders})
      AND ${activeUserWhere('u')}
    ORDER BY
      CASE UPPER(COALESCE(role,''))
        WHEN 'ENCARREGADO_MANUTENCAO' THEN 0
        WHEN 'ENCARREGADO_LOGISTICA' THEN 0
        WHEN 'ENCARREGADO_FRIGORIFICO' THEN 0
        WHEN 'RH' THEN 0
        ELSE 1
      END,
      name
  `).all(...roles);
}

function notifyUsers(userIds, solicitacaoId, titulo, mensagem, statusReferencia) {
  if (!tableExists('notificacoes')) return;
  const notificationCols = columns('notificacoes');
  if (!['user_id','origem_tipo','origem_id','titulo','mensagem'].every((name) => notificationCols.has(name))) return;
  const insertCols = ['user_id','origem_tipo','origem_id','titulo','mensagem'];
  if (notificationCols.has('status_referencia')) insertCols.push('status_referencia');
  const stmt = db.prepare(`
    INSERT INTO notificacoes (${insertCols.join(',')})
    VALUES (${insertCols.map(() => '?').join(',')})
  `);
  [...new Set((userIds || []).map(Number).filter(Boolean))].forEach((userId) => {
    const values = [userId, ORIGIN, Number(solicitacaoId), titulo, mensagem];
    if (notificationCols.has('status_referencia')) values.push(statusReferencia || null);
    stmt.run(...values);
  });
}

function notifyApprovers(solicitacao) {
  const approvers = listApprovers(solicitacao.setor_origem);
  notifyUsers(
    approvers.map((row) => row.id),
    solicitacao.id,
    'Pré-solicitação aguardando análise',
    `${solicitacao.numero || 'Pré-solicitação'} • ${solicitacao.setor_origem} • ${solicitacao.semana_referencia || 'semana não informada'}`,
    solicitacao.pre_status
  );
  return approvers;
}

function notifyCompras(solicitacao) {
  if (!tableExists('users')) return;
  const rows = db.prepare(`
    SELECT id FROM users u
    WHERE UPPER(COALESCE(role,''))='COMPRAS'
      AND ${activeUserWhere('u')}
  `).all();
  notifyUsers(
    rows.map((row) => row.id),
    solicitacao.id,
    'Pré-solicitação aprovada e liberada para Compras',
    `${solicitacao.numero || 'Solicitação'} • ${solicitacao.setor_origem} • origem Almoxarifado`,
    PRE_STATUS.ENVIADA_COMPRAS
  );
}

function enrich(solicitacao) {
  if (!solicitacao) return null;
  const itens = Array.isArray(solicitacao.itens) ? solicitacao.itens : [];
  const analisados = itens.filter((item) => String(item.pre_aprovacao_item_status || ITEM_STATUS.PENDENTE) !== ITEM_STATUS.PENDENTE).length;
  const aprovados = itens.filter((item) => [ITEM_STATUS.APROVADO, ITEM_STATUS.AJUSTADO].includes(String(item.pre_aprovacao_item_status || ''))).length;
  const reprovados = itens.filter((item) => String(item.pre_aprovacao_item_status || '') === ITEM_STATUS.REPROVADO).length;
  const primary = solicitacao.pre_aprovador_user_id && tableExists('users')
    ? db.prepare('SELECT id,name,role FROM users WHERE id=?').get(Number(solicitacao.pre_aprovador_user_id))
    : null;
  return {
    ...solicitacao,
    itens,
    itens_total: itens.length,
    itens_analisados: analisados,
    itens_aprovados: aprovados,
    itens_reprovados: reprovados,
    progresso_analise: itens.length ? Math.round((analisados / itens.length) * 100) : 0,
    aprovador_nome: primary?.name || null,
    aprovador_role: primary?.role || null,
  };
}

function getById(id) {
  const sol = solicitacoesService.getSolicitacaoById(Number(id));
  if (!sol || String(sol.tipo_origem || '').toUpperCase() !== ORIGIN) return null;
  return enrich(sol);
}

function listForUser(user, filters = {}) {
  const role = normalizeRole(user?.role);
  const where = ["UPPER(COALESCE(s.tipo_origem,''))=?"];
  const params = [ORIGIN];

  if (role !== 'ADMIN' && role !== 'ALMOXARIFADO') {
    const setor = setorForApprover(user);
    if (!setor) return [];
    where.push('s.setor_origem=?');
    params.push(setor);
  }

  if (filters.status && Object.values(PRE_STATUS).includes(String(filters.status).toUpperCase())) {
    where.push('s.pre_status=?');
    params.push(String(filters.status).toUpperCase());
  }
  if (filters.setor) {
    where.push('s.setor_origem=?');
    params.push(validateSetor(filters.setor));
  }
  if (filters.semana) {
    where.push('s.semana_referencia=?');
    params.push(String(filters.semana).trim().toUpperCase());
  }

  return db.prepare(`
    SELECT s.*,
           u.name AS solicitante_nome,
           ap.name AS aprovador_nome,
           (SELECT COUNT(*) FROM solicitacao_itens i WHERE i.solicitacao_id=s.id) AS itens_total,
           (SELECT COUNT(*) FROM solicitacao_itens i WHERE i.solicitacao_id=s.id
             AND COALESCE(i.pre_aprovacao_item_status,'PENDENTE')<>'PENDENTE') AS itens_analisados,
           (SELECT COUNT(*) FROM solicitacao_itens i WHERE i.solicitacao_id=s.id
             AND i.pre_aprovacao_item_status IN ('APROVADO','AJUSTADO')) AS itens_aprovados
    FROM solicitacoes s
    LEFT JOIN users u ON u.id=s.solicitante_user_id
    LEFT JOIN users ap ON ap.id=s.pre_aprovador_user_id
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE COALESCE(s.pre_status,'RASCUNHO')
        WHEN 'AGUARDANDO_APROVACAO' THEN 0
        WHEN 'EM_ANALISE' THEN 1
        WHEN 'RASCUNHO' THEN 2
        ELSE 3
      END,
      datetime(s.updated_at) DESC,
      s.id DESC
  `).all(...params).map((row) => ({
    ...row,
    progresso_analise: Number(row.itens_total || 0)
      ? Math.round((Number(row.itens_analisados || 0) / Number(row.itens_total || 0)) * 100)
      : 0,
  }));
}

function counters(user) {
  const rows = listForUser(user);
  const out = {
    total: rows.length,
    rascunho: 0,
    aguardando: 0,
    analise: 0,
    enviadas: 0,
    reprovadas: 0,
  };
  rows.forEach((row) => {
    if (row.pre_status === PRE_STATUS.RASCUNHO) out.rascunho += 1;
    else if (row.pre_status === PRE_STATUS.AGUARDANDO_APROVACAO) out.aguardando += 1;
    else if (row.pre_status === PRE_STATUS.EM_ANALISE) out.analise += 1;
    else if (row.pre_status === PRE_STATUS.ENVIADA_COMPRAS) out.enviadas += 1;
    else if (row.pre_status === PRE_STATUS.REPROVADA) out.reprovadas += 1;
  });
  return out;
}

function setHeader(id, fields) {
  const solCols = columns('solicitacoes');
  const entries = Object.entries(fields).filter(([name]) => solCols.has(name));
  if (!entries.length) return;
  const sql = entries.map(([name]) => `${name}=?`).join(',');
  db.prepare(`UPDATE solicitacoes SET ${sql},updated_at=datetime('now') WHERE id=?`)
    .run(...entries.map(([,value]) => value), Number(id));
}

function initializeItems(solicitacaoId) {
  const itemCols = columns('solicitacao_itens');
  const sets = [];
  if (itemCols.has('qtd_sugerida_almox')) {
    const qtyExpr = itemCols.has('qtd_solicitada') && itemCols.has('quantidade')
      ? 'COALESCE(qtd_solicitada,quantidade,0)'
      : itemCols.has('qtd_solicitada') ? 'COALESCE(qtd_solicitada,0)'
      : itemCols.has('quantidade') ? 'COALESCE(quantidade,0)' : '0';
    sets.push(`qtd_sugerida_almox=${qtyExpr}`);
  }
  if (itemCols.has('qtd_aprovada_setor')) sets.push('qtd_aprovada_setor=NULL');
  if (itemCols.has('pre_aprovacao_item_status')) sets.push("pre_aprovacao_item_status='PENDENTE'");
  if (itemCols.has('pre_aprovacao_item_por')) sets.push('pre_aprovacao_item_por=NULL');
  if (itemCols.has('pre_aprovacao_item_em')) sets.push('pre_aprovacao_item_em=NULL');
  if (itemCols.has('pre_aprovacao_item_observacao')) sets.push('pre_aprovacao_item_observacao=NULL');
  if (sets.length) db.prepare(`UPDATE solicitacao_itens SET ${sets.join(',')} WHERE solicitacao_id=?`).run(Number(solicitacaoId));
}

function preparePayload(data, user) {
  const setor = validateSetor(data.setor_origem);
  const semana = validateSemana(data.semana_referencia);
  const subarea = validateSubarea(setor, data.subarea_destino);
  const itens = solicitacoesService.parseItensFromBody(data);
  if (!itens.length) throw new Error('Inclua ao menos um material com quantidade maior que zero.');
  const observacao = String(data.observacao || '').trim();
  return { setor, semana, subarea, itens, observacao, user };
}

function sendStateForAction(action) {
  return String(action || '').toLowerCase() === 'enviar'
    ? PRE_STATUS.AGUARDANDO_APROVACAO
    : PRE_STATUS.RASCUNHO;
}

function create(data, user) {
  if (!isAlmoxUser(user)) throw new Error('Somente o Almoxarifado pode criar uma pré-solicitação.');
  const payload = preparePayload(data, user);
  const actionStatus = sendStateForAction(data.acao);

  return db.transaction(() => {
    const id = solicitacoesService.createSolicitacao({
      userId: Number(user.id),
      user,
      setor_origem: payload.setor,
      prioridade: data.prioridade || 'MEDIA',
      titulo: `Pedido semanal do Almoxarifado • ${payload.setor} • ${payload.semana}`,
      descricao: payload.observacao || 'Pré-solicitação semanal de materiais do Almoxarifado.',
      destino_uso: payload.subarea,
      itens: payload.itens,
    });

    const approvers = listApprovers(payload.setor);
    const primaryApprover = approvers[0] || null;
    setHeader(id, {
      tipo_origem: ORIGIN,
      pre_status: actionStatus,
      semana_referencia: payload.semana,
      subarea_destino: payload.subarea,
      pre_criada_por_user_id: Number(user.id),
      pre_enviada_aprovacao_em: actionStatus === PRE_STATUS.AGUARDANDO_APROVACAO ? new Date().toISOString() : null,
      pre_aprovador_user_id: primaryApprover?.id || null,
      disponivel_compras: 0,
    });
    initializeItems(id);

    const created = getById(id);
    if (actionStatus === PRE_STATUS.AGUARDANDO_APROVACAO) notifyApprovers(created);
    return created;
  })();
}

function updateDraft(id, data, user) {
  const current = getById(id);
  if (!current) throw new Error('Pré-solicitação não encontrada.');
  if (!canEditDraft(current, user)) throw new Error('Este rascunho não pode mais ser alterado por este usuário.');
  const payload = preparePayload(data, user);
  const actionStatus = sendStateForAction(data.acao);

  return db.transaction(() => {
    solicitacoesService.updateSolicitacao(Number(id), {
      setor_origem: payload.setor,
      prioridade: data.prioridade || current.prioridade || 'MEDIA',
      titulo: `Pedido semanal do Almoxarifado • ${payload.setor} • ${payload.semana}`,
      descricao: payload.observacao || current.descricao || null,
      destino_uso: payload.subarea,
      itens: payload.itens,
    }, user);

    const approvers = listApprovers(payload.setor);
    setHeader(id, {
      tipo_origem: ORIGIN,
      pre_status: actionStatus,
      semana_referencia: payload.semana,
      subarea_destino: payload.subarea,
      pre_enviada_aprovacao_em: actionStatus === PRE_STATUS.AGUARDANDO_APROVACAO ? new Date().toISOString() : null,
      pre_aprovador_user_id: approvers[0]?.id || null,
      disponivel_compras: 0,
    });
    initializeItems(id);
    const updated = getById(id);
    if (actionStatus === PRE_STATUS.AGUARDANDO_APROVACAO) notifyApprovers(updated);
    return updated;
  })();
}

function decideItem(solicitacaoId, itemId, data, user) {
  const solicitacao = getById(solicitacaoId);
  if (!solicitacao) throw new Error('Pré-solicitação não encontrada.');
  if (!canReview(solicitacao, user)) throw new Error('Você não pode analisar pedidos deste setor.');
  if (![PRE_STATUS.AGUARDANDO_APROVACAO, PRE_STATUS.EM_ANALISE].includes(String(solicitacao.pre_status))) {
    throw new Error('Esta pré-solicitação não está disponível para análise.');
  }

  const item = solicitacao.itens.find((row) => Number(row.id) === Number(itemId));
  if (!item) throw new Error('Item não pertence a esta pré-solicitação.');

  const decisao = String(data.decisao || '').trim().toUpperCase();
  if (!Object.values(ITEM_STATUS).filter((status) => status !== ITEM_STATUS.PENDENTE).includes(decisao)) {
    throw new Error('Selecione uma decisão válida para o item.');
  }

  const sugerida = Number(item.qtd_sugerida_almox ?? item.qtd_solicitada ?? item.quantidade ?? 0);
  let aprovada = Number(String(data.qtd_aprovada_setor ?? sugerida).replace(',', '.'));
  const observacao = String(data.observacao || '').trim();

  if (decisao === ITEM_STATUS.REPROVADO) {
    aprovada = 0;
    if (!observacao) throw new Error('Informe o motivo da reprovação.');
  } else {
    if (!Number.isFinite(aprovada) || aprovada <= 0) throw new Error('Informe uma quantidade aprovada válida.');
    if (Math.abs(aprovada - sugerida) > 0.000001 && !observacao) {
      throw new Error('Informe o motivo do ajuste de quantidade.');
    }
  }

  const finalStatus = decisao === ITEM_STATUS.APROVADO && Math.abs(aprovada - sugerida) > 0.000001
    ? ITEM_STATUS.AJUSTADO
    : decisao;

  db.prepare(`
    UPDATE solicitacao_itens
    SET qtd_aprovada_setor=?,
        pre_aprovacao_item_status=?,
        pre_aprovacao_item_por=?,
        pre_aprovacao_item_em=datetime('now'),
        pre_aprovacao_item_observacao=?,
        updated_at=datetime('now')
    WHERE id=? AND solicitacao_id=?
  `).run(aprovada, finalStatus, Number(user.id), observacao || null, Number(itemId), Number(solicitacaoId));

  setHeader(solicitacaoId, {
    pre_status: PRE_STATUS.EM_ANALISE,
    pre_aprovador_user_id: Number(user.id),
  });
  return getById(solicitacaoId);
}

function finalizeReview(solicitacaoId, data, user) {
  const solicitacao = getById(solicitacaoId);
  if (!solicitacao) throw new Error('Pré-solicitação não encontrada.');
  if (!canReview(solicitacao, user)) throw new Error('Você não pode liberar pedidos deste setor.');
  if (![PRE_STATUS.AGUARDANDO_APROVACAO, PRE_STATUS.EM_ANALISE].includes(String(solicitacao.pre_status))) {
    throw new Error('Esta pré-solicitação já foi finalizada ou ainda está em rascunho.');
  }
  if (!solicitacao.itens.length) throw new Error('A pré-solicitação não possui itens.');

  const pendentes = solicitacao.itens.filter((item) => String(item.pre_aprovacao_item_status || ITEM_STATUS.PENDENTE) === ITEM_STATUS.PENDENTE);
  if (pendentes.length) throw new Error(`Analise todos os itens antes de finalizar. Ainda faltam ${pendentes.length}.`);

  const aprovados = solicitacao.itens.filter((item) => [ITEM_STATUS.APROVADO, ITEM_STATUS.AJUSTADO].includes(String(item.pre_aprovacao_item_status || '')));
  const observacaoFinal = String(data.observacao_final || '').trim();
  const itemCols = columns('solicitacao_itens');

  return db.transaction(() => {
    const updateApproved = [];
    if (itemCols.has('qtd_solicitada')) updateApproved.push('qtd_solicitada=qtd_aprovada_setor');
    if (itemCols.has('quantidade')) updateApproved.push('quantidade=qtd_aprovada_setor');
    if (itemCols.has('status_compra')) updateApproved.push("status_compra='PENDENTE'");
    if (itemCols.has('status_cotacao')) updateApproved.push("status_cotacao='PENDENTE'");
    if (itemCols.has('status_item')) updateApproved.push("status_item='PENDENTE'");
    if (updateApproved.length) {
      db.prepare(`
        UPDATE solicitacao_itens SET ${updateApproved.join(',')},updated_at=datetime('now')
        WHERE solicitacao_id=? AND pre_aprovacao_item_status IN ('APROVADO','AJUSTADO')
      `).run(Number(solicitacaoId));
    }

    const rejectSets = [];
    if (itemCols.has('status_compra')) rejectSets.push("status_compra='CANCELADO'");
    if (itemCols.has('status_cotacao')) rejectSets.push("status_cotacao='PENDENTE'");
    if (itemCols.has('status_item')) rejectSets.push("status_item='CANCELADO'");
    if (rejectSets.length) {
      db.prepare(`
        UPDATE solicitacao_itens SET ${rejectSets.join(',')},updated_at=datetime('now')
        WHERE solicitacao_id=? AND pre_aprovacao_item_status='REPROVADO'
      `).run(Number(solicitacaoId));
    }

    if (!aprovados.length) {
      setHeader(solicitacaoId, {
        pre_status: PRE_STATUS.REPROVADA,
        pre_aprovador_user_id: Number(user.id),
        pre_aprovada_em: new Date().toISOString(),
        pre_observacao_aprovacao: observacaoFinal || 'Todos os itens foram reprovados na análise do setor.',
        disponivel_compras: 0,
        status: 'CANCELADA',
        cancelada_em: new Date().toISOString(),
      });
      return getById(solicitacaoId);
    }

    const fields = {
      pre_status: PRE_STATUS.ENVIADA_COMPRAS,
      pre_aprovador_user_id: Number(user.id),
      pre_aprovada_em: new Date().toISOString(),
      pre_observacao_aprovacao: observacaoFinal || null,
      disponivel_compras: 1,
      status: 'ABERTA',
    };
    if (hasColumn('solicitacoes','disponivel_compras_em')) fields.disponivel_compras_em = new Date().toISOString();
    if (hasColumn('solicitacoes','disponivel_compras_por')) fields.disponivel_compras_por = Number(user.id);
    if (hasColumn('solicitacoes','elaboracao_finalizada_em')) fields.elaboracao_finalizada_em = new Date().toISOString();
    if (hasColumn('solicitacoes','elaboracao_finalizada_por')) fields.elaboracao_finalizada_por = Number(user.id);
    setHeader(solicitacaoId, fields);

    const released = getById(solicitacaoId);
    notifyCompras(released);
    return released;
  })();
}

function formOptions() {
  return {
    setores: SETOR_OPTIONS,
    subareas: SUBAREAS,
    estoqueItens: solicitacoesService.listEstoqueItens(),
  };
}

module.exports = {
  ORIGIN,
  PRE_STATUS,
  ITEM_STATUS,
  SETOR_OPTIONS,
  SUBAREAS,
  APPROVER_ROLES,
  normalizeSetor,
  canReview,
  canView,
  canEditDraft,
  isAlmoxUser,
  listApprovers,
  listForUser,
  counters,
  getById,
  create,
  updateDraft,
  decideItem,
  finalizeReview,
  formOptions,
};
