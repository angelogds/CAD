'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = process.cwd();
const logicUrl = pathToFileURL(path.join(root, 'frontend', 'mlightcad-advanced-modify.logic.mjs')).href;
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function near(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance, `${actual} deveria ser próximo de ${expected}`);
}

test('MIRROR reflete ponto corretamente em eixos horizontal, vertical e diagonal', async () => {
  const { reflectPointAcrossAxis } = await import(logicUrl);

  const horizontal = reflectPointAcrossAxis({ x: 30, y: 20 }, { x: 0, y: 0 }, { x: 100, y: 0 });
  assert.equal(horizontal.ok, true);
  near(horizontal.point.x, 30);
  near(horizontal.point.y, -20);

  const vertical = reflectPointAcrossAxis({ x: 30, y: 20 }, { x: 10, y: 0 }, { x: 10, y: 100 });
  assert.equal(vertical.ok, true);
  near(vertical.point.x, -10);
  near(vertical.point.y, 20);

  const diagonal = reflectPointAcrossAxis({ x: 20, y: 5 }, { x: 0, y: 0 }, { x: 100, y: 100 });
  assert.equal(diagonal.ok, true);
  near(diagonal.point.x, 5);
  near(diagonal.point.y, 20);
});

test('MIRROR rejeita eixo formado pelo mesmo ponto', async () => {
  const { buildReflectionMatrixValues } = await import(logicUrl);
  const result = buildReflectionMatrixValues({ x: 5, y: 5 }, { x: 5, y: 5 });
  assert.equal(result.ok, false);
  assert.match(result.error, /devem ser diferentes/i);
});

test('FILLET orienta arco horário como arco equivalente anti-horário do MLightCAD', async () => {
  const { orientFilletArc } = await import(logicUrl);
  const result = orientFilletArc({ cx: 10, cy: 10, radius: 5, startAngle: 0.2, endAngle: 1.4, ccw: false });
  near(result.startAngle, 1.4);
  near(result.endAngle, 0.2);
});

test('extensão registra MIRROR FILLET CHAMFER e reutiliza os solvers geométricos validados', () => {
  const source = read('frontend/mlightcad-advanced-modify.js');
  assert.match(source, /class CampoMirrorCmd extends AcEdCommand/);
  assert.match(source, /class CampoFilletCmd extends AcEdCommand/);
  assert.match(source, /class CampoChamferCmd extends AcEdCommand/);
  assert.match(source, /solveFillet\(/);
  assert.match(source, /solveChamfer\(/);
  assert.match(source, /pickedPoint/);
  assert.match(source, /cloneAndTransform/);
  assert.match(source, /new AcDbArc\(/);
  assert.match(source, /new AcDbLine\(/);
  assert.match(source, /manager\.addCommand\(group, 'mirror'/);
  assert.match(source, /manager\.addCommand\(group, 'fillet'/);
  assert.match(source, /manager\.addCommand\(group, 'chamfer'/);
});

test('bundle e runtime carregam os modificadores avançados no workspace atual', () => {
  const build = read('scripts/build-mlightcad.mjs');
  const entry = read('public/js/cad-engine-v2.js');
  const runtime = read('public/js/cad-advanced-modify-runtime.js');

  assert.match(build, /mlightcad-advanced-modify/);
  assert.match(entry, /cad-advanced-modify-runtime\.js/);
  assert.match(runtime, /mlightcad-advanced-modify\.js/);
  assert.match(runtime, /mlightMirrorGeometryBtn/);
  assert.match(runtime, /mlightFilletGeometryBtn/);
  assert.match(runtime, /mlightChamferGeometryBtn/);
  assert.match(runtime, /const run = \(command, label\) =>/);
  assert.match(runtime, /run\('mirror', 'Espelhar'\)/);
  assert.match(runtime, /run\('fillet', 'Arredondar'\)/);
  assert.match(runtime, /run\('chamfer', 'Chanfro 2D'\)/);
  assert.match(runtime, /app\.runCommand\(command\)/);
});
