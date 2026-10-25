const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../firmware/esp32-sinaleiros/local_ui.h'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const settle = () => new Promise(setImmediate);
const channel = (canal, extra = {}) => ({ canal, fechado_min: canal === 1 ? 5 : 10, aberto_s: 60,
  ativo: false, aberto: false, comando_aberto: false, modo: 'PARADO', armado: false, armado_teste_cad: false, saida_fisica_habilitada: true,
  pino_reservado: canal === 1 ? 25 : 26, restante_ms: 0, ...extra });
const payload = (extra = {}) => ({ digestor: 1, modo: 'parado', origem: 'SIMULACAO', temperatura_c: null,
  faixa_temperatura: 'SENSOR_INDISPONIVEL', cor_sinaleiro: 'DESLIGADO', pronto_descarga: false,
  sensor_status: 'SEM_SENSOR', pt100_habilitado: false, vermelho: false, amarelo: false, verde: false,
  saidas_habilitadas: true, purgadores: [channel(1), channel(2)], ...extra });
const remoteSimulation = (extra = {}) => payload({ modo: 'simulacao', origem: 'SIMULACAO',
  sensor_status: 'SIMULADO', simulacao_cad_atual: true, estado_simulacao_disponivel: true, temperatura_c: 121.5,
  faixa_temperatura: 'PRONTO', cor_sinaleiro: 'VERMELHO_PISCANDO', pronto_descarga: true,
  vermelho: true, aquecimento_simulado: true,
  purgadores_simulados: { camisa: 'ABERTO', eixo: 'FECHADO' }, ...extra });

function makeElement() {
  const element = { textContent: '', className: '', dataset: {}, value: '', disabled: false, listeners: {},
    append() {}, appendChild() {}, replaceChildren() {}, focus() {},
    setAttribute(key, value) { this[key] = value; },
    addEventListener(key, fn) { this.listeners[key] = fn; } };
  element.classList = {
    contains: value => element.className.split(' ').includes(value),
    add: value => { if (!element.classList.contains(value)) element.className += ' ' + value; },
    remove: value => { element.className = element.className.split(' ').filter(item => item !== value).join(' '); },
    toggle(value, enabled) {
      if (enabled === undefined) enabled = !element.classList.contains(value);
      enabled ? this.add(value) : this.remove(value);
    },
  };
  return element;
}

function createUi(initial = payload()) {
  const ids = new Map(), elements = [], requests = [], timers = new Map();
  let data = initial, timerId = 0;
  for (const match of html.matchAll(/<(?:button|input|span|div|article|p|b|dd)[^>]*>/g)) {
    const element = makeElement();
    for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) {
      const [, key, value] = attr;
      if (key === 'id') { element.id = value; ids.set(value, element); }
      else if (key === 'class') element.className = value;
      else if (key === 'value') element.value = value;
      else if (key.startsWith('data-')) element.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
    element.textContent = html.slice(match.index + match[0].length).split('<')[0];
    elements.push(element);
  }
  const query = selector => elements.filter(element => selector.split(',').some(part => {
    const match = part.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/);
    if (!match) return false;
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return key in element.dataset && (match[2] === undefined || element.dataset[key] === match[2]);
  }));
  const cad = { device_id: 'ESP32-DIGESTOR-01', status: 0, credencial_configurada: false, http: 0 };
  let fetchImpl = async url => ({ ok: true, status: 200, text: async () => JSON.stringify(url === '/api/cad/status' ? cad : data) });
  const document = { getElementById: id => { assert.ok(ids.has(id), id); return ids.get(id); },
    querySelectorAll: query, querySelector: selector => query(selector)[0], createElement: makeElement,
    addEventListener() {} };
  vm.runInNewContext(script, { document, AbortController, URLSearchParams, Date, Number, Math, Error, Map,
    confirm: () => true, fetch: (url, options) => { requests.push({ url, options }); return fetchImpl(url, options); },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), setInterval() {} });
  return { ids, query, requests, timers, setData: value => { data = value; }, setFetch: fn => { fetchImpl = fn; },
    refresh: async () => { ids.get('refresh').listeners.click(); await settle(); },
    click: async selector => { await query(selector)[0].listeners.click(); await settle(); } };
}

