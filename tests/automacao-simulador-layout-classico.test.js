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

test('simulador preserva cartões e purgadores, sem gráfico de temperatura por tempo', () => {
  const view = read('views/automacao/simulador-digestores.ejs');
  const js = read('public/js/automacao-simulador.js');
  const core = read('public/js/automacao-simulador-core.js');
  for (const token of [
    'id="sim-start"', 'id="sim-pause"', 'id="sim-reset"', 'id="sim-presentation"',
    'data-role="temperature"', 'data-role="contactor"', 'data-role="tower"',
    'data-role="camisa-state"', 'data-role="eixo-state"',
    'data-role="cycle-clock"', 'data-action="load"', 'data-action="heat"',
    'id="sim-events-list"', 'sim-hardware-indicator',
  ]) assert.ok(view.includes(token), token);
  assert.doesNotMatch(view, /sim-chart|chart-line|Temperatura × tempo/);
  assert.doesNotMatch(js, /drawChart|chart-line/);
  assert.match(js, /core\.estadoPurgadores/);
  assert.match(js, /core\.registrarAmostra/);
  assert.match(core, /INTERVALO_PURGA_SEGUNDOS = 30/);
  for (const source of [js, core]) assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
});

test('conexão, seleção e modos ficam antes dos cartões sem duplicar controles', () => {
  const view = read('views/automacao/simulador-digestores.ejs');
  const connection = view.indexOf('class="sim-bancada-online"');
  const selection = view.indexOf('class="sim-select-panel"');
  const modes = view.indexOf('class="sim-toolbar"');
  const cards = view.indexOf('class="sim-grid"');
  assert.ok(connection > 0 && connection < selection && selection < modes && modes < cards);
  for (const id of ['sim-connect-esp32', 'sim-select-digestor', 'sim-start', 'sim-purge-seconds']) {
    assert.equal(view.split('id="' + id + '"').length - 1, 1, id);
  }
  assert.match(view, /id="sim-purge-seconds" type="number" min="1" max="300" step="1" value="30"/);
  assert.doesNotMatch(view, /id="sim-solenoids-enable"|id="sim-solenoids-status"/);
});
