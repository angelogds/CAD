const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const layout = read('views/layout.ejs');
const sidebar = read('views/partials/sidebar.ejs');
const settings = read('views/meu-portal/configuracoes.ejs');
const shellCss = read('public/css/ui-shell-modern-2026.css');
const portalCss = read('public/css/meu-portal.css');
const appLayout = read('public/js/app-layout.js');
const portalRoutes = read('modules/meu-portal/meu-portal.routes.js');
const portalController = read('modules/meu-portal/meu-portal.controller.js');
const portalService = read('modules/meu-portal/meu-portal.service.js');
const authService = read('modules/auth/auth.service.js');
const authController = read('modules/auth/auth.controller.js');
const migration = read('database/migrations/221_users_sidebar_preference.js');

test('preferência da sidebar é pessoal e persistida sem alterar RBAC', () => {
  assert.match(migration, /addColumnIfMissing\([\s\S]*'users'[\s\S]*'sidebar_mode'/);
  assert.match(migration, /DEFAULT 'EXPANDED'/);
  assert.match(portalService, /SIDEBAR_MODES = new Set\(\['EXPANDED', 'COMPACT', 'AUTO'\]\)/);
  assert.match(portalService, /function updateOwnSystemPreferences/);
  assert.match(portalService, /UPDATE users[\s\S]*sidebar_mode = \?/);
  assert.match(authService, /sidebar_mode/);
  assert.match(authController, /sidebar_mode: String\(user\.sidebar_mode \|\| 'EXPANDED'\)/);
});

test('menu do usuário oferece Configurações do sistema e tela com três modos', () => {
  assert.match(layout, /href="\/meu-portal\/configuracoes"/);
  assert.match(layout, />Configurações do sistema</);
  assert.match(layout, /data-sidebar-mode="<%= shellSidebarMode %>"/);
  assert.match(portalRoutes, /router\.get\('\/configuracoes', ctrl\.configuracoes\)/);
  assert.match(portalRoutes, /router\.post\('\/configuracoes', ctrl\.saveConfiguracoes\)/);
  assert.match(portalController, /function configuracoes/);
  assert.match(portalController, /function saveConfiguracoes/);
  assert.match(settings, /value="EXPANDED"/);
  assert.match(settings, /value="COMPACT"/);
  assert.match(settings, /value="AUTO"/);
  assert.match(settings, /Sempre aberta/);
  assert.match(settings, /Compacta com ícones/);
  assert.match(settings, /Automática/);
  assert.match(portalCss, /\.my-sidebar-mode-grid/);
});

test('desktop alterna aberta e compacta, AUTO recolhe após escolher módulo', () => {
  assert.match(appLayout, /allowedModes = new Set\(\['EXPANDED', 'COMPACT', 'AUTO'\]\)/);
  assert.match(appLayout, /sessionStorage\.setItem\(autoKey, '1'\)/);
  assert.match(appLayout, /setDesktopCompact\(true\)/);
  assert.match(appLayout, /app\.classList\.toggle\('sidebar-compact'/);
  assert.match(appLayout, /sidebar\.addEventListener\('click'/);
  assert.match(appLayout, /shell-sidebar-tooltip/);
  assert.match(appLayout, /dataNavLabel|dataset\.navLabel/);
});

test('modo compacto usa ícones e preserva comportamento mobile existente', () => {
  assert.match(sidebar, /data-nav-label/);
  assert.match(sidebar, /sidebar-compact-mark/);
  assert.match(shellCss, /--shell-sidebar-compact-width:72px/);
  assert.match(shellCss, /\.app\.sidebar-compact\{/);
  assert.match(shellCss, /\.shell-nav-icon/);
  assert.match(shellCss, /\.shell-sidebar-tooltip/);
  assert.match(shellCss, /@media \(max-width:980px\)[\s\S]*\.app\.sidebar-compact,[\s\S]*\.app\.sidebar-collapsed\{grid-template-columns:1fr;\}/);
  assert.match(appLayout, /app\.classList\.toggle\('mobile-sidebar-open'/);
  assert.match(appLayout, /app\.classList\.remove\('mobile-sidebar-open'\)/);
});