test('HMI mostra telemetria só no digestor vinculado e remove pronto real em falha ou leitura inválida', async () => {
  const valid = payload({ modo: 'real', origem: 'REAL', temperatura_c: 121.5, faixa_temperatura: 'PRONTO',
    cor_sinaleiro: 'VERMELHO_PISCANDO', pronto_descarga: true, sensor_status: 'VALIDO', pt100_habilitado: true, vermelho: true });
  const ui = createUi(valid); await settle();
  assert.equal(ui.ids.get('d1temp').textContent, '121,5');
  assert.equal(ui.ids.get('d1ready').textContent, 'Pronto para descarga');
  assert.ok(ui.ids.get('card1').classList.contains('linked'));
  for (const id of [2, 3, 4]) {
    assert.ok(ui.ids.get('card' + id).classList.contains('unlinked'));
    assert.equal(ui.ids.get('d' + id + 'temp').textContent, '—');
  }
  for (const change of [{ sensor_status: 'FALHA' }, { temperatura_c: null }]) {
    ui.setData({ ...valid, ...change }); await ui.refresh();
    assert.equal(ui.ids.get('d1temp').textContent, '—');
    assert.equal(ui.ids.get('d1ready').textContent, 'Pronto: não');
    assert.equal(ui.ids.get('d1signal').textContent, 'Desligado');
    assert.equal(ui.ids.get('d1range').textContent, 'Sensor indisponível');
    assert.equal(ui.ids.get('d1red').classList.contains('active'), false);
  }
});

test('HMI separa armar e iniciar purgadores; PARADO permite ciclo local, REAL exige PT100 válido', async () => {
  const ui = createUi(); await settle();
  const button = key => ui.query('[data-purge-' + key + '="1"]')[0];
  assert.equal(button('arm').disabled, false);
  assert.equal(button('real').disabled, true);
  const armed = payload({ purgadores: [channel(1, { armado: true, modo: 'REAL' }), channel(2)] });
  ui.setData(armed); await ui.refresh();
  assert.equal(button('arm').disabled, true);
  assert.equal(button('real').disabled, false);
  assert.equal(button('start').disabled, true);
  ui.setData({ ...armed, modo: 'real', origem: 'REAL', temperatura_c: 95, sensor_status: 'VALIDO' }); await ui.refresh();
  assert.equal(button('real').disabled, false);
  ui.setData({ ...armed, modo: 'real', origem: 'REAL', temperatura_c: null, sensor_status: 'FALHA' }); await ui.refresh();
  assert.equal(button('real').disabled, true);
  ui.setData(payload({ modo: 'automatico' })); await ui.refresh();
  assert.equal(button('arm').disabled, true);
  assert.equal(button('real').disabled, true);
  assert.equal(button('start').disabled, false);
});

test('HMI não inventa temperatura na simulação nem mantém pronto após perda de contato', async () => {
  const ui = createUi(payload({ modo: 'teste', faixa_temperatura: 'PRONTO', cor_sinaleiro: 'VERMELHO_PISCANDO', pronto_descarga: true }));
  await settle();
  assert.equal(ui.ids.get('d1temp').textContent, '—');
  assert.equal(ui.ids.get('d1ready').textContent, 'Pronto: não');
  ui.setFetch(async () => { throw new Error('Sem rede'); }); await ui.refresh();
  assert.equal(ui.ids.get('d1ready').textContent, 'Pronto não confirmado');
  assert.equal(ui.ids.get('d1signal').textContent, 'Sem leitura');
  assert.equal(ui.ids.get('connectionText').textContent, 'Sem comunicação local');
  assert.equal(ui.query('[data-purge-real="1"]')[0].disabled, true);
});

