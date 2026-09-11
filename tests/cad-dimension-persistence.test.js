const test = require('node:test');
const assert = require('node:assert/strict');

const {
  encodeBase64,
  parseDxfDimensions,
  recoverDimensions,
  patchSerializer,
} = require('../public/js/cad-dimension-persistence-runtime.js');

function pair(code, value) {
  return `${code}\n${value}\n`;
}

function alignedDimension({ handle, x1, y1, x2, y2, textX, textY, dimX, dimY, label = '' }) {
  return [
    pair(0, 'DIMENSION'),
    pair(5, handle),
    pair(8, 'cotas'),
    pair(2, `*D${handle}`),
    pair(70, 33),
    label ? pair(1, label) : '',
    pair(10, dimX), pair(20, dimY), pair(30, 0),
    pair(11, textX), pair(21, textY), pair(31, 0),
    pair(13, x1), pair(23, y1), pair(33, 0),
    pair(14, x2), pair(24, y2), pair(34, 0),
    pair(42, Math.hypot(x2 - x1, y2 - y1)),
  ].join('');
}

function sampleDxf() {
  return [
    pair(0, 'SECTION'), pair(2, 'HEADER'), pair(0, 'ENDSEC'),
    pair(0, 'SECTION'), pair(2, 'ENTITIES'),
    pair(0, 'CIRCLE'), pair(8, 'geometria_principal'), pair(10, 0), pair(20, 0), pair(40, 200),
    alignedDimension({ handle: 'A1', x1: -200, y1: 0, x2: 200, y2: 0, textX: 0, textY: 245, dimX: 0, dimY: 240 }),
    alignedDimension({ handle: 'A2', x1: 0, y1: 0, x2: 200, y2: 0, textX: 100, textY: 25, dimX: 100, dimY: 20 }),
    alignedDimension({ handle: 'A3', x1: 280, y1: 200, x2: 300, y2: 200, textX: 290, textY: 230, dimX: 290, dimY: 225 }),
    alignedDimension({ handle: 'A4', x1: 300, y1: -200, x2: 300, y2: 200, textX: 340, textY: 0, dimX: 335, dimY: 0 }),
    pair(0, 'ENDSEC'), pair(0, 'EOF'),
  ].join('');
}

function flangeDxf() {
  return [
    pair(0, 'SECTION'), pair(2, 'ENTITIES'),
    pair(0, 'CIRCLE'), pair(8, 'geometria_principal'), pair(10, 0), pair(20, 0), pair(40, 200),
    pair(0, 'CIRCLE'), pair(8, 'geometria_principal'), pair(10, 0), pair(20, 0), pair(40, 150),
    alignedDimension({ handle: 'F1', x1: -200, y1: 0, x2: 200, y2: 0, textX: 0, textY: 245, dimX: 0, dimY: 240, label: '%%c400.000' }),
    alignedDimension({ handle: 'F2', x1: -150, y1: 0, x2: 150, y2: 0, textX: 0, textY: 205, dimX: 0, dimY: 200, label: 'PCD %%c300.000' }),
    alignedDimension({ handle: 'F3', x1: 140, y1: 0, x2: 160, y2: 0, textX: 150, textY: 35, dimX: 150, dimY: 30, label: '8x %%c20.000' }),
    pair(0, 'ENDSEC'), pair(0, 'EOF'),
  ].join('');
}

function shaftDxf() {
  return [
    pair(0, 'SECTION'), pair(2, 'ENTITIES'),
    pair(0, 'LWPOLYLINE'), pair(8, 'geometria_principal'),
    alignedDimension({ handle: 'S1', x1: 0, y1: -30, x2: 100, y2: -30, textX: 50, textY: -55, dimX: 50, dimY: -50, label: '100.000' }),
    alignedDimension({ handle: 'S2', x1: 100, y1: -25, x2: 250, y2: -25, textX: 175, textY: -55, dimX: 175, dimY: -50, label: '150.000' }),
    alignedDimension({ handle: 'S3', x1: 250, y1: -20, x2: 400, y2: -20, textX: 325, textY: -55, dimX: 325, dimY: -50, label: '150.000' }),
    alignedDimension({ handle: 'S4', x1: 0, y1: -30, x2: 0, y2: 30, textX: -35, textY: 0, dimX: -30, dimY: 0, label: '%%c60.000' }),
    alignedDimension({ handle: 'S5', x1: 100, y1: -25, x2: 100, y2: 25, textX: 65, textY: 0, dimX: 70, dimY: 0, label: '%%c50.000' }),
    alignedDimension({ handle: 'S6', x1: 0, y1: -30, x2: 400, y2: -30, textX: 200, textY: -90, dimX: 200, dimY: -85, label: 'TOTAL 400.000' }),
    pair(0, 'ENDSEC'), pair(0, 'EOF'),
  ].join('');
}

