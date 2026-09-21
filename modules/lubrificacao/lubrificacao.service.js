const db = require('../../database/db');

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function hasColumn(table, column) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column); }
  catch (_e) { return false; }
}

function ensureReady() {
  if (!tableExists('pcm_lubrificacao_planos') || !tableExists('pcm_lubrificacao_execucoes')) {
    throw new Error('Estrutura do Plano de Lubrificação V2 ainda não foi aplicada. Execute as migrations.');
  }
}

function listRoteiro(userId, status = '') {
  ensureReady();
  const hasValidation = hasColumn('pcm_lubrificacao_planos','validado_tecnicamente');
  const hasRoute = hasColumn('pcm_lubrificacao_planos','rota_lubrificacao');
  const hasOrder = hasColumn('pcm_lubrificacao_planos','ordem_rota');
  const hasFamily = hasColumn('pcm_lubrificacao_planos','familia_lubrificacao');
  const hasInstruction = hasColumn('pcm_lubrificacao_planos','instrucoes_execucao');
  const hasWeekdays = hasColumn('pcm_lubrificacao_planos','dias_semana_lubrificacao');
  const validationWhere = hasValidation ? 'AND COALESCE(l.validado_tecnicamente,1)=1' : '';

  const rows = db.prepare(`
    SELECT
      l.id,
      l.equipamento_id,
      l.ponto_lubrificacao,
      l.tipo_lubrificante_texto,
      l.quantidade,
      l.unidade,
      l.frequencia_dias,
      l.frequencia_semanas,
      l.frequencia_meses,
      l.frequencia_horas_operacao,
      ${hasWeekdays ? "COALESCE(l.dias_semana_lubrificacao,'')" : "''"} AS dias_semana_lubrificacao,
      l.observacao,
      l.proxima_execucao_em,
      l.ultima_execucao_em,
      l.metodo_aplicacao,
      ${hasRoute ? "COALESCE(l.rota_lubrificacao,'Rota não definida')" : "'Rota não definida'"} AS rota_lubrificacao,
      ${hasOrder ? 'COALESCE(l.ordem_rota,999999)' : '999999'} AS ordem_rota,
      ${hasFamily ? "COALESCE(l.familia_lubrificacao,'OUTROS')" : "'OUTROS'"} AS familia_lubrificacao,
      ${hasInstruction ? "COALESCE(l.instrucoes_execucao,'')" : "''"} AS instrucoes_execucao,
      e.nome AS equipamento_nome,
      COALESCE(e.setor, '') AS setor,
      CASE
        WHEN l.proxima_execucao_em IS NULL THEN 'SEM_DATA'
        WHEN date(l.proxima_execucao_em) < date('now') THEN 'ATRASADO'
        WHEN date(l.proxima_execucao_em) = date('now') THEN 'HOJE'
        WHEN date(l.proxima_execucao_em) <= date('now', '+7 day') THEN 'PROXIMO'
        ELSE 'FUTURO'
      END AS situacao
    FROM pcm_lubrificacao_planos l
    JOIN equipamentos e ON e.id = l.equipamento_id
    WHERE COALESCE(l.ativo, 1) = 1
      AND l.responsavel_user_id = @userId
      ${validationWhere}
    ORDER BY
      CASE
        WHEN l.proxima_execucao_em IS NOT NULL AND date(l.proxima_execucao_em) < date('now') THEN 0
        WHEN l.proxima_execucao_em IS NOT NULL AND date(l.proxima_execucao_em) = date('now') THEN 1
        WHEN l.proxima_execucao_em IS NOT NULL AND date(l.proxima_execucao_em) <= date('now', '+7 day') THEN 2
        WHEN l.proxima_execucao_em IS NULL THEN 4
        ELSE 3
      END,
      rota_lubrificacao ASC,
      ordem_rota ASC,
      e.nome ASC,
      l.ponto_lubrificacao ASC
  `).all({ userId: Number(userId) });

  const wanted = String(status || '').trim().toUpperCase();
  if (!wanted || wanted === 'TODOS') return rows;
  return rows.filter((row) => row.situacao === wanted);
}

function agruparRoteiro(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const rota = row.rota_lubrificacao || 'Rota não definida';
    if (!groups.has(rota)) groups.set(rota, { rota, pontos: [], atrasados: 0, hoje: 0, proximos: 0 });
    const group = groups.get(rota);
    group.pontos.push(row);
    if (row.situacao === 'ATRASADO') group.atrasados += 1;
    if (row.situacao === 'HOJE') group.hoje += 1;
    if (row.situacao === 'PROXIMO') group.proximos += 1;
  });
  return Array.from(groups.values());
}

function resumoRoteiro(userId) {
  const rows = listRoteiro(userId);
  const count = (status) => rows.filter((row) => row.situacao === status).length;
  const executadosHoje = db.prepare(`
    SELECT COUNT(*) AS total
    FROM pcm_lubrificacao_execucoes
    WHERE executor_user_id = ?
      AND date(executed_at) = date('now')
  `).get(Number(userId))?.total || 0;

  return {
    total: rows.length,
    rotas: new Set(rows.map((row) => row.rota_lubrificacao).filter(Boolean)).size,
    atrasados: count('ATRASADO'),
    hoje: count('HOJE'),
    proximos: count('PROXIMO'),
    executados_hoje: Number(executadosHoje || 0),
  };
}

