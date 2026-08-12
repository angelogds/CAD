const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('script do Modo TV é JavaScript válido e usa o endpoint agregado correto', () => {
  const source = fs.readFileSync('public/js/tv-mode.js', 'utf8');
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /api\/tv\/snapshot/);
  assert.match(source, /Tentando reconectar/);
  assert.match(source, /content-type/);
});

test('Modo TV possui seis telas, atualização e estados operacionais', () => {
  const view = fs.readFileSync('views/tv/modo-tv.ejs', 'utf8');
  const source = fs.readFileSync('public/js/tv-mode.js', 'utf8');
  assert.match(view, /tvScreenIndicator/);
  assert.match(view, /refreshMs: 60000/);
  assert.match(view, /rotationMs: 18000/);
  assert.match(source, /'geral', 'criticos', 'os', 'preventivas', 'materiais', 'programacao'/);
  assert.match(source, /Nenhuma OS aguardando material no momento/);
  assert.match(source, /Todos os equipamentos registrados estão disponíveis/);
});

test('snapshot operacional não usa as antigas OS fictícias', () => {
  const service = fs.readFileSync('modules/tv/tv.service.js', 'utf8');
  assert.match(service, /buildOperationalSnapshot/);
  assert.doesNotMatch(service, /return fallbackOS\(\)/);
  assert.doesNotMatch(service, /return fallbackPreventivas\(\)/);
});
