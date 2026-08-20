const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('CAD profissional usa MLightCAD como motor padrão e mantém fallback legado', () => {
  const router = read('public/js/cad-engine-v2.js');
  const runtime = read('public/js/cad-mlight-runtime.js');
  const legacy = read('public/js/cad-legacy-engine.js');
  assert.match(router, /cad-mlight-runtime\.js/);
  assert.match(router, /engine.*legacy/);
  assert.match(router, /cad-legacy-engine\.js/);
  assert.match(runtime, /vendor\/mlightcad\/mlightcad-core\.js/);
  assert.match(runtime, /MLightCAD/);
  assert.match(runtime, /Abrir DXF/);
  assert.match(runtime, /Exportar DXF/);
  assert.match(runtime, /Flange/);
  assert.match(runtime, /Eixo/);
  assert.match(runtime, /\/desenho-tecnico\/cad\/\$\{drawingId\}/);
  assert.match(legacy, /bootstrapDesenhoTecnico/);
  assert.match(legacy, /RotateTool/);
  assert.match(legacy, /FilletTool/);
  assert.match(legacy, /ChamferTool/);
});

test('bundle do MLightCAD é gerado no postinstall sem alterar o servidor principal', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['build:cad-core'], 'node scripts/build-mlightcad.mjs');
  assert.equal(pkg.scripts.postinstall, 'node scripts/build-mlightcad.mjs');
  assert.equal(pkg.dependencies['@mlightcad/cad-simple-viewer'], '1.6.1');
  assert.equal(pkg.dependencies['@mlightcad/cad-simple-ui-plugin'], '1.6.1');
  assert.equal(pkg.dependencies['@mlightcad/data-model'], '1.13.1');
  const build = read('scripts/build-mlightcad.mjs');
  assert.match(build, /frontend\/mlightcad-core\.entry\.js/);
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
  assert.match(core, /createFlange/);
  assert.match(core, /createShaft/);
});

test('toolbar expõe comandos 2D de desenho, modificação, hachura, camadas e medição', () => {
  const core = read('frontend/mlightcad-core.entry.js');
  for (const command of ['line', 'pline', 'circle', 'arc', 'rectang', 'ellipse', 'spline', '-hatch', 'move', 'copy', 'rotate', 'offset', 'erase', 'dimlinear']) {
    assert.ok(core.includes(`'${command}'`), `comando ${command} precisa estar no workbench`);
  }
  assert.match(core, /preset: 'layer'/);
  assert.match(core, /preset: 'measure'/);
});

test('licença MIT do MLightCAD é preservada no repositório', () => {
  const license = read('licenses/mlightcad-MIT.txt');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 mlightcad/);
});
