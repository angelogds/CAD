const db = require('../../database/db');
const { canAccessModule, normalizeRole } = require('../../config/rbac');
const osService = require('../os/os.service');
const equipamentosService = require('../equipamentos/equipamentos.service');
const solicitacoesService = require('../solicitacoes/solicitacoes.service');
const preventivasService = require('../preventivas/preventivas.service');
const pcmOperationalService = require('../pcm/pcm.operational.service');

const ACTION_TYPES = {
  CREATE_SOLICITACAO: 'CREATE_SOLICITACAO',
  SCHEDULE_PCM_OS: 'SCHEDULE_PCM_OS',
  CREATE_PREVENTIVA: 'CREATE_PREVENTIVA',
};

const TOOL_NAMES = new Set([
  'consultar_acoes_pendentes',
  'preparar_solicitacao_material',
  'confirmar_solicitacao_material',
  'preparar_programacao_pcm',
  'confirmar_programacao_pcm',
  'preparar_preventiva',
  'confirmar_preventiva',
  'cancelar_acao_operacional',
]);

function requireModule(user, moduleKey) {
  const role = normalizeRole(user?.role || '');
  if (!canAccessModule(role, moduleKey)) {
    const err = new Error('Você não tem permissão para executar esta ação.');
    err.code = 'AI_RBAC_DENIED';
    err.status = 403;
    throw err;
  }
}

function requireUser(user) {
  const userId = Number(user?.id || 0);
  if (!userId) {
    const err = new Error('Sessão de usuário inválida.');
    err.status = 401;
    throw err;
  }
  return userId;
}

function normalizeText(value, max = 500) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalizePriority(value) {
  const token = String(value || 'MEDIA').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (['CRITICA', 'URGENTE', 'EMERGENCIAL'].includes(token)) return 'CRITICA';
  if (token === 'ALTA') return 'ALTA';
  if (token === 'BAIXA') return 'BAIXA';
  return 'MEDIA';
}

function requireDate(value, label) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error(`${label} deve estar no formato AAAA-MM-DD.`);
    err.status = 400;
    throw err;
  }
  return date;
}

function insertPendingAction({ userId, conversationId, actionType, payload }) {
  const info = db.prepare(`
    INSERT INTO ai_pending_actions (user_id, conversation_id, action_type, payload_json, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, 'PENDING', datetime('now'), datetime('now', '+15 minutes'))
  `).run(Number(userId), conversationId || null, actionType, JSON.stringify(payload || {}));
  return Number(info.lastInsertRowid);
}

function getPending(actionId, userId, actionType = null) {
  const params = [Number(actionId), Number(userId)];
  let typeClause = '';
  if (actionType) {
    typeClause = ' AND action_type=?';
    params.push(actionType);
  }
  return db.prepare(`
    SELECT * FROM ai_pending_actions
    WHERE id=? AND user_id=? AND status='PENDING' AND datetime(expires_at)>datetime('now')${typeClause}
    LIMIT 1
  `).get(...params) || null;
}

function claimPending(actionId, userId, actionType) {
  return db.transaction(() => {
    const info = db.prepare(`
      UPDATE ai_pending_actions
      SET status='EXECUTING', confirmed_at=datetime('now')
      WHERE id=? AND user_id=? AND action_type=? AND status='PENDING' AND datetime(expires_at)>datetime('now')
    `).run(Number(actionId), Number(userId), actionType);
    if (!info.changes) return null;
    return db.prepare('SELECT * FROM ai_pending_actions WHERE id=? AND user_id=? LIMIT 1').get(Number(actionId), Number(userId)) || null;
  })();
}

function restorePending(actionId, userId) {
  db.prepare(`
    UPDATE ai_pending_actions
    SET status='PENDING', confirmed_at=NULL
    WHERE id=? AND user_id=? AND status='EXECUTING' AND datetime(expires_at)>datetime('now')
  `).run(Number(actionId), Number(userId));
}

