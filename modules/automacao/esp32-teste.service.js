'use strict';

// Primeiro piloto: estado volátil de um único ESP32 e somente do LED de teste.
// Não representa leitura PT100, sensor, relé ou estado das válvulas.
const TEMPO_SEM_SINAL_MS = 10000;
let ultimaLeitura = null;

function registrarLeitura(corpo, agora = Date.now()) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)
      || corpo.device_id !== 'digestor-1' || typeof corpo.gpio2 !== 'boolean') {
    throw new TypeError('Formato inválido: esperado device_id=digestor-1 e gpio2 booleano.');
  }
  ultimaLeitura = {
    device_id: 'digestor-1',
    gpio2: corpo.gpio2,
    recebido_em: new Date(agora).toISOString(),
    recebido_ms: agora,
  };
  return { ok: true };
}

function consultarLeitura(agora = Date.now()) {
  const conectado = !!ultimaLeitura
    && agora >= ultimaLeitura.recebido_ms
    && agora - ultimaLeitura.recebido_ms <= TEMPO_SEM_SINAL_MS;
  return {
    device_id: 'digestor-1',
    conectado,
    gpio2: conectado ? ultimaLeitura.gpio2 : null,
    recebido_em: ultimaLeitura?.recebido_em || null,
    modo: 'TESTE_LED',
    temperatura_c: null,
    comandos_habilitados: false,
  };
}

function limparParaTeste() {
  ultimaLeitura = null;
}

module.exports = { registrarLeitura, consultarLeitura, limparParaTeste, TEMPO_SEM_SINAL_MS };
