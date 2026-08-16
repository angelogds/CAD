const db = require('../../database/db');

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(String(name || '')); } catch (_e) { return false; }
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function compactUsage(usage = {}) {
  return {
    input_tokens: number(usage.input_tokens),
    output_tokens: number(usage.output_tokens),
    total_tokens: number(usage.total_tokens),
    cached_tokens: number(usage?.input_tokens_details?.cached_tokens),
    reasoning_tokens: number(usage?.output_tokens_details?.reasoning_tokens),
  };
}

function addUsage(total = {}, usage = {}) {
  const next = compactUsage(usage);
  return {
    input_tokens: number(total.input_tokens) + next.input_tokens,
    output_tokens: number(total.output_tokens) + next.output_tokens,
    total_tokens: number(total.total_tokens) + next.total_tokens,
    cached_tokens: number(total.cached_tokens) + next.cached_tokens,
    reasoning_tokens: number(total.reasoning_tokens) + next.reasoning_tokens,
  };
}

function sanitizeTools(tools = []) {
  return (Array.isArray(tools) ? tools : []).slice(0, 30).map((tool) => ({
    name: String(tool?.name || '').slice(0, 100) || null,
    ok: tool?.ok === true,
    source: tool?.source ? String(tool.source).slice(0, 240) : null,
    code: tool?.code ? String(tool.code).slice(0, 120) : null,
  }));
}

function logUsage({ tipo, userId = null, conversationId = null, model = null, durationMs = 0, usage = {}, tools = [], status = 'ok', errorCode = null, context = {}, rounds = 0 } = {}) {
  if (!tableExists('ai_usage_logs')) return false;
  try {
    const payload = {
      user_id: Number(userId || 0) || null,
      conversation_id: conversationId ? String(conversationId).slice(0, 120) : null,
      model: model ? String(model).slice(0, 160) : null,
      duration_ms: Math.max(0, Math.round(Number(durationMs || 0))),
      usage: compactUsage(usage),
      tools: sanitizeTools(tools),
      rounds: Math.max(0, Math.min(20, Number(rounds || 0) || 0)),
      context: {
        module: String(context?.module || '').slice(0, 80) || null,
        entity_type: String(context?.entity_type || '').slice(0, 80) || null,
        entity_id: Number(context?.entity_id || 0) || null,
      },
    };
    db.prepare(`
      INSERT INTO ai_usage_logs (tipo,referencia_tipo,referencia_id,payload_json,status,erro_tecnico,criado_em)
      VALUES (?,?,?,?,?,?,datetime('now'))
    `).run(
      String(tipo || 'INDUSTRIAL_ASSISTANT').slice(0, 100),
      payload.context.entity_type || 'USER',
      payload.context.entity_id || payload.user_id || null,
      JSON.stringify(payload),
      String(status || 'ok').slice(0, 30),
      errorCode ? String(errorCode).slice(0, 200) : null,
    );
    return true;
  } catch (err) {
    console.warn('[ai.observability.logUsage]', err?.message || err);
    return false;
  }
}

function recentStats() {
  if (!tableExists('ai_usage_logs')) return { total_24h: 0, sucessos_24h: 0, erros_24h: 0, tokens_24h: 0, ultima_execucao: null };
  const rows = db.prepare(`
    SELECT status,payload_json,criado_em
    FROM ai_usage_logs
    WHERE tipo IN ('INDUSTRIAL_TEXT','INDUSTRIAL_REALTIME_SETUP')
      AND datetime(criado_em)>=datetime('now','-24 hours')
    ORDER BY datetime(criado_em) DESC,id DESC
    LIMIT 1000
  `).all();
  let tokens = 0;
  let success = 0;
  let errors = 0;
  for (const row of rows) {
    if (String(row.status || '').toLowerCase() === 'ok') success += 1;
    else errors += 1;
    try { tokens += number(JSON.parse(row.payload_json || '{}')?.usage?.total_tokens); } catch (_e) {}
  }
  return {
    total_24h: rows.length,
    sucessos_24h: success,
    erros_24h: errors,
    tokens_24h: tokens,
    ultima_execucao: rows[0]?.criado_em || null,
  };
}

function pendingStats() {
  if (!tableExists('ai_pending_actions')) return { pendentes: 0, executando: 0, expiradas: 0 };
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN status='PENDING' AND datetime(expires_at)>datetime('now') THEN 1 ELSE 0 END) AS pendentes,
      SUM(CASE WHEN status='EXECUTING' THEN 1 ELSE 0 END) AS executando,
      SUM(CASE WHEN status='PENDING' AND datetime(expires_at)<=datetime('now') THEN 1 ELSE 0 END) AS expiradas
    FROM ai_pending_actions
  `).get() || {};
  return { pendentes: number(row.pendentes), executando: number(row.executando), expiradas: number(row.expiradas) };
}

function healthSnapshot() {
  const configured = Boolean(String(process.env.OPENAI_API_KEY || '').trim());
  const enabled = String(process.env.AI_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
  return {
    ok: enabled && configured,
    enabled,
    provider_primary: String(process.env.AI_PROVIDER_PRIMARY || 'openai').trim() || 'openai',
    openai_key_configured: configured,
    models: {
      assistant: String(process.env.OPENAI_MODEL_ASSISTANT || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini').trim(),
      voice: String(process.env.OPENAI_MODEL_VOICE || 'gpt-realtime').trim(),
      transcription: String(process.env.OPENAI_MODEL_TRANSCRIBE || 'gpt-4o-mini-transcribe').trim(),
      embeddings: String(process.env.OPENAI_MODEL_EMBEDDINGS || 'text-embedding-3-small').trim(),
    },
    storage: {
      usage_logs: tableExists('ai_usage_logs'),
      conversations: tableExists('ai_conversations'),
      pending_actions: tableExists('ai_pending_actions'),
      embeddings_index: tableExists('ai_embeddings_index'),
    },
    activity: recentStats(),
    actions: pendingStats(),
    checked_at: new Date().toISOString(),
  };
}

module.exports = { compactUsage, addUsage, sanitizeTools, logUsage, healthSnapshot };
