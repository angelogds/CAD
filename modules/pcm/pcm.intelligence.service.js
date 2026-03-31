const db = require('../../database/db');
const osService = require('../os/os.service');

function tableExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(String(name || ''));
  } catch (_e) {
    return false;
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalizeCriticidadePeso(valor) {
  const txt = String(valor || '').trim().toUpperCase();
  if (['CRITICA', 'CRÍTICA', 'ALTA'].includes(txt)) return 1;
  if (txt === 'MEDIA' || txt === 'MÉDIA') return 0.6;
  if (txt === 'BAIXA') return 0.3;
  return 0.5;
}

function classificarRisco(score) {
  const n = Number(score || 0);
  if (n >= 70) return 'ALTO';
  if (n >= 40) return 'MEDIO';
  return 'BAIXO';
}

function calcularScoreRiscoEquipamento(equipamentoId) {
  const id = Number(equipamentoId);
  if (!id) return null;

  const ultimos180d = db.prepare(`
    SELECT
      SUM(CASE WHEN UPPER(COALESCE(tipo,''))='CORRETIVA' THEN 1 ELSE 0 END) AS falhas,
      SUM(CASE WHEN UPPER(COALESCE(tipo,''))='CORRETIVA' AND datetime(opened_at) >= datetime('now','-30 day') THEN 1 ELSE 0 END) AS falhas_30,
      SUM(COALESCE(custo_total,0)) AS custo_total,
      MAX(COALESCE(closed_at, opened_at)) AS ultima_manutencao,
      SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('ABERTA','ANDAMENTO','EM_ANDAMENTO','PAUSADA') THEN 1 ELSE 0 END) AS backlog_aberto
    FROM os
    WHERE equipamento_id = ?
      AND datetime(opened_at) >= datetime('now','-180 day')
  `).get(id) || {};

  const reincidencia = db.prepare(`
    SELECT COUNT(*) AS total
    FROM (
      SELECT LOWER(TRIM(COALESCE(sintoma_principal,''))) AS sintoma
      FROM os
      WHERE equipamento_id = ?
        AND UPPER(COALESCE(tipo,''))='CORRETIVA'
        AND datetime(opened_at) >= datetime('now','-180 day')
      GROUP BY LOWER(TRIM(COALESCE(sintoma_principal,'')))
      HAVING COUNT(*) >= 2 AND sintoma <> ''
    ) t
  `).get(id)?.total || 0;

  const preventivasAtrasadas = tableExists('preventiva_execucoes')
    ? db.prepare(`
      SELECT COUNT(*) AS total
      FROM preventiva_execucoes pe
      INNER JOIN preventiva_planos pp ON pp.id = pe.plano_id
      WHERE pp.equipamento_id = ?
        AND UPPER(COALESCE(pe.status,'')) IN ('PENDENTE','ATRASADA')
        AND date(COALESCE(pe.data_prevista,'')) < date('now','localtime')
    `).get(id)?.total || 0
    : 0;

  const eq = db.prepare(`SELECT criticidade, nome FROM equipamentos WHERE id=?`).get(id) || {};
  const diasSemManutencao = ultimos180d.ultima_manutencao
    ? Math.max(0, Math.floor((Date.now() - new Date(ultimos180d.ultima_manutencao).getTime()) / 86400000))
    : 365;

  const scoreFalhas = clamp((Number(ultimos180d.falhas || 0) * 7) + (Number(ultimos180d.falhas_30 || 0) * 4), 0, 30);
  const scoreReincidencia = clamp(Number(reincidencia || 0) * 10, 0, 20);
  const scoreCusto = clamp(Number(ultimos180d.custo_total || 0) / 800, 0, 15);
  const scoreTempo = clamp(diasSemManutencao / 4, 0, 15);
  const scorePreventiva = clamp(Number(preventivasAtrasadas || 0) * 7, 0, 14);
  const scoreCriticidade = Math.round(normalizeCriticidadePeso(eq.criticidade) * 6);

  const scoreFinal = clamp(
    Math.round(scoreFalhas + scoreReincidencia + scoreCusto + scoreTempo + scorePreventiva + scoreCriticidade),
    0,
    100
  );

  return {
    equipamento_id: id,
    equipamento_nome: eq.nome || `Equipamento ${id}`,
    score_risco: scoreFinal,
    classificacao_risco: classificarRisco(scoreFinal),
    falhas_180d: Number(ultimos180d.falhas || 0),
    reincidencia: Number(reincidencia || 0),
    custo_acumulado: Number(ultimos180d.custo_total || 0),
    dias_sem_manutencao: Number(diasSemManutencao || 0),
    preventivas_atrasadas: Number(preventivasAtrasadas || 0),
    criticidade_base: String(eq.criticidade || 'MEDIA').toUpperCase(),
    backlog_aberto: Number(ultimos180d.backlog_aberto || 0),
  };
}

function persistirScoreRisco(risco) {
  if (!risco || !tableExists('equipamento_risco_scores')) return risco;
  db.prepare(`
    INSERT INTO equipamento_risco_scores (
      equipamento_id, score_risco, classificacao_risco, falhas_180d, reincidencia, custo_acumulado,
      dias_sem_manutencao, preventivas_atrasadas, criticidade_base, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(equipamento_id) DO UPDATE SET
      score_risco=excluded.score_risco,
      classificacao_risco=excluded.classificacao_risco,
      falhas_180d=excluded.falhas_180d,
      reincidencia=excluded.reincidencia,
      custo_acumulado=excluded.custo_acumulado,
      dias_sem_manutencao=excluded.dias_sem_manutencao,
      preventivas_atrasadas=excluded.preventivas_atrasadas,
      criticidade_base=excluded.criticidade_base,
      atualizado_em=datetime('now')
  `).run(
    risco.equipamento_id,
    risco.score_risco,
    risco.classificacao_risco,
    risco.falhas_180d,
    risco.reincidencia,
    risco.custo_acumulado,
    risco.dias_sem_manutencao,
    risco.preventivas_atrasadas,
    risco.criticidade_base
  );
  return risco;
}

function criarAlertaOperacional(payload = {}) {
  if (!tableExists('alertas_operacionais')) return null;
  const tipo = String(payload.tipo || 'GERAL').toUpperCase();
  const chave = `${tipo}:${payload.entidade_tipo || '-'}:${payload.entidade_id || '-'}:${payload.regra_geradora_id || '-'}`;
  const existe = db.prepare(`
    SELECT id FROM alertas_operacionais
    WHERE chave_unica = ? AND status = 'NAO_LIDO'
    LIMIT 1
  `).get(chave);
  if (existe) return Number(existe.id);

  const info = db.prepare(`
    INSERT INTO alertas_operacionais (
      tipo, severidade, entidade_tipo, entidade_id, responsavel_user_id, mensagem,
      status, metadata_json, regra_geradora_id, chave_unica, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'NAO_LIDO', ?, ?, ?, datetime('now'))
  `).run(
    tipo,
    String(payload.severidade || 'MEDIA').toUpperCase(),
    payload.entidade_tipo || null,
    payload.entidade_id ? Number(payload.entidade_id) : null,
    payload.responsavel_user_id ? Number(payload.responsavel_user_id) : null,
    String(payload.mensagem || '').trim() || tipo,
    payload.metadata_json ? JSON.stringify(payload.metadata_json) : null,
    payload.regra_geradora_id ? Number(payload.regra_geradora_id) : null,
    chave
  );
  return Number(info.lastInsertRowid);
}

function getOuCriarRegra(nome, gatilho, config = {}) {
  if (!tableExists('regras_automacao_os')) return null;
  const key = String(nome || '').trim().toUpperCase();
  let regra = db.prepare(`SELECT * FROM regras_automacao_os WHERE nome = ? LIMIT 1`).get(key);
  if (regra) return regra;

  const info = db.prepare(`
    INSERT INTO regras_automacao_os (nome, gatilho, ativo, configuracao_json, created_at, updated_at)
    VALUES (?, ?, 1, ?, datetime('now'), datetime('now'))
  `).run(key, String(gatilho || key).toUpperCase(), JSON.stringify(config || {}));
  regra = db.prepare(`SELECT * FROM regras_automacao_os WHERE id = ?`).get(Number(info.lastInsertRowid));
  return regra;
}

function existeOSAutomaticaAberta({ equipamentoId, regraId, preventivaExecucaoId }) {
  return !!db.prepare(`
    SELECT id
    FROM os
    WHERE equipamento_id = ?
      AND UPPER(COALESCE(status,'')) IN ('ABERTA','ANDAMENTO','EM_ANDAMENTO','PAUSADA')
      AND UPPER(COALESCE(origem,'')) IN ('AUTOMACAO','PREVENTIVA')
      AND (
        ( ? IS NOT NULL AND regra_geradora_id = ? )
        OR ( ? IS NOT NULL AND preventiva_execucao_id = ? )
      )
    LIMIT 1
  `).get(Number(equipamentoId), regraId || null, regraId || null, preventivaExecucaoId || null, preventivaExecucaoId || null);
}

function gerarOSAutomaticaPreventiva(execucao, regra, userId = null) {
  if (!execucao?.equipamento_id) return null;
  if (existeOSAutomaticaAberta({ equipamentoId: execucao.equipamento_id, regraId: regra?.id, preventivaExecucaoId: execucao.id })) {
    return null;
  }

  const osId = osService.createOSAutomatica({
    equipamento_id: execucao.equipamento_id,
    descricao: `Preventiva ${execucao.status} (${execucao.titulo || 'Plano'}) - prevista para ${execucao.data_prevista || 'sem data'}`,
    tipo: 'PREVENTIVA',
    prioridade: execucao.criticidade || 'MEDIA',
    opened_by: userId,
    origem: 'AUTOMACAO',
    regra_geradora_id: regra?.id || null,
    preventiva_execucao_id: execucao.id,
    metadata: { gatilho: regra?.gatilho || 'PREVENTIVA', preventiva_execucao_id: execucao.id },
  });

  criarAlertaOperacional({
    tipo: 'OS_AUTOMATICA_GERADA',
    severidade: 'MEDIA',
    entidade_tipo: 'OS',
    entidade_id: osId,
    mensagem: `OS automática #${osId} gerada para preventiva ${execucao.status.toLowerCase()} do equipamento ${execucao.equipamento_nome}.`,
    regra_geradora_id: regra?.id || null,
    metadata_json: { os_id: osId, preventiva_execucao_id: execucao.id },
  });

  return osId;
}

function processarAutomacaoOS({ userId = null } = {}) {
  if (!tableExists('preventiva_execucoes') || !tableExists('preventiva_planos')) return { geradas: 0, riscosAltos: 0 };

  const regraAtrasada = getOuCriarRegra('PREVENTIVA_VENCIDA', 'PREVENTIVA_VENCIDA', { dias_antecedencia: 0 });
  const regraProxima = getOuCriarRegra('PREVENTIVA_PROXIMA_VENCIMENTO', 'PREVENTIVA_PROXIMA_VENCIMENTO', { dias_antecedencia: 3 });
  const regraRisco = getOuCriarRegra('RISCO_ALTO_EQUIPAMENTO', 'RISCO_ALTO_EQUIPAMENTO', { score_minimo: 70 });

  const preventivasPendentes = db.prepare(`
    SELECT pe.id, pe.status, pe.data_prevista, pe.criticidade,
           pp.equipamento_id, pp.titulo, e.nome AS equipamento_nome
    FROM preventiva_execucoes pe
    JOIN preventiva_planos pp ON pp.id = pe.plano_id
    JOIN equipamentos e ON e.id = pp.equipamento_id
    WHERE UPPER(COALESCE(pe.status,'')) IN ('PENDENTE','ATRASADA')
      AND (
        date(COALESCE(pe.data_prevista,'')) < date('now','localtime')
        OR date(COALESCE(pe.data_prevista,'')) <= date('now','+3 day','localtime')
      )
    ORDER BY date(COALESCE(pe.data_prevista,'')) ASC, pe.id ASC
    LIMIT 60
  `).all();

  let geradas = 0;
  for (const row of preventivasPendentes) {
    const isAtrasada = row.data_prevista && row.data_prevista < new Date().toISOString().slice(0, 10);
    const regra = isAtrasada ? regraAtrasada : regraProxima;
    const osId = gerarOSAutomaticaPreventiva(row, regra, userId);
    if (osId) geradas += 1;
    if (isAtrasada) {
      criarAlertaOperacional({
        tipo: 'PREVENTIVA_VENCIDA',
        severidade: 'ALTA',
        entidade_tipo: 'EQUIPAMENTO',
        entidade_id: row.equipamento_id,
        mensagem: `Preventiva vencida para ${row.equipamento_nome} (prevista em ${row.data_prevista || 'sem data'}).`,
        regra_geradora_id: regraAtrasada?.id || null,
      });
    }
  }

  const riscos = atualizarScoresRiscoEquipamentos();
  const altos = riscos.filter((r) => r.classificacao_risco === 'ALTO');
  for (const risco of altos) {
    criarAlertaOperacional({
      tipo: 'RISCO_ALTO_EQUIPAMENTO',
      severidade: 'ALTA',
      entidade_tipo: 'EQUIPAMENTO',
      entidade_id: risco.equipamento_id,
      mensagem: `Risco alto (${risco.score_risco}/100) detectado para ${risco.equipamento_nome}.`,
      regra_geradora_id: regraRisco?.id || null,
      metadata_json: risco,
    });
  }

  return { geradas, riscosAltos: altos.length };
}

function atualizarScoresRiscoEquipamentos() {
  const equipamentos = db.prepare(`SELECT id FROM equipamentos WHERE IFNULL(ativo,1)=1 ORDER BY id`).all();
  return equipamentos
    .map((eq) => persistirScoreRisco(calcularScoreRiscoEquipamento(eq.id)))
    .filter(Boolean)
    .sort((a, b) => b.score_risco - a.score_risco);
}

function listarAlertas({ limit = 25, status = '' } = {}) {
  if (!tableExists('alertas_operacionais')) return [];
  const where = [];
  const params = [];
  if (status) {
    where.push('UPPER(COALESCE(status,\'\')) = UPPER(?)');
    params.push(String(status));
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`
    SELECT *
    FROM alertas_operacionais
    ${sqlWhere}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(...params, Number(limit) || 25);
}

function getRankingTecnicos({ dias = 90, setor = '' } = {}) {
  const whereSetor = setor ? 'AND UPPER(COALESCE(e.setor,\'\')) = UPPER(?)' : '';
  const params = setor ? [Number(dias) || 90, String(setor)] : [Number(dias) || 90];

  const rows = db.prepare(`
    SELECT
      ex.executor_user_id AS user_id,
      u.name AS tecnico,
      COUNT(DISTINCT ex.os_id) AS os_concluidas,
      AVG(CASE WHEN ex.iniciado_em IS NOT NULL AND ex.finalizado_em IS NOT NULL THEN (julianday(ex.finalizado_em)-julianday(ex.iniciado_em))*24*60 END) AS tempo_medio_min,
      SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ('CONCLUIDA','FINALIZADA') THEN 1 ELSE 0 END) AS finalizadas,
      SUM(CASE WHEN date(COALESCE(o.closed_at,o.data_fim,'')) <= date(COALESCE(o.data_conclusao,o.closed_at,o.data_fim,'')) THEN 1 ELSE 0 END) AS dentro_prazo,
      SUM(COALESCE(o.custo_total,0)) AS custo_total
    FROM os_execucoes ex
    JOIN os o ON o.id = ex.os_id
    LEFT JOIN equipamentos e ON e.id = o.equipamento_id
    LEFT JOIN users u ON u.id = ex.executor_user_id
    WHERE ex.executor_user_id IS NOT NULL
      AND ex.finalizado_em IS NOT NULL
      AND datetime(ex.iniciado_em) >= datetime('now', '-' || ? || ' day')
      ${whereSetor}
    GROUP BY ex.executor_user_id, u.name
    HAVING COUNT(DISTINCT ex.os_id) > 0
    ORDER BY os_concluidas DESC
  `).all(...params);

  return rows.map((row) => {
    const osConcluidas = Number(row.os_concluidas || 0);
    const tempoMedioMin = Number(row.tempo_medio_min || 0);
    const prazoRate = osConcluidas ? Number(row.dentro_prazo || 0) / osConcluidas : 0;

    const preventivasExecutadas = tableExists('preventiva_execucoes')
      ? (db.prepare(`
          SELECT COUNT(*) AS total
          FROM preventiva_execucoes
          WHERE (responsavel_1_id = ? OR responsavel_2_id = ? OR finalizada_por_user_id = ?)
            AND UPPER(COALESCE(status,'')) IN ('FINALIZADA','EXECUTADA','CONCLUIDA')
            AND datetime(COALESCE(finalizada_em, data_executada, created_at)) >= datetime('now', '-' || ? || ' day')
        `).get(Number(row.user_id), Number(row.user_id), Number(row.user_id), Number(dias) || 90)?.total || 0)
      : 0;

    const reincidencia = db.prepare(`
      SELECT COUNT(*) AS total FROM (
        SELECT LOWER(TRIM(COALESCE(sintoma_principal,''))) AS sintoma
        FROM os
        WHERE opened_by = ?
          AND UPPER(COALESCE(tipo,''))='CORRETIVA'
          AND datetime(opened_at) >= datetime('now','-' || ? || ' day')
        GROUP BY LOWER(TRIM(COALESCE(sintoma_principal,'')))
        HAVING COUNT(*) >= 2 AND sintoma <> ''
      ) x
    `).get(Number(row.user_id), Number(dias) || 90)?.total || 0;

    const base =
      clamp(osConcluidas * 3, 0, 35) +
      clamp(prazoRate * 25, 0, 25) +
      clamp(preventivasExecutadas * 2, 0, 20) +
      clamp(20 - (tempoMedioMin / 20), 0, 15) -
      clamp(Number(reincidencia || 0) * 4, 0, 15);

    return {
      user_id: Number(row.user_id),
      tecnico: row.tecnico || `Usuário ${row.user_id}`,
      os_concluidas: osConcluidas,
      preventivas_executadas: Number(preventivasExecutadas || 0),
      tempo_medio_min: Math.round(tempoMedioMin || 0),
      prazo_rate: Math.round(prazoRate * 100),
      reincidencia: Number(reincidencia || 0),
      score: clamp(Math.round(base), 0, 100),
    };
  }).sort((a, b) => b.score - a.score);
}

module.exports = {
  classificarRisco,
  calcularScoreRiscoEquipamento,
  atualizarScoresRiscoEquipamentos,
  listarAlertas,
  criarAlertaOperacional,
  processarAutomacaoOS,
  getRankingTecnicos,
};
