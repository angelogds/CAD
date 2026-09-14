const db = require('../../database/db');
const pcmService = require('../pcm/pcm.service');
const custosEquipamentosService = require('../compras/custos-equipamentos.service');

const CLOSED_STATUSES = "('CONCLUIDA','FINALIZADA','FECHADA')";
const CANCELLED_STATUSES = "('CANCELADA','CANCELADO')";

function hasTable(name) {
  try {
    return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
  } catch (_error) {
    return false;
  }
}

function hasColumn(table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
  } catch (_error) {
    return false;
  }
}

function firstColumn(table, names) {
  return names.find((name) => hasColumn(table, name));
}

function safeGet(label, sql, params = {}) {
  try {
    return db.prepare(sql).get(params) || {};
  } catch (error) {
    console.error('[diretoria][manutencao] Falha na consulta:', label, error?.message || error);
    return {};
  }
}

function percentage(part, total) {
  const denominator = Number(total || 0);
  if (!denominator) return null;
  return Math.round((Number(part || 0) * 1000) / denominator) / 10;
}

function dashboardWhere(filtros = {}, { backlog = false } = {}) {
  const params = { ...filtros };
  const where = [
    backlog
      ? "o.opened_at IS NOT NULL AND date(o.opened_at) <= date(@data_final)"
      : "date(o.opened_at) BETWEEN date(@data_inicial) AND date(@data_final)",
  ];
  const hasEquipamentos = hasTable('equipamentos');

  if (filtros.setor && hasEquipamentos && hasColumn('equipamentos', 'setor')) {
    where.push("COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado')=@setor");
  }
  if (filtros.equipamento_id) where.push('o.equipamento_id=@equipamento_id');
  if (filtros.tipo_manutencao && hasColumn('os', 'tipo')) where.push("UPPER(COALESCE(o.tipo,''))=@tipo_manutencao");
  if (filtros.status && hasColumn('os', 'status')) where.push("UPPER(COALESCE(o.status,''))=@status");
  if (filtros.prioridade && hasColumn('os', 'prioridade')) where.push("UPPER(COALESCE(o.prioridade,''))=@prioridade");
  if (filtros.criticidade && hasEquipamentos && hasColumn('equipamentos', 'criticidade')) where.push("UPPER(COALESCE(e.criticidade,''))=@criticidade");
  if (filtros.ativo !== '' && hasEquipamentos && hasColumn('equipamentos', 'ativo')) where.push('COALESCE(e.ativo,1)=@ativo');
  if (filtros.solicitante_id && hasColumn('os', 'opened_by')) where.push('o.opened_by=@solicitante_id');

  const execUserCol = hasTable('os_execucoes')
    ? firstColumn('os_execucoes', ['mecanico_user_id', 'executor_user_id', 'user_id', 'responsavel_id', 'tecnico_id'])
    : null;
  if (filtros.mecanico_id && execUserCol) {
    where.push(`EXISTS (SELECT 1 FROM os_execucoes x WHERE x.os_id=o.id AND x.${execUserCol}=@mecanico_id)`);
  }

  return { sql: where.join(' AND '), params };
}

function getBacklogAging(filtros = {}) {
  if (!hasTable('os')) return { total: 0, ate_7: 0, de_8_30: 0, de_31_60: 0, acima_60: 0, mais_antiga_dias: 0 };
  const scope = dashboardWhere(filtros, { backlog: true });
  return safeGet('backlog_aging', `
    SELECT
      COUNT(*) total,
      SUM(CASE WHEN (julianday('now')-julianday(o.opened_at)) <= 7 THEN 1 ELSE 0 END) ate_7,
      SUM(CASE WHEN (julianday('now')-julianday(o.opened_at)) > 7 AND (julianday('now')-julianday(o.opened_at)) <= 30 THEN 1 ELSE 0 END) de_8_30,
      SUM(CASE WHEN (julianday('now')-julianday(o.opened_at)) > 30 AND (julianday('now')-julianday(o.opened_at)) <= 60 THEN 1 ELSE 0 END) de_31_60,
      SUM(CASE WHEN (julianday('now')-julianday(o.opened_at)) > 60 THEN 1 ELSE 0 END) acima_60,
      MAX(CAST(julianday('now')-julianday(o.opened_at) AS INTEGER)) mais_antiga_dias
    FROM os o
    LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    WHERE ${scope.sql}
      AND UPPER(COALESCE(o.status,'')) NOT IN ${CLOSED_STATUSES}
      AND UPPER(COALESCE(o.status,'')) NOT IN ${CANCELLED_STATUSES}
  `, scope.params);
}

