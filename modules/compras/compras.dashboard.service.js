const db = require('../../database/db');

const STATUS_ORDER = [
  'ABERTA',
  'EM_COTACAO',
  'COMPRADA',
  'EM_RECEBIMENTO',
  'RECEBIDA_PARCIAL',
  'RECEBIDA_TOTAL',
  'FECHADA',
  'REABERTA',
  'CANCELADA',
];

const STATUS_LABELS = Object.freeze({
  ABERTA: 'Aberta',
  EM_COTACAO: 'Em cotação',
  COMPRADA: 'Comprada',
  EM_RECEBIMENTO: 'Em recebimento',
  RECEBIDA_PARCIAL: 'Recebida parcial',
  RECEBIDA_TOTAL: 'Recebida total',
  FECHADA: 'Fechada',
  REABERTA: 'Reaberta',
  CANCELADA: 'Cancelada',
});

const COMMITTED_STATUSES = new Set([
  'COMPRADA',
  'EM_RECEBIMENTO',
  'RECEBIDA_PARCIAL',
  'RECEBIDA_TOTAL',
  'SEPARADA_PARA_RETIRADA',
  'ENTREGUE_SOLICITANTE',
  'FECHADA',
]);

const CLOSED_RECEIPT_STATUSES = new Set([
  'RECEBIDA_TOTAL',
  'ENTREGUE_SOLICITANTE',
  'FECHADA',
  'CANCELADA',
]);

function tableExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  } catch {
    return false;
  }
}

function columns(table) {
  if (!tableExists(table)) return new Set();
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
  } catch {
    return new Set();
  }
}

