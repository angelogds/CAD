const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
let sceneModule;
const loadScene = async () => sceneModule || (sceneModule = await import('../public/js/automacao-digestores-scene.mjs'));
const simulated = (extra = {}) => ({
  mode: 'SIMULACAO', running: true, feedAuger: true, gates: [true, false, false, false],
  digestors: Array.from({ length: 4 }, (_, index) => ({ tempC: null, shaft: index === 0, loading: index === 0, discharging: index === 1 })),
  percolator: true, tachoMixer: true, pump: true, tachoLiters: 500, tachoCapacityLiters: 1000, ...extra
});
const positions = model => model.flows.flatMap(flow => flow.particles.map(particle => particle.position.toArray()));
const rotations = model => model.rotors.map(rotor => rotor.mesh.rotation[rotor.axis]);

test('digestores D1 a D4, plataforma, portas e circuito mantêm geometria finita e seleção', async () => {
  const { createDigestorScene, selectionKey } = await loadScene();
  const model = createDigestorScene();
  try {
    for (const key of ['digestor1', 'digestor2', 'digestor3', 'digestor4', 'gate1', 'gate2', 'gate3', 'gate4',
      'feedAuger', 'percolator', 'tacho', 'tachoMixer', 'pump', 'serviceTankBoundary', 'gasHeader']) assert.ok(model.equipment.has(key), key);
    const digestors = [1, 2, 3, 4].map(index => model.equipment.get('digestor' + index));
    assert.deepEqual(digestors.map(object => object.position.x), [-7.5, -2.5, 2.5, 7.5]);
    for (const digestor of digestors) {
      assert.ok(digestor.position.y > model.equipment.get('percolator').position.y);
      const door = digestor.getObjectByName('porta-frontal');
      assert.ok(door.geometry.parameters.radiusTop > 0.8);
      assert.ok(door.position.z > 1.8);
      assert.equal(selectionKey(door), digestor.userData.selectKey);
    }
    assert.ok(model.equipment.get('tacho').position.x < -5);
    assert.equal(selectionKey(model.equipment.get('tachoMixer').children[0]), 'tachoMixer');
    assert.equal(selectionKey(null), null);
    model.root.traverse(object => {
      assert.ok([...object.position.toArray(), ...object.scale.toArray(), ...object.rotation.toArray().slice(0, 3)].every(Number.isFinite));
      if (object.geometry?.attributes.position) assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite));
    });
  } finally { model.dispose(); }
});

test('LIVE ignora campos de simulação e retira níveis, partículas e posições afirmadas', async () => {
  const model = (await loadScene()).createDigestorScene();
  try {
    model.update(simulated(), 1);
    assert.ok(rotations(model).some(angle => angle > 0));
    assert.equal(model.liquid[0].mesh.visible, true);
    model.update(simulated({ mode: 'LIVE' }), 2);
    assert.ok(rotations(model).every(angle => angle === 0));
    assert.ok(model.flows.every(flow => flow.particles.every(particle => !particle.visible)));
    assert.ok(model.liquid.every(fill => !fill.mesh.visible));
    assert.ok(model.gates.every(gate => gate.slide.position.y === gate.closedY && gate.mesh.userData.positionStatus === 'SEM_SINAL'));
  } finally { model.dispose(); }
});

test('somente equipamentos habilitados explicitamente giram na simulação', async () => {
  const model = (await loadScene()).createDigestorScene();
  try {
    model.update(simulated(), 2);
    for (const rotor of model.rotors) {
      const angle = rotor.mesh.rotation[rotor.axis];
      if (rotor.key.startsWith('digestor') && rotor.key !== 'digestor1') assert.equal(angle, 0, rotor.key);
      else assert.ok(angle > 0, rotor.key);
    }
    assert.ok(model.gates[0].slide.position.y > model.gates[0].closedY);
    assert.ok(model.gates.slice(1).every(gate => gate.slide.position.y === gate.closedY));
    const feedD1 = model.flows.find(flow => flow.key === 'gate1');
    const feedD2 = model.flows.find(flow => flow.key === 'gate2');
    assert.ok(feedD1.particles.every(particle => particle.visible));
    assert.ok(feedD2.particles.every(particle => !particle.visible));
    assert.equal(model.flows.some(flow => flow.key === 'gasHeader'), false);
  } finally { model.dispose(); }
});

