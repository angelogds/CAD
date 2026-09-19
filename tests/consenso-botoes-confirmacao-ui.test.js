const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

test('rótulos distinguem exclusão de alteração e o observer não repete mutações', () => {
  let textWrites = 0;
  let onMutation;
  function control(text, action = null) {
    return {
      // No navegador, formAction sem atributo pode apontar à página atual.
      formAction: 'https://example.test/solicitacoes/1',
      disabled: false,
      getAttribute: (name) => name === 'formaction' ? action : null,
      get textContent() { return text; },
      set textContent(value) { text = value; textWrites += 1; },
    };
  }
  const change = [control('Recusar', '/solicitacoes/1/itens/2/alteracao/recusar'), control('Aprovar alteração')];
  const exclusion = [control('Manter item', '/solicitacoes/1/itens/3/exclusao/recusar'), control('Confirmar exclusão')];
  const forms = [
    { action: '/solicitacoes/1/itens/2/alteracao/aprovar', querySelectorAll: () => change },
    { action: '/solicitacoes/1/itens/3/exclusao/aprovar', querySelectorAll: () => exclusion },
  ];
  const originalActions = forms.map((form) => form.action);
  const document = {
    readyState: 'complete', body: {},
    querySelector: () => ({}), // Estilo já carregado.
    querySelectorAll: (selector) => selector.includes('.sol-consensus-form') ? forms : [],
  };
  vm.runInNewContext(ui, {
    document,
    MutationObserver: class { constructor(callback) { onMutation = callback; } observe() {} },
  });
  assert.deepEqual(change.map((button) => button.textContent), ['Recusar alteração', 'Confirmar alteração']);
  assert.deepEqual(exclusion.map((button) => button.textContent), ['Manter item', 'Confirmar exclusão']);
  const initialWrites = textWrites;
  onMutation();
  onMutation();
  assert.equal(textWrites, initialWrites, 'reaplicar a melhoria não deve disparar novas mutações de texto');
  assert.deepEqual(forms.map((form) => form.action), originalActions);
  assert.ok([...change, ...exclusion].every((button) => !button.disabled));
});