function finishPending(pending, userId, result) {
  db.prepare(`
    UPDATE ai_pending_actions
    SET status='EXECUTED', executed_at=datetime('now'), result_json=?
    WHERE id=? AND user_id=? AND status='EXECUTING'
  `).run(JSON.stringify(result || {}), Number(pending.id), Number(userId));
  return { action_id: Number(pending.id), status: 'EXECUTED', result };
}

function validateConfirmation(value) {
  const confirmation = String(value || '').trim().toLowerCase();
  const allowed = ['confirmar', 'confirmo', 'sim', 'pode confirmar', 'pode criar', 'pode programar', 'pode agendar', 'criar', 'programar', 'agendar'];
  if (!allowed.includes(confirmation)) {
    const err = new Error('Confirmação explícita não reconhecida.');
    err.status = 400;
    throw err;
  }
}

function normalizeItems(items) {
  const normalized = (Array.isArray(items) ? items : []).slice(0, 12).map((item) => ({
    item_nome: normalizeText(item?.item_nome || item?.nome, 160),
    item_descricao: normalizeText(item?.item_descricao || item?.descricao, 500) || null,
    unidade: normalizeText(item?.unidade || 'UN', 12).toUpperCase() || 'UN',
    qtd_solicitada: Number(item?.qtd_solicitada || item?.quantidade || 0),
    estoque_item_id: Number(item?.estoque_item_id || 0) || null,
  })).filter((item) => item.item_nome && Number.isFinite(item.qtd_solicitada) && item.qtd_solicitada > 0);
  if (!normalized.length) {
    const err = new Error('Informe ao menos um item com nome e quantidade maior que zero.');
    err.status = 400;
    throw err;
  }
  return normalized;
}

function buildSolicitacaoPreview(args, userId) {
  const osId = Number(args.os_id || 0) || null;
  const equipamentoIdInput = Number(args.equipamento_id || 0) || null;
  let equipamentoId = equipamentoIdInput;
  let equipamento = equipamentoId ? equipamentosService.getById(equipamentoId) : null;
  let os = null;

  if (osId) {
    os = osService.getOSById(osId);
    if (!os) {
      const err = new Error(`OS #${osId} não encontrada.`);
      err.status = 404;
      throw err;
    }
    equipamentoId = Number(os.equipamento_id || equipamentoId || 0) || null;
    equipamento = equipamentoId ? equipamentosService.getById(equipamentoId) : equipamento;
  }

  const destinoUso = normalizeText(args.destino_uso, 240) || null;
  if (!osId && !equipamentoId && !destinoUso) {
    const err = new Error('Informe a OS, o equipamento ou outro local onde o material será utilizado.');
    err.status = 400;
    throw err;
  }
  if (equipamentoId && !equipamento) {
    const err = new Error('Equipamento informado não foi encontrado.');
    err.status = 404;
    throw err;
  }

  const itens = normalizeItems(args.itens);
  return {
    userId,
    setor_origem: normalizeText(args.setor_origem || 'Manutenção', 120) || 'Manutenção',
    prioridade: normalizePriority(args.prioridade),
    titulo: normalizeText(args.titulo || (osId ? `Materiais para OS #${osId}` : 'Solicitação de material'), 180),
    descricao: normalizeText(args.descricao, 1000) || null,
    equipamento_id: equipamentoId,
    equipamento_nome: equipamento?.nome || os?.equipamento || null,
    destino_uso: destinoUso,
    tipo_aplicacao: osId ? null : (equipamentoId ? 'EQUIPAMENTO' : 'OUTRO'),
    preventiva_id: Number(args.preventiva_id || 0) || null,
    os_id: osId,
    demanda_id: Number(args.demanda_id || 0) || null,
    itens,
  };
}

