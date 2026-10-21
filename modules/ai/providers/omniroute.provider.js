function failure(code, message, providerStatus = null) {
  const err = new Error(message);
  err.code = code;
  err.status = providerStatus === 429 || providerStatus >= 500 ? 503 : (providerStatus || 503);
  if (providerStatus) err.provider_status = providerStatus;
  return err;
}

function config() {
  const base = String(process.env.OMNIROUTE_BASE_URL || '').trim();
  const key = String(process.env.OMNIROUTE_API_KEY || '').trim();
  const model = String(process.env.OMNIROUTE_MODEL || '').trim();
  if (!base || !key || !model) {
    throw failure('AI_OMNIROUTE_CONFIG_MISSING', 'Configure OMNIROUTE_BASE_URL, OMNIROUTE_API_KEY e OMNIROUTE_MODEL no servidor.');
  }
  let url;
  try { url = new URL(base); } catch (_e) {}
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw failure('AI_OMNIROUTE_URL_INVALID', 'OMNIROUTE_BASE_URL deve ser uma URL HTTP(S) sem credenciais, parâmetros ou fragmento.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/responses`;
  return { url: url.toString(), key, model };
}

async function createResponse({ body = {}, timeoutMs = 45000 } = {}) {
  const cfg = config();
  const controller = new AbortController();
  const timeout = Number(timeoutMs);
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeout) && timeout > 0 ? Math.max(1000, timeout) : 45000);
  try {
    const response = await fetch(cfg.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      // Preservar o contrato Responses, inclusive ferramentas e seus call_id.
      // Nunca herdar a chave/modelo OpenAI para o gateway.
      body: JSON.stringify({ ...body, model: cfg.model, store: false, stream: false }),
      redirect: 'error',
      signal: controller.signal,
    });
    // Não propagar corpo/erro bruto do gateway: pode conter prompts e segredos.
    if (!response.ok) {
      try { await response.body?.cancel(); } catch (_e) {}
      throw failure('AI_OMNIROUTE_HTTP_ERROR', `OmniRoute retornou HTTP ${response.status}.`, response.status);
    }
    let data;
    try { data = await response.json(); } catch (err) {
      if (controller.signal.aborted) throw err;
      throw failure('AI_OMNIROUTE_RESPONSE_INVALID', 'OmniRoute não retornou uma resposta JSON válida.', 502);
    }
    if (!Array.isArray(data?.output) || data.error || (data.status && data.status !== 'completed')) {
      throw failure('AI_OMNIROUTE_RESPONSE_INVALID', 'OmniRoute não retornou uma resposta Responses completa.', 502);
    }
    for (const item of data.output) {
      if (item?.type !== 'function_call') continue;
      let args;
      try { args = JSON.parse(item.arguments); } catch (_e) {}
      if (typeof item.name !== 'string' || !item.name.trim() || typeof item.call_id !== 'string' || !item.call_id.trim()
        || typeof item.arguments !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) {
        throw failure('AI_OMNIROUTE_RESPONSE_INVALID', 'OmniRoute retornou uma chamada de ferramenta inválida.', 502);
      }
    }
    return data;
  } catch (err) {
    if (controller.signal.aborted) {
      const timeoutError = failure('AI_TIMEOUT', 'O Assistente Industrial demorou para responder. Tente novamente.', 504);
      timeoutError.status = 504;
      throw timeoutError;
    }
    if (err?.code?.startsWith('AI_')) throw err;
    throw failure('AI_OMNIROUTE_NETWORK_ERROR', 'Não foi possível conectar ao OmniRoute.', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function createRealtimeCall() {
  throw failure('AI_OMNIROUTE_REALTIME_UNSUPPORTED', 'O piloto OmniRoute atende somente texto. Mantenha a voz no provider OpenAI.');
}

function status() {
  let configured = false;
  try { config(); configured = true; } catch (_e) {}
  return { name: 'omniroute', configured, supports: { responses: true, realtime: false } };
}

module.exports = { name: 'omniroute', createResponse, createRealtimeCall, status };
