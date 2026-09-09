const crypto = require('crypto');
const db = require('../../database/db');
const { ROLE, normalizeRole } = require('../../config/rbac');

const ITEM_APPROVAL = Object.freeze({
  NONE: 'NAO_SOLICITADA',
  PENDING: 'AGUARDANDO_APROVACAO',
  APPROVED: 'APROVADA',
  PURCHASED: 'COMPRADO',
  NOT_QUOTED: 'SEM_COTACAO',
  CANCELLED: 'CANCELADO',
});

function tableExists(name) {
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); } catch (_error) { return false; }
}

function columns(name) {
  try { return new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((row) => row.name)); } catch (_error) { return new Set(); }
}

function requireSchema() {
  const cols = columns('solicitacao_itens');
  const required = ['aprovacao_item_status', 'aprovacao_item_por_user_id', 'aprovacao_item_em', 'aprovacao_item_assinatura', 'aprovacao_item_valor_centavos'];
  if (!required.every((column) => cols.has(column))) {
    const error = new Error('Estrutura de aprovação por item indisponível. Execute as migrations do sistema.');
    error.code = 'APROVACAO_ITEM_SCHEMA_INDISPONIVEL';
    throw error;
  }
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function canApprove(sessionUser) {
  const role = normalizeRole(sessionUser?.role || sessionUser?.perfil);
  return role === ROLE.ADMIN || role === ROLE.DIRETORIA;
}

function assertCanApprove(sessionUser) {
  if (!canApprove(sessionUser)) {
    const error = new Error('Somente ADMIN ou DIRETORIA podem aprovar itens cotados.');
    error.code = 'APROVACAO_ITEM_SEM_PERMISSAO';
    throw error;
  }
}

function loadItems(solicitacaoId) {
  requireSchema();
  const cols = columns('solicitacao_itens');
  const qtd = cols.has('qtd_solicitada') ? 'COALESCE(si.qtd_solicitada,0)' : (cols.has('quantidade') ? 'COALESCE(si.quantidade,0)' : '0');
  const name = cols.has('item_nome') ? 'si.item_nome' : "''";
  const desc = cols.has('item_descricao') ? 'si.item_descricao' : "''";
  const fornecedor = cols.has('fornecedor_id') ? 'si.fornecedor_id' : 'NULL';
  const unitario = cols.has('valor_unitario_centavos') ? 'si.valor_unitario_centavos' : 'NULL';
  const statusCotacao = cols.has('status_cotacao') ? 'si.status_cotacao' : "'PENDENTE'";
  const statusCompra = cols.has('status_compra') ? 'si.status_compra' : "'PENDENTE'";
  const qtdComprada = cols.has('qtd_comprada') ? 'si.qtd_comprada' : 'NULL';
  const unidade = cols.has('unidade') ? 'si.unidade' : "'UN'";

  return db.prepare(`
    SELECT si.id, si.solicitacao_id,
      ${name} item_nome, ${desc} item_descricao, ${qtd} qtd_solicitada, ${unidade} unidade,
      ${fornecedor} fornecedor_id, ${unitario} valor_unitario_centavos,
      ${statusCotacao} status_cotacao, ${statusCompra} status_compra, ${qtdComprada} qtd_comprada,
      si.aprovacao_item_status, si.aprovacao_item_por_user_id, si.aprovacao_item_em,
      si.aprovacao_item_assinatura, si.aprovacao_item_valor_centavos,
      f.nome fornecedor_nome,
      u.name aprovacao_por_nome
    FROM solicitacao_itens si
    LEFT JOIN fornecedores f ON f.id=${fornecedor}
    LEFT JOIN users u ON u.id=si.aprovacao_item_por_user_id
    WHERE si.solicitacao_id=?
    ORDER BY si.id
  `).all(Number(solicitacaoId));
}

function itemQuoteValue(item) {
  return Math.round(Number(item.qtd_solicitada || 0) * Number(item.valor_unitario_centavos || 0));
}

function itemSignature(item) {
  const payload = JSON.stringify({
    id: Number(item.id),
    nome: String(item.item_nome || ''),
    descricao: String(item.item_descricao || ''),
    quantidade: Number(Number(item.qtd_solicitada || 0).toFixed(6)),
    unidade: String(item.unidade || 'UN'),
    fornecedor_id: Number(item.fornecedor_id || 0),
    valor_unitario_centavos: Math.round(Number(item.valor_unitario_centavos || 0)),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function isQuoteReady(item) {
  return normalize(item.status_cotacao) === 'COTADO'
    && Number(item.fornecedor_id || 0) > 0
    && Number(item.valor_unitario_centavos || 0) > 0;
}

function getItemState(item) {
  const purchaseStatus = normalize(item.status_compra);
  if (purchaseStatus === 'CANCELADO') return ITEM_APPROVAL.CANCELLED;
  if (purchaseStatus === 'COMPRADO') return ITEM_APPROVAL.PURCHASED;
  if (!isQuoteReady(item)) return ITEM_APPROVAL.NOT_QUOTED;

  const signature = itemSignature(item);
  const approved = normalize(item.aprovacao_item_status) === ITEM_APPROVAL.APPROVED
    && String(item.aprovacao_item_assinatura || '') === signature;
  return approved ? ITEM_APPROVAL.APPROVED : ITEM_APPROVAL.PENDING;
}

function enrichItem(item) {
  const approvalState = getItemState(item);
  const valorCotadoCentavos = isQuoteReady(item) ? itemQuoteValue(item) : 0;
  return {
    ...item,
    approvalState,
    valorCotadoCentavos,
    approvalStale: normalize(item.aprovacao_item_status) === ITEM_APPROVAL.APPROVED
      && approvalState === ITEM_APPROVAL.PENDING,
  };
}

function getSummary(solicitacaoId) {
  const itens = loadItems(solicitacaoId).map(enrichItem);
  const pendentes = itens.filter((item) => item.approvalState === ITEM_APPROVAL.PENDING);
  const aprovados = itens.filter((item) => item.approvalState === ITEM_APPROVAL.APPROVED);
  const comprados = itens.filter((item) => item.approvalState === ITEM_APPROVAL.PURCHASED);
  return {
    itens,
    pendentes,
    aprovados,
    comprados,
    pendentesCount: pendentes.length,
    aprovadosCount: aprovados.length,
    compradosCount: comprados.length,
    pendentesValorCentavos: pendentes.reduce((sum, item) => sum + item.valorCotadoCentavos, 0),
    aprovadosValorCentavos: aprovados.reduce((sum, item) => sum + Number(item.aprovacao_item_valor_centavos || item.valorCotadoCentavos || 0), 0),
    temPendencias: pendentes.length > 0,
  };
}

function recordHistory({ solicitacaoId, item, userId, action }) {
  if (!tableExists('compras_aprovacoes_itens_historico')) return;
  db.prepare(`
    INSERT INTO compras_aprovacoes_itens_historico
      (solicitacao_id, solicitacao_item_id, acao, executado_por_user_id, valor_centavos, cotacao_assinatura, observacao)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(solicitacaoId), Number(item.id), action, Number(userId), itemQuoteValue(item), itemSignature(item),
    `${item.item_nome || 'Item'} · ${item.fornecedor_nome || 'Fornecedor'} · aprovação digital no sistema`,
  );
}

function approveQuotedItems(solicitacaoId, itemIds, sessionUser) {
  assertCanApprove(sessionUser);
  const summary = getSummary(solicitacaoId);
  const requestedIds = (Array.isArray(itemIds) ? itemIds : [itemIds]).filter(Boolean).map(Number);
  const targets = requestedIds.length
    ? summary.pendentes.filter((item) => requestedIds.includes(Number(item.id)))
    : summary.pendentes;

  if (!targets.length) throw new Error('Não existem itens cotados aguardando aprovação nesta solicitação.');

  return db.transaction(() => {
    const stmt = db.prepare(`
      UPDATE solicitacao_itens SET
        aprovacao_item_status='APROVADA',
        aprovacao_item_por_user_id=?,
        aprovacao_item_em=datetime('now'),
        aprovacao_item_assinatura=?,
        aprovacao_item_valor_centavos=?
      WHERE id=? AND solicitacao_id=?
    `);
    for (const item of targets) {
      stmt.run(Number(sessionUser.id), itemSignature(item), itemQuoteValue(item), Number(item.id), Number(solicitacaoId));
      recordHistory({ solicitacaoId, item, userId: sessionUser.id, action: 'APROVADA' });
    }
    return getSummary(solicitacaoId);
  })();
}

function getHistory(solicitacaoId) {
  if (!tableExists('compras_aprovacoes_itens_historico')) return [];
  return db.prepare(`
    SELECT h.*, si.item_nome, u.name executado_por_nome
    FROM compras_aprovacoes_itens_historico h
    LEFT JOIN solicitacao_itens si ON si.id=h.solicitacao_item_id
    LEFT JOIN users u ON u.id=h.executado_por_user_id
    WHERE h.solicitacao_id=?
    ORDER BY h.id DESC
  `).all(Number(solicitacaoId));
}

function assertItemsApprovedForPurchase(solicitacaoId, itemIds) {
  const ids = (Array.isArray(itemIds) ? itemIds : [itemIds]).filter(Boolean).map(Number);
  if (!ids.length) return true;
  const summary = getSummary(solicitacaoId);
  const byId = new Map(summary.itens.map((item) => [Number(item.id), item]));
  const blocked = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    if (item.approvalState === ITEM_APPROVAL.PURCHASED) continue;
    if (item.approvalState !== ITEM_APPROVAL.APPROVED) blocked.push(item);
  }
  if (blocked.length) {
    const error = new Error(`${blocked.length} item(ns) selecionado(s) ainda não foram aprovados por ADMIN/DIRETORIA.`);
    error.code = 'ITENS_AGUARDANDO_APROVACAO';
    error.itemIds = blocked.map((item) => item.id);
    throw error;
  }
  return true;
}

function parseMoneyToCents(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return Math.round(Number(fallback || 0));
  if (typeof value === 'number') return Math.round(value * 100);
  let text = String(value).trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!text) return Math.round(Number(fallback || 0));
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? Math.round(number * 100) : Math.round(Number(fallback || 0));
}

function assertPurchasePayloadMatchesApprovedItems(solicitacaoId, payload = {}, selectedIds = []) {
  const ids = (Array.isArray(selectedIds) ? selectedIds : [selectedIds]).filter(Boolean).map(Number);
  assertItemsApprovedForPurchase(solicitacaoId, ids);
  if (!ids.length) return true;

  const rows = loadItems(solicitacaoId);
  const byId = new Map(rows.map((item) => [Number(item.id), item]));
  const payloadIds = (Array.isArray(payload.item_id) ? payload.item_id : [payload.item_id]).filter(Boolean).map(Number);
  const suppliers = Array.isArray(payload.fornecedor_id) ? payload.fornecedor_id : [payload.fornecedor_id];
  const prices = Array.isArray(payload.valor_unitario) ? payload.valor_unitario : [payload.valor_unitario];
  const quotedIds = new Set((Array.isArray(payload.cotado) ? payload.cotado : [payload.cotado]).filter(Boolean).map(Number));
  const payloadIndex = new Map(payloadIds.map((id, index) => [id, index]));

  const divergent = [];
  ids.forEach((id) => {
    const current = byId.get(id);
    if (!current || normalize(current.status_compra) === 'COMPRADO') return;
    const index = payloadIndex.get(id);
    if (index === undefined) {
      divergent.push(current);
      return;
    }
    const prospective = {
      ...current,
      fornecedor_id: Number(suppliers[index] || 0) || null,
      valor_unitario_centavos: parseMoneyToCents(prices[index], Number(current.valor_unitario_centavos || 0)),
      status_cotacao: quotedIds.has(id) ? 'COTADO' : 'PENDENTE',
    };
    const approvedSignature = String(current.aprovacao_item_assinatura || '');
    if (!isQuoteReady(prospective) || !approvedSignature || itemSignature(prospective) !== approvedSignature) {
      divergent.push(current);
    }
  });

  if (divergent.length) {
    const error = new Error('Fornecedor, quantidade ou valor de item aprovado foi alterado. Salve a nova cotação e obtenha nova aprovação antes da compra.');
    error.code = 'COMPRA_DIVERGE_DA_APROVACAO_ITEM';
    error.itemIds = divergent.map((item) => item.id);
    throw error;
  }
  return true;
}

function assertAllQuotedApprovedForPurchase(solicitacaoId) {
  const summary = getSummary(solicitacaoId);
  const candidates = summary.itens.filter((item) => item.approvalState !== ITEM_APPROVAL.CANCELLED && item.approvalState !== ITEM_APPROVAL.PURCHASED);
  const blocked = candidates.filter((item) => item.approvalState !== ITEM_APPROVAL.APPROVED);
  if (blocked.length) {
    const error = new Error('Existem itens sem cotação ou sem aprovação digital. Libere os itens cotados antes de concluir a compra.');
    error.code = 'SOLICITACAO_COM_ITENS_NAO_APROVADOS';
    throw error;
  }
  return true;
}

module.exports = {
  ITEM_APPROVAL,
  canApprove,
  getSummary,
  getHistory,
  approveQuotedItems,
  assertItemsApprovedForPurchase,
  assertPurchasePayloadMatchesApprovedItems,
  assertAllQuotedApprovedForPurchase,
  itemSignature,
};