function buildProgramacaoPCMPreview(args) {
  const osId = Number(args.os_id || 0);
  const os = osService.getOSById(osId);
  if (!os) {
    const err = new Error(`OS #${osId || '?'} não encontrada.`);
    err.status = 404;
    throw err;
  }
  const status = String(os.status || '').toUpperCase();
  if (!['ABERTA', 'ANDAMENTO', 'EM_ANDAMENTO', 'PAUSADA'].includes(status)) {
    const err = new Error('Somente OS ativas podem ser programadas no PCM.');
    err.status = 409;
    throw err;
  }
  const dataProgramada = requireDate(args.data_programada, 'A data programada');
  const horas = Math.max(0.5, Math.min(72, Number(args.horas_estimadas || 2) || 2));
  const responsavelUserId = Number(args.responsavel_user_id || 0) || null;
  if (responsavelUserId) {
    const permitido = (pcmOperationalService.listMechanics() || []).some((row) => Number(row.id) === responsavelUserId);
    if (!permitido) {
      const err = new Error('Responsável informado não está disponível na lista de mecânicos do PCM.');
      err.status = 400;
      throw err;
    }
  }
  return {
    os_id: osId,
    os_resumo: { id: os.id, equipamento: os.equipamento || null, descricao: os.descricao || null, status: os.status || null },
    data_programada: dataProgramada,
    responsavel_user_id: responsavelUserId,
    horas_estimadas: horas,
    observacao: normalizeText(args.observacao, 500) || null,
  };
}

function buildPreventivaPreview(args) {
  const equipamentoId = Number(args.equipamento_id || 0);
  const equipamento = equipamentosService.getById(equipamentoId);
  if (!equipamento) {
    const err = new Error('Equipamento não encontrado para preventiva.');
    err.status = 404;
    throw err;
  }
  return {
    equipamento_id: equipamentoId,
    equipamento_nome: equipamento.nome || null,
    titulo: normalizeText(args.titulo || `Preventiva • ${equipamento.nome || equipamentoId}`, 180),
    data_prevista: requireDate(args.data_prevista, 'A data prevista'),
    tipo_preventiva: normalizeText(args.tipo_preventiva || 'preventiva', 50).toLowerCase(),
    criticidade: normalizePriority(args.criticidade || equipamento.criticidade),
    frequencia_tipo: normalizeText(args.frequencia_tipo || 'mensal', 40).toLowerCase(),
    frequencia_valor: Math.max(1, Math.min(365, Number(args.frequencia_valor || 1) || 1)),
    observacao: normalizeText(args.observacao, 1000) || null,
  };
}

function listPendingActions(userId) {
  return db.prepare(`
    SELECT id, action_type, status, created_at, expires_at, payload_json
    FROM ai_pending_actions
    WHERE user_id=? AND status='PENDING' AND datetime(expires_at)>datetime('now')
    ORDER BY id DESC LIMIT 10
  `).all(Number(userId)).map((row) => {
    let payload = {};
    try { payload = JSON.parse(row.payload_json || '{}'); } catch (_e) {}
    const summary = row.action_type === ACTION_TYPES.CREATE_SOLICITACAO
      ? `${payload.titulo || 'Solicitação de material'} • ${(payload.itens || []).length} item(ns)`
      : row.action_type === ACTION_TYPES.SCHEDULE_PCM_OS
        ? `Programar OS #${payload.os_id || '?'} para ${payload.data_programada || 'data não informada'}`
        : row.action_type === ACTION_TYPES.CREATE_PREVENTIVA
          ? `${payload.titulo || 'Preventiva'} • ${payload.data_prevista || 'sem data'}`
          : row.action_type;
    return { id: row.id, action_type: row.action_type, status: row.status, summary, created_at: row.created_at, expires_at: row.expires_at };
  });
}

