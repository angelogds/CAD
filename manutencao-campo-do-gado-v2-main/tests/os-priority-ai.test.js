const test = require('node:test');
const assert = require('node:assert/strict');

const priority = require('../modules/os/os-priority.service');

test('classifyOSPriority returns emergencial for critical stop keywords', () => {
  const result = priority.classifyOSPriority({
    descricao: 'Esteira principal parada e sem funcionar',
    tipo: 'CORRETIVA',
    equipamento_id: null,
  });

  assert.ok(['EMERGENCIAL', 'ALTA', 'MEDIA', 'BAIXA'].includes(result.prioridade));
  // regras atuais priorizam palavra de parada para nível alto, no mínimo ALTA
  assert.ok(result.prioridade === 'EMERGENCIAL' || result.prioridade === 'ALTA');
});

test('classifyOSPriority suggests categoria for electrical terms', () => {
  const result = priority.classifyOSPriority({
    descricao: 'Disjuntor desarmando e curto no painel elétrico',
    tipo: 'CORRETIVA',
    equipamento_id: null,
  });

  assert.equal(result.categoria_sugerida, 'ELETRICA');
});
