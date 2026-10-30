const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../public/js/automacao-digestores-circuito-core');

const four = (active, tempC, ready = false) => Array.from({ length: 4 }, (_, index) =>
  index === active ? { tempC, ready } : { tempC: 30, ready: false });

test('D1: carga e rosca superior ligadas, depois fecha alimentação e espera temperatura', () => {
  const state = Core.createState();
  assert.deepEqual(Core.startLinkedDemo(state, 'D1'), { ok: true });
  assert.equal(state.feedAuger, true);
  assert.deepEqual(state.gates, [true, false, false, false]);
  assert.ok(state.dischargeGates.every(v => v === false));
  Core.tick(state, 6, four(0, 30));
  assert.equal(state.stage, 'COZIMENTO');
  assert.equal(state.feedAuger, false);
  assert.ok(state.gates.every(v => !v));
  assert.equal(state.digestors[0].shaft, true);
  assert.equal(state.percolator, false);
  Core.tick(state, 200, four(0, 120, true));
  assert.equal(state.stage, 'COZIMENTO', '120 °C nao libera descarga; acima de 120 °C com pronto');
  Core.tick(state, 1, four(0, 121, true));
  assert.equal(state.stage, 'DESCARGA');
  assert.equal(state.dischargeGates[0], true);
  assert.equal(state.percolator, true);
  assert.equal(state.digestors[0].discharging, true);
  assert.ok(state.dischargeGates.slice(1).every(v => !v));
});

test('descarga da maquete alimenta o tacho; bomba transfere e encerra ciclo', () => {
  const state = Core.createState();
  Core.startLinkedDemo(state, 'D2');
  Core.tick(state, 6);
  Core.tick(state, 1, four(1, 121, true));
  Core.tick(state, Core.EXAMPLE.dischargeSeconds);
  assert.equal(state.stage, 'TRANSFERENCIA');
  assert.equal(state.dischargeGates.filter(Boolean).length, 0);
  assert.equal(state.collectedLiters, Core.EXAMPLE.chargeLiters * Core.EXAMPLE.liquidFraction);
  assert.equal(Core.snapshot(state).tachoLevel, 'BAIXO_VIRTUAL');
  assert.equal(state.pump, true);
  Core.tick(state, Core.EXAMPLE.transferSeconds);
  assert.equal(state.stage, 'CONCLUIDO');
  assert.equal(state.transferredLiters, state.collectedLiters);
  assert.equal(state.tachoLiters, 0);
  assert.equal(Core.snapshot(state).tachoLevel, 'VAZIO_VIRTUAL');
  assert.equal(state.pump, false);
  assert.ok(state.dischargeGates.every(v => !v));
});

test('todos em sequencia, nunca abre duas guilhotinas juntas; simulacao independente preservada', () => {
  const state = Core.createState();
  Core.startLinkedDemo(state, 'TODOS');
  const loaded = [];
  while (state.running) {
    const id = Number(state.activeDigestor.slice(1)) - 1;
    if (state.stage === 'CARGA') loaded.push(state.activeDigestor);
    assert.ok(state.gates.filter(Boolean).length <= 1);
    assert.ok(state.dischargeGates.filter(Boolean).length <= 1);
    if (state.stage === 'COZIMENTO') Core.tick(state, 1, four(id, 121, true));
    else Core.tick(state, state.stageDurationSeconds);
  }
  assert.deepEqual(loaded, ['D1', 'D2', 'D3', 'D4']);
  const solo = Core.createState();
  Core.startDemo(solo, 'D1');
  Core.tick(solo, Core.EXAMPLE.loadSeconds);
  assert.equal(solo.stage, 'MISTURA');
  assert.equal(solo.linked, false);
  Core.stop(solo);
  assert.ok(solo.dischargeGates.every(v => !v));
  Core.returnLive(solo);
  assert.equal(Core.snapshot(solo).tachoLevel, 'SEM_SINAL');
});

test('firmware V10 nao atribui GPIO25/26 para guilhotinas nem habilita bobinas novas', () => {
  const dir = path.join(__dirname, '../firmware/esp32-sinaleiros');
  const cfg = fs.readFileSync(path.join(dir, 'hardware_config.h'), 'utf8');
  const purge = fs.readFileSync(path.join(dir, 'purge_outputs.h'), 'utf8');
  const sketch = fs.readFileSync(path.join(dir, 'esp32-sinaleiros.ino'), 'utf8');
  assert.match(purge, /channel == 0 \? 25 : 26/);
  assert.match(cfg, /CGD_ENABLE_MATERIAL_GATE_OUTPUTS 0/);
  assert.match(cfg, /CGD_GATE_FEED_CANDIDATE_GPIO 32/);
  assert.match(cfg, /CGD_GATE_DISCHARGE_CANDIDATE_GPIO 33/);
  assert.match(sketch, /comandos_remotos_habilitados.*false/);
  assert.match(sketch, /SEM_RETORNO_FISICO/);
});