function getTools() {
  const itemSchema = {
    type: 'object', additionalProperties: false, required: ['item_nome', 'qtd_solicitada'], properties: {
      item_nome: { type: 'string' }, item_descricao: { type: 'string' }, unidade: { type: 'string' }, qtd_solicitada: { type: 'number', exclusiveMinimum: 0 }, estoque_item_id: { type: 'integer' },
    },
  };
  return [
    { type: 'function', name: 'consultar_acoes_pendentes', description: 'Lista somente as ações ainda aguardando confirmação do usuário autenticado.', parameters: { type: 'object', additionalProperties: false, properties: {} } },
    { type: 'function', name: 'preparar_solicitacao_material', description: 'Prepara uma solicitação de material/compra sem gravar. Exige confirmação separada.', parameters: { type: 'object', additionalProperties: false, required: ['itens'], properties: { conversation_id: { type: 'string' }, os_id: { type: 'integer' }, equipamento_id: { type: 'integer' }, destino_uso: { type: 'string' }, preventiva_id: { type: 'integer' }, demanda_id: { type: 'integer' }, setor_origem: { type: 'string' }, prioridade: { type: 'string' }, titulo: { type: 'string' }, descricao: { type: 'string' }, itens: { type: 'array', minItems: 1, maxItems: 12, items: itemSchema } } } },
    { type: 'function', name: 'confirmar_solicitacao_material', description: 'Confirma e cria uma solicitação de material previamente preparada.', parameters: { type: 'object', additionalProperties: false, required: ['action_id', 'confirmation_text'], properties: { action_id: { type: 'integer' }, confirmation_text: { type: 'string' } } } },
    { type: 'function', name: 'preparar_programacao_pcm', description: 'Prepara o agendamento de uma OS ativa na programação semanal do PCM sem gravar.', parameters: { type: 'object', additionalProperties: false, required: ['os_id', 'data_programada'], properties: { conversation_id: { type: 'string' }, os_id: { type: 'integer' }, data_programada: { type: 'string' }, responsavel_user_id: { type: 'integer' }, horas_estimadas: { type: 'number' }, observacao: { type: 'string' } } } },
    { type: 'function', name: 'confirmar_programacao_pcm', description: 'Confirma e grava uma programação PCM previamente preparada.', parameters: { type: 'object', additionalProperties: false, required: ['action_id', 'confirmation_text'], properties: { action_id: { type: 'integer' }, confirmation_text: { type: 'string' } } } },
    { type: 'function', name: 'preparar_preventiva', description: 'Prepara uma preventiva manual para um equipamento sem gravar.', parameters: { type: 'object', additionalProperties: false, required: ['equipamento_id', 'data_prevista'], properties: { conversation_id: { type: 'string' }, equipamento_id: { type: 'integer' }, titulo: { type: 'string' }, data_prevista: { type: 'string' }, tipo_preventiva: { type: 'string' }, criticidade: { type: 'string' }, frequencia_tipo: { type: 'string' }, frequencia_valor: { type: 'integer' }, observacao: { type: 'string' } } } },
    { type: 'function', name: 'confirmar_preventiva', description: 'Confirma e cria uma preventiva previamente preparada.', parameters: { type: 'object', additionalProperties: false, required: ['action_id', 'confirmation_text'], properties: { action_id: { type: 'integer' }, confirmation_text: { type: 'string' } } } },
    { type: 'function', name: 'cancelar_acao_operacional', description: 'Cancela uma ação operacional pendente do próprio usuário.', parameters: { type: 'object', additionalProperties: false, required: ['action_id'], properties: { action_id: { type: 'integer' } } } },
  ];
}

function hasTool(name) {
  return TOOL_NAMES.has(String(name || ''));
}

