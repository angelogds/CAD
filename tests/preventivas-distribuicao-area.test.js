const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../modules/preventivas/preventivas.service');

function criarPessoa({ id, user_id, nome, funcao = 'mecanico', tipo_turno = 'diurno' }) {
  return { id, user_id, nome, funcao, tipo_turno };
}

test('distribuição mantém a mesma área com o mesmo primário e reparte áreas entre equipe do dia', () => {
  const equipeDia = {
    mecanicos: [
      criarPessoa({ id: 1, user_id: 101, nome: 'Rodolfo' }),
      criarPessoa({ id: 2, user_id: 102, nome: 'Salviano' }),
    ],
    apoios: [
      criarPessoa({ id: 3, user_id: 103, nome: 'Emanuel', funcao: 'apoio', tipo_turno: 'apoio' }),
      criarPessoa({ id: 4, user_id: 104, nome: 'Júnior', funcao: 'auxiliar', tipo_turno: 'apoio' }),
      criarPessoa({ id: 5, user_id: 105, nome: 'Luis', funcao: 'apoio', tipo_turno: 'apoio' }),
    ],
    cargaAtual: {},
  };

  const preventivas = [
    { id: 11, data_prevista: '2026-04-01', criticidade: 'BAIXA', equipamento_setor: 'Área Suja', equipamento_nome: 'Bomba 01' },
    { id: 12, data_prevista: '2026-04-01', criticidade: 'BAIXA', equipamento_setor: 'Área Suja', equipamento_nome: 'Bomba 02' },
    { id: 13, data_prevista: '2026-04-01', criticidade: 'BAIXA', equipamento_setor: 'Casa das Caldeiras', equipamento_nome: 'Bomba 03' },
    { id: 14, data_prevista: '2026-04-01', criticidade: 'BAIXA', equipamento_setor: 'Casa das Caldeiras', equipamento_nome: 'Bomba 04' },
  ];

  const distribuicao = service.distribuirPreventivasPorAreaECarga(preventivas, equipeDia);

  const areaSujaA = distribuicao.get(11) || [];
  const areaSujaB = distribuicao.get(12) || [];
  const caldeiraA = distribuicao.get(13) || [];
  const caldeiraB = distribuicao.get(14) || [];

  assert.equal(areaSujaA.length, 1);
  assert.equal(areaSujaB.length, 1);
  assert.equal(caldeiraA.length, 1);
  assert.equal(caldeiraB.length, 1);

  assert.equal(areaSujaA[0].user_id, areaSujaB[0].user_id);
  assert.equal(caldeiraA[0].user_id, caldeiraB[0].user_id);
  assert.notEqual(areaSujaA[0].user_id, caldeiraA[0].user_id);
});