test('extrai as quatro cotas nativas do MLightCAD/DXF para o JSON do PDF', () => {
  const parsed = parseDxfDimensions(sampleDxf());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dimensions.length, 4);
  assert.deepEqual(parsed.dimensions.map((dimension) => dimension.geometry.label), [
    '400.000',
    '200.000',
    '20.000',
    '400.000',
  ]);
  assert.ok(parsed.dimensions.every((dimension) => dimension.layer === 'cotas'));
});

test('usa a medição DXF em cotas rotacionadas cujas origens não estão alinhadas', () => {
  const dxf = [
    pair(0, 'SECTION'), pair(2, 'ENTITIES'),
    pair(0, 'DIMENSION'), pair(5, 'R1'), pair(8, 'cotas'), pair(70, 32),
    pair(10, 0), pair(20, 25), pair(11, 50), pair(21, 30),
    pair(13, 0), pair(23, 0), pair(14, 100), pair(24, 100),
    pair(42, 100), pair(50, 0),
    pair(0, 'ENDSEC'), pair(0, 'EOF'),
  ].join('');

  const parsed = parseDxfDimensions(dxf);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.dimensions.length, 1);
  assert.equal(parsed.dimensions[0].geometry.label, '100.000');
});

test('preserva cotas de fabricação de flange, incluindo diâmetro, PCD e furos', () => {
  const parsed = parseDxfDimensions(flangeDxf());
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.dimensions.map((dimension) => dimension.geometry.label), [
    'Ø400.000',
    'PCD Ø300.000',
    '8x Ø20.000',
  ]);
  assert.ok(parsed.dimensions.every((dimension) => dimension.layer === 'cotas'));
});

test('preserva cotas de fabricação de eixo escalonado, comprimentos, diâmetros e total', () => {
  const parsed = parseDxfDimensions(shaftDxf());
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.dimensions.map((dimension) => dimension.geometry.label), [
    '100.000',
    '150.000',
    '150.000',
    'Ø60.000',
    'Ø50.000',
    'TOTAL 400.000',
  ]);
  assert.ok(parsed.dimensions.every((dimension) => dimension.layer === 'cotas'));
});

test('recupera cotas a partir do snapshot MLightCAD salvo no histórico', () => {
  const payload = {
    history: [{
      kind: 'mlightcad-document',
      dxfBase64: encodeBase64(sampleDxf()),
      stats: {},
    }],
    dimensions: [],
  };
  const result = recoverDimensions(payload, { dimensions: [] });
  assert.equal(result.recovered, true);
  assert.equal(result.dimensions.length, 4);
});

test('serializer corrigido não zera mais dimensions antes de gerar o PDF', () => {
  const app = {
    serializeForSave() {
      return {
        objects: [{ type: 'circle', x: 0, y: 0, radius: 200 }],
        dimensions: [],
        history: [{
          kind: 'mlightcad-document',
          dxfBase64: encodeBase64(sampleDxf()),
          stats: {},
        }],
      };
    },
  };

  assert.equal(patchSerializer(app), true);
  assert.equal(patchSerializer(app), true, 'o patch deve ser idempotente quando o PDF força novo salvamento');
  const result = app.serializeForSave({ dimensions: [] });
  assert.equal(result.dimensions.length, 4);
  assert.equal(result.history[0].stats.nativeDimensions, 4);
  assert.equal(result.history[0].stats.dimensionRecovery, 'ok');
});

test('remoção de todas as cotas no DXF também remove cotas persistidas antigas', () => {
  const emptyDxf = [pair(0, 'SECTION'), pair(2, 'ENTITIES'), pair(0, 'LINE'), pair(10, 0), pair(20, 0), pair(11, 10), pair(21, 0), pair(0, 'ENDSEC'), pair(0, 'EOF')].join('');
  const payload = {
    history: [{ kind: 'mlightcad-document', dxfBase64: encodeBase64(emptyDxf), stats: {} }],
  };
  const result = recoverDimensions(payload, { dimensions: [{ id: 'antiga', type: 'dimension' }] });
  assert.equal(result.recovered, true);
  assert.deepEqual(result.dimensions, []);
});
