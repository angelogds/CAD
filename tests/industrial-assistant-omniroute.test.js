const test = require('node:test');
const assert = require('node:assert/strict');
const gateway = require('../modules/ai/providers/omniroute.provider');
const router = require('../modules/ai/providers/provider-router');
const openai = require('../modules/ai/providers/openai.provider');

const ENV = [
  'AI_PROVIDER_PRIMARY', 'AI_PROVIDER_FALLBACK', 'AI_PROVIDER_TEXT_PRIMARY', 'AI_PROVIDER_TEXT_FALLBACK',
  'OMNIROUTE_BASE_URL', 'OMNIROUTE_API_KEY', 'OMNIROUTE_MODEL', 'OPENAI_API_KEY',
];
function configure(t, overrides = {}) {
  const previous = Object.fromEntries(ENV.map((key) => [key, process.env[key]]));
  for (const key of ENV) delete process.env[key];
  Object.assign(process.env, {
    OMNIROUTE_BASE_URL: 'https://gateway.example/v1/',
    OMNIROUTE_API_KEY: 'gateway-test-key',
    OMNIROUTE_MODEL: 'cad-pilot',
    ...overrides,
  });
  t.after(() => {
    for (const key of ENV) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}
function result(output = []) {
  return { status: 'completed', model: 'resolved-model', output, usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 } };
}
function mockResponse(t, data, httpStatus = 200) {
  return t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(data), { status: httpStatus }));
}

test('OmniRoute é opt-in e texto não troca o provider de voz', (t) => {
  configure(t);
  assert.equal(router.primaryName(), 'openai');
  assert.equal(router.primaryName('createResponse'), 'openai');
  process.env.AI_PROVIDER_TEXT_PRIMARY = 'omniroute';
  assert.equal(router.primaryName('createResponse'), 'omniroute');
  assert.equal(router.primary('createRealtimeCall').name, 'openai');
  assert.equal(router.status().text.primary.selected, 'omniroute');
});

test('sem configuração completa falha sem rede nem herdar chave OpenAI', async (t) => {
  configure(t, { OMNIROUTE_API_KEY: '', OPENAI_API_KEY: 'openai-test-key' });
  const fetchMock = mockResponse(t, result());
  assert.equal(gateway.status().configured, false);
  await assert.rejects(gateway.createResponse({ apiKey: 'openai-test-key' }), { code: 'AI_OMNIROUTE_CONFIG_MISSING' });
  assert.equal(fetchMock.mock.callCount(), 0);
  const status = JSON.stringify(gateway.status());
  assert.doesNotMatch(status, /test-key|gateway\.example/);
});

test('URL inválida ou com credencial/parâmetro é recusada antes da rede', async (t) => {
  configure(t);
  const fetchMock = mockResponse(t, result());
  for (const url of ['invalid', 'file:///tmp/key', 'https://user:password@example/v1', 'https://example/v1?key=secret', 'https://example/v1#secret']) {
    process.env.OMNIROUTE_BASE_URL = url;
    await assert.rejects(gateway.createResponse(), { code: 'AI_OMNIROUTE_URL_INVALID' });
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('Responses preserva ferramentas, contexto e resultados em duas rodadas', async (t) => {
  configure(t);
  const tool = { type: 'function', name: 'consultar_estoque', parameters: { type: 'object', properties: {} } };
  const call = { type: 'function_call', name: tool.name, call_id: 'call-1', arguments: '{}' };
  const first = result([call]);
  const second = result([{ type: 'message', content: [{ type: 'output_text', text: 'Consulta concluída.' }] }]);
  const payloads = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://gateway.example/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer gateway-test-key');
    assert.equal(options.redirect, 'error');
    payloads.push(JSON.parse(options.body));
    return new Response(JSON.stringify(payloads.length === 1 ? first : second));
  });
  const input = [{ role: 'user', content: [{ type: 'input_text', text: 'Consultar estoque' }] }];
  const body = { model: 'openai-model', instructions: 'Respeitar RBAC e confirmação.', input, tools: [tool], tool_choice: 'auto', max_output_tokens: 1200 };
  assert.deepEqual(await gateway.createResponse({ apiKey: 'openai-secret', body }), first);
  const continuation = [...input, call, { type: 'function_call_output', call_id: call.call_id, output: '{"ok":true}' }];
  assert.deepEqual(await gateway.createResponse({ body: { ...body, input: continuation } }), second);
  assert.deepEqual(payloads[1].input, continuation);
  assert.deepEqual(payloads[0].tools, [tool]);
  assert.equal(payloads[0].instructions, body.instructions);
  assert.equal(payloads[0].model, 'cad-pilot');
  assert.equal(payloads[0].store, false);
  assert.equal(payloads[0].stream, false);
  assert.equal(body.model, 'openai-model');
  assert.doesNotMatch(JSON.stringify(payloads), /openai-secret/);
});

test('resposta inválida ou incompleta não libera chamadas de ferramenta', async (t) => {
  configure(t);
  let data;
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(data)));
  const validCall = { type: 'function_call', name: 'preparar_abertura_os', call_id: 'call-2', arguments: '{}' };
  for (data of [{}, { output: [], error: { message: 'secret' } }, { ...result([validCall]), status: 'incomplete' }, result([{ ...validCall, arguments: '{' }]), result([{ ...validCall, arguments: '[]' }]), result([{ ...validCall, call_id: '' }])]) {
    await assert.rejects(gateway.createResponse(), { code: 'AI_OMNIROUTE_RESPONSE_INVALID' });
  }
});

