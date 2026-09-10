const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('menu do usuário oferece Meu Portal, Perfil, RH e Conta sem remover logout seguro', () => {
  const layout = read('views/layout.ejs');

  assert.match(layout, /href="\/meu-portal"[^>]*>[\s\S]*Meu Portal/);
  assert.match(layout, /href="\/meu-portal\/perfil"[^>]*>[\s\S]*Meu Perfil/);
  assert.match(layout, /href="\/meu-portal\/cartao"[^>]*>[\s\S]*Meu Cartão/);
  assert.match(layout, /href="\/escala\/meu-painel"[^>]*>[\s\S]*Minha Jornada/);
  assert.match(layout, /href="\/meu-portal\/rh"[^>]*>[\s\S]*Meu RH/);
  assert.match(layout, /href="\/meu-portal\/conta"[^>]*>[\s\S]*Conta e segurança/);
  assert.match(layout, /<form action="\/auth\/logout" method="POST">/);
  assert.match(layout, /activeMenu === 'meu-portal'[\s\S]*meu-portal-modernizacao\.css/);
});

test('home vira hub compacto e não repete formulários nem QR na tela inicial', () => {
  const view = read('views/meu-portal/index.ejs');
  const controller = read('modules/meu-portal/meu-portal.controller.js');
  const indexBlock = controller.slice(controller.indexOf('async function index'), controller.indexOf('function perfil'));

  assert.match(view, /MEU ACESSO/);
  assert.match(view, /Minha identidade/);
  assert.match(view, /Identificação do Almoxarifado/);
  assert.match(view, /Minha conta/);
  assert.match(view, /href="\/meu-portal\/perfil"/);
  assert.match(view, /href="\/meu-portal\/cartao"/);
  assert.match(view, /href="\/meu-portal\/conta"/);
  assert.match(view, /href="\/meu-portal\/rh"/);
  assert.match(view, /href="\/meu-portal\/materiais"/);
  assert.match(view, /href="\/meu-portal\/treinamentos"/);
  assert.match(view, /href="\/meu-portal\/servicos"/);
  assert.doesNotMatch(view, /method="POST" action="\/meu-portal\/foto"/);
  assert.doesNotMatch(view, /method="POST" action="\/meu-portal\/senha"/);
  assert.doesNotMatch(view, /employee-id-card/);
  assert.doesNotMatch(indexBlock, /qrDataUrl\(/);
  assert.doesNotMatch(indexBlock, /cardQr/);
});

test('perfil e conta usam páginas próprias e preservam POSTs e validações existentes', () => {
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  const perfil = read('views/meu-portal/perfil.ejs');
  const conta = read('views/meu-portal/conta.ejs');
  const controller = read('modules/meu-portal/meu-portal.controller.js');

  assert.match(routes, /router\.use\(requireLogin\)/);
  assert.match(routes, /router\.get\('\/perfil', ctrl\.perfil\)/);
  assert.match(routes, /router\.get\('\/conta', ctrl\.conta\)/);
  assert.match(perfil, /method="POST" action="\/meu-portal\/foto"/);
  assert.match(perfil, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(conta, /method="POST" action="\/meu-portal\/senha"/);
  assert.match(conta, /name="current_password"/);
  assert.match(conta, /name="new_password"/);
  assert.match(conta, /name="confirm_password"/);
  assert.match(controller, /newPassword\.length < 8/);
  assert.match(controller, /currentPassword === newPassword/);
});

test('cartão possui página dedicada para emissão, estado revogado e QR ativo', () => {
  const card = read('views/meu-portal/cartao.ejs');
  const controller = read('modules/meu-portal/meu-portal.controller.js');

  assert.match(card, /Identificação do Almoxarifado/);
  assert.match(card, /Cartão revogado/);
  assert.match(card, /method="POST" action="\/meu-portal\/cartao\/emitir"/);
  assert.match(card, /employee-id-card/);
  assert.match(card, /Imprimir \/ salvar PDF/);
  assert.match(controller, /Number\(colaborador\.qr_ativo \|\| 0\) === 1[\s\S]*qrDataUrl\(colaborador\)/);
});

test('hub compacto é responsivo e mantém padronização das páginas internas', () => {
  const css = read('public/css/meu-portal-modernizacao.css');

  assert.match(css, /\.my-access-grid/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.my-service-card--primary/);
  assert.match(css, /\.my-personal-profile/);
  assert.match(css, /\.my-password-form--dedicated/);
  assert.match(css, /\.my-material-table th,\.my-f2b-table th[\s\S]*position:sticky/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.doesNotMatch(css, /display:\s*none[^;]*(?:senha|password|logout)/i);
});
