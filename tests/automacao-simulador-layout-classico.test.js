const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('visual compacto original mostra quatro digestores por linha no desktop', () => {
  const view = read('views/automacao/simulador-digestores.ejs');
  const css = read('public/css/automacao-simulador.css');
  assert.match(view, /for\(let id=1;id<=4;id\+\+\)/);
  assert.match(css, /\.sim-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:1130px\)\{\.sim-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:650px\)\{\.sim-grid\{grid-template-columns:1fr/);
  assert.doesNotMatch(view, /automacao-simulador-apple\.css|automacao-simulador-ihm\.css|sim-hmi-hero|sim-hmi-diagram-label/);
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public/css/automacao-simulador-apple.css')));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public/css/automacao-simulador-ihm.css')));
});

test('reversao visual mantem o simulador V3 com graficos e purgadores ficticios', () => {
  const view = read('views/automacao/simulador-digestores.ejs');
  const js = read('public/js/automacao-simulador.js');
  const core = read('public/js/automacao-simulador-core.js');
  for (const token of [
    'id="sim-start"', 'id="sim-pause"', 'id="sim-reset"', 'id="sim-presentation"',
    'data-role="temperature"', 'data-role="contactor"', 'data-role="tower"',
    'data-role="camisa-state"', 'data-role="eixo-state"', 'data-role="chart-line"',
    'data-role="cycle-clock"', 'data-action="load"', 'data-action="heat"',
    'id="sim-events-list"', 'sim-hardware-indicator',
  ]) assert.ok(view.includes(token), token);
  assert.match(js, /core\.estadoPurgadores/);
  assert.match(js, /core\.registrarAmostra/);
  assert.match(core, /INTERVALO_PURGA_SEGUNDOS = 30/);
  for (const source of [js, core]) assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
});
