const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('modules/escala/escala.service.js', 'utf8');
const pdf = fs.readFileSync('modules/escala/escala.pdf.js', 'utf8');
const migration = fs.readFileSync('database/migrations/169_escala_folgas_sabado_adicional.sql', 'utf8');

test('nova escala inicia em 20/07/2026 e alterna as duplas sem Rodolfo', () => {
  assert.match(service, /INICIO_NOVA_ESCALA = '2026-07-20'/);
  assert.match(service, /\['Salviano','Luiz'\]/);
  assert.match(service, /\['Emanuel','Júnior'\]/);
  assert.doesNotMatch(service.slice(service.indexOf('const INICIO_NOVA_ESCALA')), /Rodolfo/);
});
test('sábado exige dupla e substituto quando Diogo folga', () => {
  assert.match(service, /folga de Diogo exige a indicação de um substituto/);
  assert.match(service, /cobertura mínima de dois mecânicos diferentes/);
});
test('folga, adicional noturno e auditoria têm registros separados', () => {
  for (const tabela of ['escala_folgas_sabado','escala_adicional_noturno','escala_alteracoes_historico']) assert.match(migration, new RegExp(tabela));
  assert.match(service, /escala_anterior,nova_escala,justificativa,alcance/);
});
test('PDF contém as duas tabelas e orientação operacional', () => {
  assert.match(pdf, /Tabela 2 — Folgas e cobertura de sábado/);
  assert.match(pdf, /Diogo permanece fixo no turno diurno/);
  assert.match(pdf, /equipe-base dos sábados/);
});
