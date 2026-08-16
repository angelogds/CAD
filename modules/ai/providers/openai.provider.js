function providerError(code, message, technical = null, status = 503) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (technical) err.technical = String(technical).slice(0, 1200);
  return err;
}

function requireApiKey(apiKey) {
  const key = String(apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw providerError('OPENAI_KEY_MISSING', 'OPENAI_API_KEY não configurada no servidor.');
  return key;
}

async function createResponse({ apiKey, body, timeoutMs = 45000 } = {}) {
  const key = requireApiKey(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 45000)));
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (_e) {}
    if (!response.ok) {
      throw providerError(
        data?.error?.code || 'OPENAI_RESPONSES_ERROR',
        data?.error?.message || `OpenAI Responses retornou HTTP ${response.status}.`,
        raw,
        503,
      );
    }
    return data || {};
  } catch (err) {
    if (err?.name === 'AbortError') throw providerError('AI_TIMEOUT', 'O Assistente Industrial demorou para responder. Tente novamente.', null, 504);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function createRealtimeCall({ apiKey, sdp, session } = {}) {
  const key = requireApiKey(apiKey);
  const offer = String(sdp || '').trim();
  if (!offer) throw providerError('AI_REALTIME_SDP_MISSING', 'SDP WebRTC ausente.', null, 400);

  const form = new FormData();
  form.append('sdp', new Blob([offer], { type: 'application/sdp' }), 'offer.sdp');
  form.append('session', new Blob([JSON.stringify(session || {})], { type: 'application/json' }), 'session.json');

  const response = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const answer = await response.text();
  if (!response.ok) {
    throw providerError('OPENAI_REALTIME_ERROR', `Falha ao iniciar voz em tempo real: OpenAI ${response.status}.`, answer, 503);
  }
  return { sdp: answer, contentType: response.headers.get('content-type') || 'application/sdp' };
}

function status() {
  return {
    name: 'openai',
    configured: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
    supports: { responses: true, realtime: true },
  };
}

module.exports = { name: 'openai', createResponse, createRealtimeCall, status };
