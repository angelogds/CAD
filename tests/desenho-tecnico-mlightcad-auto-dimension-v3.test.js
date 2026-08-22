'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = process.cwd();
const logicUrl = pathToFileURL(path.join(root, 'frontend', 'mlightcad-auto-dimension-v3.logic.mjs')).href;
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function rectangle(id, x, y, width, height, layer = '0') {
  return {
    id,
    layer,
    closed: true,
    points: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height }
    ]
  };
}

function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance, `${actual} deveria ser próximo de ${expected}`);
}

test('layers técnicos V3 reutilizam namespace FAB_* e não tratam chaveta como anotação', async () => {
  const { TECHNICAL_LAYERS, TECHNICAL_LAYER_NAMES, isNonModelLayer } = await import(logicUrl);

  assert.equal(TECHNICAL_LAYERS.OUTLINE, 'FAB_CONTORNO');
  assert.equal(TECHNICAL_LAYERS.DIMENSIONS, 'FAB_COTAS');
  assert.equal(TECHNICAL_LAYERS.CENTER, 'FAB_EIXOS_CENTRO');
  assert.equal(TECHNICAL_LAYERS.NOTES, 'FAB_NOTAS_TECNICAS');
  assert.equal(TECHNICAL_LAYERS.SHEET, 'FAB_FOLHA_TECNICA');
  assert.equal(TECHNICAL_LAYERS.KEYWAY, 'FAB_RASGOS_CHAVETA');
  assert.equal(new Set(TECHNICAL_LAYER_NAMES).size, TECHNICAL_LAYER_NAMES.length);

  assert.equal(isNonModelLayer('FAB_COTAS'), true);
  assert.equal(isNonModelLayer('FAB_FOLHA_TECNICA'), true);
  assert.equal(isNonModelLayer('FAB_NOTAS_TECNICAS'), true);
  assert.equal(isNonModelLayer('FAB_EIXOS_CENTRO'), true);
  assert.equal(isNonModelLayer('FAB_RASGOS_CHAVETA'), false);
  assert.equal(isNonModelLayer('0'), false);
});

test('AUTO COTAR V3 organiza eixo escalonado com comprimentos, diâmetros e total', async () => {
  const { planAutoDimensions } = await import(logicUrl);
  const snapshot = {
    circles: [],
    lines: [],
    ellipses: [],
    polylines: [
      rectangle('s1', 0, -30, 80, 60),
      rectangle('s2', 80, -25, 120, 50),
      rectangle('s3', 200, -20, 60, 40)
    ]
  };

  const plan = planAutoDimensions(snapshot);
  assert.equal(plan.summary['shaft-length'], 3);
  assert.equal(plan.summary['shaft-diameter'], 3);
  assert.equal(plan.summary['shaft-total'], 1);
  assert.equal(plan.summary.total, 7);

  const lengths = plan.dimensions.filter((item) => item.semantic === 'shaft-length');
  assert.deepEqual(lengths.map((item) => item.label), ['80', '120', '60']);
  assert.equal(new Set(lengths.map((item) => item.dimLinePoint.y)).size, 1, 'comprimentos do eixo devem compartilhar a mesma faixa de cotagem');

  const total = plan.dimensions.find((item) => item.semantic === 'shaft-total');
  assert.equal(total.label, 'TOTAL 260');
  assert.ok(total.dimLinePoint.y < lengths[0].dimLinePoint.y, 'cota total deve ficar externamente às cotas de trechos');

  const diameters = plan.dimensions.filter((item) => item.semantic === 'shaft-diameter');
  assert.deepEqual(diameters.map((item) => item.label), ['Ø60', 'Ø50', 'Ø40']);
});

