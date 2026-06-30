const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const service = readFileSync('modules/escala/escala.service.js', 'utf8');
const controller = readFileSync('modules/escala/escala.controller.js', 'utf8');
const migration = readFileSync('database/migrations/164_horas_extras_multi_colaborador_por_os.js', 'utf8');
const horaExtraView = readFileSync('views/escala/hora-extra-nova.ejs', 'utf8');
const osView = readFileSync('views/os/show.ejs', 'utf8');

test('bloqueio de hora extra ativa é por colaborador, não por OS', () => {
  assert.match(service, /SELECT \* FROM escala_horas_extras WHERE colaborador_id=\? AND status='EM_ANDAMENTO' LIMIT 1/);
  assert.doesNotMatch(service, /WHERE\s+os_id=\?\s+AND\s+status='EM_ANDAMENTO'[^;]*throw/s);
  assert.match(service, /Você já possui uma hora extra em andamento/);
});

test('lançamento aceita OS opcional desde que exista descrição', () => {
  assert.match(service, /const osId = Number\(dados\.os_id \|\| 0\) \|\| null/);
  assert.match(service, /if \(!osId && !descricao\) throw new Error\('Informe uma OS ou descreva o serviço realizado\.'\)/);
  assert.doesNotMatch(service, /Sem OS vinculada, informe uma descrição do serviço com pelo menos 10 caracteres/);
});

test('migration remove índice único exclusivo por OS e mantém unicidade por colaborador ativo', () => {
  assert.match(migration, /DROP INDEX IF EXISTS/);
  assert.match(migration, /os_id', 'ordem_servico_id'/);
  assert.match(migration, /ON escala_horas_extras\(colaborador_id\)\s+WHERE status = 'EM_ANDAMENTO'/);
});

test('telas exibem contador individual e totais separados por colaborador na OS', () => {
  assert.match(controller, /listarHorasExtrasEmAndamentoPorOs\(osSelecionadaId\)/);
  assert.match(horaExtraView, /js-extra-clock/);
  assert.match(horaExtraView, /não bloqueia outros mecânicos/);
  assert.match(osView, /Total geral da OS/);
  assert.match(osView, /Total por colaborador/);
});