test('HTML no endpoint é erro de contrato sem expor o conteúdo', async (t) => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>private-data</html>'));
  await assert.rejects(gateway.createResponse(), (err) => err.code === 'AI_OMNIROUTE_RESPONSE_INVALID' && !err.message.includes('private-data'));
});

test('erro HTTP preserva status para fallback e oculta corpo do gateway', async (t) => {
  configure(t);
  mockResponse(t, { error: { message: 'gateway-test-key private-prompt' } }, 429);
  await assert.rejects(gateway.createResponse(), (err) => {
    assert.equal(err.status, 503);
    assert.equal(err.provider_status, 429);
    assert.equal(router.shouldFallback(err), true);
    assert.doesNotMatch(JSON.stringify(err), /gateway-test-key|private-prompt/);
    assert.doesNotMatch(err.message, /gateway-test-key|private-prompt/);
    return true;
  });
});

test('fallback de texto é explícito e não muda a voz', async (t) => {
  configure(t, { AI_PROVIDER_TEXT_PRIMARY: 'omniroute', AI_PROVIDER_TEXT_FALLBACK: 'openai' });
  mockResponse(t, {}, 503);
  const expected = result();
  const fallbackMock = t.mock.method(openai, 'createResponse', async () => expected);
  assert.deepEqual(await router.runWithFallback('createResponse', { body: {} }), expected);
  assert.equal(fallbackMock.mock.callCount(), 1);
  assert.equal(router.primary('createRealtimeCall').name, 'openai');
  process.env.AI_PROVIDER_TEXT_FALLBACK = '';
  await assert.rejects(router.runWithFallback('createResponse', {}), { code: 'AI_OMNIROUTE_HTTP_ERROR' });
  assert.equal(fallbackMock.mock.callCount(), 1);
});

test('falhas de autenticação e configuração não causam fallback', async (t) => {
  configure(t, { AI_PROVIDER_TEXT_PRIMARY: 'omniroute', AI_PROVIDER_TEXT_FALLBACK: 'openai' });
  mockResponse(t, {}, 401);
  const fallbackMock = t.mock.method(openai, 'createResponse', async () => result());
  await assert.rejects(router.runWithFallback('createResponse', {}), { provider_status: 401 });
  process.env.OMNIROUTE_API_KEY = '';
  await assert.rejects(router.runWithFallback('createResponse', {}), { code: 'AI_OMNIROUTE_CONFIG_MISSING' });
  assert.equal(fallbackMock.mock.callCount(), 0);
});

test('falha de rede não expõe dados internos e pode usar fallback explícito', async (t) => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('gateway-test-key internal-host'); });
  await assert.rejects(gateway.createResponse(), (err) => {
    assert.equal(err.code, 'AI_OMNIROUTE_NETWORK_ERROR');
    assert.equal(router.shouldFallback(err), true);
    assert.doesNotMatch(err.message, /gateway-test-key|internal-host/);
    return true;
  });
});

test('timeout encerra a chamada inclusive durante leitura do corpo', async (t) => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async (_url, options) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })),
  }));
  await assert.rejects(gateway.createResponse({ timeoutMs: 1 }), { code: 'AI_TIMEOUT', status: 504 });
});

test('voz OmniRoute falha explicitamente sem chamada de rede', async (t) => {
  configure(t);
  const fetchMock = mockResponse(t, result());
  await assert.rejects(gateway.createRealtimeCall(), { code: 'AI_OMNIROUTE_REALTIME_UNSUPPORTED' });
  assert.equal(fetchMock.mock.callCount(), 0);
});
