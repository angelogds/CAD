const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeCadData } = require('../modules/desenho-tecnico/desenho-tecnico.cad.service');
const {
  POINTS_PER_MM,
  normalizePaperLayout,
  resolvePaperConfig,
  computePlotTransform,
} = require('../modules/desenho-tecnico/desenho-tecnico.layout');

test('persiste Paper Space A3 e escala real no cad_data sem aceitar campos arbitrários', () => {
  const sanitized = sanitizeCadData({
    codigo: 'CAD-TESTE',
    objects: [],
    manufacturing: {
      paperLayout: {
        format: 'a3',
        name: 'NOME-INJETADO',
        scale: '1:5',
        denominator: 5,
        generatedAt: '2026-09-14T18:00:00.000Z',
        campoNaoPermitido: 'ignorar',
      },
      segredo: 'nao persistir',
    },
  });

  assert.deepEqual(sanitized.manufacturing, {
    paperLayout: {
      format: 'A3',
      name: 'FAB-A3',
      scale: '1:5',
      denominator: 5,
      generatedAt: '2026-09-14T18:00:00.000Z',
    },
  });
});

test('recupera denominador pelo texto da escala quando necessário', () => {
  assert.deepEqual(normalizePaperLayout({ format: 'A4', scale: '1:2,5' }), {
    format: 'A4',
    name: 'FAB-A4',
    scale: '1:2.5',
    denominator: 2.5,
    generatedAt: '',
  });
});

test('descarta layout inválido e mantém compatibilidade com desenhos antigos', () => {
  const sanitized = sanitizeCadData({
    objects: [],
    manufacturing: { paperLayout: { format: 'A0', scale: 'AUTO' } },
  });
  assert.deepEqual(sanitized.manufacturing, {});

  const config = resolvePaperConfig({ unidade: 'mm' });
  assert.equal(config.format, 'A4');
  assert.equal(config.orientation, 'landscape');
  assert.equal(config.scaleLabel, 'AJUSTAR');
  assert.equal(config.trueScale, false);
  assert.equal(config.denominator, null);
});

test('configura A3 paisagem e carimbo com a escala persistida', () => {
  const config = resolvePaperConfig({
    unidade: 'mm',
    manufacturing: { paperLayout: { format: 'A3', denominator: 10, scale: '1:10' } },
  });
  assert.equal(config.pdfSize, 'A3');
  assert.equal(config.orientation, 'landscape');
  assert.equal(config.scaleLabel, '1:10');
  assert.equal(config.denominator, 10);
  assert.equal(config.trueScale, true);
});

test('plotagem em 1:5 converte milímetros do modelo para pontos físicos do PDF', () => {
  const area = { x: 30, y: 70, width: 900, height: 600 };
  const bounds = { minX: 0, minY: 0, maxX: 400, maxY: 200 };
  const transform = computePlotTransform(bounds, area, { format: 'A3', scale: '1:5', denominator: 5 });

  assert.equal(transform.mode, 'true-scale');
  assert.ok(Math.abs(transform.scale - (POINTS_PER_MM / 5)) < 1e-12);

  const drawingCenterX = ((bounds.minX + bounds.maxX) / 2) * transform.scale + transform.offsetX;
  const drawingCenterY = ((bounds.minY + bounds.maxY) / 2) * transform.scale + transform.offsetY;
  assert.ok(Math.abs(drawingCenterX - (area.x + area.width / 2)) < 1e-9);
  assert.ok(Math.abs(drawingCenterY - (area.y + area.height / 2)) < 1e-9);
});

test('desenho legado continua usando o mesmo auto-fit limitado a 1.5', () => {
  const area = { x: 30, y: 70, width: 762, height: 415 };
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
  const transform = computePlotTransform(bounds, area, null);

  assert.equal(transform.mode, 'legacy-fit');
  assert.equal(transform.scale, 1.5);
  assert.equal(transform.offsetX, 60);
  assert.equal(transform.offsetY, 100);
});