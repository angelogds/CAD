const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const layout = fs.readFileSync(path.join(root, 'views/layout.ejs'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'views/partials/sidebar.ejs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/ui-shell-modern-2026.css'), 'utf8');

test('topbar usa shell moderno e mantém logout somente no menu do usuário', () => {
  assert.match(layout, /ui-shell-modern-2026\.css\?v=20260819-shell-01/);
  assert.equal(layout.includes('class="desktop-logout"'), false);
  assert.equal((layout.match(/action="\/auth\/logout"/g) || []).length, 1);
  assert.match(layout, /class="btn btn-ghost user-menu-logout"/);
  assert.match(layout, /class="btn btn-green topbar-extra-btn"/);
});

test('sidebar preserva permissões e ganha hierarquia visual por grupos', () => {
  assert.match(sidebar, /canAccessModule/);
  assert.match(sidebar, /sidebar-brand-subtitle">Manutenção Integrada/);
  assert.match(sidebar, />OPERAÇÃO</);
  assert.match(sidebar, />GESTÃO E APOIO</);
  assert.match(sidebar, />ADMIN</);
  assert.match(sidebar, /sidebar-tv-link/);
  assert.match(sidebar, /currentPcmSection === 'engenharia' \? 'active' : ''/);
});

test('shell moderno é responsivo e não altera conteúdo das páginas', () => {
  assert.match(css, /--shell-sidebar-width:248px/);
  assert.match(css, /\.topbar\{[\s\S]*position:sticky/);
  assert.match(css, /\.nav-item\.active\{[\s\S]*background:#fff/);
  assert.match(css, /\.desktop-logout\{display:none !important;\}/);
  assert.match(css, /@media \(max-width:980px\)/);
  assert.match(css, /@media \(max-width:768px\)/);
  assert.match(css, /\.app\.mobile-sidebar-open \.sidebar\{transform:translateX\(0\);\}/);
});
