const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = require('../public/js/automacao-decanters-core');
const { detailsFor } = require('../public/js/automacao-decanters');
let sceneModule;
const loadScene = async () => sceneModule || (sceneModule = await import('../public/js/automacao-decanters-scene.mjs'));

test('cena Three.js contém todo o circuito clicável e preserva geometria finita', async () => {
  const { createIndustrialScene } = await loadScene();
  const model = createIndustrialScene();
  try {
    for (const key of ['tank', 'mixer', 'steam', 'pt100', 'inlet', 'feed', 'FAST', 'GRATE',
      'valveFAST', 'valveGRATE', 'tachoFAST', 'tachoGRATE', 'screw', 'out1', 'out2', 'outlet',
      'storage1', 'storage2', 'storage3', 'storage4', 'storage5', 'sensor1', 'sensor2', 'sensor3', 'sensor4', 'sensor5']) {
      assert.ok(model.equipment.has(key), key);
    }
    // O usuário retirou a serpentina da representação visual.
    assert.equal(model.equipment.has('coil'), false);
    model.root.traverse(object => {
      assert.ok([object.position.x, object.position.y, object.position.z].every(Number.isFinite));
      if (object.geometry?.attributes.position) assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite));
    });
  } finally { model.dispose(); }
});

test('sem telemetria não há preenchimento de tanque, fluxo ou rotação inventados', async () => {
  const model = (await loadScene()).createIndustrialScene();
  try {
    model.update(core.snapshot(core.createState()), 30);
    assert.ok(model.liquid.every(fill => fill.mesh.visible === false));
    assert.ok(model.flows.every(flow => flow.particles.every(p => p.visible === false)));
    assert.ok(model.rotors.every(rotor => rotor.mesh.rotation[rotor.axis] === 0));
  } finally { model.dispose(); }
});

test('corte da decanter anima tambor e rosca em velocidades didáticas diferentes', async () => {
  const model = (await loadScene()).createIndustrialScene();
  try {
    const state = core.startDemo(core.createState());
    core.set(state, 'readyFAST', true);
    model.update(core.snapshot(state), 2);
    const speeds = model.rotors.filter(rotor => rotor.mesh.parent === model.equipment.get('FAST') && rotor.speed);
    assert.equal(speeds.length, 2);
    assert.notEqual(speeds[0].mesh.rotation.x, speeds[1].mesh.rotation.x);
    assert.ok(speeds.every(rotor => rotor.mesh.rotation.x > 0));
    const old = speeds.map(rotor => rotor.mesh.rotation.x);
    model.update(core.snapshot(state), 10, { motion: false });
    assert.deepEqual(speeds.map(rotor => rotor.mesh.rotation.x), old);
    core.stop(state);
    model.update(core.snapshot(state), 20);
    assert.deepEqual(speeds.map(rotor => rotor.mesh.rotation.x), old);
  } finally { model.dispose(); }
});

test('nível incoerente oculta a estimativa visual e não mantém tanque aparentemente medido', async () => {
  const model = (await loadScene()).createIndustrialScene();
  try {
    const state = core.startDemo(core.createState());
    model.update(core.snapshot(state), 0);
    assert.equal(model.liquid[0].mesh.visible, true);
    core.set(state, 'levelFault', 'INCONSISTENTE');
    model.update(core.snapshot(state), 1);
    assert.equal(model.liquid[0].mesh.visible, false);
  } finally { model.dispose(); }
});

test('clique em hélice interna identifica a máquina e não uma peça anônima', async () => {
  const { createIndustrialScene, selectionKey } = await loadScene();
  const model = createIndustrialScene();
  try {
    const rotor = model.rotors.find(item => item.mesh.parent === model.equipment.get('FAST') && item.speed === 2.05);
    assert.equal(selectionKey(rotor.mesh.children[0]), 'FAST');
    assert.equal(selectionKey(model.equipment.get('mixer').children[0]), 'mixer');
  } finally { model.dispose(); }
});

test('indicadores desconhecidos não viram desligado, zero ou confirmação de homogeneização', () => {
  const live = core.snapshot(core.createState());
  assert.ok(detailsFor('tank', live).rows.some(([key, value]) => key === 'Mexedor' && value === 'Sem sinal'));
  assert.ok(detailsFor('inlet', live).rows.some(([, value]) => value === '— L'));
  assert.ok(detailsFor('mixer', live).rows.some(([key, value]) => key === 'Homogeneidade do sebo' && value === 'Não avaliada'));
  const sim = core.startDemo(core.createState());
  core.set(sim, 'mixer', true);
  assert.match(detailsFor('mixer', core.snapshot(sim)).quality, /simulação local/);
  assert.ok(detailsFor('outlet', live).rows.some(([key, value]) => key === 'Produção apurada' && /validar/.test(value)));
});

test('biblioteca 3D usa mesma versão local com licença e sem dependência de CDN', () => {
  const renderer = fs.readFileSync(require.resolve('../public/js/automacao-industrial-viewer.mjs'), 'utf8');
  const vendor = require('../public/vendor/three-0.172.0/package.json');
  const installed = JSON.parse(fs.readFileSync(require('node:path').join(require('node:path').dirname(require.resolve('three')), '../package.json'), 'utf8'));
  assert.equal(vendor.version, installed.version);
  assert.match(renderer, /three-0\.172\.0\/three\.module\.min\.js/);
  assert.doesNotMatch(renderer, /https?:\/\/|fetch\(/);
  assert.match(fs.readFileSync(require.resolve('../public/vendor/three-0.172.0/LICENSE'), 'utf8'), /MIT License/);
});
