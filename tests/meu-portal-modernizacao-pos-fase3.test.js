const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('menu do usuário oferece atalhos pessoais sem remover logout seguro', () => {
  const layout = read('views/layout.ejs');

  assert.match(layout, /href="\/meu-portal"[^>]*>[\s\S]*Meu Portal/);
  assert.match(layout, /href="\/meu-portal\/cartao"[^>]*>[\s\S]*Meu Cartão/);
  assert.match(layout, /href="\/escala\/meu-painel"[^>]*>[\s\S]*Minha Jornada/);
  assert.match(layout, /href="\/meu-portal#seguranca"[^>]*>[\s\S]*Conta e segurança/);
  assert.match(layout, /<form action="\/auth\/logout" method="POST">/);
  assert.match(layout, /activeMenu === 'meu-portal'[\s\S]*meu-portal-modernizacao\.css/);
});

test('home prioriza serviços e preserva ações existentes de perfil, cartão e senha', () => {
  const view = read('views/meu-portal/index.ejs');
  const servicePos = view.indexOf('class="my-portal-services"');
  const profilePos = view.indexOf('id="perfil"');

  assert.ok(servicePos >= 0 && profilePos >= 0 && servicePos < profilePos, 'serviços devem aparecer antes do bloco de perfil');
  assert.match(view, /href="\/meu-portal\/rh"/);
  assert.match(view, /href="\/meu-portal\/materiais"/);
  assert.match(view, /href="\/meu-portal\/treinamentos"/);
  assert.match(view, /href="\/meu-portal\/servicos"/);
  assert.match(view, /method="POST" action="\/meu-portal\/foto"/);
  assert.match(view, /method="POST" action="\/meu-portal\/cartao\/emitir"/);
  assert.match(view, /method="POST" action="\/meu-portal\/senha"/);
  assert.match(view, /name="current_password"/);
  assert.match(view, /name="new_password"/);
  assert.match(view, /name="confirm_password"/);
});

test('modernização é responsiva e padroniza tabelas sem alterar backend', () => {
  const css = read('public/css/meu-portal-modernizacao.css');

  assert.match(css, /\.my-portal-services/);
  assert.match(css, /grid-template-columns:repeat\(6,minmax\(150px,1fr\)\)/);
  assert.match(css, /\.my-account-panel__layout/);
  assert.match(css, /\.my-password-form--inline/);
  assert.match(css, /\.my-material-table th,\.my-f2b-table th[\s\S]*position:sticky/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.doesNotMatch(css, /display:\s*none[^;]*(?:senha|password|logout)/i);
});

test('controllers continuam identificando páginas pessoais para carregar a camada visual', () => {
  const main = read('modules/meu-portal/meu-portal.controller.js');
  const fase2b = read('modules/meu-portal/meu-portal-fase2b.controller.js');

  assert.match(main, /res\.locals\.activeMenu = 'meu-portal'/);
  assert.match(fase2b, /function treinamentos[\s\S]*res\.locals\.activeMenu = 'meu-portal'/);
  assert.match(fase2b, /function dadosProfissionais[\s\S]*res\.locals\.activeMenu = 'meu-portal'/);
  assert.match(fase2b, /function servicos[\s\S]*res\.locals\.activeMenu = 'meu-portal'/);
});
