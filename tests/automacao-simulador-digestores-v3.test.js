const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../public/js/automacao-simulador-core');

const source = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('ciclo demonstrativo completo: carregado, aquecimento, cozimento e pronto', () => {
  const d = core.criarDigestor(0);
  assert.equal(d.fase, core.FASES.CARREGADO);
  assert.equal(d.temp, 30);
  assert.equal(d.enabled, false);
  assert.equal(core.iniciarDigestor(d), true);
  assert.equal(core.iniciarDigestor(d), false);
  assert.equal(d.fase, core.FASES.AQUECIMENTO);
  for (let i = 0; i < 230; i++) core.avancarDigestor(d, 1);
  assert.equal(d.fase, core.FASES.COZIMENTO);
  assert.equal(core.faixaTemperatura(d.temp).lamp, 'yellow');
  for (let i = 0; i < 250; i++) core.avancarDigestor(d, 1);
  assert.equal(d.fase, core.FASES.PRONTO);
  assert.equal(d.temp, 120);
  assert.equal(d.enabled, false);
  assert.equal(d.cycleActive, false);
  assert.deepEqual(
    [core.estadoPurgadores(d.cycleSeconds, d.cycleActive).camisa,
      core.estadoPurgadores(d.cycleSeconds, d.cycleActive).eixo],
    ['FECHADO', 'FECHADO'],
  );
  assert.equal(core.iniciarDigestor(d), false);
});

test('os quatro digestores possuem cronômetros e temperaturas independentes', () => {
  const a = core.criarDigestor(0);
  const b = core.criarDigestor(1);
  const c = core.criarDigestor(2);
  const d = core.criarDigestor(3);
  assert.deepEqual([a.temp,b.temp,c.temp,d.temp], [30,32,34,36]);
  core.iniciarDigestor(a);
  core.iniciarDigestor(b);
  core.avancarDigestor(a,30);
  core.avancarDigestor(b,8);
  assert.equal(a.cycleSeconds,30);
  assert.equal(b.cycleSeconds,8);
  assert.equal(c.cycleSeconds,0);
  assert.equal(d.cycleSeconds,0);
  assert.equal(core.estadoPurgadores(a.cycleSeconds,true).eixo,'ABERTO');
  assert.equal(core.estadoPurgadores(b.cycleSeconds,true).camisa,'ABERTO');
  core.carregarDigestor(a);
  assert.equal(a.fase,core.FASES.CARREGADO);
  assert.equal(a.cycleSeconds,0);
  assert.equal(a.cycleActive,false);
  assert.equal(a.samples.length,1);
  assert.equal(b.cycleSeconds,8);
});

test('historico de amostras tem limite e curva SVG finita', () => {
  const d = core.criarDigestor(0);
  core.iniciarDigestor(d);
  for (let n=0;n<110;n++) {
    core.avancarDigestor(d,1);
    core.registrarAmostra(d);
  }
  assert.equal(d.samples.length,core.MAX_AMOSTRAS);
  assert.ok(d.samples.every(p => Number.isFinite(p.t) && Number.isFinite(p.temp)));
  const graph = core.pontosGrafico(d.samples,260,90);
  assert.equal(graph.split(' ').length,core.MAX_AMOSTRAS);
  assert.ok(!graph.includes('NaN'));
  assert.equal(core.pontosGrafico([]), '');
});

test('a tela V3 mostra etapas, botoes, grafico, cronometro e modo apresentacao', () => {
  const view = source('views/automacao/simulador-digestores.ejs');
  const selectors = ['sim-presentation', 'sim-events-filter', 'sim-events-list',
    'cycle-clock', 'chart-line', 'data-action="load"', 'data-action="heat"',
    'data-step="CARREGADO"', 'data-step="AQUECIMENTO"', 'data-step="COZIMENTO"',
    'data-step="PRONTO"', 'camisa-icon', 'eixo-icon', 'sim-signal-tower'];
  for (const selector of selectors) assert.ok(view.includes(selector), selector);
  assert.match(view, /SIMULAÇÃO • SEM HARDWARE/);
  assert.match(view, /NÃO alarmes reais/);
  assert.match(view, /for\(let id=1;id<=4;id\+\+\)/);
});

test('a V3 preserva os intervalos de 30 s virtuais e a separacao da rede industrial', () => {
  assert.equal(core.INTERVALO_PURGA_SEGUNDOS,30);
  const script = source('public/js/automacao-simulador.js');
  const logic = source('public/js/automacao-simulador-core.js');
  for (const js of [script,logic]) assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  assert.match(script, /setInterval\(tick, 1000\)/);
  assert.match(script, /clearInterval\(handle\)/);
  assert.match(script, /core\.iniciarDigestor/);
  assert.match(script, /core\.estadoPurgadores/);
  assert.match(script, /core\.registrarAmostra/);
  assert.match(script, /events\.length = 0/);
  assert.match(script, /presentation\.addEventListener/);
  assert.match(script, /document\.createElement\('li'\)/);
});
