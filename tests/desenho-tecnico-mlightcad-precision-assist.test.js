'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Precisão V1 usa sysvars e OSNAP nativos do MLightCAD', () => {
  const source = read('frontend/mlightcad-precision-assist.entry.js');

  assert.match(source, /AcApSettingManager/);
  assert.match(source, /AcDbSysVarManager/);
  assert.match(source, /AcDbSystemVariables\.ORTHOMODE/);
  assert.match(source, /AcDbSystemVariables\.DYNMODE/);
  assert.match(source, /AcDbSystemVariables\.DYNPROMPT/);
  assert.match(source, /AcDbSystemVariables\.POLARMODE/);
  assert.match(source, /AcDbSystemVariables\.POLARANG/);
  assert.match(source, /togglePolarTrackingSysVar/);
  assert.match(source, /AcDbOsnapMode\.EndPoint/);
  assert.match(source, /AcDbOsnapMode\.MidPoint/);
  assert.match(source, /AcDbOsnapMode\.Center/);
  assert.match(source, /AcDbOsnapMode\.Quadrant/);
  assert.match(source, /AcDbOsnapMode\.Intersection/);
  assert.match(source, /AcDbOsnapMode\.Nearest/);
  assert.match(source, /settings\.osnapModes/);
});

test('entrada dinâmica é ligada em modo completo e preserva prompt técnico', () => {
  const source = read('frontend/mlightcad-precision-assist.entry.js');
  assert.match(source, /DYNMODE, enabled \? 3 : 0/);
  assert.match(source, /DYNPROMPT, enabled \? 1 : 0/);
});

test('runtime expõe barra compacta com atalhos F3 F8 F10 e ajuda de coordenadas', () => {
  const runtime = read('public/js/cad-precision-assist-runtime.js');

  assert.match(runtime, /data-precision="osnap"/);
  assert.match(runtime, /data-precision="ortho"/);
  assert.match(runtime, /data-precision="polar"/);
  assert.match(runtime, /data-precision="dynamic"/);
  assert.match(runtime, /F3/);
  assert.match(runtime, /F8/);
  assert.match(runtime, /F10/);
  assert.match(runtime, /100,50/);
  assert.match(runtime, /@50,0/);
  assert.match(runtime, /100&lt;45/);
  assert.match(runtime, /@100&lt;45/);
  assert.doesNotMatch(runtime, /event\.key.*F12/i, 'F12 do navegador não deve ser sequestrado');
});

test('painel permite configurar modos OSNAP e incremento polar', () => {
  const runtime = read('public/js/cad-precision-assist-runtime.js');
  const source = read('frontend/mlightcad-precision-assist.entry.js');

  assert.match(runtime, /data-osnap-mode/);
  assert.match(runtime, /setOsnapMode/);
  assert.match(runtime, /applyDefaultOsnaps/);
  assert.match(runtime, /setPolarAngle/);
  assert.match(source, /POLAR_ANGLES = Object\.freeze\(\[15, 30, 45, 90\]\)/);
});

test('bundle e loader incluem assistência de precisão sem substituir o core', () => {
  const build = read('scripts/build-mlightcad.mjs');
  const loader = read('public/js/cad-engine-v2.js');
  const css = read('public/css/cad-precision-assist.css');

  assert.match(build, /mlightcad-precision-assist/);
  assert.match(loader, /cad-precision-assist-runtime\.js/);
  assert.match(css, /cad-precision-assist/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(build, /publicDir: false/);
});
