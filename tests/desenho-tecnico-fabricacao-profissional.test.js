const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('build MLightCAD inclui bundle de fabricacao profissional', () => {
  const build = read('scripts/build-mlightcad.mjs');
  assert.match(build, /mlightcad-manufacturing/);
  assert.match(build, /frontend\/mlightcad-manufacturing\.entry\.js/);
  assert.match(build, /publicDir: false/);
});

test('runtime carrega ferramentas de fabricacao sem substituir o MLightCAD', () => {
  const runtime = read('public/js/cad-mlight-runtime.js');
  assert.match(runtime, /mlightcad-manufacturing\.js/);
  assert.match(runtime, /createMlightManufacturingTools/);
  assert.match(runtime, /Folha A3\/A4/);
  assert.match(runtime, /Rugosidade/);
  assert.match(runtime, /Tolerância/);
  assert.match(runtime, /Rosca/);
  assert.match(runtime, /Chaveta/);
  assert.match(runtime, /Corte/);
  assert.match(runtime, /Chanfro\/Raio/);
  assert.doesNotMatch(runtime, /Motor anterior/);
});

test('folha tecnica gera A3/A4, quadro de revisao e dados de fabricacao', () => {
  const source = read('frontend/mlightcad-manufacturing.entry.js');
  for (const token of [
    'FAB_FOLHA_TECNICA',
    'DESENHO MECÂNICO DE FABRICAÇÃO',
    'TOLERÂNCIA GERAL',
    'RESPONSÁVEL',
    'EQUIPAMENTO',
    'FORMATO',
    'ESCALA',
    'REV',
    'QTD',
    'A4',
    'A3'
  ]) assert.ok(source.includes(token), `esperado ${token}`);
  assert.match(source, /createTechnicalSheet/);
  assert.match(source, /sheetFormat/);
  assert.match(source, /generalTolerance/);
  assert.match(source, /generatedAt/);
});

test('simbologia de fabricacao cria entidades DXF persistentes', () => {
  const source = read('frontend/mlightcad-manufacturing.entry.js');
  assert.match(source, /AcDbMText/);
  assert.match(source, /AcDbLayerTableRecord/);
  assert.match(source, /addSurfaceFinish/);
  assert.match(source, /addTolerance/);
  assert.match(source, /addThread/);
  assert.match(source, /addChamferRadius/);
  assert.match(source, /addSectionMarker/);
  assert.match(source, /createKeyway/);
  assert.match(source, /RASGO CHAVETA/);
  assert.match(source, /addCenterMarks/);
});

test('linha de comando oferece atalhos de fabricacao', () => {
  const runtime = read('public/js/cad-mlight-runtime.js');
  for (const alias of ['folha', 'rugosidade', 'tolerancia', 'ajuste', 'rosca', 'chaveta', 'corte', 'centros', 'chanfro', 'raio']) {
    assert.match(runtime, new RegExp(`${alias}:`));
  }
});

test('barra de fabricacao permanece compacta e responsiva', () => {
  const css = read('public/css/cad-mlight.css');
  assert.match(css, /\.cad-mlight-fabbar/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /@media \(max-width: 820px\)/);
});
