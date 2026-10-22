const test = require('node:test');
const assert = require('node:assert/strict');
const esp32 = require('../modules/automacao/esp32-teste.service');
const ctrl = require('../modules/automacao/automacao.controller');

function respostaMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; return this; },
  };
}
function reqMock(token, body) {
  return { body, get: (name) => name === 'authorization' ? token : '' };
}
const TOKEN = 'teste-piloto-token-de-32-caracteres-minimo-123456789';

test('piloto nasce desconectado e sem leitura PT100 ou comandos', () => {
  esp32.limparParaTeste();
  assert.deepEqual(esp32.consultarLeitura(), {
    device_id: 'digestor-1', conectado: false, gpio2: null, recebido_em: null,
    modo: 'TESTE_LED', temperatura_c: null, comandos_habilitados: false,
  });
});

test('aceita somente Digestor 1 e estado booleano do GPIO2', () => {
  esp32.limparParaTeste();
  for (const body of [null, {}, { device_id: 'digestor-2', gpio2: true },
    { device_id: 'digestor-1', gpio2: 'HIGH' }, { device_id: 'digestor-1', gpio2: 1 }]) {
    assert.throws(() => esp32.registrarLeitura(body));
  }
  esp32.registrarLeitura({ device_id: 'digestor-1', gpio2: true }, 1000);
  assert.equal(esp32.consultarLeitura(10999).conectado, true);
  assert.equal(esp32.consultarLeitura(11001).conectado, false);
  assert.equal(esp32.consultarLeitura(11001).gpio2, null);
});

test('endpoint exige token de ambiente forte, sem aceitar token arbitrário', () => {
  esp32.limparParaTeste();
  const antigo = process.env.IHM_ESP32_D1_TOKEN;
  try {
    delete process.env.IHM_ESP32_D1_TOKEN;
    let r = respostaMock();
    ctrl.receberEsp32(reqMock('Bearer ' + TOKEN, { device_id:'digestor-1',gpio2:true }), r);
    assert.equal(r.statusCode, 503);

    process.env.IHM_ESP32_D1_TOKEN = TOKEN;
    r = respostaMock();
    ctrl.receberEsp32(reqMock('Bearer inválido', { device_id:'digestor-1',gpio2:true }), r);
    assert.equal(r.statusCode, 401);
    assert.equal(esp32.consultarLeitura().conectado, false);

    r = respostaMock();
    ctrl.receberEsp32(reqMock('Bearer ' + TOKEN, { device_id:'digestor-1',gpio2:true }), r);
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.ok, true);

    r = respostaMock();
    ctrl.consultarEsp32({}, r);
    assert.equal(r.body.conectado, true);
    assert.equal(r.body.gpio2, true);
    assert.equal(r.body.temperatura_c, null);
    assert.equal(r.body.comandos_habilitados, false);
  } finally {
    if (antigo === undefined) delete process.env.IHM_ESP32_D1_TOKEN;
    else process.env.IHM_ESP32_D1_TOKEN = antigo;
    esp32.limparParaTeste();
  }
});
