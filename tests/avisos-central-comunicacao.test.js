const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const controller = readFileSync('modules/avisos/avisos.controller.js', 'utf8');
const service = readFileSync('modules/avisos/avisos.service.js', 'utf8');
const routes = readFileSync('modules/avisos/avisos.routes.js', 'utf8');
const rbac = readFileSync('config/rbac.js', 'utf8');
const view = readFileSync('views/avisos/index.ejs', 'utf8');
const migration = readFileSync('database/migrations/187_avisos_central_comunicacao.js', 'utf8');

test('Avisos usa RBAC central sem lista local de publicação', () => {
  assert.match(controller, /ACCESS, normalizeRole/);
  assert.doesNotMatch(controller, /function canPublishAviso/);
  assert.match(routes, /const manageRoles = ACCESS\.avisos_manage/);
  assert.match(routes, /const deleteRoles = ACCESS\.avisos_delete/);
  assert.match(rbac, /avisos_manage:\s*\[[^\]]*ROLE\.MANUTENCAO_SUPERVISOR/s);
});

test('service centraliza categoria prioridade e status efetivo', () => {
  assert.match(service, /SEGURANCA/);
  assert.match(service, /MEIO_AMBIENTE/);
  assert.match(service, /CRITICA/);
  assert.match(service, /function calculateEffectiveStatus/);
  assert.match(service, /RASCUNHO/);
  assert.match(service, /AGENDADO/);
  assert.match(service, /EXPIRADO/);
  assert.match(service, /function listAvisos/);
  assert.match(service, /function getDashboardMetrics/);
});

test('migration é incremental e preserva avisos antigos', () => {
  assert.match(migration, /addColumnIfMissing\('avisos', 'categoria'/);
  assert.match(migration, /addColumnIfMissing\('avisos', 'prioridade'/);
  assert.match(migration, /addColumnIfMissing\('avisos', 'status'/);
  assert.match(migration, /addColumnIfMissing\('avisos', 'publish_at'/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM avisos/i);
});

test('interface possui KPIs filtros paginação e modal funcional', () => {
  ['Publicados','Agendados','Rascunhos','Expirados','Total'].forEach((label) => assert.match(view, new RegExp(label)));
  assert.match(view, /name="categoria"/);
  assert.match(view, /name="prioridade"/);
  assert.match(view, /name="periodo"/);
  assert.match(view, /aviso-modal/);
  assert.match(view, /listagem\.pages/);
  assert.match(view, /canManageAvisos/);
  assert.match(view, /canDeleteAvisos/);
});
