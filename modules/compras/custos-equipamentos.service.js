const db = require('../../database/db');

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(String(name)));
}

function columns(table) {
  if (!tableExists(table)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function normalizeDate(value) {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function dateFilters(filters = {}) {
  return {
    inicio: normalizeDate(filters.data_inicial || filters.data_inicio || filters.inicio),
    fim: normalizeDate(filters.data_final || filters.data_fim || filters.fim),
  };
}

function expressions() {
  const itemCols = columns('solicitacao_itens');
  const solCols = columns('solicitacoes');
  if (!itemCols.size || !solCols.size || !itemCols.has('status_compra')) return null;

  const qtdSolicitada = itemCols.has('qtd_solicitada')
    ? 'COALESCE(si.qtd_solicitada,0)'
    : (itemCols.has('quantidade') ? 'COALESCE(si.quantidade,0)' : '0');
  const qtdComprada = itemCols.has('qtd_comprada')
    ? `COALESCE(si.qtd_comprada,${qtdSolicitada})`
    : qtdSolicitada;
  const qtdRecebida = itemCols.has('qtd_recebida_total') ? 'COALESCE(si.qtd_recebida_total,0)' : '0';
  const unitario = itemCols.has('valor_unitario_centavos') ? 'COALESCE(si.valor_unitario_centavos,0)' : '0';
  const compraData = itemCols.has('comprado_em')
    ? `COALESCE(si.comprado_em,${solCols.has('comprada_em') ? 's.comprada_em,' : ''}s.updated_at,s.created_at)`
    : (solCols.has('comprada_em') ? 'COALESCE(s.comprada_em,s.updated_at,s.created_at)' : 'COALESCE(s.updated_at,s.created_at)');
  const itemNome = itemCols.has('item_nome') ? 'si.item_nome' : (itemCols.has('descricao') ? 'si.descricao' : "'Item'");
  const unidade = itemCols.has('unidade') ? 'si.unidade' : "'UN'";
  const fornecedorJoin = itemCols.has('fornecedor_id') && tableExists('fornecedores')
    ? 'LEFT JOIN fornecedores f ON f.id=si.fornecedor_id'
    : '';
  const fornecedorNome = fornecedorJoin ? 'f.nome' : (solCols.has('fornecedor') ? 's.fornecedor' : 'NULL');

  return { qtdSolicitada, qtdComprada, qtdRecebida, unitario, compraData, itemNome, unidade, fornecedorJoin, fornecedorNome };
}

function consumptionExpressions() {
  const movCols = columns('estoque_movimentos');
  const itemCols = columns('solicitacao_itens');
  if (!movCols.size || !itemCols.size || !movCols.has('equipamento_id') || !movCols.has('solicitacao_item_id')) return null;
  const dataMov = movCols.has('data_mov') ? 'COALESCE(m.data_mov,m.created_at)' : 'm.created_at';
  const unitario = itemCols.has('valor_unitario_centavos') ? 'COALESCE(si.valor_unitario_centavos,0)' : '0';
  return { dataMov, unitario };
}

function buildWhere(filters = {}, { requireEquipment = true } = {}) {
  const where = ["UPPER(COALESCE(si.status_compra,''))='COMPRADO'"];
  const params = {};
  const { inicio, fim } = dateFilters(filters);
  if (requireEquipment) where.push('s.equipamento_id IS NOT NULL');
  if (inicio) { where.push('date(COMPRA_DATA) >= date(@data_inicial)'); params.data_inicial = inicio; }
  if (fim) { where.push('date(COMPRA_DATA) <= date(@data_final)'); params.data_final = fim; }
  if (filters.equipamento_id) { where.push('s.equipamento_id=@equipamento_id'); params.equipamento_id = Number(filters.equipamento_id); }
  if (filters.setor) { where.push("COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado')=@setor"); params.setor = String(filters.setor); }
  return { where, params };
}

function buildConsumptionWhere(filters = {}) {
  const where = ["UPPER(COALESCE(m.tipo,'')) LIKE 'SAIDA%'", 'm.equipamento_id IS NOT NULL'];
  const params = {};
  const { inicio, fim } = dateFilters(filters);
  if (inicio) { where.push('date(CONSUMO_DATA) >= date(@consumo_data_inicial)'); params.consumo_data_inicial = inicio; }
  if (fim) { where.push('date(CONSUMO_DATA) <= date(@consumo_data_final)'); params.consumo_data_final = fim; }
  if (filters.equipamento_id) { where.push('m.equipamento_id=@consumo_equipamento_id'); params.consumo_equipamento_id = Number(filters.equipamento_id); }
  if (filters.setor) { where.push("COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado')=@consumo_setor"); params.consumo_setor = String(filters.setor); }
  return { where, params };
}

function sqlWithPurchaseDate(sql, compraData) {
  return sql.replaceAll('COMPRA_DATA', compraData);
}

function sqlWithConsumptionDate(sql, dataMov) {
  return sql.replaceAll('CONSUMO_DATA', dataMov);
}

function consumptionAnalytics(filters = {}) {
  const exp = consumptionExpressions();
  if (!exp || !tableExists('equipamentos')) return { byEquipment: [], byMonth: [] };
  const scope = buildConsumptionWhere(filters);
  const baseWhere = sqlWithConsumptionDate(scope.where.join(' AND '), exp.dataMov);

  const byEquipment = db.prepare(sqlWithConsumptionDate(`
    SELECT e.id equipamento_id,e.nome equipamento_nome,e.setor,
      ROUND(SUM(ABS(COALESCE(m.quantidade,0)) * ${exp.unitario})) consumido_centavos
    FROM estoque_movimentos m
    JOIN equipamentos e ON e.id=m.equipamento_id
    LEFT JOIN solicitacao_itens si ON si.id=m.solicitacao_item_id
    WHERE ${baseWhere}
    GROUP BY e.id,e.nome,e.setor
    ORDER BY consumido_centavos DESC,e.nome COLLATE NOCASE
  `, exp.dataMov)).all(scope.params).map((row) => ({
    ...row,
    consumido_centavos: Number(row.consumido_centavos || 0),
  }));

  const byMonth = db.prepare(sqlWithConsumptionDate(`
    SELECT strftime('%Y-%m',CONSUMO_DATA) mes,
      ROUND(SUM(ABS(COALESCE(m.quantidade,0)) * ${exp.unitario})) consumido_centavos
    FROM estoque_movimentos m
    JOIN equipamentos e ON e.id=m.equipamento_id
    LEFT JOIN solicitacao_itens si ON si.id=m.solicitacao_item_id
    WHERE ${baseWhere}
    GROUP BY strftime('%Y-%m',CONSUMO_DATA)
    HAVING mes IS NOT NULL
    ORDER BY mes
  `, exp.dataMov)).all(scope.params).map((row) => ({
    mes: row.mes,
    consumido_centavos: Number(row.consumido_centavos || 0),
  }));

  return { byEquipment, byMonth };
}

function mergeEquipmentCosts(purchaseRows = [], consumptionRows = []) {
  const rows = new Map();
  for (const row of purchaseRows) rows.set(Number(row.equipamento_id), { ...row, consumido_centavos: 0 });
  for (const row of consumptionRows) {
    const id = Number(row.equipamento_id);
    const current = rows.get(id) || {
      equipamento_id: id,
      equipamento_nome: row.equipamento_nome,
      setor: row.setor,
      solicitacoes: 0,
      ordens: 0,
      comprado_centavos: 0,
      recebido_centavos: 0,
      pendente_centavos: 0,
      ultima_compra: null,
    };
    current.consumido_centavos = Number(row.consumido_centavos || 0);
    rows.set(id, current);
  }
  return [...rows.values()].sort((a, b) => Number(b.comprado_centavos || b.consumido_centavos || 0) - Number(a.comprado_centavos || a.consumido_centavos || 0));
}

function mergeMonthlyCosts(purchaseRows = [], consumptionRows = []) {
  const rows = new Map();
  for (const row of purchaseRows) rows.set(row.mes, { ...row, consumido_centavos: 0 });
  for (const row of consumptionRows) {
    const current = rows.get(row.mes) || { mes: row.mes, comprado_centavos: 0, recebido_centavos: 0, pendente_centavos: 0 };
    current.consumido_centavos = Number(row.consumido_centavos || 0);
    rows.set(row.mes, current);
  }
  return [...rows.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
}

function getAnalytics(filters = {}) {
  const exp = expressions();
  const consumption = consumptionAnalytics(filters);
  if (!exp || !tableExists('equipamentos')) {
    const byEquipment = mergeEquipmentCosts([], consumption.byEquipment);
    const byMonth = mergeMonthlyCosts([], consumption.byMonth);
    const totals = byEquipment.reduce((acc, row) => {
      acc.consumido_centavos += Number(row.consumido_centavos || 0);
      return acc;
    }, emptyTotals());
    totals.equipamentos = byEquipment.length;
    return { totals, byEquipment, byMonth };
  }

  const scope = buildWhere(filters);
  const baseWhere = sqlWithPurchaseDate(scope.where.join(' AND '), exp.compraData);

  const purchaseByEquipment = db.prepare(sqlWithPurchaseDate(`
    SELECT e.id equipamento_id,e.nome equipamento_nome,e.setor,
      COUNT(DISTINCT s.id) solicitacoes,
      COUNT(DISTINCT CASE WHEN s.os_id IS NOT NULL THEN s.os_id END) ordens,
      ROUND(SUM(${exp.qtdComprada} * ${exp.unitario})) comprado_centavos,
      ROUND(SUM(MIN(${exp.qtdRecebida},${exp.qtdComprada}) * ${exp.unitario})) recebido_centavos,
      MAX(COMPRA_DATA) ultima_compra
    FROM solicitacoes s
    JOIN solicitacao_itens si ON si.solicitacao_id=s.id
    JOIN equipamentos e ON e.id=s.equipamento_id
    WHERE ${baseWhere}
    GROUP BY e.id,e.nome,e.setor
    ORDER BY comprado_centavos DESC,e.nome COLLATE NOCASE
  `, exp.compraData)).all(scope.params).map((row) => ({
    ...row,
    comprado_centavos: Number(row.comprado_centavos || 0),
    recebido_centavos: Number(row.recebido_centavos || 0),
    pendente_centavos: Math.max(0, Number(row.comprado_centavos || 0) - Number(row.recebido_centavos || 0)),
  }));

  const purchaseByMonth = db.prepare(sqlWithPurchaseDate(`
    SELECT strftime('%Y-%m',COMPRA_DATA) mes,
      ROUND(SUM(${exp.qtdComprada} * ${exp.unitario})) comprado_centavos,
      ROUND(SUM(MIN(${exp.qtdRecebida},${exp.qtdComprada}) * ${exp.unitario})) recebido_centavos
    FROM solicitacoes s
    JOIN solicitacao_itens si ON si.solicitacao_id=s.id
    JOIN equipamentos e ON e.id=s.equipamento_id
    WHERE ${baseWhere}
    GROUP BY strftime('%Y-%m',COMPRA_DATA)
    HAVING mes IS NOT NULL
    ORDER BY mes
  `, exp.compraData)).all(scope.params).map((row) => ({
    mes: row.mes,
    comprado_centavos: Number(row.comprado_centavos || 0),
    recebido_centavos: Number(row.recebido_centavos || 0),
    pendente_centavos: Math.max(0, Number(row.comprado_centavos || 0) - Number(row.recebido_centavos || 0)),
  }));

  const byEquipment = mergeEquipmentCosts(purchaseByEquipment, consumption.byEquipment);
  const byMonth = mergeMonthlyCosts(purchaseByMonth, consumption.byMonth);

  const totals = byEquipment.reduce((acc, row) => {
    acc.comprado_centavos += Number(row.comprado_centavos || 0);
    acc.recebido_centavos += Number(row.recebido_centavos || 0);
    acc.consumido_centavos += Number(row.consumido_centavos || 0);
    acc.solicitacoes += Number(row.solicitacoes || 0);
    acc.ordens += Number(row.ordens || 0);
    return acc;
  }, emptyTotals());
  totals.pendente_centavos = Math.max(0, totals.comprado_centavos - totals.recebido_centavos);
  totals.equipamentos = byEquipment.length;

  return { totals, byEquipment, byMonth };
}

function emptyTotals() {
  return { comprado_centavos: 0, recebido_centavos: 0, consumido_centavos: 0, pendente_centavos: 0, solicitacoes: 0, ordens: 0, equipamentos: 0 };
}

function getEquipmentDetail(equipamentoId, filters = {}) {
  const id = Number(equipamentoId);
  if (!id) return { totals: emptyTotals(), byMonth: [], items: [] };
  const exp = expressions();

  const scoped = { ...filters, equipamento_id: id };
  const analytics = getAnalytics(scoped);
  if (!exp || !tableExists('equipamentos')) return { totals: analytics.totals, byMonth: analytics.byMonth, items: [] };

  const scope = buildWhere(scoped);
  const baseWhere = sqlWithPurchaseDate(scope.where.join(' AND '), exp.compraData);

  const items = db.prepare(sqlWithPurchaseDate(`
    SELECT s.id solicitacao_id,s.numero,s.os_id,
      ${exp.itemNome} item_nome,${exp.unidade} unidade,
      ${exp.qtdComprada} qtd_comprada,${exp.qtdRecebida} qtd_recebida,
      ${exp.unitario} valor_unitario_centavos,
      ROUND(${exp.qtdComprada} * ${exp.unitario}) total_centavos,
      ${exp.fornecedorNome} fornecedor_nome,
      COMPRA_DATA data_compra
    FROM solicitacoes s
    JOIN solicitacao_itens si ON si.solicitacao_id=s.id
    JOIN equipamentos e ON e.id=s.equipamento_id
    ${exp.fornecedorJoin}
    WHERE ${baseWhere}
    ORDER BY datetime(COMPRA_DATA) DESC,si.id DESC
    LIMIT 100
  `, exp.compraData)).all(scope.params).map((row) => ({
    ...row,
    valor_unitario_centavos: Number(row.valor_unitario_centavos || 0),
    total_centavos: Number(row.total_centavos || 0),
  }));

  return { totals: analytics.totals, byMonth: analytics.byMonth, items };
}

function getEquipmentLifetime(equipamentoId) {
  return getEquipmentDetail(equipamentoId, {});
}

module.exports = { getAnalytics, getEquipmentDetail, getEquipmentLifetime };
