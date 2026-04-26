const test = require('node:test');
const assert = require('node:assert/strict');

const aiService = require('../modules/ai/ai.service');

test('fallback local define criticidade alta para texto com queimou', async () => {
  const out = aiService.buildOSFallbackFromText('bomba queimou no digestor 2');
  assert.equal(out.criticidade, 'ALTA');
  assert.match(out.equipamento_nome, /(Digestor 2|Bomba)/i);
});

test('sanitizeVoiceText remove controles', async () => {
  const out = aiService.sanitizeVoiceText('abc\n\u0000def');
  assert.equal(out.includes('\u0000'), false);
  assert.equal(out.includes('abc'), true);
});

test('os.routes includes voice endpoints', () => {
  const fs = require('node:fs');
  const content = fs.readFileSync(require.resolve('../modules/os/os.routes'), 'utf8');
  assert.equal(content.includes('/voice/analyze'), true);
  assert.equal(content.includes('/voice/create'), true);
});
