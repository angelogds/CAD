const test = require('node:test');
const assert = require('node:assert/strict');
const { apresentacao } = require('../public/js/automacao-digestores');
const real = { origem: 'REAL', telemetria_atual: true, medicao_atual: true, sensor_status: 'VALIDO',
  temperatura_c: 121.25, cor_sinaleiro: 'VERMELHO_PISCANDO', faixa_temperatura: 'PRONTO', pronto_descarga: true,
  timestamp_medicao: '2026-10-25T20:00:00Z', ultimo_contato_s: 1, conexao: 'ONLINE' };

test('supervisão real mostra a leitura, cor e pronto informados pelo firmware', () => {
  const p = apresentacao(real);
  assert.match(p.modo, /OPERAÇÃO REAL/);
  assert.equal(p.temperatura, '121,25 °C');
  assert.equal(p.cor, 'Vermelho piscando');
  assert.equal(p.ready, true);
  assert.equal(p.blink, true);
  // A camada de apresentação espelha a decisão do dispositivo; não recalcula a cor.
  assert.equal(apresentacao({ ...real, temperatura_c: 40, cor_sinaleiro: 'AMARELO', pronto_descarga: false }).cor, 'Amarelo fixo');
});

test('telemetria vencida, falha de sensor e simulação não mostram pronto real', () => {
  for (const d of [{ ...real, telemetria_atual: false }, { ...real, medicao_atual: false },
    { ...real, sensor_status: 'FALHA', temperatura_c: null, cor_sinaleiro: 'DESLIGADO' },
    { ...real, origem: 'SIMULACAO' }, {}]) {
    const p = apresentacao(d);
    assert.equal(p.ready, false);
    assert.equal(p.temperatura, '--,- °C');
  }
  assert.equal(apresentacao({ ...real, telemetria_atual: false }).lamp, 'off');
  assert.equal(apresentacao({ ...real, origem: 'SIMULACAO' }).lamp, 'off');
});

test('sincronização transmite temperatura simulada e transições sem comando industrial', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const handlers = {};
  const posts = [];
  const element = () => ({ dataset: {}, checked: false, disabled: false, value: '1', textContent: '',
    addEventListener(event, fn) { handlers[this.id + ':' + event] = fn; }, querySelector() { return null; },
    replaceChildren() {}, setAttribute() {}, appendChild() {} });
  const els = Object.fromEntries(['sim-digestores','sim-remote-enable','sim-remote-status','sim-select-digestor',
    'sim-start','sim-remote-rows','sim-pause','sim-reset'].map(id => [id, { ...element(), id }]));
  const card = { dataset: { temperaturaC: '120', aquecimentoSimulado: 'true', camisaSimulada: 'ABERTO', eixoSimulado: 'FECHADO' }, querySelector() { return { dataset: { stage: 'red' } }; } };
  els['sim-digestores'].querySelector = () => card;
  els['sim-start'].disabled = true;
  els['sim-remote-enable'].dataset.csrf = 'csrf';
  const intervals = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/automacao-simulador-remoto'), 'utf8'), {
    window: { CGDSimHttp: { MSG: {}, async fetchJson(url, options) {
      if (options?.method === 'POST') posts.push(JSON.parse(options.body));
      return { ok: true, digestores: [] };
    } }, addEventListener() {} },
    document: { getElementById: id => els[id] || null, createElement: element },
    confirm: () => true, setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval() {},
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  els['sim-remote-enable'].checked = true;
  handlers['sim-remote-enable:change']();
  await flush();
  assert.deepEqual(posts.at(-1).estados, [{ digestor_id: 1, fase: 'MEIO', temperatura_c: 120, aquecimento_simulado: true, purgadores_simulados: { camisa: 'ABERTO', eixo: 'FECHADO' } }]);
  card.dataset.temperaturaC = '120.1';
  card.dataset.aquecimentoSimulado = 'false';
  card.dataset.camisaSimulada = 'FECHADO';
  handlers['sim-digestores:simulador:estado']();
  await flush();
  assert.deepEqual(posts.at(-1).estados, [{ digestor_id: 1, fase: 'FINAL', temperatura_c: 120.1, aquecimento_simulado: false, purgadores_simulados: { camisa: 'FECHADO', eixo: 'FECHADO' } }]);
  card.dataset.temperaturaC = '50';
  card.dataset.aquecimentoSimulado = 'true';
  card.dataset.eixoSimulado = 'ABERTO';
  handlers['sim-digestores:simulador:estado']();
  await flush();
  assert.deepEqual(posts.at(-1).estados, [{ digestor_id: 1, fase: 'INICIO', temperatura_c: 50, aquecimento_simulado: true, purgadores_simulados: { camisa: 'FECHADO', eixo: 'ABERTO' } }]);
  assert.ok(intervals.some(timer => timer.ms === 1000));
  card.dataset.temperaturaC = '';
  handlers['sim-digestores:simulador:estado']();
  await flush();
  assert.deepEqual(posts.at(-1).estados, [{ digestor_id: 1, fase: 'PARADO', aquecimento_simulado: false, purgadores_simulados: { camisa: 'FECHADO', eixo: 'FECHADO' } }]);
  els['sim-start'].disabled = false;
  handlers['sim-digestores:simulador:estado']();
  await flush();
  assert.deepEqual(posts.at(-1).estados, [{ digestor_id: 1, fase: 'PARADO', aquecimento_simulado: false, purgadores_simulados: { camisa: 'FECHADO', eixo: 'FECHADO' } }]);
});

