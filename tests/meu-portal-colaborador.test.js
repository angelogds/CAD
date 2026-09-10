const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Meu Portal é autoatendimento autenticado e não reaproveita a permissão administrativa de usuários', () => {
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  assert.match(routes, /router\.use\(requireLogin\)/);
  assert.doesNotMatch(routes, /ACCESS\.usuarios|requireAdmin/);
  assert.match(routes, /router\.post\('\/senha'/);
  assert.match(routes, /router\.post\('\/foto'/);
  assert.match(routes, /router\.get\('\/cartao'/);
});

test('portal resolve colaborador exclusivamente pelo user_id e não cria cadastro paralelo', () => {
  const service = read('modules/meu-portal/meu-portal.service.js');
  assert.match(service, /WHERE user_id = \? AND COALESCE\(deleted_at, ''\) = ''/);
  assert.doesNotMatch(service, /INSERT INTO colaboradores/i);
  assert.doesNotMatch(service, /normalizePersonName|LIKE.*nome/i);
});

test('vínculo é explícito, limitado a RH e ADMIN e usa somente ficha existente sem login', () => {
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  const service = read('modules/meu-portal/meu-portal.service.js');
  const controller = read('modules/meu-portal/meu-portal.controller.js');
  const view = read('views/meu-portal/index.ejs');

  assert.match(routes, /LINK_MANAGER_ROLES = \['ADMIN', 'RH'\]/);
  assert.match(routes, /router\.post\('\/vinculo', requireRole\(LINK_MANAGER_ROLES\), ctrl\.linkColaborador\)/);
  assert.match(service, /\(user_id IS NULL OR user_id = 0\)/);
  assert.match(service, /UPDATE colaboradores[\s\S]*SET user_id = \?/);
  assert.match(service, /Somente RH ou ADMIN pode realizar o vínculo/);
  assert.doesNotMatch(service, /INSERT INTO colaboradores/i);
  assert.doesNotMatch(service, /normalizePersonName|LIKE.*nome/i);
  assert.match(controller, /linkOwnUserToColaborador/);
  assert.match(view, /Vincular colaborador/);
  assert.match(view, /A lista contém somente fichas existentes ainda sem usuário vinculado/);
});

test('alteração de senha exige conferência da senha atual e grava hash somente do próprio usuário', () => {
  const service = read('modules/meu-portal/meu-portal.service.js');
  const controller = read('modules/meu-portal/meu-portal.controller.js');
  assert.match(service, /bcrypt\.compareSync/);
  assert.match(service, /bcrypt\.hashSync/);
  assert.match(service, /UPDATE users SET password_hash = \? WHERE id = \?/);
  assert.match(controller, /newPassword\.length < 8/);
  assert.match(controller, /newPassword !== confirmPassword/);
});

test('foto própria sincroniza users e ficha vinculada sem alterar função, setor ou perfil', () => {
  const service = read('modules/meu-portal/meu-portal.service.js');
  assert.match(service, /UPDATE users SET photo_path = \? WHERE id = \?/);
  assert.match(service, /UPDATE colaboradores[\s\S]*SET foto_url = \?, updated_at = datetime\('now'\)[\s\S]*WHERE user_id = \?/);
  assert.doesNotMatch(service, /SET role|SET funcao|SET setor/i);
});

test('cartão próprio reutiliza o QR seguro existente e não permite rotação/revogação pelo colaborador', () => {
  const service = read('modules/meu-portal/meu-portal.service.js');
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  assert.match(service, /colaboradores\.qr\.service/);
  assert.match(service, /emitToken\(colaborador\.id, \{ rotate: false \}\)/);
  assert.doesNotMatch(routes, /revogar|rotate/);
  assert.match(read('modules/colaboradores/colaboradores.qr.service.js'), /CGCOL:\$\{colaborador\.qr_token\}/);
});

test('integração preserva leitura do QR no Almoxarifado e mantém Meu Portal visível em Gestão e Apoio', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(read('modules/almoxarifado/retiradas-qr.controller.js'), /getColaboradorByQr\(codigo\)/);
  assert.match(read('modules/tv/tv.routes.js'), /router\.use\('\/meu-portal', meuPortalRoutes\)/);
  assert.match(sidebar, /const canMeuPortal = Boolean\(user\?\.id\)/);
  assert.match(sidebar, /hasSupportGroup = [^;]*canMeuPortal/);
  assert.match(sidebar, /navItem\('\/meu-portal', 'Meu Portal'/);
  assert.doesNotMatch(sidebar, />MINHA CONTA</);
});

test('estado sem vínculo é compacto e responsivo', () => {
  const view = read('views/meu-portal/index.ejs');
  const css = read('public/css/meu-portal.css');
  assert.match(view, /my-portal-panel--compact/);
  assert.match(view, /my-card-state--compact/);
  assert.match(css, /\.my-portal-grid\{[^}]*align-items:start/);
  assert.match(css, /\.my-portal-notice\.has-action/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*\.my-link-form\{grid-template-columns:1fr\}/);
});
