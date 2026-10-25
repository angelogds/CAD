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

test('automacao classifica temperatura nas faixas locais do ESP32', () => {
  for (const [value, color, ready, blink] of [
    [0, 'GREEN', false, false], [50, 'GREEN', false, false], [50.1, 'YELLOW', false, false],
    [99.9, 'YELLOW', false, false], [100, 'RED', false, false], [120, 'RED', false, false],
    [120.1, 'RED', true, true],
  ]) {
    const result = service.classifyTemperature(value);
    assert.equal(result.color, color, String(value));
    assert.equal(result.ready, ready);
    assert.equal(result.blink, blink);
  }
  for (const value of [null, undefined, '', '  ', 'inválido', false, -1, Infinity]) assert.equal(service.classifyTemperature(value).color, 'OFF');
});
