const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../public/js/automacao-prensas-core');
const src = name => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');

test('prensas sem hardware: não apresentam estados virtuais como telemetria real', () => {
  const state = Core.createState(), snapshot = Core.snapshot(state);
  assert.equal(snapshot.mode, 'LIVE');
  assert.equal(snapshot.running, false);
  assert.equal(snapshot.realSensors, null);
  assert.equal(snapshot.equipmentConnected, false);
  assert.equal(snapshot.physicalCommands, false);
  assert.deepEqual(Object.values(snapshot.feed), [false, false, false]);
  assert.deepEqual(Object.values(snapshot.oilPumps), [false, false, false]);
  assert.equal(snapshot.returnScrew, false);
});

test('tolva e três guilhotinas alimentam FAST P50 P46 de forma independente, somente na maquete', () => {
  const state=Core.createState();
  Core.start(state);
  assert.equal(Core.snapshot(state).mixing, true);
  assert.deepEqual(Object.values(Core.snapshot(state).feed), [true,true,true]);
  Core.change(state, 'gate', 'P50', false);
  assert.equal(Core.snapshot(state).feed.P50, false);
  assert.equal(Core.snapshot(state).oilPumps.P50, false);
  assert.equal(Core.snapshot(state).feed.FAST, true);
  assert.equal(Core.snapshot(state).oilPumps.FAST, true);
  Core.change(state, 'press','FAST',false);
  assert.equal(Core.snapshot(state).feed.FAST, false);
  Core.change(state, 'mixer',null,false);
  assert.deepEqual(Object.values(Core.snapshot(state).feed),[false,false,false]);
  Core.change(state,'mixer',null,true);
  assert.equal(Core.snapshot(state).feed.P46,true);
});

test('rosca inclinada só retorna torta mal prensada com saída P46 e transporte ativos', () => {
  const s=Core.createState();Core.start(s);
  Core.change(s,'return',null,true);
  assert.equal(Core.snapshot(s).returnScrew,true);
  Core.change(s,'gate','P46',false);
  assert.equal(Core.snapshot(s).returnScrew,false);
  Core.change(s,'gate','P46',true);
  Core.change(s,'cake',null,false);
  assert.equal(Core.snapshot(s).returnScrew,false);
  Core.change(s,'cake',null,true);
  assert.equal(Core.snapshot(s).returnScrew,true);
  Core.pause(s);
  assert.equal(Core.snapshot(s).returnScrew,false);
  assert.equal(Core.snapshot(s).oilPumps.P46,false);
  Core.reset(s);
  assert.equal(Core.snapshot(s).mode,'LIVE');
});

test('simulação não liga sem iniciar e não transmite nada externamente', () => {
  const s=Core.createState();
  Core.change(s,'gate','FAST',true);Core.change(s,'return',null,true);Core.tick(s,9);
  assert.equal(s.seconds,0);
  assert.equal(Core.snapshot(s).feed.FAST,false);
  Core.start(s);
  Core.tick(s,1);assert.equal(s.seconds,1);
  Core.pause(s);Core.tick(s,1);assert.equal(s.seconds,1);
  const source=src('public/js/automacao-prensas-core.js');
  assert.doesNotMatch(source,/\b(fetch|XMLHttpRequest|WebSocket|socket\.io)\s*\(/);
});

test('rota de simulador das prensas exige apenas papel ADMIN; supervisão preservada', () => {
  const routes=src('modules/automacao/automacao.routes.js');
  assert.match(routes,/router\.get\('\/prensas',\s*requireLogin,\s*requireRole\(ACCESS\.automacao_view\)/);
  assert.match(routes,/router\.get\('\/prensas\/simulador',\s*requireLogin,\s*requireRole\(\[ROLE\.ADMIN\]\)/);
  assert.doesNotMatch(routes,/router\.post\('\/prensas/);
  const controller=src('modules/automacao/automacao.controller.js');
  assert.match(controller,/simulacaoPrensasHabilitada:\s*admin\s*&&\s*simular/);
});

test('SVG e 3D representam tolva, roscas contrarrotativas, guilhotinas, bombas e retorno', () => {
  const view=src('views/automacao/prensas.ejs');
  const svg=src('views/automacao/partials/prensas-circuito.ejs');
  const scene=src('public/js/automacao-prensas-scene.mjs');
  assert.match(view,/include\('partials\/prensas-circuito'\)/);
  assert.match(view,/if \(prModoSimulacao\)/);
  assert.match(view,/data-pr-simulation-allowed/);
  for(const id of ['FAST','P50','P46']){
    assert.match(scene,new RegExp('PUMP_'));
    assert.match(svg,new RegExp(id));
  }
  for(const term of ['GUILHOTINA','ROSCA','TOLVA','PERCOLADORA','RETORNO','TACHO']){
    assert.match(svg,new RegExp(term));
  }
  assert.match(scene,/createPrensasScene/);
  assert.match(scene,/returnGroup\.quaternion/);
});
