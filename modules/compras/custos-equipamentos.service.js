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

function movementExpressions() {
  const movCols = columns('estoque_movimentos');
  const stockCols = columns('estoque_itens');
  const itemCols = columns('solicitacao_itens');
  if (!movCols.size || !stockCols.size || !movCols.has('equipamento_id')) return null;

  const dataMov = movCols.has('data_mov') ? 'COALESCE(m.data_mov,m.created_at)' : 'm.created_at';
  const movimentoCost = movCols.has('custo_unit') ? 'm.custo_unit' : 'NULL';
  const itemCost = itemCols.has('valor_unitario_centavos') ? 'si.valor_unitario_centavos' : 'NULL';
  const estoqueCost = stockCols.has('custo_unit') ? 'ei.custo_unit' : 'NULL';
  const custoUnitCentavos = `CASE
    WHEN ${movimentoCost} IS NOT NULL AND ${movimentoCost} > 0 THEN ROUND(${movimentoCost} * 100)
    WHEN ${itemCost} IS NOT NULL AND ${itemCost} > 0 THEN ${itemCost}
    WHEN ${estoqueCost} IS NOT NULL AND ${estoqueCost} > 0 THEN ROUND(${estoqueCost} * 100)
    ELSE 0 END`;
  const custoOrigem = `CASE
    WHEN ${movimentoCost} IS NOT NULL AND ${movimentoCost} > 0 THEN 'MOVIMENTO'
    WHEN ${itemCost} IS NOT NULL AND ${itemCost} > 0 THEN 'SOLICITACAO'
    WHEN ${estoqueCost} IS NOT NULL AND ${estoqueCost} > 0 THEN 'ESTOQUE_ATUAL'
    ELSE 'SEM_CUSTO' END`;
  const solicitacaoItemJoin = movCols.has('solicitacao_item_id') && itemCols.size
    ? 'LEFT JOIN solicitacao_itens si ON si.id=m.solicitacao_item_id'
    : 'LEFT JOIN (SELECT NULL id,NULL valor_unitario_centavos,NULL fornecedor_id) si ON 1=0';
  const solicitacaoJoin = movCols.has('solicitacao_id') && tableExists('solicitacoes')
    ? 'LEFT JOIN solicitacoes s ON s.id=m.solicitacao_id'
    : 'LEFT JOIN (SELECT NULL id,NULL numero) s ON 1=0';
  const fornecedorJoin = itemCols.has('fornecedor_id') && tableExists('fornecedores')
    ? 'LEFT JOIN fornecedores f ON f.id=si.fornecedor_id'
    : '';
  const fornecedorNome = fornecedorJoin ? 'f.nome' : 'NULL';

  return {
    dataMov,
    custoUnitCentavos,
    custoOrigem,
    solicitacaoItemJoin,
    solicitacaoJoin,
    fornecedorJoin,
    fornecedorNome,
  };
}

function buildWhere(filters = {}, { requireEquipment = true } = {}) {
  const where = ["UPPER(COALESCE(si.status_compra,''))='COMPRADO'"];
  const params = {};
  const inicio = normalizeDate(filters.data_inicial || filters.inicio || filters.data_inicio);
  const fim = normalizeDate(filters.data_final || filters.fim || filters.data_fim);
  if (requireEquipment) where.push('s.equipamento_id IS NOT NULL');
  if (inicio) { where.push('date(COMPRA_DATA) >= date(@data_inicial)'); params.data_inicial = inicio; }
  if (fim) { where.push('date(COMPRA_DATA) <= date(@data_final)'); params.data_final = fim; }
  if (filters.equipamento_id) { where.push('s.equipamento_id=@equipamento_id'); params.equipamento_id = Number(filters.equipamento_id); }
  if (filters.setor) { where.push("COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado')=@setor"); params.setor = String(filters.setor); }
  return { where, params };
}

