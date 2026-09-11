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
