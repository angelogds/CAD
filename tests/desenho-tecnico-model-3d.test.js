'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { sanitizeCadData } = require('../modules/desenho-tecnico/desenho-tecnico.cad.service');
const logic = import(pathToFileURL(path.join(__dirname, '../public/js/cad-model-3d.logic.mjs')).href);

function shaft(id = 'shaft-1', overrides = {}) {
  return { id, type: 'shaft', geometry: {
    origin: { x: 20, y: 30 }, orientation: 'horizontal',
    segments: [{ diameter: 25, length: 40 }, { diameter: 40, length: 60 }, { diameter: 25, length: 40 }],
    ...overrides,
  } };
}

function flange(thickness = 12) {
  const groupId = 'flange-1';
  const parameters = { outerDiameter: 200, boreDiameter: 20, pitchDiameter: 100, holeDiameter: 10, holeCount: 2 };
  if (thickness != null) parameters.thickness = thickness;
  const circle = (id, x, y, radius, role) => ({ id, type: 'circle', x, y, radius,
    metadata: { groupId, componentType: 'flange', flangeParameters: { ...parameters }, role } });
  return [circle('outer', 100, 200, 100, 'contorno_externo'), circle('bore', 100, 200, 10, 'furo_central'),
    circle('hole-a', 150, 200, 5, 'furo_1'), circle('hole-b', 50, 200, 5, 'furo_2'),
    circle('pcd', 100, 200, 50, 'circulo_furacao'),
    { id: 'center', type: 'centerline', metadata: { groupId, componentType: 'flange', role: 'linha_centro_horizontal' } }];
}

test('CAD0009 preserva trechos Ø25×40 + Ø40×60 + Ø25×40 e posição sem chanfros presumidos', async () => {
  const { buildModel3D } = await logic;
  const result = buildModel3D({ objects: [shaft()] });
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.length, 140);
  assert.equal(item.maxDiameter, 40);
  assert.equal(item.bore, null);
  assert.deepEqual(item.profile, [
    { radius: 0, distance: 0 }, { radius: 12.5, distance: 0 }, { radius: 12.5, distance: 40 },
    { radius: 20, distance: 40 }, { radius: 20, distance: 100 }, { radius: 12.5, distance: 100 },
    { radius: 12.5, distance: 140 }, { radius: 0, distance: 140 }, { radius: 0, distance: 0 },
  ]);
  assert.deepEqual(item.position, { x: 20, y: 30, z: 0 });
  assert.deepEqual(result.bounds, { min: { x: 20, y: 10, z: -20 }, max: { x: 160, y: 50, z: 20 } });
  assert.deepEqual(result.unsupported, []);
});

test('alojamento cego termina na profundidade informada e alojamento passante deixa a face aberta', async () => {
  const { shaftProfilePoints } = await logic;
  const segments = [{ diameter: 40, length: 80 }];
  const blind = shaftProfilePoints({ segments, bore: { diameter: 12, depth: 25 } });
  assert.ok(blind.some((p) => p.radius === 6 && p.distance === 25));
  assert.ok(blind.some((p) => p.radius === 0 && p.distance === 80));
  const through = shaftProfilePoints({ segments, bore: { diameter: 12, depth: 80 } });
  assert.ok(through.every((p) => p.radius >= 6));
  assert.deepEqual(through.at(-2), { radius: 6, distance: 80 });
  assert.deepEqual(through.at(-1), through[0]);
});

test('alojamento que invade trecho menor e furos transversais impedem prévia volumétrica incompleta', async () => {
  const { buildModel3D } = await logic;
  const result = buildModel3D({ objects: [
    shaft('invalid-bore', { segments: [{ diameter: 100, length: 20 }, { diameter: 30, length: 40 }], bore: { diameter: 40, depth: 25 } }),
    shaft('cross-holes', { crossHoles: [{ distance: 20, diameter: 13 }] }),
  ] });
  assert.equal(result.items.length, 0);
  assert.equal(result.bounds, null);
  assert.match(result.unsupported[0].reason, /invade/);
  assert.match(result.unsupported[1].reason, /Furos transversais/);
});