function getDataQuality(filtros = {}) {
  if (!hasTable('os')) {
    return { score: null, status: 'SEM_DADOS', status_label: 'Sem dados', campos_pendentes: ['Ordens de serviço ainda não disponíveis'] };
  }

  const scope = dashboardWhere(filtros);
  const closedCol = firstColumn('os', ['closed_at', 'data_conclusao', 'data_fim', 'finished_at']);
  const closedExpr = closedCol ? `o.${closedCol}` : 'NULL';
  const hasFalhas = hasTable('pcm_falhas') && hasColumn('pcm_falhas', 'os_id');
  const classificadaExpr = hasFalhas
    ? "EXISTS (SELECT 1 FROM pcm_falhas pf WHERE pf.os_id=o.id)"
    : '0';
  const paradaExpr = hasFalhas && hasColumn('pcm_falhas', 'inicio_parada_em') && hasColumn('pcm_falhas', 'fim_parada_em')
    ? "EXISTS (SELECT 1 FROM pcm_falhas pf WHERE pf.os_id=o.id AND pf.inicio_parada_em IS NOT NULL AND pf.fim_parada_em IS NOT NULL)"
    : '0';

  const row = safeGet('qualidade_dados', `
    SELECT
      COUNT(*) total_os,
      SUM(CASE WHEN o.equipamento_id IS NOT NULL THEN 1 ELSE 0 END) os_com_equipamento,
      SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${CLOSED_STATUSES} THEN 1 ELSE 0 END) concluidas,
      SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${CLOSED_STATUSES} AND ${closedExpr} IS NOT NULL THEN 1 ELSE 0 END) concluidas_com_fechamento,
      SUM(CASE WHEN UPPER(COALESCE(o.tipo,''))='CORRETIVA' THEN 1 ELSE 0 END) corretivas,
      SUM(CASE WHEN UPPER(COALESCE(o.tipo,''))='CORRETIVA' AND ${classificadaExpr} THEN 1 ELSE 0 END) corretivas_classificadas,
      SUM(CASE WHEN UPPER(COALESCE(o.tipo,''))='CORRETIVA' AND ${paradaExpr} THEN 1 ELSE 0 END) corretivas_com_intervalo_parada
    FROM os o
    LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    WHERE ${scope.sql}
  `, scope.params);

  const equipamentoPct = percentage(row.os_com_equipamento, row.total_os);
  const fechamentoPct = percentage(row.concluidas_com_fechamento, row.concluidas);
  const classificacaoPct = percentage(row.corretivas_classificadas, row.corretivas);
  const paradaPct = percentage(row.corretivas_com_intervalo_parada, row.corretivas);
  const available = [equipamentoPct, fechamentoPct, classificacaoPct, paradaPct].filter((value) => value !== null);
  const score = available.length ? Math.round((available.reduce((sum, value) => sum + value, 0) / available.length) * 10) / 10 : null;

  let status = 'SEM_DADOS';
  let statusLabel = 'Sem dados suficientes';
  if (score !== null) {
    if (score >= 85) { status = 'BOM'; statusLabel = 'Boa base para indicadores'; }
    else if (score >= 65) { status = 'EM_EVOLUCAO'; statusLabel = 'Base em evolução'; }
    else { status = 'ATENCAO'; statusLabel = 'Base precisa de atenção'; }
  }

  const camposPendentes = [];
  if (equipamentoPct === null || equipamentoPct < 95) camposPendentes.push('Vincular todas as OS aos equipamentos corretos');
  if (fechamentoPct === null || fechamentoPct < 95) camposPendentes.push('Registrar data/hora real de conclusão das OS');
  if (classificacaoPct === null || classificacaoPct < 85) camposPendentes.push('Classificar as falhas corretivas no PCM');
  if (paradaPct === null || paradaPct < 85) camposPendentes.push('Registrar início e fim real das paradas');

  return {
    score,
    status,
    status_label: statusLabel,
    os_com_equipamento_pct: equipamentoPct,
    encerramento_com_data_pct: fechamentoPct,
    corretivas_classificadas_pct: classificacaoPct,
    paradas_com_intervalo_pct: paradaPct,
    campos_pendentes: camposPendentes,
  };
}