test('PRONTO expira localmente com relógio avançado mesmo se próxima consulta ficar pendente', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  let now = 0, calls = 0;
  const intervals = [];
  const roles = Object.fromEntries(['modo','temperatura','faixa','cor','pronto','sensor','contato','medicao','conexao']
    .map(role => [role, { dataset: { telemetriaRole: role }, textContent: '' }]));
  const tower = { dataset: {}, setAttribute() {} };
  const card = { dataset: { telemetriaDigestor: '1' }, classList: { toggle() {} },
    querySelectorAll: () => Object.values(roles), querySelector: () => tower };
  const root = { querySelectorAll: () => [card] };
  const status = { textContent: '' };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/automacao-digestores'), 'utf8'), {
    window: { CGDSimHttp: { async fetchJson() {
      calls++;
      if (calls === 1) return { digestores: [{ ...real, digestor_id: 1, ultima_confirmacao_s: 0, medicao_idade_s: 0 }] };
      return new Promise(() => {});
    } }, addEventListener() {} },
    document: { getElementById: id => id === 'digestores-supervisao' ? root : status },
    Date: { now: () => now },
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval() {},
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(roles.pronto.textContent, /^PRONTO PARA DESCARGA/);
  assert.equal(roles.temperatura.textContent, '121,25 °C');
  intervals.find(timer => timer.ms === 2000).fn(); // Esta consulta nunca resolve.
  now = 15000;
  intervals.find(timer => timer.ms === 1000).fn();
  assert.equal(roles.temperatura.textContent, '--,- °C');
  assert.match(roles.pronto.textContent, /não confirmado/);
  assert.equal(tower.className, 'process-tower is-off');
});

test('cliente limita tempo da requisição e da leitura do JSON, inclusive com promises pendentes', async () => {
  const { fetchJson } = require('../public/js/automacao-simulador-http');
  let signal;
  await assert.rejects(fetchJson('/status', { timeoutMs: 10 }, (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }), e => e.kind === 'REDE' && /tempo de resposta excedido/.test(e.message));
  assert.equal(signal.aborted, true);
  await assert.rejects(fetchJson('/status', { timeoutMs: 10 }, async () => ({ ok: true, status: 200,
    headers: { get: () => 'application/json' }, json: () => new Promise(() => {}) })), { kind: 'REDE' });
});