test('múltiplos eixos mantêm origens e orientações em vez de selecionar um arbitrariamente', async () => {
  const { buildModel3D } = await logic;
  const result = buildModel3D({ objects: [shaft('horizontal'), shaft('vertical', { origin: { x: -50, y: -20 }, orientation: 'vertical' })] });
  assert.deepEqual(result.items.map((item) => item.id), ['horizontal', 'vertical']);
  assert.equal(result.items[1].orientation, 'vertical');
  assert.deepEqual(result.bounds.min, { x: -70, y: -20, z: -20 });
  assert.deepEqual(result.bounds.max, { x: 160, y: 120, z: 20 });
});

test('metadados MLightCAD só geram eixo quando todos os trechos ainda correspondem ao 2D', async () => {
  const { buildModel3D } = await logic;
  const spec = shaft().geometry;
  const objects = [
    { type: 'rect', x: 20, y: 17.5, width: 40, height: 25 },
    { type: 'rect', x: 60, y: 10, width: 60, height: 40 },
    { type: 'polyline', closed: true, points: [{ x: 120, y: 17.5 }, { x: 160, y: 17.5 }, { x: 160, y: 42.5 }, { x: 120, y: 42.5 }] },
  ];
  const result = buildModel3D({ objects, shaftSheet: spec });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].kind, 'shaft');
  assert.deepEqual(result.unsupported, []);
  objects[0].width = 41;
  const changed = buildModel3D({ objects, shaftSheet: spec });
  assert.equal(changed.items.length, 0);
  assert.match(changed.unsupported[0].reason, /diverge/);
});

test('retângulos contíguos sem cadastro paramétrico não são inferidos como eixo', async () => {
  const { buildModel3D } = await logic;
  const result = buildModel3D({ objects: [0, 20, 40].map((x) => ({ type: 'rect', x, y: 0, width: 20, height: 10, thickness: 1 })) });
  assert.equal(result.items.length, 0);
  assert.ok(result.unsupported.every((item) => /espessura 3D/.test(item.reason)));
});

test('flange gera um disco extrudado com furação real, sem extrudar PCD ou círculos separadamente', async () => {
  const { buildModel3D } = await logic;
  const result = buildModel3D(sanitizeCadData({ objects: flange() }));
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.kind, 'flange');
  assert.equal(item.thickness, 12);
  assert.deepEqual(item.profile, { type: 'circle', radius: 100 });
  assert.deepEqual(item.position, { x: 100, y: 200, z: 0 });
  assert.deepEqual(item.holes, [{ x: 0, y: 0, radius: 10 }, { x: 50, y: 0, radius: 5 }, { x: -50, y: 0, radius: 5 }]);
  assert.deepEqual(result.bounds, { min: { x: 0, y: 100, z: 0 }, max: { x: 200, y: 300, z: 12 } });
});

test('furo movido é representado por sua posição atual, sem reconstrução por PCD antigo', async () => {
  const { buildModel3D } = await logic;
  const objects = flange();
  objects[2].x = 145;
  objects[2].y = 205;
  const result = buildModel3D({ objects });
  assert.deepEqual(result.items[0].holes[1], { x: 45, y: 5, radius: 5 });
});

test('flange sem espessura não assume 1 mm da normalização nem espessura padrão', async () => {
  const { buildModel3D } = await logic;
  const data = sanitizeCadData({ defaultThickness: 10, objects: flange(null) });
  assert.equal(data.objects[0].thickness, 1);
  const result = buildModel3D(data);
  assert.equal(result.items.length, 0);
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /espessura 3D/);
});

