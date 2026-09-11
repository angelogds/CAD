const db = require('../../database/db');
const itemApprovalService = require('./compras.aprovacao-itens.service');

const CLOSED = new Set(['RECEBIDA_TOTAL', 'ENTREGUE_SOLICITANTE', 'FECHADA', 'CANCELADA']);

function tableExists(name) {
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
  catch (_error) { return false; }
}

function columns(name) {
  try { return new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((row) => row.name)); }
  catch (_error) { return new Set(); }
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function isQuoteReady(item) {
  return normalize(item.status_cotacao) === 'COTADO'
    && Number(item.fornecedor_id || 0) > 0
    && Number(item.valor_unitario_centavos || 0) > 0;
}

function listDashboardStatus() {
  const requiredTables = ['solicitacoes', 'solicitacao_itens'];
  if (!requiredTables.every(tableExists)) {
    return { rows: [], totalSolicitacoesLiberadas: 0, totalItensLiberados: 0, totalItensAguardando: 0 };
  }

  const itemCols = columns('solicitacao_itens');
  const approvalColumns = [
    'aprovacao_item_status',
    'aprovacao_item_assinatura',
    'fornecedor_id',
    'valor_unitario_centavos',
    'status_cotacao',
    'status_compra',
  ];
  if (!approvalColumns.every((column) => itemCols.has(column))) {
    return { rows: [], totalSolicitacoesLiberadas: 0, totalItensLiberados: 0, totalItensAguardando: 0 };
  }

  const qtdExpr = itemCols.has('qtd_solicitada') ? 'COALESCE(si.qtd_solicitada,0)'
    : itemCols.has('quantidade') ? 'COALESCE(si.quantidade,0)' : '0';
  const nameExpr = itemCols.has('item_nome') ? "COALESCE(si.item_nome,'')" : "''";
  const descExpr = itemCols.has('item_descricao') ? "COALESCE(si.item_descricao,'')" : "''";
  const unitExpr = itemCols.has('unidade') ? "COALESCE(si.unidade,'UN')" : "'UN'";

  const items = db.prepare(`
    SELECT
      s.id solicitacao_id,
      s.numero,
      s.status solicitacao_status,
      si.id,
      ${nameExpr} item_nome,
      ${descExpr} item_descricao,
      ${qtdExpr} qtd_solicitada,
      ${unitExpr} unidade,
      si.fornecedor_id,
      si.valor_unitario_centavos,
      si.status_cotacao,
      si.status_compra,
      si.aprovacao_item_status,
      si.aprovacao_item_assinatura
    FROM solicitacoes s
    JOIN solicitacao_itens si ON si.solicitacao_id=s.id
    ORDER BY s.id DESC, si.id
  `).all();

  const grouped = new Map();
  for (const item of items) {
    const requestStatus = normalize(item.solicitacao_status);
    if (CLOSED.has(requestStatus)) continue;

    const purchaseStatus = normalize(item.status_compra);
    if (purchaseStatus === 'COMPRADO' || purchaseStatus === 'CANCELADO') continue;

    const quoteReady = isQuoteReady(item);
    if (!quoteReady) continue;

    const currentSignature = itemApprovalService.itemSignature(item);
    const approved = normalize(item.aprovacao_item_status) === 'APROVADA'
      && String(item.aprovacao_item_assinatura || '') === currentSignature;

    const key = Number(item.solicitacao_id);
    if (!grouped.has(key)) {
      grouped.set(key, {
        solicitacao_id: key,
        numero: item.numero || `#${key}`,
        liberados: 0,
        aguardando: 0,
      });
    }
    const row = grouped.get(key);
    if (approved) row.liberados += 1;
    else row.aguardando += 1;
  }

  const rows = [...grouped.values()].sort((a, b) => {
    if (b.liberados !== a.liberados) return b.liberados - a.liberados;
    if (b.aguardando !== a.aguardando) return b.aguardando - a.aguardando;
    return b.solicitacao_id - a.solicitacao_id;
  });

  return {
    rows,
    totalSolicitacoesLiberadas: rows.filter((row) => row.liberados > 0).length,
    totalItensLiberados: rows.reduce((sum, row) => sum + Number(row.liberados || 0), 0),
    totalItensAguardando: rows.reduce((sum, row) => sum + Number(row.aguardando || 0), 0),
  };
}

module.exports = { listDashboardStatus };
