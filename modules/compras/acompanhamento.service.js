const db = require('../../database/db');
const comprasService = require('./compras.service');
const approvalService = require('./compras.aprovacao.service');

const TERMINAIS = new Set(['FECHADA', 'CANCELADA', 'RECEBIDA_TOTAL', 'ENTREGUE_SOLICITANTE']);
const PRIORITY_GROUPS = Object.freeze([
  { key: 'critical', label: 'Críticas / imediatas', tokens: new Set(['URGENTE', 'CRITICA', 'EMERGENCIAL']) },
  { key: 'high', label: 'Prioridade alta', tokens: new Set(['ALTA']) },
  { key: 'medium', label: 'Prioridade média', tokens: new Set(['MEDIA']) },
  { key: 'low', label: 'Prioridade baixa', tokens: new Set(['BAIXA']) },
  { key: 'undefined', label: 'Sem prioridade definida', tokens: new Set() },
]);
const pct = (n, d) => d > 0 ? (n / d) * 100 : 0;
const tableExists = (table) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
const columns = (table) => tableExists(table) ? new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)) : new Set();

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function priorityGroup(value) {
  const token = normalizeToken(value);
  for (const group of PRIORITY_GROUPS.slice(0, -1)) {
    if (group.tokens.has(token)) return group.key;
  }
  return 'undefined';
}

function buildFilters(query = {}) {
  const prioridade = String(query.prioridade || '').trim().toLowerCase();
  const visao = ['andamento', 'historico', 'todos'].includes(String(query.visao || '').toLowerCase())
    ? String(query.visao).toLowerCase()
    : 'andamento';
  return {
    visao,
    periodo: ['7','30','90','ano','todos','personalizado'].includes(query.periodo) ? query.periodo : 'todos',
    inicio: String(query.inicio || ''),
    fim: String(query.fim || ''),
    setor: String(query.setor || ''),
    responsavel: String(query.responsavel || ''),
    status: String(query.status || ''),
    prioridade: PRIORITY_GROUPS.some((group) => group.key === prioridade) ? prioridade : '',
  };
}

function getTodayBahia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' }).format(new Date());
}

