const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../public/js/automacao-simulador-core.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('sinaleiros seguem quatro faixas contínuas e pronto somente acima de 120 °C', () => {
  const cases = [[0, 'green', false, false], [50, 'green', false, false], [50.1, 'yellow', false, false],
    [51, 'yellow', false, false], [99.9, 'yellow', false, false], [100, 'red', false, false],
    [120, 'red', false, false], [120.1, 'red', true, true], [125, 'red', true, true]];
  for (const [temp, lamp, ready, blink] of cases) {
    const result = core.faixaTemperatura(temp);
    assert.equal(result.lamp, lamp, 'temp ' + temp);
    assert.equal(result.ready, ready, 'temp ' + temp);
    assert.equal(result.blink, blink, 'temp ' + temp);
  }
  for (const value of [NaN, Infinity, null, undefined, '', ' ', true, -1, 851]) {
    const invalid = core.faixaTemperatura(value);
    assert.equal(invalid.lamp, 'off');
    assert.equal(invalid.ready, false);
  }
});

test('purgadores alternam exclusivamente em intervalos de 30 segundos virtuais', () => {
  assert.equal(core.INTERVALO_PURGA_SEGUNDOS, 30);
  assert.deepEqual(
    { camisa: core.estadoPurgadores(0, false).camisa, eixo: core.estadoPurgadores(0, false).eixo },
    { camisa: 'FECHADO', eixo: 'FECHADO' },
  );
  for (const [segundo, camisa, eixo, tempo] of [
    [0, 'ABERTO', 'FECHADO', 30], [29, 'ABERTO', 'FECHADO', 1],
    [30, 'FECHADO', 'ABERTO', 30], [59, 'FECHADO', 'ABERTO', 1],
    [60, 'ABERTO', 'FECHADO', 30], [89, 'ABERTO', 'FECHADO', 1],
    [90, 'FECHADO', 'ABERTO', 30],
  ]) {
    const status = core.estadoPurgadores(segundo, true);
    assert.equal(status.camisa, camisa, segundo + ' s camisa');
    assert.equal(status.eixo, eixo, segundo + ' s eixo');
    assert.equal(status.proximaTroca, tempo, segundo + ' s restante');
    assert.notEqual(status.camisa, status.eixo, 'intertravamento virtual ' + segundo);
  }
});

test('digestores evoluem separadamente e interrompem o aquecimento simulado acima de 120 °C', () => {
  const a = { temp: 30, enabled: true, cycleSeconds: 0, cycleActive: false };
  const b = { temp: 34, enabled: false, cycleSeconds: 0, cycleActive: false };
  core.avancarDigestor(a, 30);
  core.avancarDigestor(b, 30);
  assert.equal(a.cycleSeconds, 30);
  assert.equal(a.cycleActive, true);
  assert.equal(b.cycleSeconds, 0);
  assert.equal(b.temp, 34);
  assert.equal(core.estadoPurgadores(a.cycleSeconds, true).eixo, 'ABERTO');
  core.avancarDigestor(a, 1000);
  assert.ok(a.temp > 120);
  assert.equal(core.faixaTemperatura(a.temp).ready, true);
  const previous = a.cycleSeconds;
  core.avancarDigestor(a, 0);
  assert.equal(a.cycleSeconds, previous);
});

test('a IHM V2 apresenta torres e os dois purgadores em cada digestor', () => {
  const view = read('views/automacao/simulador-digestores.ejs');
  for (const token of ['sim-signal-tower', 'sim-lamp-red', 'sim-lamp-yellow', 'sim-lamp-green',
    'camisa-state', 'eixo-state', 'purga-countdown', 'sim-track', 'simulador-core.js']) {
    assert.ok(view.includes(token), token);
  }
  assert.match(view, /id="sim-hardware-indicator"/);
  assert.match(view, /Somente LEDs de bancada/);
});

test('nenhum código do simulador abre comunicação com hardware', () => {
  const main = read('public/js/automacao-simulador.js');
  const logic = read('public/js/automacao-simulador-core.js');
  for (const script of [main, logic]) {
    assert.doesNotMatch(script, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  }
  assert.match(main, /core\.estadoPurgadores/);
  assert.match(main, /core\.avancarDigestor/);
  assert.match(main, /clearInterval\(handle\)/);
});
