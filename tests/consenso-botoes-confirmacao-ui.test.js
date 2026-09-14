const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const layout = fs.readFileSync(path.join(root, 'views/layout.ejs'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public/js/consenso-botoes-confirmacao.js'), 'utf8');
const comprasUi = fs.readFileSync(path.join(root, 'public/js/compras-consenso-bilateral.js'), 'utf8');
const solicitacoesView = fs.readFileSync(path.join(root, 'views/solicitacoes/show.ejs'), 'utf8');
const bilateral = fs.readFileSync(path.join(root, 'modules/solicitacoes/solicitacoes.itens-bilateral.service.js'), 'utf8');

test('layout carrega melhoria visual do consenso para os dois lados autenticados', () => {
  assert.match(layout, /consenso-botoes-confirmacao\.js/);
});

test('ações de consenso ficam explicitamente visíveis e nomeadas', () => {
  assert.match(ui, /Confirmar alteração/);
  assert.match(ui, /Recusar alteração/);
  assert.match(ui, /consensus-decision-buttons/);
  assert.match(ui, /disabled = true/);
});

test('usuário elegível continua recebendo formulário ativo de decisão', () => {
  assert.match(comprasUi, /pending\.pode_responder/);
  assert.match(comprasUi, /\/alteracao\/aprovar/);
  assert.match(comprasUi, /\/alteracao\/recusar/);
  assert.match(solicitacoesView, /\/alteracao\/aprovar/);
  assert.match(solicitacoesView, /\/alteracao\/recusar/);
});

test('autoaprovação permanece bloqueada no backend', () => {
  assert.match(bilateral, /Quem solicitou a alteração não pode aprovar a própria solicitação/);
  assert.match(bilateral, /Esta decisão precisa ser confirmada pelo setor de Compras/);
  assert.match(bilateral, /Esta decisão precisa ser confirmada pelo solicitante original/);
});