function listHistorico(userId, limit = 12) {
  ensureReady();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 12));
  const routeExpr = hasColumn('pcm_lubrificacao_planos','rota_lubrificacao')
    ? "COALESCE(l.rota_lubrificacao,'Rota não definida')"
    : "'Rota não definida'";
  return db.prepare(`
    SELECT
      x.id,
      x.plano_id,
      x.quantidade_prevista,
      x.quantidade_utilizada,
      x.unidade,
      x.observacao,
      x.anomalia,
      x.anomalia_descricao,
      x.proxima_execucao_em,
      x.executed_at,
      e.nome AS equipamento_nome,
      COALESCE(e.setor, '') AS setor,
      l.ponto_lubrificacao,
      l.tipo_lubrificante_texto,
      l.metodo_aplicacao,
      ${routeExpr} AS rota_lubrificacao
    FROM pcm_lubrificacao_execucoes x
    JOIN pcm_lubrificacao_planos l ON l.id = x.plano_id
    JOIN equipamentos e ON e.id = x.equipamento_id
    WHERE x.executor_user_id = ?
    ORDER BY datetime(x.executed_at) DESC, x.id DESC
    LIMIT ?
  `).all(Number(userId), safeLimit);
}

function normalizeWeekdays(value) {
  return [...new Set(
    String(value || '')
      .split(',')
      .map((v) => Number(String(v).trim()))
      .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6)
  )].sort((a, b) => a - b);
}

function calcularProximaPorDiasSemana(value) {
  const dias = normalizeWeekdays(value);
  if (!dias.length) return null;
  return db.prepare(`
    WITH RECURSIVE seq(n) AS (
      SELECT 1
      UNION ALL
      SELECT n + 1 FROM seq WHERE n < 7
    )
    SELECT datetime('now', '+' || n || ' day') AS dt
    FROM seq
    WHERE instr(',' || ? || ',', ',' || strftime('%w', datetime('now', '+' || n || ' day')) || ',') > 0
    ORDER BY n
    LIMIT 1
  `).get(dias.join(','))?.dt || null;
}

function calcularProximaExecucao(plano) {
  const porSemana = calcularProximaPorDiasSemana(plano.dias_semana_lubrificacao);
  if (porSemana) return porSemana;

  const dias = Number(plano.frequencia_dias || 0);
  const semanas = Number(plano.frequencia_semanas || 0);
  const meses = Number(plano.frequencia_meses || 0);

  let modifier = null;
  if (dias > 0) modifier = `+${dias} day`;
  else if (semanas > 0) modifier = `+${semanas * 7} day`;
  else if (meses > 0) modifier = `+${meses} month`;

  if (!modifier) return null;
  return db.prepare("SELECT datetime('now', ?) AS dt").get(modifier)?.dt || null;
}

function registrarExecucao(planoId, userId, payload = {}) {
  ensureReady();
  const id = Number(planoId);
  const executorId = Number(userId);
  if (!id || !executorId) throw new Error('Execução de lubrificação inválida.');

  const validationWhere = hasColumn('pcm_lubrificacao_planos','validado_tecnicamente')
    ? 'AND COALESCE(validado_tecnicamente,1)=1'
    : '';

  const plano = db.prepare(`
    SELECT *
    FROM pcm_lubrificacao_planos
    WHERE id = ?
      AND COALESCE(ativo, 1) = 1
      AND responsavel_user_id = ?
      ${validationWhere}
    LIMIT 1
  `).get(id, executorId);

  if (!plano) {
    throw new Error('Este ponto não pertence ao seu roteiro, está inativo ou ainda não foi validado pelo PCM.');
  }

  const rawQuantidade = payload.quantidade_utilizada;
  const quantidadeUtilizada = rawQuantidade === '' || rawQuantidade == null
    ? (plano.quantidade == null ? null : Number(plano.quantidade))
    : Number(rawQuantidade);

  if (quantidadeUtilizada != null && (!Number.isFinite(quantidadeUtilizada) || quantidadeUtilizada < 0)) {
    throw new Error('Informe uma quantidade utilizada válida.');
  }

  const observacao = String(payload.observacao || '').trim() || null;
  const anomalia = String(payload.anomalia || '') === '1' ? 1 : 0;
  const anomaliaDescricao = String(payload.anomalia_descricao || '').trim() || null;
  if (anomalia && !anomaliaDescricao) {
    throw new Error('Descreva a anomalia encontrada antes de concluir.');
  }

  const proxima = calcularProximaExecucao(plano);

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO pcm_lubrificacao_execucoes (
        plano_id, equipamento_id, executor_user_id,
        quantidade_prevista, quantidade_utilizada, unidade,
        observacao, anomalia, anomalia_descricao,
        proxima_execucao_em, executed_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      plano.id,
      plano.equipamento_id,
      executorId,
      plano.quantidade == null ? null : Number(plano.quantidade),
      quantidadeUtilizada,
      plano.unidade || null,
      observacao,
      anomalia,
      anomaliaDescricao,
      proxima
    );

    db.prepare(`
      UPDATE pcm_lubrificacao_planos
      SET ultima_execucao_em = datetime('now'),
          proxima_execucao_em = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(proxima, plano.id);

    return Number(info.lastInsertRowid);
  });

  return { execucao_id: tx(), proxima_execucao_em: proxima, anomalia: Boolean(anomalia) };
}

module.exports = {
  listRoteiro,
  agruparRoteiro,
  resumoRoteiro,
  listHistorico,
  registrarExecucao,
  calcularProximaExecucao,
};
