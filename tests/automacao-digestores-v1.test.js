const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../modules/automacao/automacao.service');
const { ACCESS } = require('../config/rbac');

test('automacao v1 expõe quatro digestores com PT100 e duas descargas', () => {
  const items = service.getDigestoresOverview();
  assert.equal(items.length, 4);
  for (const item of items) {
    assert.equal(item.sensor, 'PT100');
    assert.deepEqual(item.valvulas.map((v) => v.key), ['EIXO', 'CAMISA']);
    assert.equal(item.temperatura_c, null);
    assert.equal(item.temperatura_status, 'SEM_SINAL');
    assert.ok(item.valvulas.every((v) => v.comando_habilitado === false));
  }
});

test('automacao v1 não simula hardware antes da etapa de simulador', () => {
  const state = service.getIntegrationState();
  assert.equal(state.live, false);
  assert.equal(state.simulator, false);
  assert.equal(state.mode, 'AGUARDANDO_HARDWARE');
});

test('automacao restringe visualizacao e gestao aos perfis aprovados', () => {
  assert.deepEqual([...ACCESS.automacao_view].sort(), ['ADMIN', 'DIRETORIA', 'MANUTENCAO_SUPERVISOR'].sort());
  assert.deepEqual([...ACCESS.automacao_manage].sort(), ['ADMIN', 'MANUTENCAO_SUPERVISOR'].sort());
});

test('automacao classifica temperatura do processo para a torre sinalizadora', () => {
  assert.equal(service.classifyTemperature(60).color, 'RED');
  assert.equal(service.classifyTemperature(79.9).key, 'FRIO');
  assert.equal(service.classifyTemperature(80).key, 'FRITANDO');
  assert.equal(service.classifyTemperature(99.9).color, 'YELLOW');
  assert.equal(service.classifyTemperature(100).key, 'COZIMENTO_FINAL');
  assert.equal(service.classifyTemperature(119.9).ready, false);
  assert.equal(service.classifyTemperature(120).color, 'GREEN');
  assert.equal(service.classifyTemperature(120).ready, true);
  for (const value of [null, undefined, '', '  ', 'inválido']) assert.equal(service.classifyTemperature(value).color, 'OFF');
  assert.equal(service.classifyTemperature(0).color, 'RED');
});
