function providerError(code, message, technical = null, status = 503, providerStatus = null) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (Number.isFinite(Number(providerStatus))) err.provider_status = Number(providerStatus);
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
        response.status >= 500 || response.status === 429 ? 503 : response.status,
        response.status,
      );
    }
    return data || {};
  } catch (err) {
    if (err?.name === 'AbortError') throw providerError('AI_TIMEOUT', 'O Assistente Industrial demorou para responder. Tente novamente.', null, 504, 504);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function requireValidSdp(sdp) {
  const offer = String(sdp || '');
  if (!offer.trim()) throw providerError('AI_REALTIME_SDP_MISSING', 'SDP WebRTC ausente.', null, 400, 400);
  if (!offer.startsWith('v=0')) {
    throw providerError('AI_REALTIME_SDP_INVALID', 'SDP WebRTC inválido: offer não inicia com v=0.', null, 400, 400);
  }
  return offer;
}

function buildRealtimeForm({ sdp, session } = {}) {
  const offer = requireValidSdp(sdp);
  const form = new FormData();
  // Contrato oficial da interface unificada: campos string no FormData.
  // Não reconstruir multipart manualmente e não transformar SDP em arquivo/Blob.
  form.set('sdp', offer);
  form.set('session', JSON.stringify(session || {}));
  return form;
}

async function createRealtimeCall({ apiKey, sdp, session } = {}) {
  const key = requireApiKey(apiKey);
  const form = buildRealtimeForm({ sdp, session });

  const response = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const answer = await response.text();
  if (!response.ok) {
    let data = null;
    try { data = JSON.parse(answer); } catch (_e) {}
    const detail = String(data?.error?.message || '').trim().slice(0, 400);
    throw providerError(
      data?.error?.code || 'OPENAI_REALTIME_ERROR',
      detail ? `Falha ao iniciar voz em tempo real: ${detail}` : `Falha ao iniciar voz em tempo real: OpenAI ${response.status}.`,
      answer,
      response.status >= 500 || response.status === 429 ? 503 : response.status,
      response.status,
    );
  }

  if (!String(answer || '').startsWith('v=0')) {
    throw providerError(
      'OPENAI_REALTIME_ANSWER_INVALID',
      'A OpenAI não retornou um SDP de resposta válido para a sessão de voz.',
      answer,
      502,
      502,
    );
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

module.exports = {
  name: 'openai',
  createResponse,
  createRealtimeCall,
  status,
  buildRealtimeForm,
  requireValidSdp,
};
