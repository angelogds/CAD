const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { sanitizeCadData } = require('../modules/desenho-tecnico/desenho-tecnico.cad.service');

// Load the same browser modules as ESM without a DOM or a database.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-drafting-workflow-'));
fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
fs.cpSync(path.join(__dirname, '../public/js/modules/desenho-tecnico'), path.join(directory, 'drawing'), { recursive: true });
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
const load = (name) => import(pathToFileURL(path.join(directory, 'drawing', name)).href);

async function controller(data = {}) {
  const [{ DesenhoTecnicoController }, { createDesenhoTecnicoState }] = await Promise.all([
    load('desenho-tecnico.controller.js'), load('desenho-tecnico.state.js'),
  ]);
  const cad = Object.create(DesenhoTecnicoController.prototype);
  cad.state = createDesenhoTecnicoState();
  cad.toolManager = { name: 'select' };
  cad.viewport = { getViewState: () => ({ zoom: 1, offsetX: 0, offsetY: 0 }) };
  cad.previewLayer = { items: [], set(items) { this.items = items; } };
  cad.render = () => {};
  cad.markDirty = () => {};
  cad.loadInitial(data);
  return cad;
}

test('polar e ortho são exclusivos e sobrevivem ao ciclo salvar/reabrir', async () => {
  const cad = await controller({ polarConfig: { enabled: true, angleDeg: 30 } });
  assert.deepEqual(cad.state.polarConfig, { enabled: true, angleDeg: 30 });
  cad.executeAction('toggle-ortho');
  assert.equal(cad.state.orthoEnabled, true);
  assert.equal(cad.state.polarConfig.enabled, false);
  cad.executeAction('toggle-polar');
  assert.equal(cad.state.orthoEnabled, false);
  assert.equal(cad.state.polarConfig.enabled, true);
  const saved = sanitizeCadData(cad.serialize());
  const reopened = await controller(saved);
  assert.deepEqual(reopened.state.polarConfig, { enabled: true, angleDeg: 30 });
  assert.deepEqual(sanitizeCadData({ polarConfig: { enabled: true, angleDeg: 0 } }).polarConfig, { enabled: true, angleDeg: 45 });
  assert.equal(sanitizeCadData({ orthoEnabled: true, polarConfig: { enabled: true } }).polarConfig.enabled, false);
});

test('polar captura direção com snap desligado e respeita tolerância do cursor', async () => {
  const cad = await controller({ snapEnabled: false, polarConfig: { enabled: true, angleDeg: 45 } });
  const point = cad.getPoint({ x: 100, y: 98 }, { x: 0, y: 0 });
  assert.ok(Math.abs(point.x - 99) < 1e-8);
  assert.ok(Math.abs(point.y - 99) < 1e-8);
  assert.deepEqual(cad.getPoint({ x: 100, y: 60 }, { x: 0, y: 0 }), { x: 100, y: 60 });
});

test('snap de proximidade ignora camada oculta e limpa marcador ao desativar', async () => {
  const cad = await controller({
    layers: { hidden: { visible: false } },
    objects: [{ id: 'hidden-circle', type: 'circle', x: 0, y: 0, radius: 20, layer: 'hidden' }],
    snappingConfig: { grid: false },
  });
  cad.previewLayer.items = [{ type: 'snap', point: { x: 0, y: 0 } }];
  assert.deepEqual(cad.getPoint({ x: 19, y: 1 }), { x: 19, y: 1 });
  assert.equal(cad.state.snappingConfig.activeKind, null);
  assert.equal(cad.previewLayer.items.length, 0);
});

test('grade não desvia o segmento de um raio polar ou ortogonal', async () => {
  const cad = await controller({ gridStep: 20, polarConfig: { enabled: true, angleDeg: 45 } });
  const from = { x: 5, y: 0 };
  const point = cad.getPoint({ x: 45, y: 40 }, from);
  assert.ok(Math.abs((point.x - from.x) - (point.y - from.y)) < 1e-8);
  cad.state.orthoEnabled = true;
  cad.state.polarConfig.enabled = false;
  assert.equal(cad.getPoint({ x: 42, y: 6 }, { x: 5, y: 3 }).y, 3);
});

test('snap e interseção incluem a aresta de fechamento da polilinha', async () => {
  const cad = await controller({ objects: [
    { id: 'poly', type: 'polyline', closed: true, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }] },
    { id: 'line', type: 'line', x: 0, y: 20, x2: 40, y2: 20 },
  ] });
  assert.ok(cad.getSnapCandidates().some((p) => p.kind === 'intersection' && p.x === 20 && p.y === 20));
  const nearest = cad.getNearestPointOnEntity(cad.state.entities[0], { x: 19, y: 21 });
  assert.ok(Math.abs(nearest.x - 20) < 1e-8 && Math.abs(nearest.y - 20) < 1e-8);
});

test('flange com espessura opcional mantém medidas e furos ao salvar/reabrir', async () => {
  const { createFlangeGeometry } = await load('core/flange.factory.js');
  const input = { outerDiameter: 200, boreDiameter: 60, pitchDiameter: 150, holeDiameter: 18, holeCount: 8, thickness: '12,5' };
  const flange = createFlangeGeometry(input, { x: 30, y: 60 }, { groupId: 'flange-physical' });
  const cad = await controller(sanitizeCadData({ objects: flange.objects.map((object, index) => ({
    ...object, id: `flange-${index}`, x: object.geometry.cx ?? object.geometry.x1,
    y: object.geometry.cy ?? object.geometry.y1, radius: object.geometry.radius,
    x2: object.geometry.x2, y2: object.geometry.y2,
  })) }));
  const saved = sanitizeCadData(cad.serialize());
  const { buildModel3D } = await import('../public/js/cad-model-3d.logic.mjs');
  const model = buildModel3D(saved);
  assert.equal(model.items.length, 1);
  assert.equal(model.items[0].thickness, 12.5);
  assert.equal(model.items[0].holes.length, 9);
  assert.deepEqual(model.items[0].position, { x: 30, y: 60, z: 0 });
  const twoD = createFlangeGeometry({ ...input, thickness: '' });
  assert.equal('thickness' in twoD.parameters, false);
  for (const thickness of [-1, 0, 'abc', Infinity]) {
    assert.throws(() => createFlangeGeometry({ ...input, thickness }), /espessura/);
  }
});

test('linha de comando encaminha coordenadas e opções à ferramenta ativa', async () => {
  const cad = await controller();
  const calls = [];
  cad.toolManager.active = { name: 'polyline', applyInput: (value) => { calls.push(value); return true; } };
  assert.equal(cad.executeCommand('@12,5;8,25'), true);
  assert.equal(cad.executeCommand('C'), true);
  assert.equal(cad.executeCommand('U'), true);
  assert.equal(cad.executeCommand('Fechar'), true);
  assert.equal(cad.executeCommand('desfazer'), true);
  assert.deepEqual(calls, ['@12,5;8,25', 'c', 'u', 'c', 'u']);
});

test('cadastro paramétrico legado do eixo não é perdido ao editar o desenho 2D', async () => {
  const shaftSheet = { origin: { x: 100, y: 80 }, orientation: 'horizontal',
    segments: [{ length: 40, diameter: 25 }, { length: 60, diameter: 40 }, { length: 40, diameter: 25 }] };
  const cad = await controller({ shaftSheet });
  const saved = sanitizeCadData(cad.serialize());
  assert.deepEqual(saved.shaftSheet.segments, shaftSheet.segments);
  assert.deepEqual(saved.shaftSheet.origin, shaftSheet.origin);
  assert.notEqual(cad.state.shaftSheet, shaftSheet);
});
