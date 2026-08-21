const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('CAD usa somente MLightCAD como editor apresentado ao usuário', () => {
  const router = read('public/js/cad-engine-v2.js');
  const runtime = read('public/js/cad-mlight-runtime.js');
  assert.match(router, /cad-mlight-runtime\.js/);
  assert.doesNotMatch(router, /engine.*legacy/i);
  assert.doesNotMatch(router, /cad-legacy-engine\.js/);
  assert.match(runtime, /vendor\/mlightcad\/mlightcad-core\.js/);
  assert.match(runtime, /vendor\/mlightcad\/mlightcad-auto-dimension\.js/);
  assert.doesNotMatch(runtime, /Motor anterior/);
  assert.doesNotMatch(runtime, /engine=legacy/);
  assert.match(runtime, /Abrir DXF/);
  assert.match(runtime, /Exportar DXF/);
  assert.match(runtime, /Flange/);
  assert.match(runtime, /Disco/);
  assert.match(runtime, /Eixo/);
  assert.match(runtime, /AUTO COTAR/);
  assert.match(runtime, /\/desenho-tecnico\/cad\/\$\{drawingId\}/);
});

test('bundle do MLightCAD gera motor principal e auto-cotagem sem alterar o servidor', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['build:cad-core'], 'node scripts/build-mlightcad.mjs');
  assert.equal(pkg.scripts.postinstall, 'node scripts/build-mlightcad.mjs');
  assert.equal(pkg.dependencies['@mlightcad/cad-simple-viewer'], '1.6.1');
  assert.equal(pkg.dependencies['@mlightcad/cad-simple-ui-plugin'], '1.6.1');
  assert.equal(pkg.dependencies['@mlightcad/data-model'], '1.13.1');
  const build = read('scripts/build-mlightcad.mjs');
  assert.match(build, /frontend\/mlightcad-core\.entry\.js/);
  assert.match(build, /frontend\/mlightcad-auto-dimension\.entry\.js/);
  assert.match(build, /mlightcad-auto-dimension/);
  assert.match(build, /publicDir: false/);
  assert.match(build, /public\/vendor\/mlightcad/);
  assert.match(build, /target: 'es2020'/);
});

test('adaptador converte legado para DXF e persiste snapshot completo sem migration', () => {
  const core = read('frontend/mlightcad-core.entry.js');
  assert.match(core, /legacyCadToDxf/);
  assert.match(core, /AcApDocManager/);
  assert.match(core, /openDocument/);
  assert.match(core, /dxfOut/);
  assert.match(core, /kind: 'mlightcad-document'/);
  assert.match(core, /dxfBase64/);
  assert.match(core, /mirrorDatabase/);
  assert.match(core, /zoomToFitDrawing/);
});

test('toolbar expõe comandos 2D de desenho, modificação, hachura, camadas e medição', () => {
  const core = read('frontend/mlightcad-core.entry.js');
  for (const command of ['line', 'pline', 'circle', 'arc', 'rectang', 'ellipse', 'spline', '-hatch', 'move', 'copy', 'rotate', 'offset', 'erase', 'dimlinear']) {
    assert.ok(core.includes(`'${command}'`), `comando ${command} precisa estar no workbench`);
  }
  assert.match(core, /preset: 'layer'/);
  assert.match(core, /preset: 'measure'/);
});

test('AUTO COTAR cria cotas DXF reais e reconhece padrões de fabricação', () => {
  const auto = read('frontend/mlightcad-auto-dimension.entry.js');
  assert.match(auto, /AcDbAlignedDimension/);
  assert.match(auto, /AcDbDataGenerator/);
  assert.match(auto, /createDimBlock/);
  assert.match(auto, /AUTO_DIM_PREFIX/);
  assert.match(auto, /detectBoltCircle/);
  assert.match(auto, /PCD Ø/);
  assert.match(auto, /detectShaftRectangles/);
  assert.match(auto, /TOTAL/);
  assert.match(auto, /MAX_AUTO_DIMS = 48/);
  assert.match(auto, /createFlange/);
  assert.match(auto, /Espessura do flange/);
  assert.match(auto, /createDisc/);
  assert.match(auto, /Espessura do disco/);
  assert.match(auto, /createShaft/);
  assert.match(auto, /autoDimensionAll/);
});

test('linha de comando aceita aliases de cotagem automática', () => {
  const runtime = read('public/js/cad-mlight-runtime.js');
  for (const alias of ['autocotar', 'autodim', 'cotas', 'dimauto']) {
    assert.match(runtime, new RegExp(alias));
  }
  assert.match(runtime, /fabrication\.autoDimensionAll/);
});

test('licença MIT do MLightCAD é preservada no repositório', () => {
  const license = read('licenses/mlightcad-MIT.txt');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 mlightcad/);
});