async function executeTool({ name, args = {}, user }) {
  const userId = requireUser(user);
  switch (String(name || '')) {
    case 'consultar_acoes_pendentes':
      return { items: listPendingActions(userId), fonte: 'ai_pending_actions' };
    case 'preparar_solicitacao_material': {
      requireModule(user, 'solicitacoes_create');
      const preview = buildSolicitacaoPreview(args, userId);
      const actionId = insertPendingAction({ userId, conversationId: args.conversation_id || null, actionType: ACTION_TYPES.CREATE_SOLICITACAO, payload: preview });
      return { action_id: actionId, status: 'PENDING_CONFIRMATION', expires_in_minutes: 15, preview };
    }
    case 'confirmar_solicitacao_material': {
      requireModule(user, 'solicitacoes_create');
      validateConfirmation(args.confirmation_text);
      const pending = claimPending(args.action_id, userId, ACTION_TYPES.CREATE_SOLICITACAO);
      if (!pending) { const err = new Error('Solicitação pendente não encontrada, expirada, em execução ou já criada.'); err.status = 409; throw err; }
      try {
        const payload = JSON.parse(pending.payload_json || '{}');
        const solicitacaoId = solicitacoesService.createSolicitacao({ ...payload, userId });
        const solicitacao = solicitacoesService.getSolicitacaoById(solicitacaoId);
        return finishPending(pending, userId, { solicitacao_id: solicitacaoId, solicitacao: solicitacao ? { id: solicitacao.id, numero: solicitacao.numero, status: solicitacao.status, titulo: solicitacao.titulo, os_id: solicitacao.os_id, equipamento_nome: solicitacao.equipamento_nome, itens: solicitacao.itens } : null });
      } catch (err) { restorePending(pending.id, userId); throw err; }
    }
    case 'preparar_programacao_pcm': {
      requireModule(user, 'pcm');
      const preview = buildProgramacaoPCMPreview(args);
      const actionId = insertPendingAction({ userId, conversationId: args.conversation_id || null, actionType: ACTION_TYPES.SCHEDULE_PCM_OS, payload: preview });
      return { action_id: actionId, status: 'PENDING_CONFIRMATION', expires_in_minutes: 15, preview };
    }
    case 'confirmar_programacao_pcm': {
      requireModule(user, 'pcm');
      validateConfirmation(args.confirmation_text);
      const pending = claimPending(args.action_id, userId, ACTION_TYPES.SCHEDULE_PCM_OS);
      if (!pending) { const err = new Error('Programação pendente não encontrada, expirada, em execução ou já confirmada.'); err.status = 409; throw err; }
      try {
        const payload = JSON.parse(pending.payload_json || '{}');
        const result = pcmOperationalService.scheduleBacklogItem(payload.os_id, payload, userId);
        return finishPending(pending, userId, result);
      } catch (err) { restorePending(pending.id, userId); throw err; }
    }
    case 'preparar_preventiva': {
      requireModule(user, 'preventivas_manage');
      const preview = buildPreventivaPreview(args);
      const actionId = insertPendingAction({ userId, conversationId: args.conversation_id || null, actionType: ACTION_TYPES.CREATE_PREVENTIVA, payload: preview });
      return { action_id: actionId, status: 'PENDING_CONFIRMATION', expires_in_minutes: 15, preview };
    }
    case 'confirmar_preventiva': {
      requireModule(user, 'preventivas_manage');
      validateConfirmation(args.confirmation_text);
      const pending = claimPending(args.action_id, userId, ACTION_TYPES.CREATE_PREVENTIVA);
      if (!pending) { const err = new Error('Preventiva pendente não encontrada, expirada, em execução ou já criada.'); err.status = 409; throw err; }
      try {
        const payload = JSON.parse(pending.payload_json || '{}');
        const result = preventivasService.criarPreventivaManual({ ...payload, user });
        return finishPending(pending, userId, result);
      } catch (err) { restorePending(pending.id, userId); throw err; }
    }
    case 'cancelar_acao_operacional': {
      const pending = getPending(args.action_id, userId);
      if (!pending || !Object.values(ACTION_TYPES).includes(pending.action_type)) return { action_id: Number(args.action_id), status: 'NOT_FOUND' };
      if (pending.action_type === ACTION_TYPES.CREATE_SOLICITACAO) requireModule(user, 'solicitacoes_create');
      if (pending.action_type === ACTION_TYPES.SCHEDULE_PCM_OS) requireModule(user, 'pcm');
      if (pending.action_type === ACTION_TYPES.CREATE_PREVENTIVA) requireModule(user, 'preventivas_manage');
      const info = db.prepare(`UPDATE ai_pending_actions SET status='CANCELLED', cancelled_at=datetime('now') WHERE id=? AND user_id=? AND status='PENDING'`).run(Number(args.action_id), userId);
      return { action_id: Number(args.action_id), status: info.changes ? 'CANCELLED' : 'NOT_FOUND' };
    }
    default: {
      const err = new Error('Ferramenta operacional não reconhecida.');
      err.status = 400;
      throw err;
    }
  }
}

module.exports = { ACTION_TYPES, getTools, hasTool, executeTool };