test('HMI envia ações distintas de teste, armar e iniciar com proteção contra POST externo', async () => {
  const ui = createUi(); await settle();
  for (const [selector, endpoint, expected] of [
    ['[data-test="alto"]', '/api/simular', { valor: 'alto' }],
    ['[data-purge-arm="1"]', '/api/purgadores', { canal: '1', valor: 'armar_real' }],
    ['[data-purge-real="1"]', '/api/purgadores', { canal: '1', valor: 'iniciar_real' }],
    ['[data-purge-start="2"]', '/api/purgadores', { canal: '2', valor: 'iniciar' }],
    ['[data-purge-stop="2"]', '/api/purgadores', { canal: '2', valor: 'parar' }],
    ['[data-mode="parado"]', '/api/modo', { valor: 'parado' }],
  ]) {
    const count = ui.requests.length; await ui.click(selector);
    const request = ui.requests.slice(count).find(item => item.url === endpoint && item.options.method === 'POST');
    assert.ok(request);
    assert.equal(request.options.headers['X-CGD-Local'], 'true');
    assert.deepEqual(Object.fromEntries(request.options.body), expected);
  }
});

test('HMI mantém timeout ativo até receber corpo completo e limpa estado quando o corpo trava', async () => {
  const ui = createUi(); await settle();
  ui.setFetch(async (_url, options) => ({ ok: true, status: 200,
    text: () => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout')))) }));
  ui.ids.get('refresh').listeners.click(); await settle();
  const pending = [...ui.timers.values()];
  assert.ok(pending.some(timer => timer.delay === 1800), 'timeout da leitura permanece ativo durante response.text()');
  pending.forEach(timer => timer.fn()); await settle();
  assert.equal(ui.ids.get('connectionText').textContent, 'Sem comunicação local');
  assert.equal(ui.ids.get('d1ready').textContent, 'Pronto não confirmado');
});

test('HMI identifica temperatura e aquecimento simulados do PC e separa válvula virtual do relé comandado', async () => {
  const ui = createUi(remoteSimulation()); await settle();
  assert.equal(ui.ids.get('d1temp').textContent, '121,5');
  assert.match(ui.ids.get('d1sensor').textContent, /simulad/i);
  assert.equal(ui.ids.get('d1ready').textContent, 'Pronto · simulado');
  assert.equal(ui.ids.get('pcSimStatus').textContent, 'SIMULAÇÃO PC ATUAL');
  assert.equal(ui.ids.get('pcHeating').textContent, 'Aquecimento virtual: ligado · simulado');
  assert.equal(ui.ids.get('p1virtual').textContent, 'Aberto · simulado');
  assert.equal(ui.ids.get('p2virtual').textContent, 'Fechado · simulado');
  assert.equal(ui.ids.get('p1relay').textContent, 'Fechar · comandado');
  assert.equal(ui.query('[data-purge-cad="1"]')[0].disabled, false, 'referência PC não arma a saída local');
  ui.setData(remoteSimulation({ purgadores: [channel(1, { modo: 'TESTE_CAD', armado_teste_cad: true,
    ativo: true, aberto: true, comando_aberto: true }), channel(2)] }));
  await ui.refresh();
  assert.equal(ui.ids.get('p1relay').textContent, 'Abrir · comandado');
  assert.equal(ui.query('[data-purge-cad="1"]')[0].disabled, true);
  assert.equal(ui.query('[data-purge-cad="2"]')[0].disabled, false, 'arme de um canal não arma o outro');
});

test('HMI preserva temperatura simulada atual sem aceitar estados virtuais de pacote incompleto', async () => {
  const ui = createUi(remoteSimulation({ estado_simulacao_disponivel: false })); await settle();
  assert.equal(ui.ids.get('d1temp').textContent, '121,5');
  assert.match(ui.ids.get('d1sensor').textContent, /simulad/i);
  assert.equal(ui.ids.get('pcSimStatus').textContent, 'SIMULAÇÃO PC ATUAL');
  assert.equal(ui.ids.get('pcHeating').textContent, 'Aquecimento virtual: não confirmado');
  for (const ch of [1, 2]) {
    assert.equal(ui.ids.get('p' + ch + 'virtual').textContent, 'Não informado');
    assert.equal(ui.query('[data-purge-cad="' + ch + '"]')[0].disabled, true);
  }
});

test('HMI distingue simulação aguardando ou expirada de leitura PT100 e esconde dados antigos', async () => {
  const ui = createUi(remoteSimulation()); await settle();
  for (const [status, label] of [['AGUARDANDO_SIMULACAO', 'AGUARDANDO SIMULAÇÃO'], ['SIMULACAO_EXPIRADA', 'SIMULAÇÃO EXPIRADA']]) {
    ui.setData(remoteSimulation({ sensor_status: status, simulacao_cad_atual: false })); await ui.refresh();
    assert.equal(ui.ids.get('pcSimStatus').textContent, label);
    assert.equal(ui.ids.get('d1temp').textContent, '—');
    assert.equal(ui.ids.get('d1ready').textContent, 'Pronto: não confirmado');
    assert.equal(ui.ids.get('d1signal').textContent, 'Desligado');
    assert.equal(ui.ids.get('d1red').classList.contains('active'), false);
    assert.equal(ui.query('[data-purge-cad="1"]')[0].disabled, true);
    assert.doesNotMatch(ui.ids.get('p1virtual').textContent, /Aberto/);
    assert.doesNotMatch(ui.ids.get('pcHeating').textContent, /^Aquecimento virtual: ligado/);
  }
});

test('HMI só permite armar teste CAD com simulação atual e mantém operação REAL independente dos campos PC', async () => {
  const ui = createUi(remoteSimulation()); await settle();
  const cadButton = () => ui.query('[data-purge-cad="1"]')[0];
  assert.equal(cadButton().disabled, false);
  for (const extra of [
    { simulacao_cad_atual: false }, { estado_simulacao_disponivel: false }, { sensor_status: 'SEM_SENSOR' }, { temperatura_c: null },
    { modo: 'manual' }, { origem: 'REAL' },
    { purgadores: [channel(1, { saida_fisica_habilitada: false }), channel(2)] },
    { purgadores: [channel(1, { armado: true, modo: 'REAL' }), channel(2)] },
    { purgadores: [channel(1, { ativo: true, modo: 'SIMULACAO' }), channel(2)] },
  ]) {
    ui.setData(remoteSimulation(extra)); await ui.refresh();
    assert.equal(cadButton().disabled, true, JSON.stringify(extra));
  }
  ui.setData(remoteSimulation({ modo: 'real', origem: 'REAL', sensor_status: 'VALIDO', temperatura_c: 105,
    faixa_temperatura: 'ALTA', cor_sinaleiro: 'VERMELHO', pronto_descarga: false, pt100_habilitado: true }));
  await ui.refresh();
  assert.equal(ui.ids.get('d1temp').textContent, '105,0');
  assert.equal(ui.ids.get('d1signal').textContent, 'Vermelho fixo');
  assert.equal(ui.ids.get('pcSimStatus').textContent, 'PT100 REAL');
  assert.equal(ui.ids.get('pcHeating').textContent, 'Aquecimento virtual: não utilizado no modo real');
  assert.equal(ui.ids.get('p1virtual').textContent, 'Não utilizado no modo real');
  assert.equal(cadButton().disabled, true);
});

test('HMI envia arme CAD como ação local explícita e limpa referências virtuais na perda de contato', async () => {
  const ui = createUi(remoteSimulation()); await settle();
  const before = ui.requests.length;
  await ui.click('[data-purge-cad="1"]');
  const command = ui.requests.slice(before).find(item => item.url === '/api/purgadores' && item.options.method === 'POST');
  assert.ok(command);
  assert.equal(command.options.headers['X-CGD-Local'], 'true');
  assert.deepEqual(Object.fromEntries(command.options.body), { canal: '1', valor: 'armar_teste_cad' });
  ui.setFetch(async () => { throw new Error('Sem rede'); }); await ui.refresh();
  assert.equal(ui.ids.get('pcSimStatus').textContent, 'SEM CONTATO');
  assert.equal(ui.ids.get('pcHeating').textContent, 'Aquecimento virtual: não confirmado');
  for (const ch of [1, 2]) {
    assert.equal(ui.ids.get('p' + ch + 'virtual').textContent, 'Não confirmado');
    assert.equal(ui.ids.get('p' + ch + 'relay').textContent, 'Não confirmado');
    assert.equal(ui.query('[data-purge-cad="' + ch + '"]')[0].disabled, true);
  }
});
