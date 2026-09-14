const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeDimensionStyle,
  linePattern,
  getLinearDimensionLayout,
  getDimensionBounds,
} = require('../modules/desenho-tecnico/desenho-tecnico.dimension-pdf');

test('usa o ponto real da linha de cota do DXF em vez de inferir pelo texto', () => {
  const layout = getLinearDimensionLayout({
    geometry: {
      mode: 'aligned',
      p1: { x: -200, y: 0 },
      p2: { x: 200, y: 0 },
      dimensionLinePoint: { x: 0, y: 240 },
      textPoint: { x: 0, y: 255 },
    },
  });

  assert.deepEqual(layout.dimensionStart, { x: -200, y: 240 });
  assert.deepEqual(layout.dimensionEnd, { x: 200, y: 240 });
  assert.deepEqual(layout.textPoint, { x: 0, y: 255 });
});

test('mantém cotas horizontais em offsets diferentes sem sobreposição artificial', () => {
  const top = getLinearDimensionLayout({
    geometry: {
      mode: 'aligned',
      p1: { x: -200, y: 0 }, p2: { x: 200, y: 0 },
      dimensionLinePoint: { x: 0, y: 240 }, textPoint: { x: 0, y: 255 },
    },
  });
  const inner = getLinearDimensionLayout({
    geometry: {
      mode: 'aligned',
      p1: { x: 0, y: 0 }, p2: { x: 150, y: 0 },
      dimensionLinePoint: { x: 75, y: 60 }, textPoint: { x: 75, y: 72 },
    },
  });

  assert.equal(top.dimensionStart.y, 240);
  assert.equal(inner.dimensionStart.y, 60);
  assert.notEqual(top.dimensionStart.y, inner.dimensionStart.y);
});

test('mantém cota vertical na coordenada X definida no CAD', () => {
  const layout = getLinearDimensionLayout({
    geometry: {
      mode: 'aligned',
      p1: { x: 300, y: -200 }, p2: { x: 300, y: 200 },
      dimensionLinePoint: { x: 335, y: 0 }, textPoint: { x: 350, y: 0 },
    },
  });
  assert.equal(layout.dimensionStart.x, 335);
  assert.equal(layout.dimensionEnd.x, 335);
});

test('mantém fallback compatível para desenhos antigos sem dimensionLinePoint', () => {
  const layout = getLinearDimensionLayout({
    geometry: {
      mode: 'aligned',
      p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 },
      textPoint: { x: 50, y: 30 },
    },
  });
  assert.equal(layout.dimensionStart.y, 30);
  assert.equal(layout.dimensionEnd.y, 30);
});

test('normaliza cor e parâmetros de estilo vindos do CAD', () => {
  assert.deepEqual(normalizeDimensionStyle({
    style: { color: '#FF3B30', lineType: 'DASHDOT', lineWeight: 35, lineTypeScale: 1.5 },
  }), {
    color: '#ff3b30',
    lineType: 'DASHDOT',
    lineWeight: 35,
    lineTypeScale: 1.5,
  });
});

test('suporta linhas contínua, tracejada, oculta, centro e traço-ponto no PDF', () => {
  assert.equal(linePattern({ lineType: 'Continuous' }), null);
  assert.deepEqual(linePattern({ lineType: 'DASHED' }), [6, 3]);
  assert.deepEqual(linePattern({ lineType: 'HIDDEN' }), [3, 2]);
  assert.deepEqual(linePattern({ lineType: 'CENTER' }), [12, 3, 3, 3]);
  assert.deepEqual(linePattern({ lineType: 'DASHDOT' }), [8, 2, 1, 2]);
});

test('bounds incluem linha de cota e texto para evitar corte na prancha', () => {
  const bounds = getDimensionBounds({
    geometry: {
      mode: 'aligned',
      p1: { x: -200, y: 0 }, p2: { x: 200, y: 0 },
      dimensionLinePoint: { x: 0, y: 240 }, textPoint: { x: 0, y: 255 },
    },
  });
  assert.ok(bounds.maxY >= 263);
  assert.ok(bounds.minX <= -208);
  assert.ok(bounds.maxX >= 208);
});