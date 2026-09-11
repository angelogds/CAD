const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const imageService = require('../modules/desenho-tecnico/desenho-tecnico.image.service');
const { sanitizeCadData } = require('../modules/desenho-tecnico/desenho-tecnico.cad.service');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('serviço CAD aceita apenas PNG/JPEG e mantém a imagem isolada por desenho', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-images-'));
  try {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const stored = imageService.saveImage({ drawingId: 42, buffer: png, originalName: 'referencia.png', rootDir });
    assert.match(stored.assetId, /^[0-9a-f-]{36}$/i);
    assert.equal(stored.mimeType, 'image/png');
    assert.equal(stored.url, `/desenho-tecnico/cad/42/images/${stored.assetId}`);
    assert.ok(stored.absolutePath.startsWith(path.join(rootDir, '42')));
    assert.deepEqual(imageService.resolveImage(42, stored.assetId, { rootDir }).mimeType, 'image/png');
    assert.equal(imageService.resolveImage(43, stored.assetId, { rootDir }), null);
    assert.throws(() => imageService.saveImage({ drawingId: 42, buffer: Buffer.from('nao-e-imagem'), rootDir }), /JPG ou PNG/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('sanitização do CAD preserva geometria e referência segura da imagem', () => {
  const payload = sanitizeCadData({
    schemaVersion: 4,
    objects: [{
      id: 'img-1',
      type: 'image',
      layer: '0',
      x: 10.5,
      y: -4.25,
      width: 250,
      height: 140.625,
      rotation: 0.25,
      assetId: '58d5c53e-2713-4af3-97a4-b2c3d4e5f607',
      source: '/desenho-tecnico/cad/7/images/58d5c53e-2713-4af3-97a4-b2c3d4e5f607',
      imageWidth: 1920,
      imageHeight: 1080,
      brightness: 50,
      contrast: 50,
      fade: 20,
    }],
  });
  assert.equal(payload.schemaVersion, 4);
  assert.equal(payload.objects.length, 1);
  assert.deepEqual(
    {
      type: payload.objects[0].type,
      x: payload.objects[0].x,
      y: payload.objects[0].y,
      width: payload.objects[0].width,
      height: payload.objects[0].height,
      assetId: payload.objects[0].assetId,
      source: payload.objects[0].source,
      imageWidth: payload.objects[0].imageWidth,
      imageHeight: payload.objects[0].imageHeight,
    },
    {
      type: 'image',
      x: 10.5,
      y: -4.25,
      width: 250,
      height: 140.625,
      assetId: '58d5c53e-2713-4af3-97a4-b2c3d4e5f607',
      source: '/desenho-tecnico/cad/7/images/58d5c53e-2713-4af3-97a4-b2c3d4e5f607',
      imageWidth: 1920,
      imageHeight: 1080,
    },
  );
});

test('runtime MLightCAD integra upload, entidade raster, persistência e exportação segura para PDF', () => {
  const imageEntry = read('frontend/mlightcad-image.entry.js');
  const runtime = read('public/js/cad-image-runtime.js');
  const engine = read('public/js/cad-engine-v2.js');
  const build = read('scripts/build-mlightcad.mjs');
  const routes = read('modules/desenho-tecnico/desenho-tecnico.routes.js');
  const pdf = read('modules/desenho-tecnico/desenho-tecnico.pdf.service.js');

  assert.match(imageEntry, /AcDbRasterImage/);
  assert.match(imageEntry, /AcDbRasterImageDef/);
  assert.match(imageEntry, /imageDefinition\.setAt/);
  assert.match(imageEntry, /patchMlightImageSerialization/);
  assert.match(runtime, /mlightImageBtn/);
  assert.match(runtime, /Salvando desenho antes do PDF/);
  assert.match(engine, /cad-image-runtime\.js/);
  assert.match(build, /mlightcad-image/);
  assert.match(routes, /cad\/:id\/images/);
  assert.match(pdf, /case 'image'/);
  assert.match(pdf, /resolveImage/);
  assert.match(pdf, /\.image\(/);
});
