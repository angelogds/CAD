'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sanitizeCadData } = require('../modules/desenho-tecnico/desenho-tecnico.cad.service');
const { pickShaft, buildModel, generateShaftPdf } = require('../modules/desenho-tecnico/desenho-tecnico.shaft-sheet');

function sample() {
  // Desenho sintético para testar posicionamentos. Não define os furos reais da PS5.
  return {
    objects: [{
      id: 'eixo-teste',
      type: 'shaft',
      geometry: {
        orientation: 'horizontal',
        origin: { x: 0, y: 0 },
        segments: [
          { diameter: 127, length: 120 },
          { diameter: 104, length: 100 },
          { diameter: 96, length: 150 },
        ],
        bore: { diameter: 96, depth: 120, from: 'start' },
        crossHoles: [
          { distance: 25, diameter: 13 },
          { distance: 60, diameter: 13 },
          { distance: 95, diameter: 13 },
        ],
      },
    }],
  };
}

test('seleciona eixo isolado sem substituir exportação de outros desenhos', () => {
  assert.ok(pickShaft(sample()));
  assert.equal(pickShaft({ objects: [{ type: 'circle' }] }), null);
  assert.equal(pickShaft({
    objects: [...sample().objects, { type: 'line', x: 0, y: 0, x2: 40, y2: 10 }],
  }), null);
});

test('preserva alojamento e furação transversal ao salvar no CAD', () => {
  const saved = sanitizeCadData(sample());
  assert.deepEqual(saved.objects[0].geometry.bore, { diameter: 96, depth: 120, from: 'start' });
  assert.deepEqual(saved.objects[0].geometry.crossHoles, [
    { distance: 25, diameter: 13 }, { distance: 60, diameter: 13 }, { distance: 95, diameter: 13 },
  ]);
  const model = buildModel(saved.objects[0]);
  assert.equal(model.total, 370);
  assert.deepEqual(model.segments.map(s => s.diameter), [127, 104, 96]);
});

test('não inventa furação ou alojamento quando faltam as medidas', () => {
  const raw = sample();
  delete raw.objects[0].geometry.bore;
  delete raw.objects[0].geometry.crossHoles;
  const model = buildModel(sanitizeCadData(raw).objects[0]);
  assert.equal(model.bore, null);
  assert.deepEqual(model.crossHoles, []);
});

test('não permite furação na área de 100/150 mm nem além do alojamento', () => {
  const raw = sample();
  raw.objects[0].geometry.crossHoles.push({ distance: 150, diameter: 13 });
  assert.throws(() => buildModel(raw.objects[0]), /Furo transversal/);
  raw.objects[0].geometry.crossHoles.pop();
  raw.objects[0].geometry.bore.depth = 50;
  assert.throws(() => buildModel(raw.objects[0]), /Furo transversal/);
});

test('gera PDF A3 usando as medidas salvas do eixo e sem serviço externo', async () => {
  const cad = sanitizeCadData(sample());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-shaft-'));
  try {
    const info = await generateShaftPdf({
      codigo: 'EIXO-TESTE', revisao: 0, titulo: 'Eixo escalonado',
      equipamento_nome: 'EQUIPAMENTO DE TESTE',
      criado_por_nome: 'Desenhista de teste',
    }, cad, pickShaft(cad), { pdfDir: tmp });
    assert.equal(path.dirname(info.fullPath), tmp);
    const buffer = fs.readFileSync(info.fullPath);
    assert.equal(buffer.subarray(0, 4).toString('utf8'), '%PDF');
    assert.ok(buffer.byteLength > 1000);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
