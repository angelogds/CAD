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

function buildWhere(filters = {}, { requireEquipment = true } = {}) {
  const where = ["UPPER(COALESCE(si.status_compra,''))='COMPRADO'"];
  const params = {};
  const inicio = normalizeDate(filters.data_inicial || filters.inicio);
  const fim = normalizeDate(filters.data_final || filters.fim);
  if (requireEquipment) where.push('s.equipamento_id IS NOT NULL');
  if (inicio) { where.push('date(COMPRA_DATA) >= date(@data_inicial)'); params.data_inicial = inicio; }
  if (fim) { where.push('date(COMPRA_DATA) <= date(@data_final)'); params.data_final = fim; }
  if (filters.equipamento_id) { where.push('s.equipamento_id=@equipamento_id'); params.equipamento_id = Number(filters.equipamento_id); }
  if (filters.setor) { where.push("COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado')=@setor"); params.setor = String(filters.setor); }
  return { where, params };
}

function sqlWithPurchaseDate(sql, compraData) {
  return sql.replaceAll('COMPRA_DATA', compraData);
}

function getAnalytics(filters = {}) {
  const exp = expressions();
  if (!exp || !tableExists('equipamentos')) return { totals: emptyTotals(), byEquipment: [], byMonth: [] };
  const scope = buildWhere(filters);
  const baseWhere = sqlWithPurchaseDate(scope.where.join(' AND '), exp.compraData);

  const byEquipment = db.prepare(sqlWithPurchaseDate(`
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

  const byMonth = db.prepare(sqlWithPurchaseDate(`
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
    acc.solicitacoes += Number(row.solicitacoes || 0);
    acc.ordens += Number(row.ordens || 0);
    return acc;
  }, emptyTotals());
  totals.pendente_centavos = Math.max(0, totals.comprado_centavos - totals.recebido_centavos);
  totals.equipamentos = byEquipment.length;

  return { totals, byEquipment, byMonth };
}

function emptyTotals() {
  return { comprado_centavos: 0, recebido_centavos: 0, pendente_centavos: 0, solicitacoes: 0, ordens: 0, equipamentos: 0 };
}

function getEquipmentDetail(equipamentoId, filters = {}) {
  const id = Number(equipamentoId);
  if (!id) return { totals: emptyTotals(), byMonth: [], items: [] };
  const exp = expressions();
  if (!exp || !tableExists('equipamentos')) return { totals: emptyTotals(), byMonth: [], items: [] };

  const scoped = { ...filters, equipamento_id: id };
  const analytics = getAnalytics(scoped);
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
