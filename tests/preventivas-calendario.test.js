const test = require('node:test');
const assert = require('node:assert/strict');
const { janelaLancamento, janelaDiaria, proximoDiaUtil, isFeriadoNacional, normalizarRegra, lerRegra, validarLancamento } = require('../modules/preventivas/preventivas.calendario');
const janela = (iso) => janelaLancamento(new Date(iso));

test('lançamento respeita 5h da Bahia, mesmo com processo em UTC', () => {
  assert.equal(janela('2026-10-19T00:00:00-03:00').permitido, false);
  assert.equal(janela('2026-10-19T07:59:59Z').permitido, false);
  assert.equal(janela('2026-10-19T08:00:00Z').permitido, true);
  assert.equal(janela('2026-10-19T02:59:59Z').dataHoje, '2026-10-18');
  assert.equal(janela('2026-10-19T02:59:59Z').permitido, false);
});

test('12 de outubro adia para terça 13 às 5h e preserva referência da semana', () => {
  assert.equal(janela('2026-10-12T05:00:00-03:00').permitido, false);
  assert.equal(janela('2026-10-12T23:59:59-03:00').permitido, false);
  assert.equal(janela('2026-10-13T04:59:59-03:00').permitido, false);
  const result = janela('2026-10-13T05:00:00-03:00');
  assert.equal(result.permitido, true);
  assert.equal(result.dataSegunda, '2026-10-12');
  assert.equal(result.dataLancamento, '2026-10-13');
});

test('todos os feriados nacionais de segunda de 2026 adiam lançamento', () => {
  for (const [segunda, terca] of [['2026-09-07', '2026-09-08'], ['2026-10-12', '2026-10-13'], ['2026-11-02', '2026-11-03']]) {
    assert.equal(proximoDiaUtil(segunda), terca);
    assert.equal(janela(`${segunda}T05:00:00-03:00`).permitido, false);
    assert.equal(janela(`${terca}T05:00:00-03:00`).dataSegunda, segunda);
  }
});

test('calendário recorrente contempla outro ano e Sexta-feira Santa, sem pontos facultativos', () => {
  assert.equal(proximoDiaUtil('2027-11-15'), '2027-11-16');
  assert.equal(isFeriadoNacional('2026-04-03'), true);
  assert.equal(isFeriadoNacional('2027-03-26'), true);
  assert.equal(isFeriadoNacional('2026-02-16'), false);
  assert.equal(proximoDiaUtil('2026-04-03'), '2026-04-06');
});

test('reinício após horário recupera a mesma semana, sem executar no fim de semana', () => {
  assert.equal(janela('2026-10-14T06:00:00-03:00').dataSegunda, '2026-10-12');
  assert.equal(janela('2026-10-14T06:00:00-03:00').permitido, true);
  assert.equal(janela('2026-10-17T08:00:00-03:00').permitido, false);
  assert.equal(janela('2026-10-18T08:00:00-03:00').permitido, false);
  assert.equal(janela('2026-10-19T05:00:00-03:00').dataSegunda, '2026-10-19');
});

test('horário editado no PCM aplica minutos e feriados consecutivos', () => {
  const regra = normalizarRegra({ horario: '06:30', feriadosLocais: '2026-10-13\n2026-10-13' });
  assert.deepEqual(regra.feriadosLocais, ['2026-10-13']);
  assert.equal(proximoDiaUtil('2026-10-12', regra), '2026-10-14');
  assert.equal(janelaLancamento(new Date('2026-10-14T06:29:59-03:00'), regra).permitido, false);
  assert.equal(janelaLancamento(new Date('2026-10-14T06:30:00-03:00'), regra).permitido, true);
  assert.equal(janelaDiaria(new Date('2026-10-13T10:00:00-03:00'), regra).permitido, false);
});

test('edição valida dados e permite desativar explicitamente o adiamento', () => {
  assert.throws(() => normalizarRegra({ horario: '25:00' }));
  assert.throws(() => normalizarRegra({ feriadosLocais: '2026-02-30' }));
  assert.throws(() => normalizarRegra({ feriadosLocais: '13/10/2026' }));
  const regra = { adiarFeriados: false };
  assert.equal(janelaLancamento(new Date('2026-10-12T05:00:00-03:00'), regra).permitido, true);
});

test('configuração persistida é relida e lançamentos fora da regra são bloqueados', () => {
  let valor = JSON.stringify({ horario: '05:30', adiarFeriados: true, feriadosLocais: [] });
  const db = { prepare: () => ({ get: () => ({ valor }) }) };
  assert.equal(lerRegra(db).horario, '05:30');
  assert.throws(() => validarLancamento(db, new Date('2026-10-19T05:29:00-03:00')));
  assert.doesNotThrow(() => validarLancamento(db, new Date('2026-10-19T05:30:00-03:00')));
  valor = '{invalid';
  assert.equal(lerRegra(db).horario, '05:00');
});
