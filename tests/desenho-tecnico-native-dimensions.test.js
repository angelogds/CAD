const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const { sanitizeCadData } = require('../modules/desenho-tecnico/desenho-tecnico.cad.service');

// Bundle the installed CAD library just as Vite does (its ESM directory imports
// are browser/bundler imports). These are real native entities, not class stubs.
const compiled = buildSync({
  stdin: {
    contents: "export * from '@mlightcad/data-model'; export { mirrorDimension } from './frontend/mlightcad-dimension-mirror.mjs';",
    resolveDir: path.join(__dirname, '..')
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'error'
}).outputFiles[0].text;
const bundle = new Module(__filename, module);
bundle.paths = module.paths;
bundle._compile(compiled, __filename);
const cad = bundle.exports;
const p = (x, y) => ({ x, y, z: 0 });

test('native aligned and rotated dimensions keep the measured axis and moved label', () => {
  const aligned = new cad.AcDbAlignedDimension(p(0, 0), p(30, 40), p(10, 30));
  aligned.dimensionText = '<> mm';
  const a = cad.mirrorDimension(aligned);
  assert.equal(a.label, '50 mm');
  assert.ok(Math.abs(Math.hypot(a.dimensionEnd.x - a.dimensionStart.x, a.dimensionEnd.y - a.dimensionStart.y) - 50) < 1e-9);

  const rotated = new cad.AcDbRotatedDimension(p(0, 0), p(120, 50), p(60, -20));
  rotated.rotation = 0;
  rotated.dimensionText = '<> ±0.05';
  rotated.textPosition = new cad.AcGePoint3d(100, -40, 0);
  const r = cad.mirrorDimension(rotated);
  assert.equal(r.label, '120 ±0.05');
  assert.deepEqual(r.dimensionStart, { x: 0, y: -20 });
  assert.deepEqual(r.dimensionEnd, { x: 120, y: -20 });
  assert.deepEqual(r.textPoint, { x: 100, y: -40 });
});

test('diameters, radii, hole annotations and explicit zero-position labels survive', () => {
  const diameter = new cad.AcDbDiametricDimension(p(120, 0), p(0, 0), 15);
  diameter.dimensionText = null;
  assert.equal(cad.mirrorDimension(diameter).label, 'Ø120');
  diameter.dimensionText = '6x %%c<> H7';
  diameter.dimensionType = 128;
  assert.equal(cad.mirrorDimension(diameter).label, '6x Ø120 H7');
  assert.deepEqual(cad.mirrorDimension(diameter).textPoint, { x: 0, y: 0 });
  const radius = new cad.AcDbRadialDimension(p(0, 0), p(0, 25), 10);
  assert.equal(cad.mirrorDimension(radius).label, 'R25');
  radius.dimensionText = ' ';
  assert.equal(cad.mirrorDimension(radius).label, '');
  assert.equal(cad.mirrorDimension(new cad.AcDbCircle(p(0, 0), 20)), null);
});

test('angular dimensions select the sector containing the arc point', () => {
  const dim = new cad.AcDb3PointAngularDimension(p(0, 0), p(100, 0), p(0, 100), p(30, 30));
  assert.equal(cad.mirrorDimension(dim).label, '90°');
  dim.arcPoint = new cad.AcGePoint3d(-30, -30, 0);
  assert.equal(cad.mirrorDimension(dim).label, '270°');
});

test('DXF snapshot reload and JSON sanitization preserve actual dimensions without duplicates', async () => {
  const database = new cad.AcDbDatabase();
  const dim = new cad.AcDbAlignedDimension(p(0, 0), p(125.5, 0), p(62.75, 25));
  dim.dimensionText = 'PCD Ø125.5';
  database.tables.blockTable.modelSpace.appendEntity(dim);
  const snapshot = database.dxfOut(undefined, 6);
  const restored = new cad.AcDbDatabase();
  cad.acdbHostApplicationServices().workingDatabase = restored;
  await new cad.AcDbDxfDocumentReader(restored).read(cad.AcDbDxfFiler.fromString(snapshot));
  const native = [...restored.tables.blockTable.modelSpace.newIterator()];
  assert.equal(native.length, 1);
  const mirrored = { id: native[0].objectId, type: 'dimension', layer: 'cotas', geometry: cad.mirrorDimension(native[0]) };
  const saved = sanitizeCadData({ objects: [mirrored], dimensions: [mirrored], history: [{ kind: 'mlightcad-document', dxfBase64: Buffer.from(snapshot).toString('base64') }] });
  const reopened = JSON.parse(JSON.stringify(saved));
  assert.equal(reopened.objects.length, 0);
  assert.equal(reopened.dimensions.length, 1);
  assert.equal(reopened.dimensions[0].geometry.label, 'PCD Ø125.5');
  assert.deepEqual(reopened.dimensions[0].geometry.dimensionEnd, { x: 125.5, y: 25 });
  assert.equal(Buffer.from(reopened.history[0].dxfBase64, 'base64').toString(), snapshot);
});

function pdfText(buffer) {
  // Read PDFKit's compressed content streams and WinAnsi text operators. This
  // verifies the produced PDF, without making Poppler a CI dependency.
  const pdf = buffer.toString('latin1');
  const text = [];
  for (const match of pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let stream;
    try { stream = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString(); } catch (_) { continue; }
    for (const line of stream.split('\n').filter((line) => /TJ|Tj/.test(line))) {
      text.push([...line.matchAll(/<([\da-f]+)>/gi)].map((item) => Buffer.from(item[1], 'hex').toString('latin1')).join(''));
    }
  }
  return text.join('\n');
}

test('generated PDF includes native dimension labels, counts only plotted dimensions and reports fitted scale', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-pdf-test-'));
  const storage = require('../config/storage');
  const previous = storage.PDF_DIR;
  storage.PDF_DIR = tempDir;
  const pdfPath = require.resolve('../modules/desenho-tecnico/desenho-tecnico.pdf.service');
  delete require.cache[pdfPath];
  const { generateTechnicalPdf } = require(pdfPath);
  storage.PDF_DIR = previous;
  t.after(() => { delete require.cache[pdfPath]; fs.rmSync(tempDir, { recursive: true, force: true }); });
  const dimension = new cad.AcDbAlignedDimension(p(0, 0), p(120, 0), p(60, -20));
  dimension.dimensionText = 'PCD Ø120';
  const d = { id: 'd1', type: 'dimension', layer: 'cotas', geometry: cad.mirrorDimension(dimension) };
  const payload = sanitizeCadData({
    objects: [{ type: 'line', x: 0, y: 0, x2: 120, y2: 0 }, d],
    dimensions: [d, { ...d, id: 'd2', layer: 'oculta', geometry: { ...d.geometry, label: 'INVISIBLE' } }],
    layers: { oculta: { plottable: false } }
  });
  const pdf = await generateTechnicalPdf({ codigo: 'TESTE-COTAS' }, '', { cadData: payload });
  const contents = pdfText(fs.readFileSync(pdf.fullPath));
  assert.match(contents, /PCD Ø120/);
  assert.match(contents, /Objetos: 1 \| Cotas: 1/);
  assert.match(contents, /AJUSTADA À FOLHA/);
  assert.doesNotMatch(contents, /INVISIBLE|SEM COTAS|1:1/);

  const noDimensions = await generateTechnicalPdf({ codigo: 'TESTE-SEM-COTAS' }, '', { cadData: { objects: payload.objects, dimensions: [] } });
  assert.match(pdfText(fs.readFileSync(noDimensions.fullPath)), /SEM COTAS/);
});
