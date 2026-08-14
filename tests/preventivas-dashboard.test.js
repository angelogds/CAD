const test = require('node:test');
const assert = require('node:assert/strict');
const { classificarVencimento, formatarResponsaveis } = require('../modules/preventivas/preventivas.service');
const hoje = new Date('2026-08-14T12:00:00');
test('classifica vencimentos usando o dia local e preserva estados operacionais', () => {
  assert.equal(classificarVencimento('2026-08-13', 'PENDENTE', hoje), 'ATRASADA');
  assert.equal(classificarVencimento('2026-08-14', 'PENDENTE', hoje), 'VENCE_HOJE');
  assert.equal(classificarVencimento('2026-08-15', 'PENDENTE', hoje), 'NA_SEMANA');
  assert.equal(classificarVencimento('2026-08-21', 'PENDENTE', hoje), 'NA_SEMANA');
  assert.equal(classificarVencimento('2026-08-22', 'PENDENTE', hoje), 'PROGRAMADA');
  assert.equal(classificarVencimento('2026-08-13', 'CONCLUIDA', hoje), 'CONCLUIDA');
  assert.equal(classificarVencimento('2026-08-13', 'EM_ANDAMENTO', hoje), 'EM_EXECUCAO');
});
test('formata responsáveis sem dados fictícios', () => {
  assert.equal(formatarResponsaveis([]), 'A definir');
  assert.equal(formatarResponsaveis(['Diogo']), 'Diogo');
  assert.equal(formatarResponsaveis(['Diogo', 'Luiz']), 'Diogo e Luiz');
  assert.equal(formatarResponsaveis(['Diogo', 'Luiz', 'Ana']), 'Diogo, Luiz +1');
  assert.equal(formatarResponsaveis([], 'Equipe A'), 'Equipe A');
});
