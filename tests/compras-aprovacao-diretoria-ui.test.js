const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const show = fs.readFileSync(path.join(root, 'views/compras/solicitacoes/show.ejs'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'modules/compras/compras.routes.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'modules/compras/compras.aprovacao.controller.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'modules/compras/compras.aprovacao.service.js'), 'utf8');

test('tela de compras exibe fluxo de aprovação e seleção de diretor', () => {
  assert.match(show, /Aprovação da Diretoria/);
  assert.match(show, /name="diretor_user_id"/);
  assert.match(show, /Enviar cotação para aprovação/);
  assert.match(show, /diretores\.forEach/);
});

test('tela oferece aprovação manual auditada com evidência', () => {
  assert.match(show, /APROVACAO_DIRETORIA/);
  assert.match(show, /name="evidencia_anexo_id"/);
  assert.match(show, /Registrar visto manual/);
});

test('rotas de aprovação e trava da compra continuam ativas', () => {
  assert.match(routes, /\/aprovacao\/enviar/);
  assert.match(routes, /\/aprovacao\/manual/);
  assert.match(routes, /requireApprovedPurchaseIntent/);
  assert.match(controller, /requestApproval/);
  assert.match(controller, /registerManual/);
  assert.match(service, /assertPayloadMatchesApprovedQuote/);
});