function buildConsumptionWhere(filters = {}) {
  const exp = movementExpressions();
  if (!exp) return { where: ['1=0'], params: {} };
  const where = ["UPPER(COALESCE(m.tipo,'')) LIKE 'SAIDA%'", 'm.equipamento_id IS NOT NULL'];
  const params = {};
  const inicio = normalizeDate(filters.data_inicial || filters.inicio || filters.data_inicio);
  const fim = normalizeDate(filters.data_final || filters.fim || filters.data_fim);
  if (inicio) { where.push(`date(${exp.dataMov}) >= date(@data_inicial)`); params.data_inicial = inicio; }
  if (fim) { where.push(`date(${exp.dataMov}) <= date(@data_final)`); params.data_final = fim; }
  if (filters.equipamento_id) { where.push('m.equipamento_id=@equipamento_id'); params.equipamento_id = Number(filters.equipamento_id); }
  if (filters.os_id) { where.push('m.os_id=@os_id'); params.os_id = Number(filters.os_id); }
  if (filters.setor) { where.push("COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado')=@setor"); params.setor = String(filters.setor); }
  return { where, params };
}

function sqlWithPurchaseDate(sql, compraData) {
  return sql.replaceAll('COMPRA_DATA', compraData);
}

function emptyTotals() {
  return {
    comprado_centavos: 0,
    recebido_centavos: 0,
    pendente_centavos: 0,
    consumido_centavos: 0,
    consumo_movimentos: 0,
    solicitacoes: 0,
    ordens: 0,
    equipamentos: 0,
  };
}

function getConsumptionAnalytics(filters = {}) {
  const exp = movementExpressions();
  if (!exp || !tableExists('equipamentos')) {
    return { totals: emptyTotals(), byEquipment: [], byMonth: [], byOS: [], items: [] };
  }

  const scope = buildConsumptionWhere(filters);
  const where = scope.where.join(' AND ');

  const byEquipment = db.prepare(`
    SELECT e.id equipamento_id,e.nome equipamento_nome,e.setor,
      COUNT(m.id) consumo_movimentos,
      COUNT(DISTINCT CASE WHEN m.os_id IS NOT NULL THEN m.os_id END) ordens_consumo,
      ROUND(SUM(ABS(COALESCE(m.quantidade,0)) * (${exp.custoUnitCentavos}))) consumido_centavos,
      MAX(${exp.dataMov}) ultima_saida
    FROM estoque_movimentos m
    JOIN estoque_itens ei ON ei.id=m.item_id
    JOIN equipamentos e ON e.id=m.equipamento_id
    ${exp.solicitacaoItemJoin}
    WHERE ${where}
    GROUP BY e.id,e.nome,e.setor
    ORDER BY consumido_centavos DESC,e.nome COLLATE NOCASE
  `).all(scope.params).map((row) => ({
    ...row,
    consumido_centavos: Number(row.consumido_centavos || 0),
    consumo_movimentos: Number(row.consumo_movimentos || 0),
    ordens_consumo: Number(row.ordens_consumo || 0),
  }));

  const byMonth = db.prepare(`
    SELECT strftime('%Y-%m',${exp.dataMov}) mes,
      COUNT(m.id) consumo_movimentos,
      ROUND(SUM(ABS(COALESCE(m.quantidade,0)) * (${exp.custoUnitCentavos}))) consumido_centavos
    FROM estoque_movimentos m
    JOIN estoque_itens ei ON ei.id=m.item_id
    JOIN equipamentos e ON e.id=m.equipamento_id
    ${exp.solicitacaoItemJoin}
    WHERE ${where}
    GROUP BY strftime('%Y-%m',${exp.dataMov})
    HAVING mes IS NOT NULL
    ORDER BY mes
  `).all(scope.params).map((row) => ({
    mes: row.mes,
    consumido_centavos: Number(row.consumido_centavos || 0),
    consumo_movimentos: Number(row.consumo_movimentos || 0),
  }));

  const byOS = db.prepare(`
    SELECT m.os_id,
      COUNT(m.id) consumo_movimentos,
      ROUND(SUM(ABS(COALESCE(m.quantidade,0)) * (${exp.custoUnitCentavos}))) consumido_centavos,
      MAX(${exp.dataMov}) ultima_saida
    FROM estoque_movimentos m
    JOIN estoque_itens ei ON ei.id=m.item_id
    JOIN equipamentos e ON e.id=m.equipamento_id
    ${exp.solicitacaoItemJoin}
    WHERE ${where} AND m.os_id IS NOT NULL
    GROUP BY m.os_id
    ORDER BY consumido_centavos DESC,m.os_id DESC
  `).all(scope.params).map((row) => ({
    ...row,
    os_id: Number(row.os_id || 0),
    consumido_centavos: Number(row.consumido_centavos || 0),
    consumo_movimentos: Number(row.consumo_movimentos || 0),
  }));

  const items = db.prepare(`
    SELECT m.id movimento_id,m.os_id,m.equipamento_id,m.solicitacao_id,m.solicitacao_item_id,
      ${exp.dataMov} data_mov,ABS(COALESCE(m.quantidade,0)) quantidade,
      ei.codigo estoque_codigo,ei.nome item_nome,ei.unidade,
      (${exp.custoUnitCentavos}) valor_unitario_centavos,
      ROUND(ABS(COALESCE(m.quantidade,0)) * (${exp.custoUnitCentavos})) total_centavos,
      (${exp.custoOrigem}) custo_origem,
      s.numero solicitacao_numero,${exp.fornecedorNome} fornecedor_nome
    FROM estoque_movimentos m
    JOIN estoque_itens ei ON ei.id=m.item_id
    JOIN equipamentos e ON e.id=m.equipamento_id
    ${exp.solicitacaoItemJoin}
    ${exp.solicitacaoJoin}
    ${exp.fornecedorJoin}
    WHERE ${where}
    ORDER BY datetime(${exp.dataMov}) DESC,m.id DESC
    LIMIT 300
  `).all(scope.params).map((row) => ({
    ...row,
    quantidade: Number(row.quantidade || 0),
    valor_unitario_centavos: Number(row.valor_unitario_centavos || 0),
    total_centavos: Number(row.total_centavos || 0),
  }));

  const totals = byEquipment.reduce((acc, row) => {
    acc.consumido_centavos += Number(row.consumido_centavos || 0);
    acc.consumo_movimentos += Number(row.consumo_movimentos || 0);
    acc.ordens += Number(row.ordens_consumo || 0);
    return acc;
  }, emptyTotals());
  totals.equipamentos = byEquipment.length;

  return { totals, byEquipment, byMonth, byOS, items };
}

