const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('motor principal carrega rodada 4 sem reintroduzir editor legado', () => {
  const engine = read('public/js/cad-engine-v2.js');
  assert.match(engine, /cad-mlight-runtime\.js/);
  assert.match(engine, /cad-round3-runtime\.js/);
  assert.match(engine, /cad-round4-runtime\.js/);
  assert.doesNotMatch(engine, /legacy/i);
});

test('build gera quinto bundle isolado de biblioteca e GD&T', () => {
  const build = read('scripts/build-mlightcad.mjs');
  assert.match(build, /frontend\/mlightcad-library-gdt\.entry\.js/);
  assert.match(build, /mlightcad-library-gdt/);
  assert.match(build, /publicDir: false/);
});

test('biblioteca mecânica oferece peças paramétricas e cotas DXF reais', () => {
  const library = read('frontend/mlightcad-library-gdt.entry.js');
  assert.match(library, /createBushing/);
  assert.match(library, /createWasher/);
  assert.match(library, /createParallelKey/);
  assert.match(library, /createPerforatedPlate/);
  assert.match(library, /AcDbAlignedDimension/);
  assert.match(library, /BIBLIOTECA_MECANICA/);
  assert.match(library, /BUCHA/);
  assert.match(library, /PLACA_PERFURADA/);
});

test('GD&T cria datum e quadro de controle em camada técnica separada', () => {
  const library = read('frontend/mlightcad-library-gdt.entry.js');
  assert.match(library, /FAB_GDT/);
  assert.match(library, /addDatum/);
  assert.match(library, /addFeatureControlFrame/);
  assert.match(library, /POSIÇÃO/);
  assert.match(library, /PERPENDICULARIDADE/);
  assert.match(library, /PARALELISMO/);
  assert.match(library, /PLANICIDADE/);
});

test('nesting passa pelo Node protegido e pelo Python Engine', () => {
  const service = read('modules/desenho-tecnico/cad-python.service.js');
  const controller = read('modules/desenho-tecnico/nesting.controller.js');
  const routes = read('modules/desenho-tecnico/desenho-tecnico.routes.js');
  const main = read('services/cad-python/app/main.py');
  const nesting = read('services/cad-python/app/nesting.py');
  assert.match(service, /\/v1\/nesting/);
  assert.match(controller, /cadPythonService\.nesting/);
  assert.match(routes, /\/cad\/:id\/nesting/);
  assert.match(routes, /requireRole\(MANAGE_ACCESS\)/);
  assert.match(main, /@app\.post\("\/v1\/nesting"/);
  assert.match(main, /version="1\.2\.0"/);
  assert.match(nesting, /maxrects-best-short-side-fit-v1/);
  assert.match(nesting, /allow_rotate/);
  assert.match(nesting, /sheets_used/);
});

test('interface permite calcular, visualizar e aplicar plano de corte no CAD', () => {
  const runtime = read('public/js/cad-round4-runtime.js');
  const library = read('frontend/mlightcad-library-gdt.entry.js');
  assert.match(runtime, /Biblioteca/);
  assert.match(runtime, /GD&amp;T/);
  assert.match(runtime, /Nesting/);
  assert.match(runtime, /Detectar retângulos do CAD/);
  assert.match(runtime, /Calcular nesting/);
  assert.match(runtime, /Gerar plano no CAD/);
  assert.match(runtime, /\/nesting/);
  assert.match(library, /FAB_NESTING/);
  assert.match(library, /applyNestingPlan/);
  assert.match(library, /detectRectangularParts/);
});
