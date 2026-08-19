const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const audit = require('../modules/escala/escala.audit');

const index = readFileSync('views/escala/index.ejs', 'utf8');
const banco = readFileSync('views/escala/banco-horas.ejs', 'utf8');
const pendentes = readFileSync('views/escala/hora-extra-pendentes.ejs', 'utf8');
const ausencias = readFileSync('views/escala/ausencias.ejs', 'utf8');
const routes = readFileSync('modules/escala/escala.routes.js', 'utf8');
const service = readFileSync('modules/escala/escala.service.js', 'utf8');
const migration = readFileSync('database/migrations/163_escala_banco_horas_manutencao.sql', 'utf8');

test('helpers de tempo operam em minutos inteiros e suportam virada do dia', () => {
  assert.equal(audit.durationMinutes('17:00', '19:30'), 150);
  assert.equal(audit.durationMinutes('23:00', '02:00'), 180);
  assert.equal(audit.minutesToHuman(90), '1h30');
  assert.equal(audit.minutesToHuman(135), '2h15');
  assert.equal(audit.minutesToHuman(217), '3h37');
  assert.equal(audit.minutesToHuman(11), '0h11');
  assert.equal(audit.minutesToHuman(-80), '-1h20');
});

test('Banco de Horas mantém movimentos inteiros e unicidade de crédito de hora extra', () => {
  assert.match(migration, /minutos INTEGER NOT NULL/);
  assert.match(migration, /uidx_escala_banco_credito_hora_extra/);
  assert.match(migration, /WHERE tipo = 'CREDITO_HORA_EXTRA'/);
  assert.match(service, /function calcularSaldoBancoHoras/);
});

test('exclusão sensível de hora extra exige ADMIN também na rota', () => {
  assert.match(routes, /router\.post\("\/hora-extra\/:id\/excluir", requireLogin, requireAdmin/);
});

test('painel da Escala entrega KPIs filtros cards e tabela', () => {
  assert.match(index, /Funcionários ativos/);
  assert.match(index, /Horas extras \(mês\)/);
  assert.match(index, /Banco de horas \(total\)/);
  assert.match(index, /escala-search/);
  assert.match(index, /data-view-mode="cards"/);
  assert.match(index, /data-view-mode="table"/);
  assert.match(index, /controle operacional interno/i);
});

test('Banco de Horas e filas operacionais usam o design system novo', () => {
  assert.match(banco, /escala-dashboard\.css/);
  assert.match(banco, /Extrato/);
  assert.match(banco, /Créditos de extra no mês/);
  assert.match(pendentes, /Fila de validação/);
  assert.match(pendentes, /Total pendente/);
  assert.match(ausencias, /Indisponibilidades que afetam/);
  assert.match(ausencias, /Atestados/);
  assert.match(ausencias, /Férias/);
});

test('auditoria é somente leitura e procura duplicidades críticas', () => {
  const source = readFileSync('modules/escala/escala.audit.js', 'utf8');
  assert.match(source, /CREDITO_HORA_EXTRA_DUPLICADO/);
  assert.match(source, /DEBITO_FOLGA_DUPLICADO/);
  assert.match(source, /MOVIMENTO_COLABORADOR_ORFAO/);
  assert.match(source, /COLABORADOR_USER_DUPLICADO/);
  assert.doesNotMatch(source, /\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
});
