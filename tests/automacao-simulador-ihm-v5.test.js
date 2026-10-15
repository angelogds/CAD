const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('IHM industrial preserva os seletores funcionais existentes no simulador', () => {
  const view = read('views/automacao/simulador-digestores.ejs');
  const hooks = [
    'id="sim-digestores"','id="sim-start"','id="sim-pause"','id="sim-reset"',
    'id="sim-presentation"','id="sim-speed"','id="sim-clock"',
    'id="sim-events-filter"','id="sim-events-list"',
    'data-digestor="<%= id %>"','data-role="status"','data-role="tower"',
    'data-role="temperature"','data-role="progress"','data-role="bar"',
    'data-role="contactor"','data-role="alarm"','data-role="cycle-clock"',
    'data-role="camisa-state"','data-role="eixo-state"','data-role="camisa-box"',
    'data-role="eixo-box"','data-role="camisa-icon"','data-role="eixo-icon"',
    'data-role="chart-line"','data-role="purga-countdown"',
    'data-action="load"','data-action="heat"',
    'data-step="CARREGADO"','data-step="AQUECIMENTO"',
    'data-step="COZIMENTO"','data-step="PRONTO"',
  ];
  for (const hook of hooks) assert.ok(view.includes(hook), hook);
  assert.match(view, /for\(let id=1;id<=4;id\+\+\)/);
  assert.match(view, /SIMULAÇÃO • SEM HARDWARE/);
  assert.match(view, /NÃO alarmes reais/);
});

test('camada SCADA industrial usa Apple Design sem substituir tema geral do sistema', () => {
  const view = read('views/automacao/simulador-digestores.ejs');
  const css = read('public/css/automacao-simulador-ihm.css');
  const apple = read('public/css/automacao-simulador-apple.css');
  assert.match(view, /class="auto-page auto-hmi sim-apple sim-hmi"/);
  assert.match(view, /automacao\.css\?v=/);
  assert.match(view, /automacao-simulador-apple\.css\?v=/);
  assert.match(view, /automacao-simulador-ihm\.css\?v=/);
  assert.ok(view.indexOf('automacao-simulador-apple.css') < view.indexOf('automacao-simulador-ihm.css'));
  assert.match(css, /\.sim-hmi \.sim-grid/);
  assert.match(css, /\.sim-hmi \.sim-machine-row/);
  assert.match(css, /\.sim-hmi \.sim-temperature/);
  assert.match(css, /\.sim-hmi \.sim-chart-panel/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(apple, /sim-apple/);
});

test('sinótico destaca equipamentos sem criar comandos de campo', () => {
  const view = read('views/automacao/simulador-digestores.ejs');
  const css = read('public/css/automacao-simulador-ihm.css');
  assert.match(view, /SINÓTICO D<%= id %>/);
  assert.match(view, /UNIDADE D<%= id %> · SIMULADA/);
  assert.match(view, /Dados fictícios · Sem comando industrial/);
  assert.match(view, /Tendência térmica/);
  assert.match(view, /Purgadores · camisa \/ eixo/);
  assert.match(css, /sim-hmi-diagram-label/);
  assert.match(css, /\.sim-purger\[data-state="open"\]/);
  assert.match(css, /\.sim-stage-red/);
  assert.match(css, /\.sim-stage-yellow/);
  assert.match(css, /\.sim-stage-green/);
});

test('IHM continua responsiva e acessível', () => {
  const css = read('public/css/automacao-simulador-ihm.css');
  assert.match(css, /@media\(max-width:1240px\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@media\(max-width:385px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /prefers-contrast:more/);
  assert.match(css, /:focus-visible/);
});

test('nenhuma integração real foi adicionada e lógica de tempo permanece existente', () => {
  const js = read('public/js/automacao-simulador.js');
  const core = read('public/js/automacao-simulador-core.js');
  assert.match(js, /setInterval\(tick, 1000\)/);
  assert.match(js, /core\.estadoPurgadores/);
  assert.match(js, /core\.registrarAmostra/);
  assert.match(core, /INTERVALO_PURGA_SEGUNDOS = 30/);
  for (const script of [js, core]) {
    assert.doesNotMatch(script, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  }
});