test('pausa e movimento reduzido conservam posições sem salto acumulado ao retomar', async () => {
  const model = (await loadScene()).createDigestorScene();
  try {
    model.update(simulated(), 1);
    const angles = rotations(model);
    const particlePositions = positions(model);
    model.update(simulated(), 10, { motion: false });
    assert.deepEqual(rotations(model), angles);
    assert.deepEqual(positions(model), particlePositions);
    model.update(simulated({ running: false }), 100);
    assert.deepEqual(rotations(model), angles);
    assert.deepEqual(positions(model), particlePositions);
    model.update(simulated(), 100.01);
    assert.ok(rotations(model)[0] > angles[0]);
    assert.ok(rotations(model)[0] - angles[0] < 0.1);
    assert.notDeepEqual(positions(model), particlePositions);
  } finally { model.dispose(); }
});

test('nível do tacho requer volume e capacidade explícitos e sempre permanece ilustrativo', async () => {
  const model = (await loadScene()).createDigestorScene();
  try {
    for (const value of [null, undefined, NaN, Infinity, -1, 0]) {
      model.update(simulated({ tachoLiters: value }), 1);
      assert.equal(model.liquid[0].mesh.visible, false, String(value));
    }
    for (const capacity of [null, undefined, NaN, Infinity, -1, 0]) {
      model.update(simulated({ tachoCapacityLiters: capacity }), 1);
      assert.equal(model.liquid[0].mesh.visible, false, String(capacity));
    }
    model.update(simulated(), 2);
    assert.equal(model.liquid[0].mesh.visible, true);
    assert.equal(model.liquid[0].mesh.scale.y, model.liquid[0].height / 2);
    model.update(simulated({ tachoLiters: 3000 }), 3);
    assert.equal(model.liquid[0].mesh.scale.y, model.liquid[0].height);
    assert.equal(model.equipment.get('tacho').userData.capacityIllustrative, true);
  } finally { model.dispose(); }
});

test('valores ausentes ou truthy não simulam acionamento nem contaminam transformações', async () => {
  const model = (await loadScene()).createDigestorScene();
  try {
    model.update({}, NaN);
    model.update({ mode: 'SIMULACAO', running: true, feedAuger: 'true', gates: [1], pump: 1 }, Infinity);
    assert.ok(rotations(model).every(angle => angle === 0));
    assert.ok(model.gates.every(gate => gate.mesh.userData.positionStatus === 'SEM_SINAL'));
    assert.ok(model.flows.every(flow => flow.particles.every(particle => !particle.visible)));
  } finally { model.dispose(); }
});

test('rótulos usam âncoras externas legíveis e a cena não depende de rede ou canvas', async () => {
  const { createDigestorScene } = await loadScene();
  const THREE = await import('../public/vendor/three-0.172.0/three.module.min.js');
  const labels = [];
  const model = createDigestorScene({ makeLabel(text, width) {
    labels.push({ text, width });
    return new THREE.Group();
  } });
  try {
    assert.ok(labels.some(label => /VOLUME ILUSTRATIVO/.test(label.text)));
    assert.ok(labels.some(label => /TANQUE DE SERVIÇO/.test(label.text)));
    assert.ok(labels.every(label => label.width >= 1.5));
    const source = fs.readFileSync(require.resolve('../public/js/automacao-digestores-scene.mjs'), 'utf8');
    assert.match(source, /three-0\.172\.0\/three\.module\.min\.js/);
    assert.doesNotMatch(source, /fetch\(|WebSocket|createElement|CanvasTexture|https?:\/\//);
  } finally { model.dispose(); }
});

test('dispose libera cada recurso compartilhado apenas uma vez', async () => {
  const model = (await loadScene()).createDigestorScene();
  const geometry = model.equipment.get('digestor1').getObjectByName('porta-frontal').geometry;
  const material = model.equipment.get('pump').children[1].material;
  let geometriesDisposed = 0;
  let materialsDisposed = 0;
  geometry.addEventListener('dispose', () => geometriesDisposed++);
  material.addEventListener('dispose', () => materialsDisposed++);
  model.dispose();
  model.dispose();
  assert.equal(geometriesDisposed, 1);
  assert.equal(materialsDisposed, 1);
});
