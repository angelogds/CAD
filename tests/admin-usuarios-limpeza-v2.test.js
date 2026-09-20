const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('console de usuários preserva RBAC ADMIN e rotas canônicas', () => {
  const routes = read('modules/usuarios/usuarios.routes.js');
  const rbac = read('config/rbac.js');

  assert.match(rbac, /usuarios:\s*\[ROLE\.ADMIN\]/);
  assert.match(routes, /const USERS_ACCESS = ACCESS\.usuarios/);
  assert.match(routes, /router\.get\(\["\/", "\/usuarios"\]/);
  assert.match(routes, /router\.get\(\["\/novo", "\/usuarios\/novo"\]/);
  assert.match(routes, /router\.post\(\["\/:id\/excluir", "\/usuarios\/:id\/excluir"\],[\s\S]*requireAdmin/);
  assert.match(routes, /router\.post\(\["\/:id\/restaurar", "\/usuarios\/:id\/restaurar"\],[\s\S]*requireAdmin/);
});

test('aliases históricos de usuários compartilham os mesmos handlers sem duplicação', () => {
  const routes = read('modules/usuarios/usuarios.routes.js');

  assert.match(routes, /\["\/", "\/usuarios"\]/);
  assert.match(routes, /\["\/novo", "\/usuarios\/novo"\]/);
  assert.match(routes, /\["\/:id\/editar", "\/usuarios\/:id\/editar"\]/);
  assert.match(routes, /\["\/:id", "\/usuarios\/:id"\]/);
  assert.match(routes, /\["\/:id\/reset-senha", "\/usuarios\/:id\/reset-senha"\]/);
});

test('views legadas sem rota ativa foram removidas', () => {
  for (const file of [
    'views/admin/users.ejs',
    'views/usuarios/new.ejs',
    'views/admin/whatsapp-status.ejs',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
});

test('console de usuários usa indicadores reais e design compartilhado', () => {
  const service = read('modules/usuarios/usuarios.service.js');
  const controller = read('modules/usuarios/usuarios.controller.js');
  const view = read('views/usuarios/index.ejs');

  assert.match(service, /function getSummary\(\)/);
  assert.match(service, /com_whatsapp/);
  assert.match(service, /perfis_ativos/);
  assert.match(controller, /service\.getSummary\(\)/);
  assert.match(view, /admin-kpis/);
  assert.match(view, /ui-btn--danger-soft/);
  assert.match(view, /admin-console\.css\?v=20260919-p5/);
});

test('cadastro e edição compartilham JS de perfil e WhatsApp', () => {
  const novo = read('views/usuarios/novo.ejs');
  const edit = read('views/usuarios/edit.ejs');
  const js = read('public/js/usuarios-form.js');

  for (const source of [novo, edit]) {
    assert.match(source, /data-user-form/);
    assert.match(source, /data-role-function/);
    assert.match(source, /data-role-sector/);
    assert.match(source, /data-whatsapp-input/);
    assert.match(source, /\/js\/usuarios-form\.js\?v=20260919-p5/);
  }

  assert.match(js, /normalizeWhatsappInputValue/);
  assert.match(js, /syncRoleContext/);
  assert.match(js, /55DDDNÚMERO/);
});

test('armazenamento preserva ações críticas e respectivas permissões', () => {
  const routes = read('modules/admin/storage.routes.js');
  const storageView = read('views/admin/armazenamento.ejs');
  const cleanupView = read('views/admin/limpeza-volume.ejs');

  assert.match(routes, /'\/limpeza-volume', requireLogin, requireRole\(ADMIN\)/);
  assert.match(routes, /'\/armazenamento\/limpar-sessoes', requireLogin, requireRole\(ADMIN\)/);
  assert.match(routes, /'\/armazenamento\/checkpoint-wal', requireLogin, requireRole\(ADMIN\)/);
  assert.match(routes, /'\/armazenamento\/otimizar', requireLogin, requireRole\(ADMIN\)/);

  assert.match(storageView, /action="\/admin\/armazenamento\/limpar-sessoes"/);
  assert.match(storageView, /action="\/admin\/armazenamento\/checkpoint-wal"/);
  assert.match(storageView, /action="\/admin\/armazenamento\/otimizar"/);
  assert.match(cleanupView, /APAGAR ANEXOS/);
  assert.match(cleanupView, /ui-btn--danger-soft/);
});

test('console administrativo é responsivo', () => {
  const css = read('public/css/admin-console.css');

  assert.match(css, /\.admin-console/);
  assert.match(css, /\.admin-table td::before/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(max-width:440px\)/);
});
