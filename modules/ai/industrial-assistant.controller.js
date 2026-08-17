const industrialAssistant = require('./industrial-assistant.service');
const industrialTextAssistant = require('./industrial-assistant.text.service');
const industrialRealtimeAssistant = require('./industrial-assistant.realtime.service');
const memoryTool = require('./industrial-assistant.memory.tool');
const industrialContext = require('./industrial-assistant.context.service');
const observability = require('./industrial-assistant.observability.service');

function friendlyStatus(err) {
  return Number(err?.status || 500) || 500;
}

async function realtimeCall(req, res) {
  const startedAt = Date.now();
  const userId = Number(req.session?.user?.id || 0) || null;
  const model = industrialRealtimeAssistant.getVoiceModel();
  try {
    // Fluxo novo/oficial: application/sdp chega como string bruta.
    // Mantém compatibilidade com clientes antigos que ainda enviem JSON { sdp }.
    const rawSdp = typeof req.body === 'string' ? req.body : req.body?.sdp;
    const result = await industrialRealtimeAssistant.createRealtimeCall({
      sdp: rawSdp,
      user: req.session?.user || null,
    });
    observability.logUsage({
      tipo: 'INDUSTRIAL_REALTIME_SETUP',
      userId,
      model,
      durationMs: Date.now() - startedAt,
      status: 'ok',
    });
    res.type(result.contentType || 'application/sdp');
    return res.status(201).send(result.sdp);
  } catch (err) {
    observability.logUsage({
      tipo: 'INDUSTRIAL_REALTIME_SETUP',
      userId,
      model,
      durationMs: Date.now() - startedAt,
      status: 'error',
      errorCode: err?.code || `HTTP_${friendlyStatus(err)}`,
    });
    console.error('[ai.realtimeCall]', err?.technical || err?.stack || err?.message || err);
    return res.status(friendlyStatus(err)).json({ ok: false, error: err?.message || 'Falha ao iniciar sessão de voz.' });
  }
}

function pageContext(req, res) {
  try {
    const result = industrialContext.resolvePageContext({
      route: req.query?.route,
      user: req.session?.user || null,
    });
    return res.json({ ok: true, context: result });
  } catch (err) {
    console.warn('[ai.pageContext]', { message: err?.message });
    return res.status(friendlyStatus(err)).json({ ok: false, error: 'Falha ao resolver contexto da página.' });
  }
}

async function textMessage(req, res) {
  try {
    const resolvedContext = industrialContext.resolvePageContext({
      route: req.body?.route,
      user: req.session?.user || null,
    });
    const result = await industrialTextAssistant.runTextAssistant({
      message: req.body?.pergunta || req.body?.message,
      conversationId: req.body?.conversation_id,
      context: {
        ...resolvedContext,
        requested_context: String(req.body?.contexto || '').slice(0, 80) || null,
      },
      user: req.session?.user || null,
    });
    return res.json({
      ok: true,
      resposta: result.text,
      tools: result.tools || [],
      sources: result.sources || [],
      model: result.model || null,
      conversation_id: result.conversationId || null,
      context: resolvedContext,
    });
  } catch (err) {
    console.warn('[ai.textMessage]', { code: err?.code, message: err?.message, technical: err?.technical });
    return res.status(friendlyStatus(err)).json({ ok: false, error: err?.message || 'Falha ao consultar o Assistente Industrial.', code: err?.code || 'AI_TEXT_ERROR' });
  }
}

async function briefing(req, res) {
  try {
    const result = await industrialAssistant.executeTool({
      name: 'consultar_briefing_operacional',
      args: req.query || {},
      user: req.session?.user || null,
    });
    return res.json({ ok: true, result });
  } catch (err) {
    return res.status(friendlyStatus(err)).json({ ok: false, error: err?.message || 'Falha ao montar briefing operacional.', code: err?.code || 'AI_BRIEFING_ERROR' });
  }
}

function history(req, res) {
  try {
    const userId = Number(req.session?.user?.id || 0);
    if (!userId) return res.status(401).json({ ok: false, error: 'Sessão inválida.' });
    const items = industrialTextAssistant.listHistory({ userId, limit: req.query?.limit || 40 });
    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Falha ao carregar histórico do assistente.' });
  }
}

function health(_req, res) {
  try {
    return res.json({ ok: true, health: observability.healthSnapshot() });
  } catch (err) {
    console.warn('[ai.health]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Falha ao consultar saúde do Assistente Industrial.' });
  }
}

async function executeTool(req, res) {
  try {
    const name = req.body?.name;
    const args = req.body?.arguments || req.body?.args || {};
    const user = req.session?.user || null;
    const result = memoryTool.hasTool(name)
      ? await memoryTool.executeTool({ name, args, user })
      : await industrialAssistant.executeTool({ name, args, user });
    return res.json({ ok: true, result });
  } catch (err) {
    console.warn('[ai.executeTool]', { tool: req.body?.name, code: err?.code, message: err?.message });
    return res.status(friendlyStatus(err)).json({ ok: false, error: err?.message || 'Falha ao executar ferramenta.', code: err?.code || 'AI_TOOL_ERROR' });
  }
}

function capabilities(_req, res) {
  const tools = [...industrialAssistant.getRealtimeTools(), ...memoryTool.getTools()];
  return res.json({
    ok: true,
    voice: true,
    voice_model: industrialRealtimeAssistant.getVoiceModel(),
    text_tools: true,
    briefing: true,
    server_history: true,
    page_context: true,
    evidence_sources: true,
    factory_memory: true,
    health: true,
    tools: tools.map((tool) => tool.name),
  });
}

module.exports = { realtimeCall, pageContext, textMessage, briefing, history, health, executeTool, capabilities };
