const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const observability = require('../modules/ai/industrial-assistant.observability.service');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('voz usa Realtime 2.1 mini como default econômico e mantém override por ambiente', () => {
  const source = read('modules/ai/industrial-assistant.realtime.service.js');
  assert.match(source, /OPENAI_MODEL_VOICE \|\| 'gpt-realtime-2\.1-mini'/);
  assert.doesNotMatch(source, /OPENAI_MODEL_VOICE \|\| 'gpt-realtime-2\.1'\)/);
});

test('VAD prioriza baixa latência e continua configurável', () => {
  const source = read('modules/ai/industrial-assistant.realtime.service.js');
  assert.match(source, /OPENAI_REALTIME_VAD_EAGERNESS \|\| 'high'/);
  assert.match(source, /type: 'semantic_vad'/);
  assert.match(source, /create_response: true/);
  assert.match(source, /interrupt_response: true/);
});

test('transcrição auxiliar é opt-in para não cobrar ASR separado por padrão', () => {
  const source = read('modules/ai/industrial-assistant.realtime.service.js');
  assert.match(source, /OPENAI_REALTIME_TRANSCRIPTION_ENABLED', false/);
  assert.match(source, /input\.transcription =/);
  assert.match(source, /gpt-4o-mini-transcribe/);
});

test('prompt de voz exige resposta curta, dado confirmado e dicção clara', () => {
  const source = read('modules/ai/industrial-assistant.realtime.service.js');
  assert.match(source, /dicção clara/);
  assert.match(source, /uma ou duas frases curtas/);
  assert.match(source, /chame imediatamente a ferramenta adequada/);
  assert.match(source, /nunca adivinhe/);
});

test('tools Realtime são filtradas por permissão antes de chegar ao modelo', () => {
  const source = read('modules/ai/industrial-assistant.realtime.service.js');
  assert.match(source, /VOICE_TOOL_ACCESS/);
  assert.match(source, /canAccessModule\(role, moduleKey\)/);
  assert.match(source, /industrialAssistant\.getRealtimeTools\(\)\.filter/);
  assert.match(source, /memoryTool\.allowedSourceTypes\(user\)/);
});

test('telemetria Realtime registra turno sem enviar transcrição ou áudio', () => {
  const routes = read('modules/ai/ai.routes.js');
  const controller = read('modules/ai/industrial-assistant.controller.js');
  const client = read('public/js/ai-realtime.js');

  assert.match(routes, /\/realtime\/usage/);
  assert.match(controller, /INDUSTRIAL_REALTIME_TURN/);
  assert.match(client, /event\?\.response\?\.usage/);
  assert.match(client, /latency_ms/);
  assert.doesNotMatch(client, /reportRealtimeUsage\([^)]*transcript/);
});

test('compactUsage entende detalhes de tokens do Realtime', () => {
  const usage = observability.compactUsage({
    input_tokens: 100,
    output_tokens: 40,
    total_tokens: 140,
    input_token_details: { cached_tokens: 30, audio_tokens: 60, text_tokens: 10 },
    output_token_details: { audio_tokens: 35, text_tokens: 5, reasoning_tokens: 2 },
  });
  assert.deepEqual(usage, {
    input_tokens: 100,
    output_tokens: 40,
    total_tokens: 140,
    cached_tokens: 30,
    input_audio_tokens: 60,
    input_text_tokens: 10,
    output_audio_tokens: 35,
    output_text_tokens: 5,
    reasoning_tokens: 2,
  });
});