function firstColumn(columnSet, candidates) {
  return candidates.find((candidate) => columnSet.has(candidate)) || null;
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizePeriod(period) {
  return [7, 30, 90].includes(Number(period)) ? Number(period) : 30;
}

function selectedQuoteExpressions() {
  const quoteCols = columns('compras_cotacoes');
  if (!quoteCols.size || !quoteCols.has('solicitacao_id')) {
    return { value: '0', deadline: "''", supplier: "''" };
  }

  const selectedCol = firstColumn(quoteCols, ['selecionada', 'escolhida']);
  const valueCol = firstColumn(quoteCols, ['valor_total', 'preco_total']);
  const deadlineCol = firstColumn(quoteCols, ['prazo_entrega', 'previsao_entrega']);
  const supplierCol = firstColumn(quoteCols, ['fornecedor_nome', 'fornecedor']);
  const selectedPredicate = selectedCol ? `AND COALESCE(c.${selectedCol},0)=1` : '';
  const orderExpr = quoteCols.has('id') ? 'c.id DESC' : 'c.rowid DESC';

  const scalar = (expression, fallback) => expression
    ? `(SELECT ${expression} FROM compras_cotacoes c WHERE c.solicitacao_id=s.id ${selectedPredicate} ORDER BY ${orderExpr} LIMIT 1)`
    : fallback;

  return {
    value: scalar(valueCol ? `COALESCE(c.${valueCol},0)` : null, '0'),
    deadline: scalar(deadlineCol ? `COALESCE(c.${deadlineCol},'')` : null, "''"),
    supplier: scalar(supplierCol ? `COALESCE(c.${supplierCol},'')` : null, "''"),
  };
}

function itemAggregateExpressions() {
  const itemCols = columns('solicitacao_itens');
  if (!itemCols.size) {
    return {
      join: 'LEFT JOIN (SELECT NULL solicitacao_id) si ON 1=0',
      total: '0',
      quoted: '0',
      bought: '0',
      requestedQty: '0',
      boughtQty: '0',
      receivedQty: '0',
      receivedValue: '0',
      pricedReceivedItems: '0',
      hasPriceColumn: false,
    };
  }

  const requestedCol = firstColumn(itemCols, ['qtd_solicitada', 'quantidade']);
  const boughtQtyCol = firstColumn(itemCols, ['qtd_comprada']);
  const receivedQtyCol = firstColumn(itemCols, ['qtd_recebida_total']);
  const quoteStatusCol = firstColumn(itemCols, ['status_cotacao']);
  const buyStatusCol = firstColumn(itemCols, ['status_compra']);
  const priceCentsCol = firstColumn(itemCols, ['valor_unitario_centavos', 'preco_unitario_centavos']);
  const priceRealCol = firstColumn(itemCols, ['valor_unitario', 'preco_unitario', 'preco_unit', 'custo_unit']);

  const requested = requestedCol ? `COALESCE(si.${requestedCol},0)` : '0';
  const boughtQty = boughtQtyCol
    ? `COALESCE(si.${boughtQtyCol},0)`
    : buyStatusCol
      ? `CASE WHEN UPPER(TRIM(COALESCE(si.${buyStatusCol},'')))='COMPRADO' THEN ${requested} ELSE 0 END`
      : requested;
  const receivedQty = receivedQtyCol ? `COALESCE(si.${receivedQtyCol},0)` : '0';
  const price = priceCentsCol
    ? `(COALESCE(si.${priceCentsCol},0) / 100.0)`
    : priceRealCol
      ? `COALESCE(si.${priceRealCol},0)`
      : '0';
  const hasPriceColumn = Boolean(priceCentsCol || priceRealCol);

  return {
    join: 'LEFT JOIN solicitacao_itens si ON si.solicitacao_id=s.id',
    total: 'COUNT(si.id)',
    quoted: quoteStatusCol
      ? `SUM(CASE WHEN UPPER(TRIM(COALESCE(si.${quoteStatusCol},'')))='COTADO' THEN 1 ELSE 0 END)`
      : '0',
    bought: buyStatusCol
      ? `SUM(CASE WHEN UPPER(TRIM(COALESCE(si.${buyStatusCol},'')))='COMPRADO' THEN 1 ELSE 0 END)`
      : boughtQtyCol
        ? `SUM(CASE WHEN COALESCE(si.${boughtQtyCol},0)>0 THEN 1 ELSE 0 END)`
        : '0',
    requestedQty: `SUM(${requested})`,
    boughtQty: `SUM(${boughtQty})`,
    receivedQty: `SUM(${receivedQty})`,
    receivedValue: hasPriceColumn ? `SUM(${receivedQty} * ${price})` : '0',
    pricedReceivedItems: hasPriceColumn
      ? `SUM(CASE WHEN ${receivedQty}>0 AND ${price}>0 THEN 1 ELSE 0 END)`
      : '0',
    hasPriceColumn,
  };
}

function buildFilters(filters, params) {
  const where = ["date(s.created_at) >= date('now', ?)"];
  params.push(`-${normalizePeriod(filters.period)} days`);

  if (filters.setor) {
    where.push('s.setor_origem = ?');
    params.push(filters.setor);
  }

  if (filters.responsavel) {
    where.push('CAST(COALESCE(s.compras_user_id,\'\') AS TEXT) = ?');
    params.push(String(filters.responsavel));
  }

  if (filters.query) {
    const like = `%${String(filters.query).trim().toLowerCase()}%`;
    where.push(`(
      LOWER(COALESCE(s.numero,'')) LIKE ? OR
      LOWER(COALESCE(s.titulo,'')) LIKE ? OR
      LOWER(COALESCE(s.setor_origem,'')) LIKE ? OR
      LOWER(CAST(COALESCE(s.os_id,'') AS TEXT)) LIKE ? OR
      LOWER(COALESCE(${tableExists('equipamentos') ? 'e.nome' : "''"},'')) LIKE ?
    )`);
    params.push(like, like, like, like, like);
  }

  if (filters.prioridade) {
    if (filters.prioridade === 'critical') {
      where.push("UPPER(REPLACE(REPLACE(COALESCE(s.prioridade,''),'Í','I'),'É','E')) IN ('CRITICA','URGENTE','EMERGENCIAL')");
    } else if (filters.prioridade === 'high') {
      where.push("UPPER(COALESCE(s.prioridade,''))='ALTA'");
    } else if (filters.prioridade === 'medium') {
      where.push("UPPER(REPLACE(COALESCE(s.prioridade,''),'É','E'))='MEDIA'");
    } else if (filters.prioridade === 'low') {
      where.push("UPPER(COALESCE(s.prioridade,''))='BAIXA'");
    } else if (filters.prioridade === 'undefined') {
      where.push("TRIM(COALESCE(s.prioridade,''))='' ");
    }
  }

  return where;
}

function loadRows(filters = {}) {
  if (!tableExists('solicitacoes')) return { rows: [], hasPriceColumn: false };

  const solCols = columns('solicitacoes');
  const quote = selectedQuoteExpressions();
  const items = itemAggregateExpressions();
  const hasEquipments = tableExists('equipamentos') && solCols.has('equipamento_id');
  const equipmentJoin = hasEquipments ? 'LEFT JOIN equipamentos e ON e.id=s.equipamento_id' : 'LEFT JOIN (SELECT NULL id, NULL nome) e ON 1=0';
  const params = [];
  const where = buildFilters(filters, params);

  const solValue = solCols.has('valor_total') ? 'COALESCE(s.valor_total,0)' : '0';
  const solDeadline = solCols.has('previsao_entrega') ? "COALESCE(s.previsao_entrega,'')" : "''";
  const solSupplier = solCols.has('fornecedor') ? "COALESCE(s.fornecedor,'')" : "''";
  const costExpr = `COALESCE(NULLIF(${solValue},0), NULLIF(${quote.value},0), 0)`;
  const deadlineExpr = `COALESCE(NULLIF(${solDeadline},''), NULLIF(${quote.deadline},''), '')`;
  const supplierExpr = `COALESCE(NULLIF(${solSupplier},''), NULLIF(${quote.supplier},''), '')`;

  const rows = db.prepare(`
    SELECT
      s.id,
      s.numero,
      s.titulo,
      s.status,
      s.prioridade,
      s.os_id,
      s.created_at,
      ${hasEquipments ? 'e.nome' : 'NULL'} AS equipamento_nome,
      ${costExpr} AS custo_total,
      ${deadlineExpr} AS previsao_entrega_real,
      ${supplierExpr} AS fornecedor_real,
      ${items.total} AS itens_total,
      ${items.quoted} AS itens_cotados,
      ${items.bought} AS itens_comprados,
      ${items.requestedQty} AS qtd_solicitada_total,
      ${items.boughtQty} AS qtd_comprada_total,
      ${items.receivedQty} AS qtd_recebida_total,
      ${items.receivedValue} AS valor_recebido_rastreado,
      ${items.pricedReceivedItems} AS itens_recebidos_com_preco
    FROM solicitacoes s
    ${equipmentJoin}
    ${items.join}
    WHERE ${where.join(' AND ')}
    GROUP BY s.id
    ORDER BY s.id DESC
  `).all(...params).map((row) => {
    const status = normalizeToken(row.status);
    const boughtQty = Number(row.qtd_comprada_total || 0);
    const requestedQty = Number(row.qtd_solicitada_total || 0);
    const denominator = boughtQty > 0 ? boughtQty : requestedQty;
    const receivedQty = Number(row.qtd_recebida_total || 0);
    const receivedPct = denominator > 0 ? Math.min(100, Math.round((receivedQty / denominator) * 100)) : 0;
    const deadline = String(row.previsao_entrega_real || '').slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    return {
      ...row,
      status,
      status_label: STATUS_LABELS[status] || String(row.status || 'Não definido'),
      custo_total: Number(row.custo_total || 0),
      valor_recebido_rastreado: Number(row.valor_recebido_rastreado || 0),
      recebimento_pct: receivedPct,
      previsao_entrega_real: deadline,
      atrasado: Boolean(deadline && deadline < today && !CLOSED_RECEIPT_STATUSES.has(status)),
      vence_hoje: Boolean(deadline && deadline === today && !CLOSED_RECEIPT_STATUSES.has(status)),
    };
  });

  return { rows, hasPriceColumn: items.hasPriceColumn };
}

function getLowerDashboard(filters = {}) {
  const period = normalizePeriod(filters.period);
  const { rows, hasPriceColumn } = loadRows({ ...filters, period });
  const total = rows.length;

  const status = STATUS_ORDER.map((key) => {
    const matches = rows.filter((row) => row.status === key);
    const count = matches.length;
    return {
      key,
      label: STATUS_LABELS[key] || key,
      count,
      percent: total ? Math.round((count / total) * 100) : 0,
      value: matches.reduce((sum, row) => sum + Number(row.custo_total || 0), 0),
    };
  });

  const committedRows = rows.filter((row) => COMMITTED_STATUSES.has(row.status));
  const quotedRows = rows.filter((row) => row.status === 'EM_COTACAO');
  const committed = committedRows.reduce((sum, row) => sum + row.custo_total, 0);
  const quoted = quotedRows.reduce((sum, row) => sum + row.custo_total, 0);
  const receivedTracked = rows.reduce((sum, row) => sum + row.valor_recebido_rastreado, 0);
  const pricedReceivedItems = rows.reduce((sum, row) => sum + Number(row.itens_recebidos_com_preco || 0), 0);
  const withValue = rows.filter((row) => row.custo_total > 0).length;

  const requestCosts = rows
    .filter((row) => row.custo_total > 0 || row.qtd_recebida_total > 0)
    .sort((a, b) => b.custo_total - a.custo_total || b.recebimento_pct - a.recebimento_pct || b.id - a.id)
    .slice(0, 6);

  const linkedOs = rows
    .filter((row) => row.os_id)
    .sort((a, b) => Number(b.atrasado) - Number(a.atrasado) || b.custo_total - a.custo_total || b.id - a.id)
    .slice(0, 6);

  const receipts = rows
    .filter((row) => row.previsao_entrega_real && !CLOSED_RECEIPT_STATUSES.has(row.status))
    .sort((a, b) => String(a.previsao_entrega_real).localeCompare(String(b.previsao_entrega_real)) || a.id - b.id)
    .slice(0, 6);

  return {
    period,
    total,
    status,
    financial: {
      committed,
      quoted,
      receivedTracked,
      hasTrackedReceivedValue: Boolean(hasPriceColumn && pricedReceivedItems > 0),
      pricedReceivedItems,
      withValue,
    },
    requestCosts,
    linkedOs,
    receipts,
  };
}

module.exports = {
  STATUS_ORDER,
  STATUS_LABELS,
  getLowerDashboard,
};
