const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('Apple Design visual layer is scoped to simulator and preserves all existing data hooks', () => {
  const view = read('views/automacao/simulador-digestores.ejs');
  const selectors = [
    'id="sim-digestores"', 'id="sim-start"', 'id="sim-pause"', 'id="sim-reset"',
    'id="sim-speed"', 'id="sim-clock"', 'id="sim-presentation"',
    'id="sim-events-list"', 'id="sim-events-filter"',
    'data-role="tower"', 'data-role="temperature"', 'data-role="progress"',
    'data-role="contactor"', 'data-role="camisa-state"', 'data-role="eixo-state"',
    'data-role="camisa-icon"', 'data-role="eixo-icon"',
    'data-role="purga-countdown"', 'data-role="chart-line"',
    'data-role="cycle-clock"', 'data-action="load"', 'data-action="heat"',
  ];
  for(const token of selectors) assert.ok(view.includes(token), token);
  assert.ok(view.includes('automacao-simulador-apple.css'));
  assert.match(view, /sim-apple-hero/);
  assert.match(view, /SIMULAÇÃO • SEM HARDWARE/);
  assert.match(view, /for\(let id=1;id<=4;id\+\+\)/);
});
test('new CSS supports two-column desktop, mobile, reduced-motion, high-contrast', () => {
  const css = read('public/css/automacao-simulador-apple.css');
  assert.match(css, /\.sim-apple \.sim-grid\{/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /@media \(prefers-reduced-transparency:reduce\)/);
  assert.match(css, /@media \(prefers-contrast:more\)/);
  assert.match(css, /:focus-visible/);
});
test('visual redesign leaves simulator logic independent from hardware', () => {
  const js = read('public/js/automacao-simulador.js');
  const core = read('public/js/automacao-simulador-core.js');
  assert.match(js, /setInterval\(tick, 1000\)/);
  assert.match(js, /core\.estadoPurgadores/);
  assert.match(js, /core\.registrarAmostra/);
  assert.match(core, /INTERVALO_PURGA_SEGUNDOS = 30/);
  for(const source of [js, core]) {
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  }
});
