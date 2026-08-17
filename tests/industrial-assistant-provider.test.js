const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const providerRouter = require('../modules/ai/providers/provider-router');
const openAIProvider = require('../modules/ai/providers/openai.provider');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('texto do Assistente usa provider router em vez de endpoint OpenAI direto', () => {
  const source = read('modules/ai/industrial-assistant.text.service.js');
  assert.match(source, /providerRouter\.runWithFallback\('createResponse'/);
  assert.doesNotMatch(source, /api\.openai\.com\/v1\/responses/);
});

test('rota ativa de voz passa pelo serviço Realtime e pelo provider router', () => {
  const controller = read('modules/ai/industrial-assistant.controller.js');
  const realtime = read('modules/ai/industrial-assistant.realtime.service.js');

  assert.match(controller, /industrialRealtimeAssistant = require\('\.\/industrial-assistant\.realtime\.service'\)/);
  assert.match(controller, /industrialRealtimeAssistant\.createRealtimeCall\(/);
  assert.doesNotMatch(controller, /industrialAssistant\.createRealtimeCall\(/);
  assert.match(realtime, /providerRouter\.runWithFallback\('createRealtimeCall'/);
  assert.doesNotMatch(realtime, /api\.openai\.com\/v1\/realtime\/calls/);
});

test('OpenAI provider encapsula Responses e Realtime com chave somente no backend', () => {
  const source = read('modules/ai/providers/openai.provider.js');
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/realtime\/calls/);
  assert.match(source, /Authorization: `Bearer \$\{key\}`/);
  assert.match(source, /provider_status/);
  assert.doesNotMatch(source, /window\.|document\.|localStorage|sessionStorage/);
});

test('multipart do Realtime envia session como campo application/json, não arquivo', () => {
  const { boundary, body } = openAIProvider.buildRealtimeMultipart({
    sdp: 'v=0\r\ns=test',
    session: { type: 'realtime', model: 'gpt-realtime' },
  });
  const raw = body.toString('utf8');

  assert.ok(boundary.startsWith('----openai-realtime-'));
  assert.match(raw, /Content-Disposition: form-data; name="sdp"; filename="offer\.sdp"\r\nContent-Type: application\/sdp/);
  assert.match(raw, /Content-Disposition: form-data; name="session"\r\nContent-Type: application\/json\r\n\r\n\{"type":"realtime","model":"gpt-realtime"\}/);
  assert.doesNotMatch(raw, /name="session"; filename=/);
});

test('erro Realtime preserva mensagem específica retornada pela OpenAI sem expor chave', () => {
  const source = read('modules/ai/providers/openai.provider.js');
  assert.match(source, /data\?\.error\?\.message/);
  assert.match(source, /Falha ao iniciar voz em tempo real: \$\{detail\}/);
  assert.doesNotMatch(source, /OPENAI_API_KEY.*technical/);
});

test('provider local é stub explícito e não faz fallback silencioso para rede', () => {
  const source = read('modules/ai/providers/local.provider.js');
  assert.match(source, /AI_LOCAL_PROVIDER_UNAVAILABLE/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.match(source, /configured: false/);
});

test('fallback só existe quando AI_PROVIDER_FALLBACK é configurado', () => {
  const source = read('modules/ai/providers/provider-router.js');
  assert.match(source, /process\.env\.AI_PROVIDER_PRIMARY/);
  assert.match(source, /process\.env\.AI_PROVIDER_FALLBACK/);
  assert.match(source, /!shouldFallback\(primaryError\)/);
});

test('fallback é permitido apenas para falhas transitórias', () => {
  assert.equal(providerRouter.shouldFallback({ code: 'AI_TIMEOUT', status: 504 }), true);
  assert.equal(providerRouter.shouldFallback({ provider_status: 429 }), true);
  assert.equal(providerRouter.shouldFallback({ provider_status: 500 }), true);
  assert.equal(providerRouter.shouldFallback({ provider_status: 503 }), true);
  assert.equal(providerRouter.shouldFallback({ name: 'TypeError' }), true);

  assert.equal(providerRouter.shouldFallback({ code: 'OPENAI_KEY_MISSING', status: 503 }), false);
  assert.equal(providerRouter.shouldFallback({ provider_status: 400 }), false);
  assert.equal(providerRouter.shouldFallback({ provider_status: 401 }), false);
  assert.equal(providerRouter.shouldFallback({ provider_status: 403 }), false);
  assert.equal(providerRouter.shouldFallback({ code: 'AI_REALTIME_SDP_MISSING', provider_status: 400 }), false);
});
