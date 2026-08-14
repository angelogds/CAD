const db = require('../../database/db');
const aiService = require('../ai/ai.service');

const ACTIVE_OS = "'ABERTA','ANDAMENTO','EM_ANDAMENTO','PAUSADA'";
const CLOSED_OS = "'CONCLUIDA','FINALIZADA'";

function objectExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name=?").get(String(name || ''));
  } catch (_e) {
    return false;
  }
}

function columnExists(table, column) {
  if (!objectExists(table)) return false;
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  } catch (_e) {
    return false;
  }
}

function safeAll(sql, params = []) {
  try { return db.prepare(sql).all(...params); } catch (_e) { return []; }
}

function safeGet(sql, params = []) {
  try { return db.prepare(sql).get(...params) || {}; } catch (_e) { return {}; }
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePriority(value) {
  const text = String(value || 'MEDIA').trim().toUpperCase();
  if (text === 'CRÍTICA') return 'CRITICA';
  if (text === 'MÉDIA') return 'MEDIA';
  return ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'].includes(text) ? text : 'MEDIA';
}

function resolveFilters(input = {}) {
  const allowed = [7, 30, 90, 180, 365];
  const requested = Number(input.periodo_dias || input.dias || 30);
  return {
    periodo_dias: allowed.includes(requested) ? requested : 30,
    setor: String(input.setor || '').trim().slice(0, 120),
    prioridade: normalizePriority(input.prioridade || '') === 'MEDIA' && !input.prioridade ? '' : normalizePriority(input.prioridade),
    sla_dias: Math.max(1, Math.min(60, Number(input.sla_dias || 7) || 7)),
  };
}

function sectorClause(alias, filters, params) {
  if (!filters.setor || !columnExists('equipamentos', 'setor')) return '';
  params.push(filters.setor);
  return ` AND UPPER(COALESCE(${alias}.setor,'')) = UPPER(?)`;
}

function getOsSummary(filters) {
  if (!objectExists('os')) return {};
  const params = [filters.sla_dias, ...Array(5).fill(filters.periodo_dias)];
  const setor = sectorClause('e', filters, params);
  return safeGet(`
    SELECT
      SUM(CASE WHEN UPPER(COALESCE(o.status,''))='ABERTA' THEN 1 ELSE 0 END) AS abertas,
      SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ('ANDAMENTO','EM_ANDAMENTO') THEN 1 ELSE 0 END) AS andamento,
      SUM(CASE WHEN UPPER(COALESCE(o.status,''))='PAUSADA' THEN 1 ELSE 0 END) AS pausadas,
      SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN (${ACTIVE_OS}) THEN 1 ELSE 0 END) AS backlog,
      SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN (${ACTIVE_OS})
        AND datetime(o.opened_at) < datetime('now','-' || ? || ' day') THEN 1 ELSE 0 END) AS acima_sla,
      SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN (${CLOSED_OS})
        AND datetime(COALESCE(o.closed_at,o.data_fim,o.data_conclusao)) >= datetime('now','-' || ? || ' day') THEN 1 ELSE 0 END) AS concluidas,
      SUM(CASE WHEN UPPER(COALESCE(o.tipo,o.tipo_manutencao,''))='PREVENTIVA'
        AND datetime(o.opened_at) >= datetime('now','-' || ? || ' day') THEN 1 ELSE 0 END) AS preventivas,
      SUM(CASE WHEN UPPER(COALESCE(o.tipo,o.tipo_manutencao,''))='CORRETIVA'
        AND datetime(o.opened_at) >= datetime('now','-' || ? || ' day') THEN 1 ELSE 0 END) AS corretivas,
      SUM(CASE WHEN datetime(o.opened_at) >= datetime('now','-' || ? || ' day') THEN COALESCE(o.custo_total,0) ELSE 0 END) AS custo_os,
      AVG(CASE WHEN UPPER(COALESCE(o.status,'')) IN (${CLOSED_OS})
        AND COALESCE(o.closed_at,o.data_fim,o.data_conclusao) IS NOT NULL
        AND datetime(COALESCE(o.closed_at,o.data_fim,o.data_conclusao)) >= datetime('now','-' || ? || ' day')
        THEN (julianday(COALESCE(o.closed_at,o.data_fim,o.data_conclusao))-julianday(COALESCE(o.data_inicio,o.opened_at)))*24 END) AS mttr_horas
    FROM os o
    LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    WHERE 1=1 ${setor}
  `, params);
}

function getMtbf(filters) {
  if (!objectExists('os')) return { valor: null, amostras: 0 };
  const params = [filters.periodo_dias];
  const setor = sectorClause('e', filters, params);
  const rows = safeAll(`
    SELECT o.equipamento_id, o.opened_at
    FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    WHERE o.equipamento_id IS NOT NULL
      AND UPPER(COALESCE(o.tipo,o.tipo_manutencao,''))='CORRETIVA'
      AND datetime(o.opened_at) >= datetime('now','-' || ? || ' day') ${setor}
    ORDER BY o.equipamento_id, datetime(o.opened_at)
  `, params);
  let sum = 0;
  let count = 0;
  const previous = new Map();
  rows.forEach((row) => {
    const date = new Date(row.opened_at);
    const last = previous.get(row.equipamento_id);
    if (last && Number.isFinite(date.getTime()) && Number.isFinite(last.getTime())) {
      const days = (date - last) / 86400000;
      if (days >= 0) { sum += days; count += 1; }
    }
    previous.set(row.equipamento_id, date);
  });
  return { valor: count ? Math.round((sum / count) * 10) / 10 : null, amostras: count };
}

function getPreventiveSummary(filters) {
  if (!objectExists('preventiva_execucoes') || !objectExists('preventiva_planos')) {
    const planos = objectExists('pcm_planos') ? safeGet(`
      SELECT
        SUM(CASE WHEN ativo=1 THEN 1 ELSE 0 END) AS ativas,
        SUM(CASE WHEN ativo=1 AND date(proxima_data_prevista)<date('now','localtime') THEN 1 ELSE 0 END) AS vencidas,
        SUM(CASE WHEN ativo=1 AND date(proxima_data_prevista) BETWEEN date('now','localtime') AND date('now','+7 day','localtime') THEN 1 ELSE 0 END) AS proximas
      FROM pcm_planos
    `) : {};
    return { ativas: number(planos.ativas), vencidas: number(planos.vencidas), proximas: number(planos.proximas), concluidas: 0 };
  }
  const params = [filters.periodo_dias];
  const setor = sectorClause('e', filters, params);
  const row = safeGet(`
    SELECT
      COUNT(DISTINCT pp.id) AS ativas,
      SUM(CASE WHEN UPPER(COALESCE(pe.status,'')) IN ('PENDENTE','ATRASADA') AND date(pe.data_prevista)<date('now','localtime') THEN 1 ELSE 0 END) AS vencidas,
      SUM(CASE WHEN UPPER(COALESCE(pe.status,'')) IN ('PENDENTE','ATRASADA') AND date(pe.data_prevista) BETWEEN date('now','localtime') AND date('now','+7 day','localtime') THEN 1 ELSE 0 END) AS proximas,
      SUM(CASE WHEN UPPER(COALESCE(pe.status,'')) IN ('FINALIZADA','EXECUTADA','CONCLUIDA')
        AND datetime(COALESCE(pe.data_executada,pe.created_at)) >= datetime('now','-' || ? || ' day') THEN 1 ELSE 0 END) AS concluidas
    FROM preventiva_planos pp
    JOIN equipamentos e ON e.id=pp.equipamento_id
    LEFT JOIN preventiva_execucoes pe ON pe.plano_id=pp.id
    WHERE IFNULL(pp.ativo,1)=1 ${setor}
  `, params);
  return { ativas: number(row.ativas), vencidas: number(row.vencidas), proximas: number(row.proximas), concluidas: number(row.concluidas) };
}

function getPurchaseSummary(filters) {
  if (!objectExists('solicitacoes')) return { pendentes: 0, aguardando_material: 0, recebido_centavos: 0, comprometido_centavos: 0 };
  const params = [filters.periodo_dias];
  let setor = '';
  if (filters.setor) { setor = ' AND UPPER(COALESCE(s.setor_origem,\'\'))=UPPER(?)'; params.push(filters.setor); }
  const row = safeGet(`
    SELECT
      SUM(CASE WHEN UPPER(COALESCE(s.status,'')) NOT IN ('FECHADA','CANCELADA','RECEBIDA_TOTAL') THEN 1 ELSE 0 END) AS pendentes,
      SUM(CASE WHEN UPPER(COALESCE(s.status,'')) IN ('COMPRADA','EM_RECEBIMENTO','RECEBIDA_PARCIAL') THEN 1 ELSE 0 END) AS aguardando_material
    FROM solicitacoes s
    WHERE datetime(s.created_at) >= datetime('now','-' || ? || ' day') ${setor}
  `, params);
  let costs = {};
  if (objectExists('vw_compras_custos_os')) {
    costs = safeGet(`
      SELECT SUM(v.comprometido_centavos) AS comprometido_centavos,
             SUM(v.recebido_centavos) AS recebido_centavos
      FROM vw_compras_custos_os v
      JOIN solicitacoes s ON s.id=v.solicitacao_id
      WHERE datetime(s.created_at) >= datetime('now','-' || ? || ' day') ${setor}
    `, params);
  }
  return {
    pendentes: number(row.pendentes),
    aguardando_material: number(row.aguardando_material),
    recebido_centavos: number(costs.recebido_centavos),
    comprometido_centavos: number(costs.comprometido_centavos),
  };
}

function getWorkQueue(filters, limit = 12) {
  if (!objectExists('os')) return [];
  const params = [];
  const setor = sectorClause('e', filters, params);
  let prioridade = '';
  if (filters.prioridade) { prioridade = ' AND UPPER(COALESCE(o.prioridade,o.grau,\'MEDIA\'))=UPPER(?)'; params.push(filters.prioridade); }
  params.push(Math.max(1, Math.min(30, Number(limit) || 12)));
  return safeAll(`
    SELECT o.id, COALESCE(e.nome,o.equipamento,'Sem equipamento') AS equipamento,
      COALESCE(e.setor,'Setor não informado') AS setor,
      UPPER(COALESCE(o.status,'ABERTA')) AS status,
      UPPER(COALESCE(o.prioridade,o.grau,'MEDIA')) AS prioridade,
      UPPER(COALESCE(o.tipo,o.tipo_manutencao,'CORRETIVA')) AS tipo,
      o.opened_at,
      CAST(julianday('now','localtime')-julianday(o.opened_at) AS INTEGER) AS dias_aberta,
      COALESCE(u.name,'Não atribuído') AS responsavel,
      CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS possui_solicitacao,
      COALESCE(s.status,'') AS status_solicitacao
    FROM os o
    LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    LEFT JOIN users u ON u.id=COALESCE(o.mecanico_user_id,o.responsavel_user_id)
    LEFT JOIN solicitacoes s ON s.os_id=o.id AND UPPER(COALESCE(s.status,'')) NOT IN ('FECHADA','CANCELADA')
    WHERE UPPER(COALESCE(o.status,'')) IN (${ACTIVE_OS}) ${setor} ${prioridade}
    GROUP BY o.id
    ORDER BY CASE UPPER(COALESCE(o.prioridade,o.grau,'MEDIA'))
      WHEN 'CRITICA' THEN 1 WHEN 'CRÍTICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 WHEN 'MÉDIA' THEN 3 ELSE 4 END,
      CASE UPPER(COALESCE(o.status,'')) WHEN 'PAUSADA' THEN 1 ELSE 2 END,
      datetime(o.opened_at) ASC
    LIMIT ?
  `, params).map((row) => ({ ...row, prioridade: normalizePriority(row.prioridade), acima_sla: number(row.dias_aberta) > filters.sla_dias }));
}

function getRiskRows(filters, limit = 6) {
  if (!objectExists('equipamento_risco_scores')) return [];
  const params = [];
  const setor = sectorClause('e', filters, params);
  params.push(Math.max(1, Math.min(20, Number(limit) || 6)));
  return safeAll(`
    SELECT r.*, e.nome AS equipamento, e.setor
    FROM equipamento_risco_scores r
    JOIN equipamentos e ON e.id=r.equipamento_id
    WHERE IFNULL(e.ativo,1)=1 ${setor}
    ORDER BY r.score_risco DESC, e.nome ASC LIMIT ?
  `, params);
}

function getHighRiskCount(filters) {
  if (!objectExists('equipamento_risco_scores')) return 0;
  const params = [];
  const setor = sectorClause('e', filters, params);
  const row = safeGet(`
    SELECT COUNT(*) AS total
    FROM equipamento_risco_scores r
    JOIN equipamentos e ON e.id=r.equipamento_id
    WHERE IFNULL(e.ativo,1)=1 ${setor}
      AND UPPER(COALESCE(r.classificacao_risco,'')) IN ('ALTO','CRITICO','CRÍTICO')
  `, params);
  return number(row.total);
}

function getPlans(filters, limit = 8) {
  if (!objectExists('pcm_planos')) return [];
  const params = [];
  const setor = sectorClause('e', filters, params);
  params.push(Math.max(1, Math.min(20, Number(limit) || 8)));
  return safeAll(`
    SELECT p.id, p.equipamento_id, e.nome AS equipamento, e.setor, p.atividade_descricao,
      p.tipo_manutencao, p.proxima_data_prevista,
      CASE WHEN p.proxima_data_prevista IS NULL THEN 'SEM_DATA'
        WHEN date(p.proxima_data_prevista)<date('now','localtime') THEN 'ATRASADO'
        WHEN date(p.proxima_data_prevista)<=date('now','+7 day','localtime') THEN 'PROXIMO'
        ELSE 'NO_PRAZO' END AS situacao
    FROM pcm_planos p JOIN equipamentos e ON e.id=p.equipamento_id
    WHERE p.ativo=1 ${setor}
    ORDER BY CASE WHEN p.proxima_data_prevista IS NULL THEN 2 ELSE 1 END, date(p.proxima_data_prevista), p.id
    LIMIT ?
  `, params);
}

function getAlerts(limit = 8) {
  if (!objectExists('alertas_operacionais')) return [];
  return safeAll(`
    SELECT id,tipo,severidade,entidade_tipo,entidade_id,mensagem,status,created_at
    FROM alertas_operacionais
    WHERE UPPER(COALESCE(status,''))='NAO_LIDO'
    ORDER BY CASE UPPER(severidade) WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END,
      datetime(created_at) DESC LIMIT ?
  `, [Math.max(1, Math.min(30, Number(limit) || 8))]);
}

function getStatusDistribution(filters) {
  if (!objectExists('os')) return [];
  const params = [filters.periodo_dias];
  const setor = sectorClause('e', filters, params);
  return safeAll(`
    SELECT UPPER(COALESCE(o.status,'SEM STATUS')) AS status, COUNT(*) AS total
    FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    WHERE datetime(o.opened_at) >= datetime('now','-' || ? || ' day') ${setor}
    GROUP BY UPPER(COALESCE(o.status,'SEM STATUS')) ORDER BY total DESC
  `, params);
}

function getOverview(input = {}, userId = null) {
  const filters = resolveFilters(input);
  const os = getOsSummary(filters);
  const preventive = getPreventiveSummary(filters);
  const purchases = getPurchaseSummary(filters);
  const mtbf = getMtbf(filters);
  const totalTypes = number(os.preventivas) + number(os.corretivas);
  const risks = getRiskRows(filters);
  const analysis = getLatestAnalysis(filters);
  return {
    filtros: filters,
    cards: {
      backlog: number(os.backlog),
      abertas: number(os.abertas),
      andamento: number(os.andamento),
      pausadas: number(os.pausadas),
      acima_sla: number(os.acima_sla),
      concluidas: number(os.concluidas),
      preventivas_proximas: preventive.proximas,
      preventivas_vencidas: preventive.vencidas,
      solicitacoes_pendentes: purchases.pendentes,
      aguardando_material: purchases.aguardando_material,
      riscos_altos: getHighRiskCount(filters),
      custo_os: number(os.custo_os),
      custo_materiais_recebidos: purchases.recebido_centavos / 100,
      custo_materiais_comprometidos: purchases.comprometido_centavos / 100,
      mttr_horas: number(os.mttr_horas) > 0 ? Math.round(number(os.mttr_horas) * 10) / 10 : null,
      mtbf_dias: mtbf.valor,
      mtbf_amostras: mtbf.amostras,
      preventiva_pct: totalTypes ? Math.round(number(os.preventivas) * 1000 / totalTypes) / 10 : 0,
      corretiva_pct: totalTypes ? Math.round(number(os.corretivas) * 1000 / totalTypes) / 10 : 0,
    },
    fila: getWorkQueue(filters),
    riscos: risks,
    planos: getPlans(filters),
    alertas: getAlerts(),
    distribuicao_status: getStatusDistribution(filters),
    preventivas: preventive,
    analise_ia: analysis,
    atualizado_em: new Date().toISOString(),
    user_id: userId || null,
  };
}

function buildLocalAnalysis(overview) {
  const c = overview.cards;
  const priorities = [];
  if (c.acima_sla) priorities.push({ nivel: 'ALTA', titulo: `${c.acima_sla} OS acima do SLA interno`, motivo: `Ordens abertas há mais de ${overview.filtros.sla_dias} dias.`, acao: 'Revisar a fila, definir responsável e registrar impedimentos.' });
  if (c.preventivas_vencidas) priorities.push({ nivel: 'ALTA', titulo: `${c.preventivas_vencidas} preventiva(s) vencida(s)`, motivo: 'Datas previstas já foram ultrapassadas.', acao: 'Reprogramar ou executar as preventivas antes de abrir novas atividades de menor prioridade.' });
  if (c.aguardando_material) priorities.push({ nivel: 'MEDIA', titulo: `${c.aguardando_material} solicitação(ões) aguardando material`, motivo: 'O andamento depende do fluxo de Compras/Almoxarifado.', acao: 'Acompanhar previsão de entrega e atualizar a OS vinculada.' });
  if (!priorities.length) priorities.push({ nivel: 'BAIXA', titulo: 'Fluxo sem bloqueios críticos detectados', motivo: 'As regras locais não encontraram exceções relevantes.', acao: 'Manter a programação semanal e revisar os indicadores no próximo ciclo.' });
  return {
    resumo: `Backlog atual de ${c.backlog} OS, com ${c.preventiva_pct}% de intervenções preventivas no período.`,
    prioridades: priorities.slice(0, 5),
    recomendacoes: [
      'Tratar primeiro as OS críticas/altas, pausadas e acima do SLA.',
      'Validar as datas das preventivas e os materiais pendentes antes de fechar a programação semanal.',
      'Registrar início e fim reais das execuções para melhorar MTTR e MTBF.',
    ],
    observacoes_confiabilidade: [
      c.mtbf_amostras ? `MTBF calculado com ${c.mtbf_amostras} intervalo(s) entre falhas.` : 'MTBF indisponível por falta de intervalos suficientes entre falhas.',
      c.mttr_horas ? 'MTTR calculado com datas reais de início e conclusão.' : 'MTTR indisponível por falta de datas completas de execução.',
    ],
  };
}

function compactAIInput(overview) {
  return {
    periodo_dias: overview.filtros.periodo_dias,
    setor: overview.filtros.setor || 'Todos',
    sla_dias: overview.filtros.sla_dias,
    indicadores: overview.cards,
    fila_prioritaria: overview.fila.slice(0, 10).map((row) => ({
      os_id: row.id, equipamento: row.equipamento, status: row.status,
      prioridade: row.prioridade, dias_aberta: row.dias_aberta,
      possui_solicitacao: Boolean(row.possui_solicitacao),
    })),
    equipamentos_risco: overview.riscos.slice(0, 8).map((row) => ({
      equipamento: row.equipamento, score: row.score_risco,
      classe: row.classificacao_risco, falhas_180d: row.falhas_180d,
      preventivas_atrasadas: row.preventivas_atrasadas,
    })),
  };
}

function saveAnalysis({ userId, filters, input, result, origem, status = 'CONCLUIDA', errorCode = null }) {
  if (!objectExists('pcm_ai_analises')) return null;
  const info = db.prepare(`
    INSERT INTO pcm_ai_analises
      (user_id,periodo_dias,setor,origem,status,entrada_resumo_json,resultado_json,erro_codigo,created_at)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'))
  `).run(userId || null, filters.periodo_dias, filters.setor || null, origem, status, JSON.stringify(input || {}), JSON.stringify(result || {}), errorCode);
  return Number(info.lastInsertRowid);
}

function getLatestAnalysis(filtersInput = {}) {
  if (!objectExists('pcm_ai_analises')) return null;
  const filters = resolveFilters(filtersInput);
  const row = safeGet(`
    SELECT * FROM pcm_ai_analises
    WHERE periodo_dias=? AND COALESCE(setor,'')=?
    ORDER BY datetime(created_at) DESC,id DESC LIMIT 1
  `, [filters.periodo_dias, filters.setor]);
  if (!row.id) return null;
  try {
    return { ...JSON.parse(row.resultado_json || '{}'), origem: row.origem, status: row.status, created_at: row.created_at, erro_codigo: row.erro_codigo || null };
  } catch (_e) { return null; }
}

async function generateAIAnalysis(filtersInput = {}, userId = null) {
  const overview = getOverview(filtersInput, userId);
  const input = compactAIInput(overview);
  const local = buildLocalAnalysis(overview);
  try {
    const result = await aiService.askJSONSchemaStrict({
      model: process.env.OPENAI_MODEL_PCM || process.env.OPENAI_MODEL_TEXT,
      schemaName: 'pcm_analise_operacional',
      systemPrompt: [
        'Você é um planejador de manutenção industrial (PCM).',
        'Analise somente os indicadores agregados fornecidos; não invente fatos, prazos, custos ou causas.',
        'Não autorize nem execute ações. Produza recomendações para validação humana.',
        'Priorize segurança, criticidade, atraso, preventivas vencidas e dependências de materiais.',
        'Responda em português-BR estritamente no schema solicitado.',
      ].join(' '),
      userPayload: input,
      schema: {
        type: 'object', additionalProperties: false,
        required: ['resumo','prioridades','recomendacoes','observacoes_confiabilidade'],
        properties: {
          resumo: { type: 'string' },
          prioridades: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['nivel','titulo','motivo','acao'], properties: {
            nivel: { type: 'string', enum: ['CRITICA','ALTA','MEDIA','BAIXA'] }, titulo: { type: 'string' }, motivo: { type: 'string' }, acao: { type: 'string' },
          } } },
          recomendacoes: { type: 'array', maxItems: 6, items: { type: 'string' } },
          observacoes_confiabilidade: { type: 'array', maxItems: 4, items: { type: 'string' } },
        },
      },
      maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS_PCM || 700),
      temperature: 0.1,
    });
    saveAnalysis({ userId, filters: overview.filtros, input, result, origem: 'OPENAI' });
    return { ...result, origem: 'OPENAI' };
  } catch (error) {
    saveAnalysis({ userId, filters: overview.filtros, input, result: local, origem: 'LOCAL', status: 'FALLBACK', errorCode: String(error?.code || 'AI_ERROR') });
    return { ...local, origem: 'LOCAL', status: 'FALLBACK', erro_codigo: String(error?.code || 'AI_ERROR') };
  }
}

