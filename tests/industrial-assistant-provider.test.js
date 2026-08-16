const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('texto do Assistente usa provider router em vez de endpoint OpenAI direto', () => {
  const source = read('modules/ai/industrial-assistant.text.service.js');
  assert.match(source, /providerRouter\.runWithFallback\('createResponse'/);
  assert.doesNotMatch(source, /api\.openai\.com\/v1\/responses/);
});

test('OpenAI provider encapsula Responses e Realtime com chave somente no backend', () => {
  const source = read('modules/ai/providers/openai.provider.js');
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/realtime\/calls/);
  assert.match(source, /Authorization: `Bearer \$\{key\}`/);
  assert.doesNotMatch(source, /window\.|document\.|localStorage|sessionStorage/);
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
  assert.match(source, /if \(!second \|\| second\.name === first\.name/);
});
