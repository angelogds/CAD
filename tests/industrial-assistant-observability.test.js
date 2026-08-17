const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('observabilidade registra somente metadados e não conteúdo de conversa', () => {
  const source = read('modules/ai/industrial-assistant.observability.service.js');
  const logBlock = source.match(/function logUsage[\s\S]*?function recentStats/)?.[0] || '';

  assert.match(logBlock, /duration_ms/);
  assert.match(logBlock, /usage: compactUsage\(usage\)/);
  assert.match(logBlock, /tools: sanitizeTools\(tools\)/);
  assert.doesNotMatch(logBlock, /message:/);
  assert.doesNotMatch(logBlock, /response:/);
  assert.doesNotMatch(logBlock, /OPENAI_API_KEY/);
});

test('health expõe somente presença da chave e nunca o valor', () => {
  const source = read('modules/ai/industrial-assistant.observability.service.js');
  const healthBlock = source.match(/function healthSnapshot[\s\S]*?module\.exports/)?.[0] || '';

  assert.match(healthBlock, /openai_key_configured: configured/);
  assert.match(healthBlock, /providers,/);
  assert.match(healthBlock, /safeProviderStatus\(\)/);
  assert.doesNotMatch(healthBlock, /api_key:/);
  assert.doesNotMatch(healthBlock, /OPENAI_API_KEY\s*[,}]/);
});

test('status de provider falha de forma segura sem expor segredo', () => {
  const source = read('modules/ai/industrial-assistant.observability.service.js');
  const statusBlock = source.match(/function safeProviderStatus[\s\S]*?function healthSnapshot/)?.[0] || '';

  assert.match(statusBlock, /providerRouter\.status\(\)/);
  assert.match(statusBlock, /AI_PROVIDER_STATUS_ERROR/);
  assert.doesNotMatch(statusBlock, /OPENAI_API_KEY/);
});

test('texto acumula uso de todas as rodadas e registra sucesso ou erro', () => {
  const source = read('modules/ai/industrial-assistant.text.service.js');

  assert.match(source, /usage = observability\.addUsage\(usage, response\?\.usage \|\| \{\}\)/);
  assert.match(source, /tipo: 'INDUSTRIAL_TEXT'/);
  assert.match(source, /status: 'ok'/);
  assert.match(source, /status: 'error'/);
  assert.match(source, /durationMs: Date\.now\(\) - startedAt/);
});

test('setup de voz registra apenas duração e status no backend', () => {
  const source = read('modules/ai/industrial-assistant.controller.js');
  const realtimeBlock = source.match(/async function realtimeCall[\s\S]*?function pageContext/)?.[0] || '';

  assert.match(realtimeBlock, /tipo: 'INDUSTRIAL_REALTIME_SETUP'/);
  assert.match(realtimeBlock, /durationMs: Date\.now\(\) - startedAt/);
  assert.doesNotMatch(realtimeBlock, /usage:\s*req\.body/);
});

test('health do assistente é restrito aos perfis do PCM', () => {
  const routes = read('modules/ai/ai.routes.js');
  assert.match(routes, /router\.get\('\/industrial\/health', requireLogin, requireRole\(ACCESS\.pcm \|\| \[\]\), industrialCtrl\.health\)/);
});
