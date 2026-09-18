const db = require('../../database/db');
const acompanhamentoService = require('../compras/acompanhamento.service');
const itemApprovalService = require('../compras/compras.aprovacao-itens.service');
const { SETORES, normalizeSetorCorporativo } = require('../compras/compras-setores');
const { getAcompanhamentoScope, canViewSetor } = require('./acompanhamento-compras.scope');

function tableExists(name) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  } catch (_error) {
    return false;
  }
}

function columns(table) {
  if (!tableExists(table)) return new Set();
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  } catch (_error) {
    return new Set();
  }
}

function token(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function accessError(message = 'Você não possui acesso a esta solicitação.') {
  const error = new Error(message);
  error.status = 403;
  error.code = 'ACOMPANHAMENTO_COMPRAS_FORBIDDEN';
  return error;
}

function getScope(user) {
  const scope = getAcompanhamentoScope(user);
  if (!scope) throw accessError('Seu perfil não possui acesso ao Acompanhamento de Compras.');
  return scope;
}

function safeApprovalSummary(id) {
  try {
    return itemApprovalService.getSummary(Number(id));
  } catch (_error) {
    return {
      itens: [],
      pendentes: [],
      aprovados: [],
      pendentesCount: 0,
      aprovadosCount: 0,
      pendentesValorCentavos: 0,
      temPendencias: false,
    };
  }
}

function receiptPercent(row) {
  const itens = Array.isArray(row?.itens) ? row.itens : [];
  const bought = itens.length
    ? itens.reduce((sum, item) => sum + Number(item.qtdComprada || 0), 0)
    : Number(row?.comprados || 0);
  const received = itens.length
    ? itens.reduce((sum, item) => sum + Number(item.qtdRecebida || 0), 0)
    : Number(row?.recebidos || 0);
  if (bought <= 0) return 0;
  return Math.min(100, Math.round((received / bought) * 100));
}

function currentStage(row) {
  const status = token(row?.status);
  if (status === 'CANCELADA') return 'CANCELADA';
  if (['FECHADA', 'ENTREGUE_SOLICITANTE'].includes(status)) return 'CONCLUIDA';
  if (Number(row?.recebidos || 0) > 0 && Number(row?.recebidos || 0) < Number(row?.comprados || 0)) return 'RECEBIMENTO_PARCIAL';
  if (Number(row?.comprados || 0) > Number(row?.recebidos || 0)) return 'AGUARDANDO_RECEBIMENTO';
  if (Number(row?.comprados || 0) > 0) return 'COMPRADO';
  if (token(row?.aprovacao_compra_status) === 'PENDENTE') return 'AGUARDANDO_APROVACAO';
  if (Number(row?.cotados || 0) > 0) return 'EM_COTACAO';
  return 'SOLICITADO';
}

function getDashboard(user, query = {}) {
  const scope = getScope(user);
  const requestedSector = scope.isGlobal ? normalizeSetorCorporativo(query.setor || '') : scope.setor;
  const effectiveQuery = {
    ...query,
    setor: requestedSector || '',
  };

  const painel = acompanhamentoService.getDashboard(effectiveQuery);
  painel.scope = {
    ...scope,
    setor: requestedSector || scope.setor || null,
  };
  painel.setoresCorporativos = Object.values(SETORES);

  painel.solicitacoes = (painel.solicitacoes || []).map((row) => ({
    ...row,
    setor_canonico: normalizeSetorCorporativo(row.setor_origem) || SETORES.RECICLAGEM,
    recebimentoPercentual: Number(row.comprados || 0) > 0
      ? Math.min(100, Math.round((Number(row.recebidos || 0) / Number(row.comprados || 1)) * 100))
      : 0,
    etapaAtual: currentStage(row),
  }));

  return painel;
}

function listReservations(solicitacaoId) {
  if (!tableExists('estoque_reservas')) return [];
  const cols = columns('estoque_reservas');
  const itemJoin = tableExists('estoque_itens') && cols.has('estoque_item_id')
    ? 'LEFT JOIN estoque_itens ei ON ei.id=r.estoque_item_id'
    : '';
  const solItemCols = columns('solicitacao_itens');
  const solItemJoin = solItemCols.size && cols.has('solicitacao_item_id')
    ? 'LEFT JOIN solicitacao_itens si ON si.id=r.solicitacao_item_id'
    : '';
  const solicitacaoItemName = solItemJoin
    ? (solItemCols.has('item_nome') && solItemCols.has('item_descricao')
      ? "COALESCE(si.item_nome, si.item_descricao)"
      : solItemCols.has('item_nome')
        ? 'si.item_nome'
        : solItemCols.has('item_descricao')
          ? 'si.item_descricao'
          : 'NULL')
    : 'NULL';

  return db.prepare(`
    SELECT
      r.id,
      r.solicitacao_item_id,
      r.estoque_item_id,
      r.os_id,
      r.equipamento_id,
      COALESCE(r.quantidade_reservada,0) quantidade_reservada,
      COALESCE(r.quantidade_retirada,0) quantidade_retirada,
      r.status,
      r.origem,
      r.created_at,
      r.updated_at,
      ${itemJoin ? "ei.nome" : "NULL"} estoque_item_nome,
      ${solicitacaoItemName} solicitacao_item_nome
    FROM estoque_reservas r
    ${itemJoin}
    ${solItemJoin}
    WHERE r.solicitacao_id=?
    ORDER BY r.id
  `).all(Number(solicitacaoId));
}

function listWithdrawals(solicitacaoId) {
  if (!tableExists('estoque_movimentos')) return [];
  const mc = columns('estoque_movimentos');
  const hasReserva = mc.has('reserva_id') && tableExists('estoque_reservas');
  const hasSolicitacao = mc.has('solicitacao_id');
  if (!hasSolicitacao && !hasReserva) return [];

  const joinReserva = hasReserva ? 'LEFT JOIN estoque_reservas r ON r.id=m.reserva_id' : '';
  const joinItem = mc.has('item_id') && tableExists('estoque_itens') ? 'LEFT JOIN estoque_itens ei ON ei.id=m.item_id' : '';
  const joinColaborador = mc.has('retirado_por_colaborador_id') && tableExists('colaboradores')
    ? 'LEFT JOIN colaboradores c ON c.id=m.retirado_por_colaborador_id'
    : '';
  const joinEntregador = mc.has('entregue_por_user_id') && tableExists('users')
    ? 'LEFT JOIN users eu ON eu.id=m.entregue_por_user_id'
    : '';

  const solicitationExpr = hasSolicitacao && hasReserva
    ? 'COALESCE(m.solicitacao_id,r.solicitacao_id)'
    : hasSolicitacao
      ? 'm.solicitacao_id'
      : 'r.solicitacao_id';
  const dataExpr = mc.has('data_mov') ? 'COALESCE(m.data_mov,m.created_at)' : 'm.created_at';

  return db.prepare(`
    SELECT
      m.id,
      ${dataExpr} data_mov,
      ${mc.has('quantidade') ? 'ABS(COALESCE(m.quantidade,0))' : '0'} quantidade,
      ${joinItem ? 'ei.nome' : 'NULL'} item_nome,
      ${mc.has('solicitacao_item_id') ? 'm.solicitacao_item_id' : 'NULL'} solicitacao_item_id,
      ${mc.has('os_id') ? 'm.os_id' : 'NULL'} os_id,
      ${mc.has('equipamento_id') ? 'm.equipamento_id' : 'NULL'} equipamento_id,
      ${joinColaborador ? 'c.nome' : 'NULL'} retirado_por_nome,
      ${joinEntregador ? 'eu.name' : 'NULL'} entregue_por_nome,
      ${mc.has('identificacao_origem') ? 'm.identificacao_origem' : 'NULL'} identificacao_origem,
      ${mc.has('observacao') ? 'm.observacao' : 'NULL'} observacao
    FROM estoque_movimentos m
    ${joinReserva}
    ${joinItem}
    ${joinColaborador}
    ${joinEntregador}
    WHERE ${solicitationExpr}=?
      AND UPPER(COALESCE(m.tipo,'')) LIKE 'SAIDA%'
    ORDER BY datetime(${dataExpr}) DESC, m.id DESC
    LIMIT 100
  `).all(Number(solicitacaoId));
}

function buildTimeline(detail, approvalSummary, reservations, withdrawals) {
  const itens = Array.isArray(detail?.itens) ? detail.itens : [];
  const total = itens.length;
  const cotados = itens.filter((item) => token(item.status_cotacao) === 'COTADO').length;
  const comprados = itens.filter((item) => token(item.status_compra) === 'COMPRADO').length;
  const qtdComprada = itens.reduce((sum, item) => sum + Number(item.qtdComprada || 0), 0);
  const qtdRecebida = itens.reduce((sum, item) => sum + Number(item.qtdRecebida || 0), 0);
  const qtdReservada = reservations.reduce((sum, row) => sum + Number(row.quantidade_reservada || 0), 0);
  const qtdRetirada = reservations.reduce((sum, row) => sum + Number(row.quantidade_retirada || 0), 0);
  const status = token(detail?.status);
  const approvalStatus = token(detail?.aprovacao_compra_status || detail?.aprovacao?.status);

  const purchasedOrLater = comprados > 0 || ['COMPRADA','EM_RECEBIMENTO','RECEBIDA_PARCIAL','RECEBIDA_TOTAL','SEPARADA_PARA_RETIRADA','ENTREGUE_SOLICITANTE','FECHADA'].includes(status);
  const receivedDone = qtdComprada > 0 && qtdRecebida >= qtdComprada;
  const withdrawalDone = (qtdReservada > 0 && qtdRetirada >= qtdReservada)
    || ['ENTREGUE_SOLICITANTE','FECHADA'].includes(status);
  const concluded = ['ENTREGUE_SOLICITANTE','FECHADA'].includes(status);

  const raw = [
    { key: 'solicitacao', label: 'Solicitação', done: true, detail: 'Pedido registrado no sistema.' },
    { key: 'cotacao', label: 'Cotação', done: total > 0 && cotados >= total, detail: `${cotados}/${total || 0} item(ns) cotado(s).` },
    {
      key: 'aprovacao',
      label: 'Aprovação',
      done: purchasedOrLater || ['APROVADA','APROVADA_DIRETORIA'].includes(approvalStatus) || Number(approvalSummary.aprovadosCount || 0) > 0,
      detail: Number(approvalSummary.pendentesCount || 0) > 0
        ? `${approvalSummary.pendentesCount} item(ns) aguardando decisão.`
        : 'Sem pendência de aprovação registrada.',
    },
    { key: 'compra', label: 'Compra', done: total > 0 && comprados >= total, detail: `${comprados}/${total || 0} item(ns) comprado(s).` },
    { key: 'recebimento', label: 'Recebimento', done: receivedDone, detail: `${qtdRecebida} de ${qtdComprada || 0} recebido(s).` },
    { key: 'retirada', label: 'Retirada', done: withdrawalDone, detail: `${qtdRetirada} de ${qtdReservada || 0} retirado(s) do Almoxarifado.` },
    { key: 'conclusao', label: 'Concluído', done: concluded, detail: concluded ? 'Fluxo encerrado.' : 'Aguardando conclusão do fluxo.' },
  ];

  let currentAssigned = false;
  return raw.map((stage) => {
    let state = 'pending';
    if (stage.done) state = 'done';
    else if (!currentAssigned) {
      state = 'current';
      currentAssigned = true;
    }
    return { ...stage, state };
  });
}

function getDetail(user, id) {
  const scope = getScope(user);
  const detail = acompanhamentoService.getDetail(Number(id));
  if (!detail) return null;

  if (!scope.isGlobal && !canViewSetor(user, detail.setor_origem)) {
    throw accessError();
  }

  const approvalSummary = safeApprovalSummary(id);
  const approvalByItem = new Map((approvalSummary.itens || []).map((item) => [Number(item.id), item]));
  detail.itens = (detail.itens || []).map((item) => {
    const merged = {
      ...item,
      ...(approvalByItem.get(Number(item.id)) || {}),
    };
    const purchased = token(merged.status_compra) === 'COMPRADO';
    if (purchased && Number(merged.qtdComprada || 0) <= 0) {
      merged.qtdComprada = Number(merged.qtdSolicitada || merged.qtd_solicitada || merged.quantidade || 0);
      merged.qtdPendenteReceber = Math.max(0, merged.qtdComprada - Number(merged.qtdRecebida || 0));
      merged.compradoCentavos = Math.round(merged.qtdComprada * Number(merged.valor_unitario_centavos || 0));
    }
    return merged;
  });

  detail.resumoAcompanhamento = {
    ...(detail.resumoAcompanhamento || {}),
    total: detail.itens.length,
    cotados: detail.itens.filter((item) => token(item.status_cotacao) === 'COTADO').length,
    comprados: detail.itens.filter((item) => token(item.status_compra) === 'COMPRADO').length,
    recebidos: detail.itens.filter((item) => Number(item.qtdComprada || 0) > 0 && Number(item.qtdRecebida || 0) >= Number(item.qtdComprada || 0)).length,
    compradoCentavos: detail.itens.reduce((sum, item) => sum + Number(item.compradoCentavos || 0), 0),
    recebidoCentavos: detail.itens.reduce((sum, item) => sum + Number(item.recebidoCentavos || 0), 0),
  };

  const reservations = listReservations(id);
  const withdrawals = listWithdrawals(id);
  const qtdReservada = reservations.reduce((sum, row) => sum + Number(row.quantidade_reservada || 0), 0);
  const qtdRetirada = reservations.reduce((sum, row) => sum + Number(row.quantidade_retirada || 0), 0);

  return {
    ...detail,
    setor_canonico: normalizeSetorCorporativo(detail.setor_origem) || SETORES.RECICLAGEM,
    scope,
    approvalSummary,
    reservations,
    withdrawals,
    retiradaResumo: {
      quantidadeReservada: qtdReservada,
      quantidadeRetirada: qtdRetirada,
      saldo: Math.max(0, qtdReservada - qtdRetirada),
      movimentos: withdrawals.length,
    },
    timeline: buildTimeline(detail, approvalSummary, reservations, withdrawals),
    recebimentoPercentual: receiptPercent(detail),
  };
}

module.exports = {
  getDashboard,
  getDetail,
  currentStage,
  buildTimeline,
  listReservations,
  listWithdrawals,
};
