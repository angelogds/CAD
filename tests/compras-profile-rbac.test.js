const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { canAccessModule } = require('../config/rbac');

test('perfil de compras tem somente os módulos necessários ao seu fluxo', () => {
  const allowed = ['os_chat_read', 'os_chat_write', 'compras', 'compras_read', 'compras_manage', 'fornecedores', 'estoque_view', 'assistente_manutencao'];
  const denied = ['painel_operacional', 'os_view', 'almoxarifado_read', 'inspecao_view', 'tracagem_view', 'desenho_tecnico_view'];

  allowed.forEach((moduleKey) => assert.equal(canAccessModule('COMPRAS', moduleKey), true, `${moduleKey} deveria ser permitido`));
  denied.forEach((moduleKey) => assert.equal(canAccessModule('COMPRAS', moduleKey), false, `${moduleKey} deveria ser ocultado`));
});

test('menu de compras oculta a lista pessoal e nomeia o assistente virtual', () => {
  const sidebar = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'sidebar.ejs'), 'utf8');
  assert.match(sidebar, /canSolicitacoes && !isCompras/);
  assert.match(sidebar, /Assistente da Manutenção/);
  assert.match(sidebar, /can\('assistente_manutencao'\)/);
});
