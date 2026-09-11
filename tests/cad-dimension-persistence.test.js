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

function alignedDimension({ handle, x1, y1, x2, y2, textX, textY, dimX, dimY }) {
  return [
    pair(0, 'DIMENSION'),
    pair(5, handle),
    pair(8, 'cotas'),
    pair(2, `*D${handle}`),
    pair(70, 33),
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
