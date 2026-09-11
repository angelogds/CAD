const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('RH possui roteador dedicado montado na rota oficial', () => {
  const server = read('server.js');
  const routes = read('modules/rh/rh.routes.js');
  assert.match(server, /mount\(OFFICIAL_ROUTES\.rh, "\.\/modules\/rh\/rh\.routes"\)/);
  assert.match(routes, /router\.get\('\/', requireRole\(rhRead\), controller\.index\)/);
  assert.match(routes, /router\.get\('\/colaboradores', requireRole\(rhRead\), controller\.colaboradores\)/);
  assert.match(routes, /router\.get\('\/jornada', requireRole\(rhRead\), controller\.jornada\)/);
});

test('áreas nominais e sensíveis continuam restritas a RH e ADMIN', () => {
  const routes = read('modules/rh/rh.routes.js');
  const rbac = read('config/rbac.js');
  assert.match(rbac, /rh_manage:\s*\[ROLE\.ADMIN, ROLE\.RH\]/);
  assert.match(rbac, /rh_sensitive:\s*\[ROLE\.ADMIN, ROLE\.RH\]/);
  assert.match(routes, /router\.get\('\/folgas', requireRole\(rhManage\)/);
  assert.match(routes, /router\.get\('\/exames', requireRole\(rhSensitive\)/);
  assert.match(routes, /router\.get\('\/documentos', requireRole\(rhManage\)/);
  assert.match(routes, /router\.get\('\/treinamentos', requireRole\(rhManage\)/);
  assert.match(routes, /router\.get\('\/colaboradores\/:id', requireRole\(rhManage\)/);
});

test('navegação do RH usa páginas reais em vez de âncoras da tela única', () => {
  const header = read('views/rh/_header.ejs');
  for (const href of ['/rh', '/rh/colaboradores', '/rh/jornada', '/rh/folgas', '/rh/exames', '/rh/documentos', '/rh/treinamentos']) {
    assert.ok(header.includes(`href="${href}"`), `navegação deve conter ${href}`);
  }
  assert.doesNotMatch(header, /href="#(?:visao-geral|colaboradores|jornada|folgas|exames|documentos|treinamentos)"/);
});

test('dashboard do RH não concentra formulários de exames e documentos', () => {
  const dashboard = read('views/rh/index.ejs');
  const exames = read('views/rh/exames.ejs');
  const documentos = read('views/rh/documentos.ejs');
  assert.doesNotMatch(dashboard, /action="\/colaboradores\/<%= .* %>\/exames"/);
  assert.doesNotMatch(dashboard, /action="\/colaboradores\/<%= .* %>\/rh-documentos"/);
  assert.match(exames, /action="\/colaboradores\/<%= person\.id %>\/exames"/);
  assert.match(documentos, /action="\/colaboradores\/<%= person\.id %>\/rh-documentos"/);
});

test('dashboard prioriza acesso rápido, alertas visuais e próximos vencimentos', () => {
  const dashboard = read('views/rh/index.ejs');
  assert.match(dashboard, /Abrir ficha do colaborador/);
  assert.match(dashboard, /id="rhQuickPerson"/);
  assert.match(dashboard, /window\.location\.href = `\/rh\/colaboradores\/\$\{id\}`/);
  assert.match(dashboard, /Próximos vencimentos/);
  assert.match(dashboard, /VENCE_EM_BREVE/);
  assert.match(dashboard, /rh-pending-ok/);
  assert.match(dashboard, /is-warning/);
  assert.match(dashboard, /is-danger/);
});

test('relatórios da Escala ficam contextualizados em Jornada e não no cabeçalho global', () => {
  const header = read('views/rh/_header.ejs');
  const jornada = read('views/rh/jornada.ejs');
  assert.doesNotMatch(header, /\/escala\/relatorios/);
  assert.match(jornada, /href="\/escala\/relatorios"/);
});

test('layout do RH mantém navegação e ações utilizáveis no celular', () => {
  const css = read('public/css/rh-portal.css');
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.rh-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /scroll-snap-type:x proximity/);
  assert.match(css, /-webkit-overflow-scrolling:touch/);
  assert.match(css, /\.rh-toolbar \.btn,\.rh-quick-form \.btn,\.rh-form-actions \.btn\{width:100%/);
  assert.match(css, /\.rh-table\{min-width:640px\}/);
});

test('entrada histórica da Escala redireciona para RH sem duplicar implementação', () => {
  const escalaRoutes = read('modules/escala/escala.routes.js');
  const compat = read('modules/escala/escala.rh.controller.js');
  assert.match(escalaRoutes, /role === ROLE\.RH\) return res\.redirect\('\/rh'\)/);
  assert.match(escalaRoutes, /router\.get\("\/rh"[^\n]*res\.redirect\(301, "\/rh"\)/);
  assert.match(compat, /module\.exports = require\('\.\.\/rh\/rh\.controller'\)/);
});

test('reestruturação do RH não cria banco paralelo', () => {
  const controller = read('modules/rh/rh.controller.js');
  const routes = read('modules/rh/rh.routes.js');
  assert.doesNotMatch(controller, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  assert.doesNotMatch(routes, /CREATE TABLE|ALTER TABLE|DROP TABLE/i);
});
