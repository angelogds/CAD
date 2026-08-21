const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('build inclui bundle isolado de estilos do MLightCAD', () => {
  const build = read('scripts/build-mlightcad.mjs');
  assert.match(build, /mlightcad-styles/);
  assert.match(build, /publicDir:\s*false/);
});

test('estilo atual usa variáveis CAD reais para novos objetos', () => {
  const source = read('frontend/mlightcad-styles.entry.js');
  assert.match(source, /database\.clayer/);
  assert.match(source, /database\.cecolor/);
  assert.match(source, /database\.celtype/);
  assert.match(source, /database\.celweight/);
  assert.match(source, /database\.celtscale/);
  assert.match(source, /selectionSet\?\.ids/);
});

test('tipos de linha técnicos são persistíveis no DXF', () => {
  const source = read('frontend/mlightcad-styles.entry.js');
  assert.match(source, /AcDbLinetypeTableRecord/);
  assert.match(source, /DASHED/);
  assert.match(source, /HIDDEN/);
  assert.match(source, /CENTER/);
  assert.match(source, /DASHDOT/);
  assert.match(source, /linetypeTable\.add/);
});

test('cotas usam layer próprio vermelho por padrão e hook para novas dimensões', () => {
  const source = read('frontend/mlightcad-styles.entry.js');
  assert.match(source, /FAB_COTAS/);
  assert.match(source, /#ff3b30/i);
  assert.match(source, /AcDbDimension/);
  assert.match(source, /dxfTypeName[^\n]+DIMENSION/);
  assert.match(source, /appendEntity\s*=\s*\(input\)/);
  assert.match(source, /styleDimensionBlock/);
  assert.match(source, /ByBlock/);
});

test('drawer oferece propriedades atuais e estilo independente de cotas', () => {
  const runtime = read('public/js/cad-style-runtime.js');
  assert.match(runtime, /ESTILO DO DESENHO/);
  assert.match(runtime, /PROPRIEDADES ATUAIS/);
  assert.match(runtime, /Aplicar à seleção/);
  assert.match(runtime, /Seleção → BYLAYER/);
  assert.match(runtime, /COTAS/);
  assert.match(runtime, /Aplicar estilo em todas as cotas/);
  assert.match(runtime, /type=\"color\"/);
});

test('runtime de estilos inicia depois da estabilização visual', () => {
  const engine = read('public/js/cad-engine-v2.js');
  const ui = engine.indexOf("cad-ui-stabilization.js");
  const style = engine.indexOf("cad-style-runtime.js");
  assert.ok(ui >= 0);
  assert.ok(style > ui);
});
