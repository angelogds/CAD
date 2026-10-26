const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('../public/js/automacao-digestores-scene.mjs');

test('as quatro torres ficam na tampa superior e seguem as cores do painel', async () => {
  const model = (await load()).createDigestorScene();
  try {
    assert.equal(model.towers.length, 4);
    for (let i = 0; i < 4; i++) {
      const tower = model.towers[i];
      assert.equal(tower.group.parent, model.equipment.get('digestor' + (i + 1)));
      assert.ok(tower.group.position.y > 1.1);
      assert.equal(tower.state, 'DESLIGADO');
      assert.ok(tower.lenses.red && tower.lenses.yellow && tower.lenses.green);
    }
    model.update({ mode: 'LIVE' }, 1, {
      thermal: ['VERDE', 'AMARELO', 'VERMELHO', 'VERMELHO_PISCANDO'], blinkOn: true
    });
    for (let i = 0; i < 4; i++) {
      const tower = model.towers[i];
      const expected = ['green', 'yellow', 'red', 'red'][i];
      for (const [name, lens] of Object.entries(tower.lenses)) {
        assert.equal(lens.bulb.material.emissiveIntensity > 0, name === expected, 'D' + (i + 1) + ': ' + name);
      }
    }
    model.update({ mode: 'LIVE' }, 1.1, {
      thermal: ['VERDE', 'AMARELO', 'VERMELHO', 'VERMELHO_PISCANDO'], blinkOn: false
    });
    assert.equal(model.towers[3].lenses.red.bulb.material.emissiveIntensity, 0);
    assert.ok(model.towers[2].lenses.red.bulb.material.emissiveIntensity > 0);
  } finally { model.dispose(); }
});

test('sinal vencido, inválido ou digestor fora da seleção apaga sua torre', async () => {
  const model = (await load()).createDigestorScene();
  try {
    model.update({ mode: 'LIVE' }, 1, { thermal: ['VERMELHO_PISCANDO', 'VERDE', 'AMARELO', 'VERMELHO'] });
    model.update({ mode: 'LIVE' }, 2, { thermal: ['DESLIGADO', 'VERDE', undefined, 'valor-invalido'] });
    assert.equal(model.towers[0].state, 'DESLIGADO');
    assert.equal(model.towers[1].state, 'VERDE');
    assert.equal(model.towers[2].state, 'DESLIGADO');
    assert.equal(model.towers[3].state, 'DESLIGADO');
    for (const index of [0, 2, 3])
      for (const lens of Object.values(model.towers[index].lenses))
        assert.equal(lens.bulb.material.emissiveIntensity, 0);
    model.update({ mode: 'LIVE' }, 3);
    assert.ok(model.towers.every(tower => tower.state === 'DESLIGADO'));
  } finally { model.dispose(); }
});

test('a temperatura real não afirma rotação sem retorno mecânico independente', async () => {
  const model = (await load()).createDigestorScene();
  try {
    const rotor = model.rotors.find(item => item.key === 'digestor1');
    assert.ok(rotor);
    model.update({ mode: 'LIVE', running: true, digestors: [{ shaft: true, tempC: 125 }] }, 1, { thermal: ['VERMELHO_PISCANDO'] });
    assert.equal(rotor.mesh.rotation[rotor.axis], 0);
    assert.equal(model.towers[0].state, 'VERMELHO_PISCANDO');
    model.update({ mode: 'SIMULACAO', running: true, digestors: [{ shaft: true }] }, 2, { thermal: ['VERMELHO'] });
    assert.ok(rotor.mesh.rotation[rotor.axis] > 0);
    const angle = rotor.mesh.rotation[rotor.axis];
    model.update({ mode: 'SIMULACAO', running: false, digestors: [{ shaft: true }] }, 3, { thermal: ['AMARELO'] });
    assert.equal(rotor.mesh.rotation[rotor.axis], angle);
    assert.equal(model.towers[0].state, 'AMARELO');
  } finally { model.dispose(); }
});

test('telemetria e simulador publicam a mesma estrutura térmica sem alterações de campo', () => {
  const root = path.join(__dirname, '..');
  const telemetry = fs.readFileSync(path.join(root, 'public/js/automacao-digestores.js'), 'utf8');
  const simulation = fs.readFileSync(path.join(root, 'public/js/automacao-simulador.js'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'public/js/automacao-digestores-circuito.js'), 'utf8');
  const viewer = fs.readFileSync(path.join(root, 'public/js/automacao-industrial-viewer.mjs'), 'utf8');
  const svg = fs.readFileSync(path.join(root, 'views/automacao/partials/digestores-circuito.ejs'), 'utf8');
  assert.match(telemetry, /state\.blink \? 'VERMELHO_PISCANDO'/);
  assert.match(telemetry, /new CustomEvent\('digestores-circuito:thermal'/);
  assert.match(simulation, /selected\(item\) && Number\.isFinite\(item\.temp\)/);
  assert.match(simulation, /new CustomEvent\('digestores-circuito:thermal'/);
  assert.match(controller, /applyThermal\(root\.CGDThermalState\)/);
  assert.match(viewer, /thermalEvent/);
  assert.match(svg, /data-circuito-tower="<%= id %>"/);
});
