const industrialAssistant = require('./industrial-assistant.service');
const industrialTextAssistant = require('./industrial-assistant.text.service');
const industrialContext = require('./industrial-assistant.context.service');

function friendlyStatus(err) {
  return Number(err?.status || 500) || 500;
}

async function realtimeCall(req, res) {
  try {
    const result = await industrialAssistant.createRealtimeCall({
      sdp: req.body?.sdp,
      user: req.session?.user || null,
    });
    res.type(result.contentType || 'application/sdp');
    return res.status(201).send(result.sdp);
  } catch (err) {
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

async function executeTool(req, res) {
  try {
    const result = await industrialAssistant.executeTool({
      name: req.body?.name,
      args: req.body?.arguments || req.body?.args || {},
      user: req.session?.user || null,
    });
    return res.json({ ok: true, result });
  } catch (err) {
    console.warn('[ai.executeTool]', { tool: req.body?.name, code: err?.code, message: err?.message });
    return res.status(friendlyStatus(err)).json({ ok: false, error: err?.message || 'Falha ao executar ferramenta.', code: err?.code || 'AI_TOOL_ERROR' });
  }
}

function capabilities(_req, res) {
  return res.json({ ok: true, voice: true, text_tools: true, briefing: true, server_history: true, page_context: true, tools: industrialAssistant.getRealtimeTools().map((tool) => tool.name) });
}

module.exports = { realtimeCall, pageContext, textMessage, briefing, history, executeTool, capabilities };
