const industrialAssistant = require('./industrial-assistant.service');
const industrialTextAssistant = require('./industrial-assistant.text.service');

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

async function textMessage(req, res) {
  try {
    const result = await industrialTextAssistant.runTextAssistant({
      message: req.body?.pergunta || req.body?.message,
      context: {
        contexto: req.body?.contexto,
        module: req.body?.module,
        entity_type: req.body?.entity_type,
        entity_id: req.body?.entity_id,
        route: req.body?.route,
      },
      user: req.session?.user || null,
    });
    return res.json({ ok: true, resposta: result.text, tools: result.tools || [], model: result.model || null });
  } catch (err) {
    console.warn('[ai.textMessage]', { code: err?.code, message: err?.message, technical: err?.technical });
    return res.status(friendlyStatus(err)).json({ ok: false, error: err?.message || 'Falha ao consultar o Assistente Industrial.', code: err?.code || 'AI_TEXT_ERROR' });
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
  return res.json({ ok: true, voice: true, text_tools: true, tools: industrialAssistant.getRealtimeTools().map((tool) => tool.name) });
}

module.exports = { realtimeCall, textMessage, executeTool, capabilities };
