const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('CAD carrega estabilizacao depois das extensoes', () => {
  const engine = read('public/js/cad-engine-v2.js');
  const round4 = engine.indexOf("cad-round4-runtime.js");
  const stabilize = engine.indexOf("cad-ui-stabilization.js");
  assert.ok(round4 >= 0);
  assert.ok(stabilize > round4);
});

test('menu lateral reaproveita botoes existentes sem recriar ferramentas', () => {
  const ui = read('public/js/cad-ui-stabilization.js');
  assert.match(ui, /cadToolDrawerToggle/);
  assert.match(ui, /cadToolDrawerClose/);
  assert.match(ui, /mlightFlangeBtn/);
  assert.match(ui, /mlightAutoDimBtn/);
  assert.match(ui, /mlightTechAnalysisBtn/);
  assert.match(ui, /mlightLibraryBtn/);
  assert.match(ui, /mlightNestingBtn/);
  assert.match(ui, /back\.href = '\/desenho-tecnico'/);
  assert.match(ui, /hideLegacyEditor/);
});

test('central usa permissao RBAC real e abre MLightCAD diretamente', () => {
  const routes = read('modules/desenho-tecnico/desenho-tecnico.routes.js');
  const view = read('views/desenho-tecnico/index.ejs');
  assert.match(routes, /canAccessModule/);
  assert.match(routes, /req\.can = \(key\)/);
  assert.match(routes, /req\.query\.status = 'ATIVO'/);
  assert.match(routes, /desenho_tecnico_manage/);
  assert.match(routes, /res\.redirect\(`\/desenho-tecnico\/cad\/\$\{req\.params\.id\}\/editor`\)/);
  assert.match(view, /NOVO CAD/);
  assert.match(view, />Abrir CAD</);
  assert.doesNotMatch(view, />Visualizar</);
});

test('exclusao da central e arquivamento nao destroem dados', () => {
  const routes = read('modules/desenho-tecnico/desenho-tecnico.routes.js');
  const archive = read('modules/desenho-tecnico/desenho-tecnico.archive.controller.js');
  const view = read('views/desenho-tecnico/index.ejs');
  assert.match(routes, /desenho_tecnico_delete/);
  assert.match(routes, /\/cad\/:id\/arquivar/);
  assert.match(archive, /service\.inactivate\(desenho\.id\)/);
  assert.match(archive, /dados foram preservados/i);
  assert.match(view, /action="\/desenho-tecnico\/cad\/<%= d\.id %>\/arquivar"/);
  assert.match(view, />Excluir</);
});

test('pagina antiga de detalhes nao renderiza mais preview SVG legado', () => {
  const show = read('views/desenho-tecnico/cad-show.ejs');
  assert.doesNotMatch(show, /svgPreview/);
  assert.doesNotMatch(show, /Vista 2D CAD/);
  assert.match(show, /MLightCAD/);
});