test('latência de resposta entra na validade local e não renova leitura antiga', () => {
  const { expirar } = require('../public/js/automacao-digestores');
  const packet = { ...real, medicao_idade_s: 14, ultima_confirmacao_s: 0 };
  assert.equal(apresentacao(expirar([packet], 0)[0]).ready, true);
  const delayed = expirar([packet], 4)[0];
  assert.equal(apresentacao(delayed).ready, false);
  assert.equal(delayed.faixa_temperatura, null);
  assert.equal(delayed.cor_sinaleiro, null);
});

test('temperatura SIM atual é exibida como sensor simulado sem exigir PT100 real', () => {
  const p = apresentacao({ ...real, origem: 'SIMULACAO', sensor_tipo: 'SIMULADO', sensor_status: 'SIMULADO', medicao_atual: false, simulacao_atual: true, fonte_simulacao: 'CAD' });
  assert.equal(p.temperatura, '121,25 °C');
  assert.equal(p.sensor, 'Sensor simulado · gerado pelo CAD');
  assert.match(p.modo, /^SIMULAÇÃO/);
  assert.match(p.pronto, /SIMULAÇÃO/);
  assert.equal(p.lamp, 'red');
  assert.equal(p.blink, true);
  assert.equal(p.ready, true);
});

test('SIM sem pacote e SIM expirada aguardam CAD, sem apresentar falha de PT100', () => {
  for (const d of [
    { origem: 'SIMULACAO', sensor_status: 'SEM_SINAL', telemetria_atual: true },
    { ...real, origem: 'SIMULACAO', sensor_status: 'SIMULADO', telemetria_atual: false },
  ]) {
    const p = apresentacao(d);
    assert.equal(p.temperatura, '--,- °C');
    assert.match(p.sensor, /Aguardando temperatura simulada do CAD/);
    assert.doesNotMatch(p.sensor, /PT100|FALHA|SEM_SENSOR/);
    assert.equal(p.lamp, 'off');
    assert.equal(p.ready, false);
  }
  const fault = apresentacao({ ...real, sensor_status: 'FALHA', temperatura_c: null, cor_sinaleiro: 'DESLIGADO', faixa_temperatura: 'SENSOR_INDISPONIVEL' });
  assert.equal(fault.sensor, 'FALHA');
  assert.equal(fault.faixa, 'Sensor indisponível');
  assert.equal(fault.ready, false);
});

test('SIM gerada localmente é identificada sem ser atribuída ao computador', () => {
  const p = apresentacao({ ...real, origem: 'SIMULACAO', sensor_status: 'SIMULADO', simulacao_atual: true, fonte_simulacao: 'LOCAL' });
  assert.equal(p.sensor, 'Sensor simulado · gerado no ESP32');
  assert.doesNotMatch(p.sensor, /CAD|PT100/);
});

test('prazo CAD de 6,5 s limita temperatura e estados simulados, LOCAL continua independente', () => {
  const { expirar } = require('../public/js/automacao-digestores');
  const sim = { ...real, origem: 'SIMULACAO', sensor_status: 'SIMULADO', simulacao_atual: true, fonte_simulacao: 'CAD', validade_ms: 6500,
    ultima_confirmacao_s: 0, medicao_idade_s: 0, estado_simulacao_disponivel: true,
    aquecimento_simulado: true, purgadores_simulados: { camisa: 'ABERTO', eixo: 'FECHADO' } };
  const current = apresentacao(expirar([sim], 6)[0]);
  assert.equal(current.ready, true);
  assert.equal(current.aquecimento, 'LIGADO · SIM.');
  assert.match(current.purgadores, /Camisa: ABERTO/);
  const stopped = expirar([sim], 6.5)[0];
  assert.equal(apresentacao(stopped).ready, false);
  assert.equal(apresentacao(stopped).temperatura, '--,- °C');
  assert.equal(stopped.aquecimento_simulado, false);
  assert.deepEqual(stopped.purgadores_simulados, { camisa: 'FECHADO', eixo: 'FECHADO' });
  assert.equal(apresentacao(expirar([{ ...sim, fonte_simulacao: 'LOCAL', validade_ms: 0 }], 7)[0]).ready, true);
});
