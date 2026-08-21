const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('rodada 3 carrega sem substituir o runtime principal do MLightCAD', () => {
  const engine = read('public/js/cad-engine-v2.js');
  assert.match(engine, /cad-mlight-runtime\.js/);
  assert.match(engine, /cad-round3-runtime\.js/);
  assert.doesNotMatch(engine, /legacy/i);
});

test('build gera bundle isolado de layout e analise', () => {
  const build = read('scripts/build-mlightcad.mjs');
  assert.match(build, /frontend\/mlightcad-layout-analysis\.entry\.js/);
  assert.match(build, /mlightcad-layout-analysis/);
  assert.match(build, /publicDir: false/);
});

test('Paper Space usa layout real e viewport em escala sem redimensionar o Model', () => {
  const layout = read('frontend/mlightcad-layout-analysis.entry.js');
  assert.match(layout, /AcDbLayoutManager/);
  assert.match(layout, /AcDbViewport/);
  assert.match(layout, /createLayout/);
  assert.match(layout, /blockTableRecordId/);
  assert.match(layout, /viewHeight = viewportH \* denominator/);
  assert.match(layout, /STANDARD_SCALES/);
  assert.match(layout, /FAB-A3/);
  assert.match(layout, /FAB-A4/);
  assert.match(layout, /switchModel/);
});

test('vistas automaticas reconhecem eixo e pecas circulares', () => {
  const layout = read('frontend/mlightcad-layout-analysis.entry.js');
  assert.match(layout, /detectSteppedShaft/);
  assert.match(layout, /detectRoundPart/);
  assert.match(layout, /VISTA DE EXTREMIDADE/);
  assert.match(layout, /CORTE A-A/);
  assert.match(layout, /FAB_VISTAS_PROJETADAS/);
});

test('interface expoe Layout, Vistas Auto e Analise tecnica com degradacao do Python', () => {
  const runtime = read('public/js/cad-round3-runtime.js');
  assert.match(runtime, /Vistas Auto/);
  assert.match(runtime, /Análise técnica/);
  assert.match(runtime, /LAYOUT A4/);
  assert.match(runtime, /LAYOUT A3/);
  assert.match(runtime, /\/python\/status/);
  assert.match(runtime, /\/analisar/);
  assert.match(runtime, /MOTOR TÉCNICO • BÁSICO/);
  assert.match(runtime, /persistCurrent/);
});

test('Python avancado ignora camadas FAB e calcula solidos de revolucao', () => {
  const metrics = read('services/cad-python/app/manufacturing_metrics.py');
  const main = read('services/cad-python/app/main.py');
  assert.match(metrics, /GENERATED_LAYER_PREFIX = "FAB_"/);
  assert.match(metrics, /EIXO_ESCALONADO/);
  assert.match(metrics, /FLANGE/);
  assert.match(metrics, /DISCO/);
  assert.match(metrics, /volume_mm3/);
  assert.match(metrics, /estimated_mass_kg/);
  assert.match(main, /prepare_analysis_cad/);
  assert.match(main, /enhance_analysis/);
  assert.match(main, /version="1\.1\.0"/);
});