function mergeMonths(purchaseMonths = [], consumptionMonths = []) {
  const map = new Map();
  for (const row of purchaseMonths) map.set(row.mes, { ...row, consumido_centavos: 0, consumo_movimentos: 0 });
  for (const row of consumptionMonths) {
    const current = map.get(row.mes) || { mes: row.mes, comprado_centavos: 0, recebido_centavos: 0, pendente_centavos: 0 };
    map.set(row.mes, {
      ...current,
      consumido_centavos: Number(row.consumido_centavos || 0),
      consumo_movimentos: Number(row.consumo_movimentos || 0),
    });
  }
  return [...map.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
}

function getAnalytics(filters = {}) {
  const exp = expressions();
  const consumo = getConsumptionAnalytics(filters);
  if (!exp || !tableExists('equipamentos')) {
    return { totals: consumo.totals, byEquipment: consumo.byEquipment, byMonth: consumo.byMonth };
  }
  const scope = buildWhere(filters);
  const baseWhere = sqlWithPurchaseDate(scope.where.join(' AND '), exp.compraData);

  const comprasByEquipment = db.prepare(sqlWithPurchaseDate(`
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
  `, exp.compraData)).all(scope.params).map((row) => ({
    ...row,
    comprado_centavos: Number(row.comprado_centavos || 0),
    recebido_centavos: Number(row.recebido_centavos || 0),
    pendente_centavos: Math.max(0, Number(row.comprado_centavos || 0) - Number(row.recebido_centavos || 0)),
  }));

  const consumoMap = new Map(consumo.byEquipment.map((row) => [Number(row.equipamento_id), row]));
  const compraMap = new Map(comprasByEquipment.map((row) => [Number(row.equipamento_id), row]));
  const ids = new Set([...compraMap.keys(), ...consumoMap.keys()]);
  const byEquipment = [...ids].map((id) => {
    const compra = compraMap.get(id) || {};
    const consumido = consumoMap.get(id) || {};
    return {
      equipamento_id: id,
      equipamento_nome: compra.equipamento_nome || consumido.equipamento_nome || '-',
      setor: compra.setor || consumido.setor || null,
      solicitacoes: Number(compra.solicitacoes || 0),
      ordens: Number(compra.ordens || consumido.ordens_consumo || 0),
      comprado_centavos: Number(compra.comprado_centavos || 0),
      recebido_centavos: Number(compra.recebido_centavos || 0),
      pendente_centavos: Number(compra.pendente_centavos || 0),
      consumido_centavos: Number(consumido.consumido_centavos || 0),
      consumo_movimentos: Number(consumido.consumo_movimentos || 0),
      ultima_compra: compra.ultima_compra || null,
      ultima_saida: consumido.ultima_saida || null,
    };
  }).sort((a, b) => (b.consumido_centavos - a.consumido_centavos) || (b.comprado_centavos - a.comprado_centavos));

  const purchaseMonths = db.prepare(sqlWithPurchaseDate(`
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

  const totals = byEquipment.reduce((acc, row) => {
    acc.comprado_centavos += Number(row.comprado_centavos || 0);
    acc.recebido_centavos += Number(row.recebido_centavos || 0);
    acc.consumido_centavos += Number(row.consumido_centavos || 0);
    acc.consumo_movimentos += Number(row.consumo_movimentos || 0);
    acc.solicitacoes += Number(row.solicitacoes || 0);
    acc.ordens += Number(row.ordens || 0);
    return acc;
  }, emptyTotals());
  totals.pendente_centavos = Math.max(0, totals.comprado_centavos - totals.recebido_centavos);
  totals.equipamentos = byEquipment.length;

  return { totals, byEquipment, byMonth: mergeMonths(purchaseMonths, consumo.byMonth) };
}

function getEquipmentDetail(equipamentoId, filters = {}) {
  const id = Number(equipamentoId);
  if (!id) return { totals: emptyTotals(), byMonth: [], items: [], consumos: [] };
  const exp = expressions();
  const scoped = { ...filters, equipamento_id: id };
  const analytics = getAnalytics(scoped);
  const consumo = getConsumptionAnalytics(scoped);
  if (!exp || !tableExists('equipamentos')) {
    return { totals: analytics.totals, byMonth: analytics.byMonth, items: [], consumos: consumo.items, consumoByOS: consumo.byOS || [] };
  }

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

  return { totals: analytics.totals, byMonth: analytics.byMonth, items, consumos: consumo.items, consumoByOS: consumo.byOS || [] };
}

function getOSConsumption(osId, filters = {}) {
  const id = Number(osId);
  const exp = movementExpressions();
  const movCols = columns('estoque_movimentos');
  if (!id || !exp || !movCols.has('os_id')) return { total_centavos: 0, movimentos: 0, items: [] };

  const where = ["UPPER(COALESCE(m.tipo,'')) LIKE 'SAIDA%'", 'm.os_id=@os_id'];
  const params = { os_id: id };
  const inicio = normalizeDate(filters.data_inicial || filters.inicio || filters.data_inicio);
  const fim = normalizeDate(filters.data_final || filters.fim || filters.data_fim);
  if (inicio) { where.push(`date(${exp.dataMov}) >= date(@data_inicial)`); params.data_inicial = inicio; }
  if (fim) { where.push(`date(${exp.dataMov}) <= date(@data_final)`); params.data_final = fim; }

  const items = db.prepare(`
    SELECT m.id movimento_id,m.os_id,m.equipamento_id,m.solicitacao_id,m.solicitacao_item_id,
      ${exp.dataMov} data_mov,ABS(COALESCE(m.quantidade,0)) quantidade,
      ei.codigo estoque_codigo,ei.nome item_nome,ei.unidade,
      (${exp.custoUnitCentavos}) valor_unitario_centavos,
      ROUND(ABS(COALESCE(m.quantidade,0)) * (${exp.custoUnitCentavos})) total_centavos,
      (${exp.custoOrigem}) custo_origem,
      s.numero solicitacao_numero,${exp.fornecedorNome} fornecedor_nome
    FROM estoque_movimentos m
    JOIN estoque_itens ei ON ei.id=m.item_id
    ${exp.solicitacaoItemJoin}
    ${exp.solicitacaoJoin}
    ${exp.fornecedorJoin}
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(${exp.dataMov}) DESC,m.id DESC
    LIMIT 300
  `).all(params).map((row) => ({
    ...row,
    quantidade: Number(row.quantidade || 0),
    valor_unitario_centavos: Number(row.valor_unitario_centavos || 0),
    total_centavos: Number(row.total_centavos || 0),
  }));

  return {
    total_centavos: items.reduce((sum, row) => sum + Number(row.total_centavos || 0), 0),
    movimentos: items.length,
    items,
  };
}

function getEquipmentLifetime(equipamentoId) {
  return getEquipmentDetail(equipamentoId, {});
}

module.exports = {
  getAnalytics,
  getConsumptionAnalytics,
  getEquipmentDetail,
  getEquipmentLifetime,
  getOSConsumption,
};
