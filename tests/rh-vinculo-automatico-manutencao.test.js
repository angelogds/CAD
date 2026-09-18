const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('vínculo automático separa autoatendimento técnico da Manutenção e materiais setoriais', () => {
  const vinculo = read('modules/meu-portal/meu-portal.vinculo.js');
  const maintenanceBlock = vinculo.match(/const MAINTENANCE_SELF_SERVICE_ROLES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  const materialBlock = vinculo.match(/const MATERIAL_SELF_SERVICE_ROLES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';

  assert.match(maintenanceBlock, /'MECANICO'/);
  assert.match(maintenanceBlock, /'MANUTENCAO_SUPERVISOR'/);
  assert.match(maintenanceBlock, /'ENCARREGADO_MANUTENCAO'/);
  assert.doesNotMatch(maintenanceBlock, /'ADMIN'|'RH'|'ENCARREGADO_LOGISTICA'|'ENCARREGADO_FRIGORIFICO'/);

  assert.match(materialBlock, /\.\.\.MAINTENANCE_SELF_SERVICE_ROLES/);
  assert.match(materialBlock, /'ENCARREGADO_LOGISTICA'/);
  assert.match(materialBlock, /'ENCARREGADO_FRIGORIFICO'/);
  assert.match(materialBlock, /'RH'/);
});

test('auto-link preserva a ficha existente e nunca adivinha nome duplicado', () => {
  const vinculo = read('modules/meu-portal/meu-portal.vinculo.js');

  assert.match(vinculo, /c\.user_id = \?/);
  assert.match(vinculo, /COALESCE\([^\n]*\.ativo, 1\) = 1/);
  assert.match(vinculo, /deleted_at/);
  assert.match(vinculo, /INATIVO','DESLIGADO','EXCLUIDO','REMOVIDO','APAGADO/);
  assert.match(vinculo, /candidates\.length !== 1/);
  assert.match(vinculo, /ALREADY_LINKED_TO_OTHER_USER/);
  assert.match(vinculo, /WHERE id = \?[\s\S]*user_id IS NULL OR user_id = 0 OR user_id = \?/);
  assert.doesNotMatch(vinculo, /INSERT\s+INTO\s+colaboradores/i);
});

test('migração 198 faz backfill somente quando o vínculo é único e seguro', () => {
  const migration = read('database/migrations/198_rh_vinculo_automatico_manutencao.js');

  assert.match(migration, /ELIGIBLE_ROLES/);
  assert.match(migration, /candidates\.length !== 1/);
  assert.match(migration, /anyLink\.get/);
  assert.match(migration, /user_id IS NULL OR user_id = 0 OR user_id = \?/);
  assert.match(migration, /COALESCE\(c\.ativo, 1\) = 1/);
  assert.match(migration, /COALESCE\(c\.deleted_at, ''\) = ''/);
  assert.doesNotMatch(migration, /DELETE FROM colaboradores|DROP TABLE|INSERT INTO colaboradores/i);
});

test('Meu Portal mantém foto e senha gerais, mas restringe dados profissionais e Meu RH à Manutenção', () => {
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  const view = read('views/meu-portal/index.ejs');

  assert.match(routes, /router\.use\(vinculo\.attachAutomaticMaintenanceLink\)/);
  assert.match(routes, /get\('\/perfil', ctrl\.perfil\)/);
  assert.match(routes, /get\('\/conta', ctrl\.conta\)/);
  assert.match(routes, /post\('\/foto', upload\.single\('photo'\), ctrl\.updatePhoto\)/);
  assert.match(routes, /post\('\/senha', ctrl\.changePassword\)/);
  assert.match(routes, /get\('\/rh', vinculo\.requireMaintenanceSelfService, rhPortalCtrl\.index\)/);
  assert.match(routes, /get\('\/dados-profissionais', vinculo\.requireMaintenanceSelfService/);
  assert.match(routes, /get\('\/materiais', vinculo\.requireMaterialSelfService/);
  assert.match(routes, /get\('\/cartao', vinculo\.requireMaterialSelfService/);
  assert.match(view, /const acessoManutencao =/);
  assert.match(view, /const acessoMateriais =/);
  assert.match(view, /if \(acessoManutencao\)/);
  assert.match(view, /acessoMateriais && !acessoManutencao/);
});

test('escala pessoal e lançamento de hora extra ficam operacionais, não administrativos', () => {
  const routes = read('modules/escala/escala.routes.js');

  assert.match(routes, /const maintenanceSelfRead = \[ROLE\.MECANICO, ROLE\.MANUTENCAO_SUPERVISOR, ROLE\.SUPERVISOR_MANUTENCAO, ROLE\.ENCARREGADO_MANUTENCAO\]/);
  assert.match(routes, /get\("\/meu-painel", requireLogin, requireRole\(maintenanceSelfRead\)/);
  assert.match(routes, /post\("\/folgas\/solicitar", requireLogin, requireRole\(maintenanceSelfRead\)/);
  assert.match(routes, /if \(isMaintenanceSelfServiceProfile\(user\)\) return next\(\)/);
  assert.doesNotMatch(routes, /role === ROLE\.ADMIN \|\| isMecanicoProfile/);
});

test('escala já possui filtro mestre para colaborador apagado/inativo', () => {
  const service = read('modules/escala/escala.service.js');

  assert.match(service, /function isColaboradorAtivo/);
  assert.match(service, /Number\(row\.ativo \?\? 1\) !== 1/);
  assert.match(service, /if \(row\.deleted_at\) return false/);
  assert.match(service, /'inativo', 'desligado', 'excluido', 'apagado', 'removido'/);
});