test('AUTO COTAR V3 reconhece flange com diâmetros de peça, furos e PCD', async () => {
  const { planAutoDimensions } = await import(logicUrl);
  const holes = Array.from({ length: 8 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 8;
    return {
      id: `h${index + 1}`,
      cx: Math.cos(angle) * 110,
      cy: Math.sin(angle) * 110,
      radius: 9,
      layer: '0'
    };
  });
  const snapshot = {
    lines: [], polylines: [], ellipses: [],
    circles: [
      { id: 'outer', cx: 0, cy: 0, radius: 150, layer: '0' },
      { id: 'bore', cx: 0, cy: 0, radius: 40, layer: '0' },
      ...holes
    ]
  };

  const plan = planAutoDimensions(snapshot);
  const labels = plan.dimensions.map((item) => item.label);
  assert.ok(labels.includes('Ø300'));
  assert.ok(labels.includes('Ø80'));
  assert.ok(labels.includes('8x Ø18'));
  assert.ok(labels.includes('PCD Ø220'));
  assert.equal(plan.summary['bolt-hole-diameter'], 1);
  assert.equal(plan.summary['bolt-circle-pcd'], 1);

  const pcd = plan.dimensions.find((item) => item.semantic === 'bolt-circle-pcd');
  near(pcd.p1.x, -110);
  near(pcd.p2.x, 110);
  assert.ok(pcd.dimLinePoint.y > plan.bounds.maxY, 'PCD deve ficar acima do envelope da peça');
});

test('faixas externas colocam largura abaixo, altura à direita e diâmetro acima da peça', async () => {
  const { planAutoDimensions } = await import(logicUrl);
  const snapshot = {
    lines: [],
    ellipses: [],
    circles: [{ id: 'c1', cx: 50, cy: 25, radius: 10, layer: '0' }],
    polylines: [rectangle('p1', 0, 0, 100, 50)]
  };

  const plan = planAutoDimensions(snapshot);
  const width = plan.dimensions.find((item) => item.semantic === 'profile-width');
  const height = plan.dimensions.find((item) => item.semantic === 'profile-height');
  const diameter = plan.dimensions.find((item) => item.semantic === 'circle-diameter');

  assert.ok(width.dimLinePoint.y < plan.bounds.minY);
  assert.ok(height.dimLinePoint.x > plan.bounds.maxX);
  assert.ok(diameter.dimLinePoint.y > plan.bounds.maxY);
});

test('planejador limita quantidade de cotas automáticas para preservar legibilidade', async () => {
  const { AUTO_DIM_V3_MAX, planAutoDimensions } = await import(logicUrl);
  const circles = Array.from({ length: 60 }, (_, index) => ({
    id: `circle-${index}`,
    cx: index * 12,
    cy: 0,
    radius: index + 2,
    layer: '0'
  }));
  const plan = planAutoDimensions({ circles, lines: [], polylines: [], ellipses: [] });
  assert.ok(plan.dimensions.length <= AUTO_DIM_V3_MAX);
  assert.equal(plan.dimensions.length, AUTO_DIM_V3_MAX);
});

test('integração V3 mantém V2 como fallback e liga build, runtime e layer centralizado de cotas', () => {
  const build = read('scripts/build-mlightcad.mjs');
  const loader = read('public/js/cad-engine-v2.js');
  const runtime = read('public/js/cad-auto-dimension-v3-runtime.js');
  const entry = read('frontend/mlightcad-auto-dimension-v3.entry.js');
  const logic = read('frontend/mlightcad-auto-dimension-v3.logic.mjs');

  assert.match(build, /mlightcad-auto-dimension-v3/);
  assert.match(loader, /cad-auto-dimension-v3-runtime\.js/);
  assert.match(runtime, /autoDimensionAllLegacy/);
  assert.match(runtime, /fabrication\.autoDimensionAll = tools\.autoDimensionAll/);
  assert.match(runtime, /v2-fallback/);
  assert.match(runtime, /AUTO COTAR V3/);
  assert.match(entry, /AcDbAlignedDimension/);
  assert.match(entry, /TECHNICAL_LAYERS\.DIMENSIONS/);
  assert.match(logic, /DIMENSIONS: 'FAB_COTAS'/);
  assert.match(entry, /AUTO_DIM_PREFIX = '\*AD'/);
  assert.match(entry, /isNonModelLayer/);
  assert.match(entry, /clearAutoDimensions/);
});