function minusDaysIso(today, days) {
  const date = new Date(`${today}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() - Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function matchesPeriod(value, filters, today = getTodayBahia()) {
  if (filters.periodo === 'todos') return true;
  const ref = String(value || '').slice(0, 10);
  if (!ref) return false;
  if (['7', '30', '90'].includes(filters.periodo)) return ref >= minusDaysIso(today, Number(filters.periodo));
  if (filters.periodo === 'ano') return ref.slice(0, 4) === today.slice(0, 4);
  if (filters.periodo === 'personalizado') {
    if (filters.inicio && ref < filters.inicio) return false;
    if (filters.fim && ref > filters.fim) return false;
    return true;
  }
  return true;
}

function isConcluida(solicitacao) {
  const status = normalizeToken(solicitacao?.status);
  if (TERMINAIS.has(status)) return true;
  const total = Number(solicitacao?.total || 0);
  return total > 0
    && Number(solicitacao?.cotados || 0) >= total
    && Number(solicitacao?.comprados || 0) >= total
    && Number(solicitacao?.recebidos || 0) >= total;
}

function completionDateExpression(solCols) {
  const candidates = [
    'fechada_em',
    'recebida_total_em',
    'entregue_em',
    'recebida_em',
    'finalizada_em',
    'updated_at',
    'created_at',
  ].filter((column) => solCols.has(column));
  if (!candidates.length) return 'NULL';
  if (candidates.length === 1) return `s.${candidates[0]}`;
  return `COALESCE(${candidates.map((column) => `s.${column}`).join(',')})`;
}

function getMonthlyEquipmentCosts() {
  const itemCols = columns('solicitacao_itens');
  const solCols = columns('solicitacoes');
  if (!itemCols.size || !solCols.size || !itemCols.has('status_compra')) return [];

  const qtdSolicitada = itemCols.has('qtd_solicitada') ? 'COALESCE(si.qtd_solicitada,0)' : (itemCols.has('quantidade') ? 'COALESCE(si.quantidade,0)' : '0');
  const qtdComprada = itemCols.has('qtd_comprada') ? `COALESCE(si.qtd_comprada,${qtdSolicitada})` : qtdSolicitada;
  const qtdRecebida = itemCols.has('qtd_recebida_total') ? 'COALESCE(si.qtd_recebida_total,0)' : '0';
  const unitario = itemCols.has('valor_unitario_centavos') ? 'COALESCE(si.valor_unitario_centavos,0)' : '0';
  const purchaseDate = itemCols.has('comprado_em')
    ? 'si.comprado_em'
    : (solCols.has('comprada_em') ? 's.comprada_em' : 's.updated_at');
  const equipamentoJoin = solCols.has('equipamento_id') && tableExists('equipamentos') ? 'LEFT JOIN equipamentos e ON e.id=s.equipamento_id' : '';
  const equipamentoNome = solCols.has('equipamento_id') && tableExists('equipamentos') ? 'e.nome' : 'NULL';
  const equipamentoId = solCols.has('equipamento_id') ? 's.equipamento_id' : 'NULL';

  const rows = db.prepare(`
    SELECT s.id solicitacao_id, s.numero, s.os_id,
      ${equipamentoId} equipamento_id, ${equipamentoNome} equipamento_nome,
      ${qtdSolicitada} qtd_solicitada, ${qtdComprada} qtd_comprada,
      ${qtdRecebida} qtd_recebida, ${unitario} valor_unitario_centavos,
      ${purchaseDate} data_compra
    FROM solicitacoes s
    JOIN solicitacao_itens si ON si.solicitacao_id=s.id
    ${equipamentoJoin}
    WHERE UPPER(COALESCE(si.status_compra,''))='COMPRADO'
      AND strftime('%Y-%m', ${purchaseDate})=strftime('%Y-%m','now')
  `).all();

  const groups = new Map();
  rows.forEach((row) => {
    const key = row.equipamento_id ? `E:${row.equipamento_id}` : 'SEM_EQUIPAMENTO';
    if (!groups.has(key)) groups.set(key, {
      equipamento_id: row.equipamento_id || null,
      equipamento_nome: row.equipamento_nome || 'Sem equipamento vinculado',
      osIds: new Set(),
      solicitacoesIds: new Set(),
      compradoCentavos: 0,
      recebidoCentavos: 0,
    });
    const group = groups.get(key);
    if (row.os_id) group.osIds.add(Number(row.os_id));
    group.solicitacoesIds.add(Number(row.solicitacao_id));
    group.compradoCentavos += Math.round(Number(row.qtd_comprada || 0) * Number(row.valor_unitario_centavos || 0));
    group.recebidoCentavos += Math.round(Math.min(Number(row.qtd_recebida || 0), Number(row.qtd_comprada || 0)) * Number(row.valor_unitario_centavos || 0));
  });

  return [...groups.values()].map((group) => ({
    ...group,
    osIds: [...group.osIds].sort((a, b) => a - b),
    solicitacoes: group.solicitacoesIds.size,
    saldoCentavos: Math.max(0, group.compradoCentavos - group.recebidoCentavos),
  })).sort((a, b) => b.compradoCentavos - a.compradoCentavos);
}

function getDashboard(query = {}) {
  const filters = buildFilters(query);
  const ic = columns('solicitacao_itens');
  const sc = columns('solicitacoes');
  const where = [];
  const params = [];

  if (filters.setor) { where.push('s.setor_origem=?'); params.push(filters.setor); }
  if (filters.responsavel) { where.push('s.compras_user_id=?'); params.push(Number(filters.responsavel)); }
  if (filters.status) { where.push('s.status=?'); params.push(filters.status); }

  const cancelled = ic.has('status_compra') ? "UPPER(COALESCE(si.status_compra,''))<>'CANCELADO'" : '1=1';
  const qtd = ic.has('qtd_solicitada') ? 'COALESCE(si.qtd_solicitada,0)' : 'COALESCE(si.quantidade,0)';
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const approvalStatus = sc.has('aprovacao_compra_status') ? 's.aprovacao_compra_status' : "'NAO_SOLICITADA'";
  const approvalDirector = sc.has('diretor_aprovador_user_id') ? 's.diretor_aprovador_user_id' : 'NULL';
  const approvalJoin = sc.has('diretor_aprovador_user_id') ? 'LEFT JOIN users d ON d.id=s.diretor_aprovador_user_id' : '';
  const approvalDirectorName = sc.has('diretor_aprovador_user_id') ? 'd.name' : 'NULL';
  const completionDate = completionDateExpression(sc);

  const rows = db.prepare(`SELECT s.id,s.numero,s.titulo,s.status,s.os_id,s.setor_origem,s.prioridade,s.previsao_entrega,s.created_at,s.updated_at,
    e.nome equipamento_nome,u.name responsavel_nome, ${approvalStatus} aprovacao_compra_status,
    ${approvalDirector} diretor_aprovador_user_id, ${approvalDirectorName} diretor_aprovador_nome,
    ${completionDate} data_conclusao_referencia,
    si.id item_id,${qtd} qtd_solicitada,
    ${ic.has('status_cotacao') ? 'si.status_cotacao' : "'PENDENTE'"} status_cotacao,
    ${ic.has('status_compra') ? 'si.status_compra' : "'PENDENTE'"} status_compra,
    ${ic.has('qtd_comprada') ? 'COALESCE(si.qtd_comprada,0)' : '0'} qtd_comprada,
    ${ic.has('qtd_recebida_total') ? 'COALESCE(si.qtd_recebida_total,0)' : '0'} qtd_recebida,
    ${ic.has('valor_unitario_centavos') ? 'COALESCE(si.valor_unitario_centavos,0)' : '0'} unitario
    FROM solicitacoes s
    LEFT JOIN solicitacao_itens si ON si.solicitacao_id=s.id AND ${cancelled}
    LEFT JOIN equipamentos e ON e.id=s.equipamento_id
    LEFT JOIN users u ON u.id=s.compras_user_id
    ${approvalJoin}
    ${whereSql}
    ORDER BY datetime(s.created_at) DESC,s.id DESC,si.id`).all(...params);

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.id)) map.set(row.id, { ...row, itens: [] });
    if (row.item_id) map.get(row.id).itens.push(row);
  }

  const hoje = getTodayBahia();
  let base = [...map.values()].map((s) => {
    const total = s.itens.length;
    const cotados = s.itens.filter((i) => normalizeToken(i.status_cotacao) === 'COTADO').length;
    const comprados = s.itens.filter((i) => normalizeToken(i.status_compra) === 'COMPRADO').length;
    const recebidos = s.itens.filter((i) => Number(i.qtd_comprada || i.qtd_solicitada) > 0 && Number(i.qtd_recebida) >= Number(i.qtd_comprada || i.qtd_solicitada)).length;
    const cotadoCentavos = s.itens.reduce((a, i) => a + (normalizeToken(i.status_cotacao) === 'COTADO' ? Math.round(Number(i.qtd_solicitada) * Number(i.unitario)) : 0), 0);
    const comprometidoCentavos = s.itens.reduce((a, i) => a + (normalizeToken(i.status_compra) === 'COMPRADO' ? Math.round(Number(i.qtd_comprada || i.qtd_solicitada) * Number(i.unitario)) : 0), 0);
    const recebidoCentavos = s.itens.reduce((a, i) => a + Math.round(Number(i.qtd_recebida) * Number(i.unitario)), 0);
    const atrasada = !!s.previsao_entrega && s.previsao_entrega.slice(0, 10) < hoje && !TERMINAIS.has(normalizeToken(s.status));
    const group = priorityGroup(s.prioridade);
    const calculated = {
      ...s,
      priorityGroup: group,
      total,
      cotados,
      semCotacao: Math.max(0, total - cotados),
      comprados,
      recebidos,
      percentualCotado: pct(cotados, total),
      percentualSemCotacao: pct(total - cotados, total),
      percentualComprado: pct(comprados, total),
      percentualRecebido: pct(recebidos, total),
      cotadoCentavos,
      comprometidoCentavos,
      recebidoCentavos,
      atrasada,
      venceHoje: !!s.previsao_entrega && s.previsao_entrega.slice(0, 10) === hoje,
    };
    calculated.concluidaFluxo = isConcluida(calculated);
    calculated.dataReferencia = calculated.concluidaFluxo
      ? (calculated.data_conclusao_referencia || calculated.updated_at || calculated.created_at)
      : calculated.created_at;
    return calculated;
  });

  if (filters.prioridade) base = base.filter((s) => s.priorityGroup === filters.prioridade);

  const andamento = base.filter((s) => !s.concluidaFluxo && matchesPeriod(s.created_at, filters, hoje));
  const historico = base.filter((s) => s.concluidaFluxo && matchesPeriod(s.dataReferencia, filters, hoje));
  const todos = [...andamento, ...historico];
  let solicitacoes = filters.visao === 'historico' ? historico : (filters.visao === 'todos' ? todos : andamento);

  const rank = new Map(PRIORITY_GROUPS.map((group, index) => [group.key, index]));
  if (filters.visao === 'historico') {
    solicitacoes.sort((a, b) => String(b.dataReferencia || '').localeCompare(String(a.dataReferencia || '')) || Number(b.id) - Number(a.id));
  } else {
    solicitacoes.sort((a, b) => (rank.get(a.priorityGroup) - rank.get(b.priorityGroup)) || String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(b.id) - Number(a.id));
  }

  const sum = (key, list = solicitacoes) => list.reduce((a, s) => a + Number(s[key] || 0), 0);
  const total = sum('total');
  const indicadores = {
    solicitacoes: solicitacoes.length,
    total,
    cotados: sum('cotados'),
    semCotacao: sum('semCotacao'),
    comprados: sum('comprados'),
    recebidos: sum('recebidos'),
    valorCotadoCentavos: sum('cotadoCentavos'),
  };
  const concluida = solicitacoes.filter((s) => s.concluidaFluxo && normalizeToken(s.status) !== 'CANCELADA').length;
  const fluxo = {
    cotacao: pct(indicadores.cotados, total),
    compra: pct(indicadores.comprados, total),
    recebimento: pct(indicadores.recebidos, total),
    concluidas: pct(concluida, solicitacoes.length),
  };

  const priorityOverview = PRIORITY_GROUPS.map((group) => {
    const items = solicitacoes.filter((s) => s.priorityGroup === group.key);
    const itensTotal = sum('total', items);
    return {
      key: group.key,
      label: group.label,
      solicitacoes: items,
      totalSolicitacoes: items.length,
      totalItens: itensTotal,
      percentualSolicitacoes: pct(items.length, solicitacoes.length),
      percentualCotado: pct(sum('cotados', items), itensTotal),
      percentualComprado: pct(sum('comprados', items), itensTotal),
      percentualRecebido: pct(sum('recebidos', items), itensTotal),
    };
  });
  const priorityGroups = priorityOverview.filter((group) => group.totalSolicitacoes > 0);

  return {
    filters,
    solicitacoes,
    totaisVisao: {
      andamento: andamento.length,
      historico: historico.length,
      todos: todos.length,
    },
    priorityOverview,
    priorityGroups,
    indicadores,
    fluxo,
    valores: {
      cotado: sum('cotadoCentavos'),
      comprometido: sum('comprometidoCentavos'),
      recebido: sum('recebidoCentavos'),
      saldo: Math.max(0, sum('comprometidoCentavos') - sum('recebidoCentavos')),
    },
    custosMensaisEquipamentos: getMonthlyEquipmentCosts(),
    pendencias: {
      semCotacao: indicadores.semCotacao,
      atrasadas: solicitacoes.filter((s) => s.atrasada).length,
      vencemHoje: solicitacoes.filter((s) => s.venceHoje).length,
      semOs: solicitacoes.filter((s) => !s.os_id).length,
      aguardandoAprovacao: solicitacoes.filter((s) => normalizeToken(s.aprovacao_compra_status) === 'PENDENTE').length,
    },
    setores: db.prepare('SELECT DISTINCT setor_origem nome FROM solicitacoes WHERE setor_origem IS NOT NULL ORDER BY 1').all(),
    responsaveis: db.prepare("SELECT id,name FROM users WHERE role IN ('COMPRAS','ADMIN') ORDER BY name").all(),
    atualizadoEm: new Date(),
  };
}

function getDetail(id) {
  const sol = comprasService.getSolicitacaoDetalhe(Number(id));
  if (!sol) return null;
  const supplierRows = tableExists('fornecedores') ? db.prepare('SELECT id,nome FROM fornecedores').all() : [];
  const suppliers = new Map(supplierRows.map((row) => [Number(row.id), row.nome]));
  const active = (sol.itens || []).filter((item) => normalizeToken(item.status_compra) !== 'CANCELADO');
  const itens = active.map((item) => {
    const qtdSolicitada = Number(item.qtd_solicitada || item.quantidade || 0);
    const qtdComprada = normalizeToken(item.status_compra) === 'COMPRADO' ? Number(item.qtd_comprada ?? qtdSolicitada) : 0;
    const qtdRecebida = Number(item.qtd_recebida_total || 0);
    const unitario = Number(item.valor_unitario_centavos || 0);
    return {
      ...item,
      qtdSolicitada,
      qtdComprada,
      qtdRecebida,
      qtdPendenteReceber: Math.max(0, qtdComprada - qtdRecebida),
      fornecedor_nome: suppliers.get(Number(item.fornecedor_id)) || null,
      cotadoCentavos: normalizeToken(item.status_cotacao) === 'COTADO' ? Math.round(qtdSolicitada * unitario) : 0,
      compradoCentavos: normalizeToken(item.status_compra) === 'COMPRADO' ? Math.round(qtdComprada * unitario) : 0,
      recebidoCentavos: Math.round(Math.min(qtdRecebida, qtdComprada || qtdSolicitada) * unitario),
    };
  });
  const comprasUser = sol.compras_user_id ? db.prepare('SELECT id,name FROM users WHERE id=?').get(Number(sol.compras_user_id)) : null;
  let aprovacao = null;
  try { aprovacao = approvalService.getContext(Number(id)); } catch (_error) { aprovacao = null; }
  const sum = (key) => itens.reduce((total, item) => total + Number(item[key] || 0), 0);
  return {
    ...sol,
    itens,
    compras_responsavel_nome: comprasUser?.name || null,
    aprovacao,
    resumoAcompanhamento: {
      total: itens.length,
      cotados: itens.filter((item) => normalizeToken(item.status_cotacao) === 'COTADO').length,
      comprados: itens.filter((item) => normalizeToken(item.status_compra) === 'COMPRADO').length,
      recebidos: itens.filter((item) => item.qtdComprada > 0 && item.qtdRecebida >= item.qtdComprada).length,
      cotadoCentavos: sum('cotadoCentavos'),
      compradoCentavos: sum('compradoCentavos'),
      recebidoCentavos: sum('recebidoCentavos'),
    },
  };
}

module.exports = {
  getDashboard,
  getDetail,
  getMonthlyEquipmentCosts,
  buildFilters,
  pct,
  priorityGroup,
  PRIORITY_GROUPS,
  matchesPeriod,
  isConcluida,
};
