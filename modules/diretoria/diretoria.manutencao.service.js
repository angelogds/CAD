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

function safeAll(label, sql, params = {}) {
  try {
    return db.prepare(sql).all(params) || [];
  } catch (error) {
    console.error('[diretoria][manutencao] Falha na consulta:', label, error?.message || error);
    return [];
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
    ? "EXISTS (SELECT 1 FROM pcm_falhas pf WHERE pf.os_id=o.id AND pf.inicio_parada_em IS NOT NULL AND pf.fim_parada_em IS NOT NULL AND julianday(pf.inicio_parada_em) IS NOT NULL AND julianday(pf.fim_parada_em) IS NOT NULL AND julianday(pf.fim_parada_em) >= julianday(pf.inicio_parada_em))"
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

function parseSqlDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\\d{2}:?\\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

function periodBounds(filtros = {}) {
  const startRaw = String(filtros.data_inicial || '');
  const endRaw = String(filtros.data_final || '');
  const start = /^\\d{4}-\\d{2}-\\d{2}$/.test(startRaw) ? new Date(`${startRaw}T00:00:00Z`) : null;
  const end = /^\\d{4}-\\d{2}-\\d{2}$/.test(endRaw) ? new Date(`${endRaw}T00:00:00Z`) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { start: null, endExclusive: null, hours: 0 };
  }
  const endExclusive = new Date(end.getTime() + 86400000);
  return { start, endExclusive, hours: (endExclusive.getTime() - start.getTime()) / 3600000 };
}

function periodHours(filtros = {}) {
  return periodBounds(filtros).hours;
}

function getReliabilityIndicators(filtros = {}, qualidade = {}) {
  const empty = {
    mtbf_horas: null,
    mtbf_dias: null,
    mtbf_amostras: 0,
    mttr_horas: null,
    mttr_amostras: 0,
    disponibilidade_pct: null,
    horas_parada: null,
    equipamentos_base: 0,
    falhas_classificadas: 0,
    paradas_validas: 0,
    status: 'DADOS_INSUFICIENTES',
    status_label: 'Dados insuficientes',
  };

  if (!hasTable('pcm_falhas') || !hasTable('os') || !hasTable('equipamentos')) return empty;
  if (!hasColumn('pcm_falhas', 'inicio_parada_em') || !hasColumn('pcm_falhas', 'fim_parada_em')) return empty;

  const scope = dashboardWhere(filtros);
  const falhas = safeAll('confiabilidade_falhas', `
    SELECT o.id os_id,o.equipamento_id,
      COALESCE(pf.inicio_parada_em,o.opened_at) falha_em,
      pf.inicio_parada_em,pf.fim_parada_em
    FROM os o
    JOIN pcm_falhas pf ON pf.os_id=o.id
    LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    WHERE ${scope.sql}
      AND o.equipamento_id IS NOT NULL
      AND UPPER(COALESCE(o.tipo,''))='CORRETIVA'
      AND UPPER(COALESCE(o.status,'')) NOT IN ${CANCELLED_STATUSES}
    ORDER BY o.equipamento_id,datetime(COALESCE(pf.inicio_parada_em,o.opened_at)),o.id
  `, scope.params);

  const bounds = periodBounds(filtros);
  const intervals = [];
  const lastFailureByEquipment = new Map();
  const stopIntervalsByEquipment = new Map();
  let repairHours = 0;
  let mttrSamples = 0;
  let validStops = 0;

  for (const row of falhas) {
    const failureAt = parseSqlDate(row.falha_em);
    if (failureAt) {
      const key = Number(row.equipamento_id);
      const previous = lastFailureByEquipment.get(key);
      if (previous) {
        const diffHours = (failureAt.getTime() - previous.getTime()) / 3600000;
        if (Number.isFinite(diffHours) && diffHours >= 0) intervals.push(diffHours);
      }
      lastFailureByEquipment.set(key, failureAt);
    }

    const start = parseSqlDate(row.inicio_parada_em);
    const end = parseSqlDate(row.fim_parada_em);
    if (!start || !end || end < start) continue;

    const fullRepairHours = (end.getTime() - start.getTime()) / 3600000;
    if (!Number.isFinite(fullRepairHours) || fullRepairHours < 0) continue;

    repairHours += fullRepairHours;
    mttrSamples += 1;
    validStops += 1;

    let effectiveStart = start;
    let effectiveEnd = end;
    if (bounds.start && effectiveStart < bounds.start) effectiveStart = bounds.start;
    if (bounds.endExclusive && effectiveEnd > bounds.endExclusive) effectiveEnd = bounds.endExclusive;
    if (effectiveEnd <= effectiveStart) continue;

    const key = Number(row.equipamento_id);
    const equipmentIntervals = stopIntervalsByEquipment.get(key) || [];
    equipmentIntervals.push([effectiveStart.getTime(), effectiveEnd.getTime()]);
    stopIntervalsByEquipment.set(key, equipmentIntervals);
  }

  let downtimeHours = 0;
  for (const equipmentIntervals of stopIntervalsByEquipment.values()) {
    equipmentIntervals.sort((a, b) => a[0] - b[0]);
    let current = null;

    for (const interval of equipmentIntervals) {
      if (!current) {
        current = [...interval];
        continue;
      }

      if (interval[0] <= current[1]) {
        current[1] = Math.max(current[1], interval[1]);
      } else {
        downtimeHours += (current[1] - current[0]) / 3600000;
        current = [...interval];
      }
    }

    if (current) downtimeHours += (current[1] - current[0]) / 3600000;
  }

  const equipmentWhere = ['1=1'];
  const equipmentParams = {};
  if (filtros.setor && hasColumn('equipamentos', 'setor')) {
    equipmentWhere.push("COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado')=@setor");
    equipmentParams.setor = filtros.setor;
  }
  if (filtros.equipamento_id) {
    equipmentWhere.push('e.id=@equipamento_id');
    equipmentParams.equipamento_id = Number(filtros.equipamento_id);
  }
  if (filtros.criticidade && hasColumn('equipamentos', 'criticidade')) {
    equipmentWhere.push("UPPER(COALESCE(e.criticidade,''))=@criticidade");
    equipmentParams.criticidade = filtros.criticidade;
  }
  if (filtros.ativo !== '' && hasColumn('equipamentos', 'ativo')) {
    equipmentWhere.push('COALESCE(e.ativo,1)=@ativo');
    equipmentParams.ativo = Number(filtros.ativo);
  } else if (hasColumn('equipamentos', 'ativo')) {
    equipmentWhere.push('COALESCE(e.ativo,1)=1');
  }

  const equipmentRow = safeGet(
    'confiabilidade_equipamentos_base',
    `SELECT COUNT(*) total FROM equipamentos e WHERE ${equipmentWhere.join(' AND ')}`,
    equipmentParams
  );
  const equipmentCount = Number(equipmentRow.total || 0);
  const totalPossibleHours = bounds.hours * equipmentCount;

  const equipamentoCoverage = Number(qualidade.os_com_equipamento_pct || 0);
  const classificationCoverage = Number(qualidade.corretivas_classificadas_pct || 0);
  const stopCoverage = Number(qualidade.paradas_com_intervalo_pct || 0);

  const mtbfAllowed = equipamentoCoverage >= 95 && classificationCoverage >= 85 && intervals.length > 0;
  const mttrAllowed = equipamentoCoverage >= 95 && stopCoverage >= 85 && mttrSamples > 0;
  const availabilityAllowed = mttrAllowed && totalPossibleHours > 0;

  const mtbfHours = mtbfAllowed ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null;
  const mttrHours = mttrAllowed ? repairHours / mttrSamples : null;
  const availability = availabilityAllowed
    ? Math.max(0, Math.min(100, ((totalPossibleHours - Math.min(downtimeHours, totalPossibleHours)) / totalPossibleHours) * 100))
    : null;

  const availableCount = [mtbfHours, mttrHours, availability].filter((value) => value !== null).length;
  const status = availableCount === 3 ? 'CONFIAVEL' : availableCount > 0 ? 'PARCIAL' : 'DADOS_INSUFICIENTES';
  const statusLabel = status === 'CONFIAVEL'
    ? 'Indicadores liberados'
    : status === 'PARCIAL'
      ? 'Indicadores parcialmente disponíveis'
      : 'Dados insuficientes';

  return {
    mtbf_horas: mtbfHours === null ? null : Math.round(mtbfHours * 10) / 10,
    mtbf_dias: mtbfHours === null ? null : Math.round((mtbfHours / 24) * 10) / 10,
    mtbf_amostras: intervals.length,
    mttr_horas: mttrHours === null ? null : Math.round(mttrHours * 10) / 10,
    mttr_amostras: mttrSamples,
    disponibilidade_pct: availability === null ? null : Math.round(availability * 10) / 10,
    horas_parada: validStops ? Math.round(downtimeHours * 10) / 10 : 0,
    equipamentos_base: equipmentCount,
    falhas_classificadas: falhas.length,
    paradas_validas: validStops,
    status,
    status_label: statusLabel,
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
  const confiabilidade = getReliabilityIndicators(filtros, qualidade);
  let custos = { totals: { comprado_centavos: 0, recebido_centavos: 0, pendente_centavos: 0, consumido_centavos: 0, equipamentos: 0 }, byEquipment: [], byMonth: [] };
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
    custo_consumido_centavos: Number(custos.totals?.consumido_centavos || 0),
    custo_comprado_centavos: Number(custos.totals?.comprado_centavos || 0),
    custo_recebido_centavos: Number(custos.totals?.recebido_centavos || 0),
    custo_pendente_recebimento_centavos: Number(custos.totals?.pendente_centavos || 0),
    equipamentos_com_custo: Number(custos.totals?.equipamentos || 0),
    mtbf_horas: confiabilidade.mtbf_horas,
    mtbf_dias: confiabilidade.mtbf_dias,
    mttr_horas: confiabilidade.mttr_horas,
    disponibilidade_pct: confiabilidade.disponibilidade_pct,
    horas_parada_registrada: confiabilidade.horas_parada,
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
    ...confiabilidade,
    qualidade_dados_pct: qualidade.score,
    status_qualidade: qualidade.status,
  };
  return dashboard;
}

module.exports = {
  getDashboard,
  getBacklogAging,
  getDataQuality,
  getReliabilityIndicators,
};
