const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { sanitizeCadData } = require('../modules/desenho-tecnico/desenho-tecnico.cad.service');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

async function loadGeometry() {
  const source = read('public/js/modules/desenho-tecnico/core/geometry.js');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('salvamento preserva geometria precisa de arco e configurações do viewport', () => {
  const payload = sanitizeCadData({
    schemaVersion: 2,
    gridStep: 0.25,
    snappingConfig: { enabled: true, intersection: true, quadrant: false },
    viewport: { zoom: 2.5, offsetX: 123.456, offsetY: -78.9 },
    objects: [{
      id: 'arc-1',
      type: 'arc',
      layer: 'contorno',
      geometry: { cx: 10.125, cy: -3.75, radius: 42.625, startAngle: 0.25, endAngle: 2.75, ccw: false },
    }],
  });

  assert.equal(payload.gridStep, 0.25);
  assert.deepEqual(payload.viewport, { zoom: 2.5, offsetX: 123.456, offsetY: -78.9 });
  assert.equal(payload.snappingConfig.quadrant, false);
  assert.deepEqual(payload.objects[0].geometry, {
    cx: 10.125,
    cy: -3.75,
    radius: 42.625,
    startAngle: 0.25,
    endAngle: 2.75,
    ccw: false,
  });
});

test('retângulo invertido mantém o mesmo envelope depois de salvar', () => {
  const payload = sanitizeCadData({
    objects: [{ id: 'rect-1', type: 'rect', x: 100, y: 80, width: -35.5, height: -20.25 }],
  });
  assert.deepEqual(
    { x: payload.objects[0].x, y: payload.objects[0].y, width: payload.objects[0].width, height: payload.objects[0].height },
    { x: 64.5, y: 59.75, width: 35.5, height: 20.25 },
  );
});

test('cotas são separadas e deduplicadas por id no payload persistido', () => {
  const dimension = { id: 'dim-1', type: 'dimension', geometry: { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, textPoint: { x: 5, y: -2 }, label: '10.000' } };
  const payload = sanitizeCadData({
    objects: [dimension],
    dimensions: [dimension, { ...dimension, id: 'dim-2' }],
  });
  assert.equal(payload.objects.length, 0);
  assert.deepEqual(payload.dimensions.map((item) => item.id).sort(), ['dim-1', 'dim-2']);
});

test('núcleo geométrico calcula interseções de segmentos, retas e círculos', async () => {
  const geometry = await loadGeometry();
  const segment = geometry.segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 });
  assert.ok(segment);
  assert.ok(Math.abs(segment.x - 5) < 1e-9);
  assert.ok(Math.abs(segment.y - 5) < 1e-9);

  const outside = geometry.segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 });
  assert.equal(outside, null);
  const infinite = geometry.lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 });
  assert.equal(infinite.x, 2);

  const lineCircle = geometry.lineCircleIntersections({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, 5, true);
  assert.deepEqual(lineCircle.map((point) => Number(point.x.toFixed(6))), [-5, 5]);
  const circles = geometry.circleCircleIntersections({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5);
  assert.equal(circles.length, 2);
  assert.ok(circles.every((point) => Math.abs(Math.abs(point.y) - 3) < 1e-9));
});

test('entrada de coordenadas aceita absoluto, relativo e polar', async () => {
  const geometry = await loadGeometry();
  assert.deepEqual(geometry.parseCadPointInput('12.5,8.25'), { x: 12.5, y: 8.25 });
  assert.deepEqual(geometry.parseCadPointInput('@5,-2', { x: 10, y: 10 }), { x: 15, y: 8 });
  const polar = geometry.parseCadPointInput('@10<90', { x: 2, y: 3 });
  assert.ok(Math.abs(polar.x - 2) < 1e-9);
  assert.ok(Math.abs(polar.y - 13) < 1e-9);
  assert.deepEqual(geometry.parseCadPointInput('25', { x: 0, y: 0 }, { x: 3, y: 4 }), { x: 15, y: 20 });
});

test('comandos essenciais estão ativos e a medição não é mais placeholder', () => {
  const controller = read('public/js/modules/desenho-tecnico/desenho-tecnico.controller.js');
  const measure = read('public/js/modules/desenho-tecnico/tools/measure.tool.js');
  const editor = read('views/desenho-tecnico/cad-editor-v2.ejs');
  assert.match(controller, /new MoveTool\(this\.ctx\)/);
  assert.match(controller, /new CopyTool\(this\.ctx\)/);
  assert.match(controller, /new EraseTool\(this\.ctx\)/);
  assert.doesNotMatch(controller, /const unsupported = \['copy', 'move', 'erase'\]/);
  assert.match(measure, /Distância .*ΔX .*ΔY .*Ângulo/);
  assert.doesNotMatch(measure, /em breve/i);
  assert.match(editor, /id="cadCommandInput"/);
});

test('carregamento do editor deduplica entidades pelo identificador', () => {
  const controller = read('public/js/modules/desenho-tecnico/desenho-tecnico.controller.js');
  assert.match(controller, /const entityById = new Map\(\)/);
  assert.match(controller, /entityById\.set\(String\(entity\.id\), entity\)/);
});

test('exportações PDF e SVG suportam arcos, polilinhas, eixos e cotas do schema v2', () => {
  const pdf = read('modules/desenho-tecnico/desenho-tecnico.pdf.service.js');
  const svg = read('modules/desenho-tecnico/desenho-tecnico.svg.service.js');
  assert.match(pdf, /case 'arc'/);
  assert.match(pdf, /case 'polyline'/);
  assert.match(pdf, /const geometry = shaft\.geometry \|\| shaft/);
  assert.match(pdf, /const geometry = dim\.geometry \|\| dim/);
  assert.match(svg, /const arcPath = \(obj\)/);
  assert.match(svg, /const shaftSvg = \(obj\)/);
  assert.match(svg, /const dimensionSvg = dimensions\.map/);
});
