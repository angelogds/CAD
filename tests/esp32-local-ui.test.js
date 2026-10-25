const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../firmware/esp32-sinaleiros/local_ui.h'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const settle = () => new Promise(setImmediate);
const channel = (canal, extra = {}) => ({ canal, fechado_min: canal === 1 ? 5 : 10, aberto_s: 60,
  ativo: false, aberto: false, modo: 'PARADO', armado: false, saida_fisica_habilitada: true,
  pino_reservado: canal === 1 ? 25 : 26, restante_ms: 0, ...extra });
const payload = (extra = {}) => ({ digestor: 1, modo: 'parado', origem: 'SIMULACAO', temperatura_c: null,
  faixa_temperatura: 'SENSOR_INDISPONIVEL', cor_sinaleiro: 'DESLIGADO', pronto_descarga: false,
  sensor_status: 'SEM_SENSOR', pt100_habilitado: false, vermelho: false, amarelo: false, verde: false,
  saidas_habilitadas: true, purgadores: [channel(1), channel(2)], ...extra });

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
  assert.equal(ui.ids.get('d1ready').textContent, 'Pronto · simulado');
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