function logOperationalCycle(type, userId, result = {}) {
  if (!objectExists('pcm_ciclos_operacionais')) return;
  db.prepare(`INSERT INTO pcm_ciclos_operacionais(tipo,user_id,resultado_json,created_at) VALUES (?,?,?,datetime('now'))`)
    .run(String(type || 'ATUALIZACAO'), userId || null, JSON.stringify(result || {}));
}

function mondayFrom(value) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  const safe = Number.isFinite(date.getTime()) ? date : new Date();
  const day = safe.getDay() || 7;
  safe.setDate(safe.getDate() - day + 1);
  return safe.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function listMechanics() {
  if (!objectExists('users')) return [];
  return safeAll(`
    SELECT id,name,role,funcao FROM users
    WHERE IFNULL(ativo,1)=1 AND (
      UPPER(COALESCE(role,'')) IN ('MECANICO','MECANICO_INDUSTRIAL','SUPERVISOR_MANUTENCAO','ADMIN')
      OR UPPER(COALESCE(funcao,'')) LIKE '%MECAN%'
    ) ORDER BY name
  `);
}

function getWeeklySchedule(input = {}) {
  const weekStart = mondayFrom(input.semana_inicio || input.semana);
  const weekEnd = addDays(weekStart, 6);
  const schedule = objectExists('pcm_programacao_semanal') ? safeAll(`
    SELECT p.*,o.equipamento_id,COALESCE(e.nome,o.equipamento,'Sem equipamento') AS equipamento,
      COALESCE(e.setor,'Setor não informado') AS setor,
      UPPER(COALESCE(o.prioridade,o.grau,'MEDIA')) AS prioridade,
      UPPER(COALESCE(o.status,'ABERTA')) AS os_status,
      COALESCE(u.name,'Não atribuído') AS responsavel
    FROM pcm_programacao_semanal p
    JOIN os o ON o.id=p.os_id LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    LEFT JOIN users u ON u.id=p.responsavel_user_id
    WHERE date(p.data_programada) BETWEEN date(?) AND date(?)
      AND UPPER(COALESCE(p.status,''))<>'CANCELADA'
    ORDER BY date(p.data_programada),responsavel,equipamento
  `, [weekStart, weekEnd]) : [];
  return { semana_inicio: weekStart, semana_fim: weekEnd, dias: Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), itens: schedule, mecanicos: listMechanics() };
}