function getDashboard(query = {}, userId = null) {
  const dashboard = pcmService.getDashboardGerencial(query, userId);
  const filtros = dashboard.filtros || pcmService.buildDashboardFilters(query);
  const backlog = getBacklogAging(filtros);
  const falhas = Array.isArray(dashboard?.graficos?.falhas_equipamento) ? dashboard.graficos.falhas_equipamento : [];
  const recorrentes = falhas
    .filter((item) => Number(item.falhas || 0) >= 2)
    .map((item) => ({ ...item, repeticoes_apos_primeira: Math.max(0, Number(item.falhas || 0) - 1) }))
    .sort((a, b) => Number(b.repeticoes_apos_primeira || 0) - Number(a.repeticoes_apos_primeira || 0) || Number(b.falhas || 0) - Number(a.falhas || 0));
  const corretivas = Number(dashboard?.cards?.corretivas || 0);
  const repeticoes = recorrentes.reduce((sum, item) => sum + Number(item.repeticoes_apos_primeira || 0), 0);
  const reincidenciaPct = corretivas ? Math.round((repeticoes * 1000) / corretivas) / 10 : 0;
  const qualidade = getDataQuality(filtros);
  let custos = { totals: { comprado_centavos: 0, recebido_centavos: 0, pendente_centavos: 0, equipamentos: 0 }, byEquipment: [], byMonth: [] };
  try {
    custos = custosEquipamentosService.getAnalytics({
      data_inicial: filtros.data_inicial,
      data_final: filtros.data_final,
      equipamento_id: filtros.equipamento_id,
      setor: filtros.setor,
    });
  } catch (error) {
    console.error('[diretoria][manutencao] Falha ao consolidar custos por equipamento:', error?.message || error);
  }

  dashboard.cards = {
    ...(dashboard.cards || {}),
    backlog_os_atual: Number(backlog.total || 0),
    backlog_acima_30_dias: Number(backlog.de_31_60 || 0) + Number(backlog.acima_60 || 0),
    backlog_mais_antiga_dias: Number(backlog.mais_antiga_dias || 0),
    reincidencia_corretiva_pct: reincidenciaPct,
    equipamentos_reincidentes: recorrentes.length,
    qualidade_dados_pct: qualidade.score,
    custo_comprado_centavos: Number(custos.totals?.comprado_centavos || 0),
    custo_recebido_centavos: Number(custos.totals?.recebido_centavos || 0),
    custo_pendente_recebimento_centavos: Number(custos.totals?.pendente_centavos || 0),
    equipamentos_com_custo: Number(custos.totals?.equipamentos || 0),
  };
  dashboard.graficos = {
    ...(dashboard.graficos || {}),
    backlog_idade: [
      { faixa: '0–7 dias', total: Number(backlog.ate_7 || 0) },
      { faixa: '8–30 dias', total: Number(backlog.de_8_30 || 0) },
      { faixa: '31–60 dias', total: Number(backlog.de_31_60 || 0) },
      { faixa: 'Acima de 60 dias', total: Number(backlog.acima_60 || 0) },
    ],
    reincidencia_corretiva: recorrentes,
    custos_equipamento: custos.byEquipment || [],
    custos_mes: custos.byMonth || [],
  };
  dashboard.qualidade_dados = qualidade;
  dashboard.custos = custos;
  dashboard.confiabilidade = {
    ...(dashboard.confiabilidade || {}),
    qualidade_dados_pct: qualidade.score,
    status_qualidade: qualidade.status,
  };
  return dashboard;
}

module.exports = {
  getDashboard,
  getBacklogAging,
  getDataQuality,
};
