const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('indicadores de Demandas só exibem nomes e quantidades', () => {
  const view = read('views/demandas/index.ejs');
  const style = read('public/css/demandas.css');
  assert.match(view,/class="demand-metrics"/);
  assert.match(view,/<span class="metric-label"><%= metric.label %><\/span>/);
  assert.match(view,/<strong><%= metric.value \|\| 0 %><\/strong>/);
  assert.doesNotMatch(view,/class="metric-mark"/);
  assert.doesNotMatch(view,/<small><%= metric.note %><\/small>/);
  assert.match(style,/@media \(min-width:1440px\)\{\.demand-metrics\{grid-template-columns:repeat\(8,/);
  assert.match(style,/@media \(max-width:460px\)\{\.demand-metrics\{grid-template-columns:repeat\(2,/);
});
test('navegação inferior móvel é global e respeita RBAC', () => {
  const layout=read('views/layout.ejs');
  const nav=read('views/partials/mobile-bottom-nav.ejs');
  const js=read('public/js/mobile-bottom-nav.js');
  const css=read('public/css/mobile-bottom-nav.css');
  assert.match(layout,/include\("partials\/mobile-bottom-nav"\)/);
  assert.match(layout,/mobile-bottom-nav\.css/);
  assert.match(layout,/mobile-bottom-nav\.js/);
  assert.match(nav,/mobileCan\('demandas_view'\)/);
  assert.match(nav,/mobileCan\('demandas_open'\)/);
  assert.match(nav,/mobileCan\('os_view'\)/);
  assert.match(nav,/aria-current="page"/);
  assert.match(js,/sidebarToggle\.click\(\)/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/@media \(max-width:720px\)/);
});
