const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROLE } = require('../config/rbac');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function loadAccessFunction() {
  const source = read('modules/escala/escala.routes.js');
  const normalize = source.match(/function normalizeTextRole\(value\) \{[\s\S]*?\n\}/)?.[0];
  const maintenanceRoles = source.match(/const maintenanceSelfRead = \[[^\n]+\];/)?.[0];
  const access = source.match(/function isMaintenanceSelfServiceProfile\(user = \{\}\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(normalize && maintenanceRoles && access, 'Validações de acesso da rota devem existir');
  return vm.runInNewContext(
    [normalize, maintenanceRoles, access, 'isMaintenanceSelfServiceProfile'].join('\n'),
    { ROLE }
  );
}

test('administrador e encarregado podem acessar registro e finalização de hora extra', () => {
  const allowed = loadAccessFunction();
  for (const role of ['ADMIN', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'SUPERVISOR_MANUTENCAO', 'MECANICO']) {
    assert.equal(allowed({ role }), true, role);
  }
  assert.equal(allowed({ role: 'Encarregado de Manutenção' }), true);
});

test('outros setores não recebem acesso de lançamento de hora extra', () => {
  const allowed = loadAccessFunction();
  for (const role of ['RH', 'DIRETORIA', 'COMPRAS', 'PRODUCAO', 'COLABORADOR', 'ALMOXARIFADO']) {
    assert.equal(allowed({ role }), false, role);
  }
});

test('admin seleciona mecânico cadastrado e usa a mesma validação das rotas POST', () => {
  const routes = read('modules/escala/escala.routes.js');
  const controller = read('modules/escala/escala.controller.js');
  const layout = read('views/layout.ejs');
  const view = read('views/escala/hora-extra-nova.ejs');
  assert.match(layout, /'ENCARREGADO_MANUTENCAO'[^\n]*'ADMIN'/);
  assert.match(routes, /router\.get\("\/hora-extra\/nova", requireLogin, requireHoraExtraAccess/);
  assert.match(routes, /router\.post\("\/hora-extra\/iniciar", requireLogin, requireHoraExtraAccess/);
  assert.match(routes, /router\.post\("\/hora-extra\/:id\/finalizar", requireLogin, requireHoraExtraAccess/);
  assert.match(controller, /if \(canManageEscala\(req\)\) return colaboradores/);
  assert.match(controller, /service\.listarColaboradoresMecanicosHoraExtra\(\)/);
  assert.match(view, /canManageEscala \? 'Gestão da Manutenção:/);
  assert.match(view, /if \(canManageEscala && listaColaboradores\.length > 1\)/);
});
