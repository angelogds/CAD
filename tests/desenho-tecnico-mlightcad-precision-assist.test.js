'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const logicUrl = pathToFileURL(path.join(root, 'frontend', 'mlightcad-precision.logic.mjs')).href;

test('Precisão usa sysvars e OSNAP nativos do MLightCAD', () => {
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

test('lógica V2 calcula medição e tokens CAD sem depender do browser', async () => {
  const {
    buildAbsolutePointToken,
    buildRelativePolarToken,
    computeMeasurement,
    formatCursorCoordinates
  } = await import(logicUrl);

  const measurement = computeMeasurement({ x: 10, y: 20 }, { x: 13, y: 24 });
  assert.equal(measurement.dx, 3);
  assert.equal(measurement.dy, 4);
  assert.equal(measurement.distance, 5);
  assert.ok(Math.abs(measurement.angleDeg - 53.13010235415598) < 1e-10);
  assert.equal(buildAbsolutePointToken({ x: 100, y: 50 }), '100,50');
  assert.equal(buildRelativePolarToken(100, 45), '@100<45');
  assert.equal(buildRelativePolarToken(25.5, -90), '@25.5<270');
  assert.equal(formatCursorCoordinates({ x: 12.34567, y: -8.9 }, 3), 'X 12.346  Y -8.900');
  assert.throws(() => buildRelativePolarToken(0, 45), /maior que zero/i);
});

test('Precisão V2 acompanha coordenadas WCS pelo evento real do viewport', () => {
  const source = read('frontend/mlightcad-precision-assist.entry.js');
  const runtime = read('public/js/cad-precision-assist-runtime.js');

  assert.match(source, /getView\(\)/);
  assert.match(source, /view\.events\.mouseMove\.addEventListener/);
  assert.match(source, /view\.events\.mouseMove\.removeEventListener/);
  assert.match(source, /formatCursorCoordinates/);
  assert.match(source, /getUnitsState\(\)\.lengthPrecision/);
  assert.match(runtime, /cadPrecisionCoords/);
  assert.match(runtime, /tools\.subscribeCursor/);
});

test('MEDIR usa getPoint nativo com segundo ponto baseado no primeiro', () => {
  const source = read('frontend/mlightcad-precision-assist.entry.js');
  const runtime = read('public/js/cad-precision-assist-runtime.js');

  assert.match(source, /new AcEdPromptPointOptions/);
  assert.match(source, /getEditor\(\)\.getPoint/);
  assert.match(source, /prompt\.useBasePoint = true/);
  assert.match(source, /prompt\.useDashedLine = true/);
  assert.match(source, /computeMeasurement\(first, second\)/);
  assert.match(runtime, /cadPrecisionMeasure/);
  assert.match(runtime, /cadPrecisionMeasureResult/);
  assert.match(runtime, /ΔX/);
  assert.match(runtime, /Ângulo/);
});

test('linha por distância e ângulo reutiliza LINE e parser polar do MLightCAD', () => {
  const source = read('frontend/mlightcad-precision-assist.entry.js');
  const runtime = read('public/js/cad-precision-assist-runtime.js');

  assert.match(source, /buildRelativePolarToken/);
  assert.match(source, /editor\.enqueueScriptInputs\(\[startToken, polarToken, ''\]\)/);
  assert.match(source, /sendStringToExecute\('line\\n'\)/);
  assert.match(runtime, /cadPrecisionLineDistance/);
  assert.match(runtime, /cadPrecisionLineAngle/);
  assert.match(runtime, /cadPrecisionCreatePolarLine/);
  assert.match(runtime, /L D×Â/);
});

test('unidades de fabricação usam sysvars reais e padrão milímetros', () => {
  const source = read('frontend/mlightcad-precision-assist.entry.js');
  const runtime = read('public/js/cad-precision-assist-runtime.js');

  assert.match(source, /AcDbLinearUnits/);
  assert.match(source, /AcDbAngleUnits/);
  assert.match(source, /AcDbUnitsValue/);
  assert.match(source, /AcDbSystemVariables\.LUNITS/);
  assert.match(source, /AcDbSystemVariables\.LUPREC/);
  assert.match(source, /AcDbSystemVariables\.AUNITS/);
  assert.match(source, /AcDbSystemVariables\.AUPREC/);
  assert.match(source, /AcDbSystemVariables\.INSUNITS/);
  assert.match(source, /AcDbUnitsValue\.Millimeters/);
  assert.match(source, /applyManufacturingUnits/);
  assert.match(runtime, /cadPrecisionUnitsBadge/);
  assert.match(runtime, /cadPrecisionLengthPrecision/);
  assert.match(runtime, /cadPrecisionAnglePrecision/);
  assert.match(runtime, /cadPrecisionManufacturingUnits/);
  assert.match(runtime, /MILÍMETROS \(mm\)/);
});

test('runtime mantém atalhos F3 F8 F10 e ajuda de coordenadas', () => {
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

test('painel permite configurar modos OSNAP, incremento polar e medições nativas complementares', () => {
  const runtime = read('public/js/cad-precision-assist-runtime.js');
  const source = read('frontend/mlightcad-precision-assist.entry.js');

  assert.match(runtime, /data-osnap-mode/);
  assert.match(runtime, /setOsnapMode/);
  assert.match(runtime, /applyDefaultOsnaps/);
  assert.match(runtime, /setPolarAngle/);
  assert.match(runtime, /data-native-measure="angle"/);
  assert.match(runtime, /data-native-measure="area"/);
  assert.match(source, /measureangle/);
  assert.match(source, /measurearea/);
  assert.match(source, /POLAR_ANGLES = Object\.freeze\(\[15, 30, 45, 90\]\)/);
});

test('bundle e loader incluem assistência de precisão sem substituir o core', () => {
  const build = read('scripts/build-mlightcad.mjs');
  const loader = read('public/js/cad-engine-v2.js');
  const css = read('public/css/cad-precision-assist.css');
  const runtime = read('public/js/cad-precision-assist-runtime.js');

  assert.match(build, /mlightcad-precision-assist/);
  assert.match(loader, /cad-precision-assist-runtime\.js/);
  assert.match(css, /cad-precision-assist/);
  assert.match(css, /cad-precision-coords/);
  assert.match(css, /cad-precision-units/);
  assert.match(css, /cad-precision-measure-result/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(build, /publicDir: false/);
  assert.match(runtime, /cadPrecisionAssist = 'native-v2-units'/);
});