test('flange incompleto, sobreposto ou com furo externo exige correção antes de gerar volume', async () => {
  const { buildModel3D } = await logic;
  const missing = flange().filter((object) => object.id !== 'hole-a');
  assert.match(buildModel3D({ objects: missing }).unsupported[0].reason, /incompleta/);
  const overlap = flange(); overlap[2].x = 110;
  assert.match(buildModel3D({ objects: overlap }).unsupported[0].reason, /sobrepõem/);
  const outside = flange(); outside[2].x = 198;
  assert.match(buildModel3D({ objects: outside }).unsupported[0].reason, /ultrapassa/);
});

test('chapas aceitam apenas profundidade física explícita e mantêm perfil côncavo e posição', async () => {
  const { buildModel3D } = await logic;
  const result = buildModel3D({ objects: [{ id: 'plate', type: 'polyline', geometry: {
    closed: true, points: [{ x: -10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 0, y: 30 }, { x: 0, y: 60 }, { x: -10, y: 60 }],
  }, metadata: { extrusionDepth: 8 } }] });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].profile.points.length, 6);
  assert.deepEqual(result.items[0].position, { x: -10, y: 20, z: 0 });
  assert.deepEqual(result.bounds, { min: { x: -10, y: 20, z: 0 }, max: { x: 30, y: 60, z: 8 } });
});

test('polilinhas abertas, cruzadas, degeneradas e curvas não geram extrusões falsas', async () => {
  const { buildModel3D } = await logic;
  const shape = (points, closed = true) => ({ type: 'polyline', points, closed, metadata: { extrusionDepth: 10 } });
  const result = buildModel3D({ objects: [
    shape([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], false),
    shape([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]),
    shape([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]),
    shape([{ x: 0, y: 0, bulge: .5 }, { x: 10, y: 0 }, { x: 10, y: 10 }]),
  ] });
  assert.equal(result.items.length, 0);
  assert.match(result.unsupported[0].reason, /Feche/);
  assert.match(result.unsupported[1].reason, /cruza/);
  assert.match(result.unsupported[2].reason, /sem área/);
  assert.match(result.unsupported[3].reason, /arcos/);
});

test('espessura fornecida pelo usuário na prévia não altera o documento', async () => {
  const { buildModel3D } = await logic;
  const input = { objects: [{ id: 'rect', type: 'rect', geometry: { x: 20, y: 30, width: -15, height: 20 } }] };
  const before = JSON.stringify(input);
  const result = buildModel3D(input, { thicknessById: { rect: 6 } });
  assert.equal(result.items[0].thickness, 6);
  assert.deepEqual(result.bounds, { min: { x: 5, y: 30, z: 0 }, max: { x: 20, y: 50, z: 6 } });
  assert.equal(JSON.stringify(input), before);
});

test('recortes de chapa não suportados são recusados em vez de preencher os vazios', async () => {
  const { buildModel3D } = await logic;
  const result = buildModel3D({ objects: [{ id: 'cut-plate', type: 'rect', geometry: {
    x: 0, y: 0, width: 100, height: 50, holes: [{ x: 30, y: 20, diameter: 10 }],
  }, metadata: { extrusionDepth: 6 } }] });
  assert.equal(result.items.length, 0);
  assert.match(result.unsupported[0].reason, /Recortes de chapa/);
});

test('textos, cotas e imagens não viram sólidos; unidade desconhecida e limite de objetos são rejeitados', async () => {
  const { buildModel3D } = await logic;
  const result = buildModel3D({ objects: [{ type: 'text' }, { type: 'dimension' }, { type: 'line' }, { type: 'image' }] });
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.unsupported, []);
  assert.throws(() => buildModel3D({ unidade: 'cm' }), /milímetros/);
  assert.throws(() => buildModel3D({ objects: Array.from({ length: 2001 }, () => ({ type: 'line' })) }), /2000/);
});

test('falha de uma peça mantém as outras válidas e anuncia prévia parcial', async () => {
  const { buildModel3D } = await logic;
  const result = buildModel3D({ objects: [shaft(), { type: 'rect', x: 0, y: 0, width: 20, height: 30 }] });
  assert.equal(result.items.length, 1);
  assert.equal(result.unsupported.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /1 entidade/);
});