function scheduleBacklogItem(osId, payload = {}, userId = null) {
  if (!objectExists('pcm_programacao_semanal')) throw new Error('Execute as migrações do banco antes de programar a OS.');
  const id = Number(osId);
  const os = safeGet(`SELECT id,status FROM os WHERE id=?`, [id]);
  if (!os.id || ![ 'ABERTA','ANDAMENTO','EM_ANDAMENTO','PAUSADA' ].includes(String(os.status || '').toUpperCase())) throw new Error('OS ativa não encontrada para programação.');
  const date = String(payload.data_programada || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Informe uma data válida para a programação.');
  const hours = Math.max(0.5, Math.min(72, Number(payload.horas_estimadas || 2) || 2));
  const responsible = Number(payload.responsavel_user_id || 0) || null;
  db.prepare(`
    INSERT INTO pcm_programacao_semanal
      (os_id,data_programada,responsavel_user_id,horas_estimadas,status,observacao,created_by,updated_by,created_at,updated_at)
    VALUES (?,?,?,?, 'PROGRAMADA', ?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(os_id) DO UPDATE SET data_programada=excluded.data_programada,
      responsavel_user_id=excluded.responsavel_user_id,horas_estimadas=excluded.horas_estimadas,
      status='PROGRAMADA',observacao=excluded.observacao,updated_by=excluded.updated_by,updated_at=datetime('now')
  `).run(id, date, responsible, hours, String(payload.observacao || '').trim().slice(0, 500) || null, userId || null, userId || null);
  return { os_id: id, data_programada: date, responsavel_user_id: responsible, horas_estimadas: hours };
}

module.exports = {
  resolveFilters,
  getOverview,
  generateAIAnalysis,
  logOperationalCycle,
  getWeeklySchedule,
  listMechanics,
  scheduleBacklogItem,
  buildLocalAnalysis,
};
