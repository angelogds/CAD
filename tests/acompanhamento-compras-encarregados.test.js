const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getAcompanhamentoScope,
  canViewSetor,
} = require('../modules/acompanhamento-compras/acompanhamento-compras.scope');
const {
  dbAliasesForSetor,
} = require('../modules/compras/compras-setores');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('mapeia perfis encarregados para o setor corporativo correto', () => {
  assert.equal(getAcompanhamentoScope({ role: 'ENCARREGADO_LOGISTICA' }).setor, 'LOGÍSTICA');
  assert.equal(getAcompanhamentoScope({ role: 'ENCARREGADO_FRIGORIFICO' }).setor, 'FRIGORÍFICO');
  assert.equal(getAcompanhamentoScope({ role: 'RH' }).setor, 'ADMINISTRATIVO');
  assert.equal(getAcompanhamentoScope({ role: 'ENCARREGADO_MANUTENCAO' }).setor, 'RECICLAGEM');
  assert.equal(getAcompanhamentoScope({ role: 'SUPERVISOR_MANUTENCAO' }).setor, 'RECICLAGEM');
  assert.equal(getAcompanhamentoScope({ role: 'ADMIN' }).isGlobal, true);
  assert.equal(getAcompanhamentoScope({ role: 'COMPRAS' }), null);
});

test('isola visualização por setor e preserva histórico legado da Reciclagem', () => {
  assert.equal(canViewSetor({ role: 'ENCARREGADO_LOGISTICA' }, 'Logística'), true);
  assert.equal(canViewSetor({ role: 'ENCARREGADO_LOGISTICA' }, 'Frigorífico'), false);

  assert.equal(canViewSetor({ role: 'ENCARREGADO_FRIGORIFICO' }, 'FRIGORIFICO'), true);
  assert.equal(canViewSetor({ role: 'RH' }, 'RH'), true);
  assert.equal(canViewSetor({ role: 'RH' }, 'Administrativo'), true);
  assert.equal(canViewSetor({ role: 'RH' }, 'Reciclagem'), false);

  assert.equal(canViewSetor({ role: 'ENCARREGADO_MANUTENCAO' }, 'Manutenção'), true);
  assert.equal(canViewSetor({ role: 'ENCARREGADO_MANUTENCAO' }, 'Produção'), true);
  assert.equal(canViewSetor({ role: 'ENCARREGADO_MANUTENCAO' }, ''), true);

  const aliases = dbAliasesForSetor('RECICLAGEM');
  assert.ok(aliases.includes('Manutenção'));
  assert.ok(aliases.includes('Produção'));
});

test('novo módulo de acompanhamento é somente leitura', () => {
  const routes = read('modules/acompanhamento-compras/acompanhamento-compras.routes.js');
  assert.match(routes, /router\.get\('\/'/);
  assert.match(routes, /router\.get\('\/:id'/);
  assert.doesNotMatch(routes, /router\.(post|put|patch|delete)\(/i);

  const controller = read('modules/acompanhamento-compras/acompanhamento-compras.controller.js');
  assert.match(controller, /activeMenu = 'solicitacoes'/);
});

test('RBAC e menu liberam acompanhamento sem conceder Compras operacional', () => {
  const rbac = read('config/rbac.js');
  const sidebar = read('views/partials/sidebar.ejs');
  const server = read('server.js');

  assert.match(rbac, /acompanhamento_compras:[^\n]*ROLE\.RH/);
  assert.match(rbac, /acompanhamento_compras:[^\n]*ROLE\.ENCARREGADO_LOGISTICA/);
  assert.match(rbac, /acompanhamento_compras:[^\n]*ROLE\.ENCARREGADO_FRIGORIFICO/);
  assert.match(rbac, /acompanhamento_compras:[^\n]*ROLE\.ENCARREGADO_MANUTENCAO/);

  const comprasReadLine = rbac.split('\n').find((line) => line.includes('compras_read:')) || '';
  assert.doesNotMatch(comprasReadLine, /ENCARREGADO_LOGISTICA|ENCARREGADO_FRIGORIFICO|ROLE\.RH/);

  assert.doesNotMatch(sidebar, /navItem\('\/acompanhamento-compras'/);
  const minhas = read('views/solicitacoes/minhas.ejs');
  assert.match(minhas, /href="\/acompanhamento-compras"/);
  assert.match(minhas, /Acompanhamento de Compras/);
  assert.match(server, /mount\("\/acompanhamento-compras"/);
});

test('Meu Portal libera materiais para encarregados sem abrir serviços técnicos da Manutenção', () => {
  const vinculo = read('modules/meu-portal/meu-portal.vinculo.js');
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  const view = read('views/meu-portal/index.ejs');

  assert.match(vinculo, /MATERIAL_SELF_SERVICE_ROLES/);
  assert.match(vinculo, /'ENCARREGADO_LOGISTICA'/);
  assert.match(vinculo, /'ENCARREGADO_FRIGORIFICO'/);
  assert.match(vinculo, /'RH'/);
  assert.match(vinculo, /function requireMaterialSelfService/);

  assert.match(routes, /router\.get\('\/materiais', vinculo\.requireMaterialSelfService/);
  assert.match(routes, /router\.get\('\/cartao', vinculo\.requireMaterialSelfService/);
  assert.match(routes, /router\.get\('\/treinamentos', vinculo\.requireMaintenanceSelfService/);
  assert.match(routes, /router\.get\('\/servicos', vinculo\.requireMaintenanceSelfService/);

  assert.match(view, /Retiradas e rastreabilidade/);
  assert.match(view, /Retiradas de material/);
  assert.match(view, /acessoMateriais && !acessoManutencao/);
});
