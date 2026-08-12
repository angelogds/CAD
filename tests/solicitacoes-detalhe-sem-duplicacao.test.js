const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSolicitacaoForView } = require('../modules/solicitacoes/solicitacoes.presenter');

test('não replica a descrição da solicitação no bloco de observações', () => {
  const solicitacao = normalizeSolicitacaoForView({
    id: 2,
    descricao: 'Material necessário para corrigir a OS 235.',
  });

  assert.equal(solicitacao.motivo, 'Material necessário para corrigir a OS 235.');
  assert.equal(solicitacao.observacoes, null);
});

test('mantém uma observação de compras que seja diferente do motivo', () => {
  const solicitacao = normalizeSolicitacaoForView({
    id: 2,
    descricao: 'Material necessário para corrigir a OS 235.',
    observacoes_compras: 'Fornecedor confirmou entrega na sexta-feira.',
  });

  assert.equal(solicitacao.motivo, 'Material necessário para corrigir a OS 235.');
  assert.equal(solicitacao.observacoes, 'Fornecedor confirmou entrega na sexta-feira.');
});

test('remove observação explícita quando ela repete o motivo', () => {
  const solicitacao = normalizeSolicitacaoForView({
    id: 2,
    motivo: 'Troca da mangueira.',
    observacoes_compras: 'troca da mangueira.',
  });

  assert.equal(solicitacao.observacoes, null);
});
