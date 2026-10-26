const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');
const Core = require('../public/js/automacao-digestores-circuito-core');
const { detailsFor } = require('../public/js/automacao-digestores-circuito');
const rootPath = path.join(__dirname, '..');

function noCommands(state) {
  assert.equal(state.feedAuger, false);
  assert.ok(state.gates.every(value => value === false));
  assert.ok(state.digestors.every(unit => !unit.shaft && !unit.loading && !unit.discharging));
  assert.equal(state.percolator, false);
  assert.equal(state.tachoMixer, false);
  assert.equal(state.pump, false);
}

test('supervisão começa com mecânica, volume, transferência e temperatura desconhecidos', () => {
  const state = Core.createState();
  const before = Core.snapshot(state);
  Core.tick(state, 300);
  assert.deepEqual(Core.snapshot(state), before);
  assert.equal(before.mode, 'LIVE');
  assert.equal(before.tachoLiters, null);
  assert.equal(before.transferredLiters, null);
  assert.ok(before.gates.every(value => value === null));
  assert.ok(before.digestors.every(unit => unit.tempC === null && unit.shaft === null));
  assert.ok(detailsFor('digestor1', before).rows.some(([key, value]) => key === 'Eixo' && value === 'Sem sinal'));
  assert.ok(detailsFor('gasHeader', before).rows.every(([, value]) => /Sem sinal|Estática/.test(value)));
});

test('D2 abre só sua guilhotina, mistura pelo seu eixo e descarrega na percoladora', () => {
  const state = Core.createState();
  assert.deepEqual(Core.startDemo(state, 'D2'), { ok: true });
  assert.equal(state.stage, 'CARGA');
  assert.deepEqual(state.gates, [false, true, false, false]);
  assert.equal(state.feedAuger, true);
  assert.ok(state.digestors[1].loading);
  assert.ok(state.digestors.every(unit => !unit.shaft && !unit.discharging));
  Core.tick(state, Core.EXAMPLE.loadSeconds);
  assert.equal(state.stage, 'MISTURA');
  assert.ok(state.gates.every(value => !value));
  assert.equal(state.feedAuger, false);
  assert.deepEqual(state.digestors.map(unit => unit.shaft), [false, true, false, false]);
  Core.tick(state, Core.EXAMPLE.mixSeconds);
  assert.equal(state.stage, 'DESCARGA');
  assert.equal(state.percolator, true);
  assert.equal(state.pump, false);
  assert.deepEqual(state.digestors.map(unit => unit.discharging), [false, true, false, false]);
  Core.tick(state, Core.EXAMPLE.dischargeSeconds / 2);
  assert.ok(state.tachoLiters > 0);
  assert.equal(state.tachoMixer, true);
  assert.ok(state.digestors.every(unit => unit.tempC === null));
});

test('todos atende quatro digestores em série e conserva o balanço virtual do líquido', () => {
  const state = Core.createState();
  Core.startDemo(state, 'TODOS');
  const loaded = [];
  while (state.running) {
    if (state.stage === 'CARGA') {
      loaded.push(state.activeDigestor);
      assert.equal(state.gates.filter(Boolean).length, 1);
      assert.equal(state.gates[Number(state.activeDigestor.slice(1)) - 1], true);
    } else assert.equal(state.gates.filter(Boolean).length, 0);
    if (state.stage === 'TRANSFERENCIA') {
      assert.ok(state.pump);
      assert.ok(state.tachoMixer);
    }
    Core.tick(state, state.stageDurationSeconds);
    assert.ok(state.tachoLiters >= 0 && state.tachoLiters <= state.tachoCapacityLiters);
    assert.ok(Math.abs(state.collectedLiters - state.transferredLiters - state.tachoLiters) < 0.000001);
  }
  assert.deepEqual(loaded, ['D1', 'D2', 'D3', 'D4']);
  assert.deepEqual(state.completed, loaded);
  assert.equal(state.stage, 'CONCLUIDO');
  assert.equal(state.transferredLiters, 4 * Core.EXAMPLE.chargeLiters * Core.EXAMPLE.liquidFraction);
  assert.equal(state.tachoLiters, 0);
  noCommands(state);
});

test('pausa mantém instante e posição virtual; parar retira ações e impede retomada implícita', () => {
  const state = Core.createState();
  Core.startDemo(state, 'D4');
  Core.tick(state, 2);
  Core.pause(state);
  const paused = Core.snapshot(state);
  Core.tick(state, 100);
  assert.deepEqual(Core.snapshot(state), paused);
  assert.equal(state.gates[3], true);
  Core.resume(state);
  Core.tick(state, 1);
  assert.equal(state.seconds, 3);
  Core.stop(state);
  noCommands(state);
  assert.equal(state.running, false);
  assert.equal(state.paused, false);
  Core.resume(state);
  Core.tick(state, 100);
  assert.equal(state.running, false);
  assert.equal(state.stage, 'PARADO');
  noCommands(state);
});

test('voltar à supervisão apaga sessão e cópias externas não alteram o circuito', () => {
  const state = Core.createState();
  Core.startDemo(state, 'D1');
  Core.tick(state, 30);
  assert.ok(state.transferredLiters > 0);
  const external = Core.snapshot(state);
  external.gates[3] = true;
  external.digestors[2].shaft = true;
  assert.equal(state.gates[3], false);
  assert.equal(state.digestors[2].shaft, false);
  Core.returnLive(state);
  assert.deepEqual(state, Core.createState());
  // Nem um chamador externo consegue fazer snapshot LIVE afirmar estado mecânico.
  state.feedAuger = true;
  assert.equal(Core.snapshot(state).feedAuger, null);
});

test('seleção inválida e relógio inválido não disparam ciclo ou alteram volumes', () => {
  const state = Core.createState();
  assert.equal(Core.startDemo(state, 'D9').ok, false);
  assert.equal(state.mode, 'LIVE');
  Core.startDemo(state, 'D3');
  const before = Core.snapshot(state);
  for (const elapsed of [null, NaN, Infinity, '6', -1, 0]) Core.tick(state, elapsed);
  assert.deepEqual(Core.snapshot(state), before);
  Core.tick(state, 36000);
  assert.equal(state.stage, 'CONCLUIDO');
  assert.equal(state.transferredLiters, Core.EXAMPLE.chargeLiters * Core.EXAMPLE.liquidFraction);
});

// Exercita a página renderizada e os mesmos eventos usados pelo viewer compartilhado.
function dashboard(controls = true) {
  const file = path.join(rootPath, 'views/automacao/partials/digestores-circuito.ejs');
  const html = ejs.render(fs.readFileSync(file, 'utf8'), { controls }, { filename: file });
  const elements = [];
  const ids = new Map();
  const document = { hidden: false };
  function element(tag, raw = '') {
    const attrs = Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
    if (/\bhidden(?=\s|\/|$)/.test(raw)) attrs.hidden = '';
    const classes = new Set((attrs.class || '').split(' '));
    const handlers = {};
    const object = { tag, attrs, id: attrs.id, value: attrs.value || '', disabled: /\bdisabled\b/.test(raw),
      hidden: Object.hasOwn(attrs, 'hidden'), textContent: '', children: [], dataset: {}, style: {},
      classList: { toggle(key, enabled) { enabled ? classes.add(key) : classes.delete(key); }, contains: key => classes.has(key) },
      setAttribute(key, value) { attrs[key] = value; if (key === 'hidden') this.hidden = true; },
      removeAttribute(key) { delete attrs[key]; if (key === 'hidden') this.hidden = false; },
      append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
      addEventListener(name, fn) { (handlers[name] ||= []).push(fn); },
      fire(name, extra = {}) { for (const fn of handlers[name] || []) fn({ target: this, preventDefault() {}, ...extra }); }
    };
    for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) object.dataset[key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    elements.push(object);
    if (object.id) ids.set(object.id, object);
    return object;
  }
  for (const match of html.matchAll(/<([a-z][\w-]*)(\s[^<>]*?)?>/gi)) element(match[1], match[2] || '');
  for (const match of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const options = [...match[2].matchAll(/<option value="([^"]+)"([^>]*)>/g)];
    const selected = options.find(option => /\bselected\b/.test(option[2])) || options[0];
    ids.get(match[1]).value = selected?.[1] || '';
  }
  const matches = (object, selector) => {
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    return Boolean(attr && Object.hasOwn(object.attrs, attr[1]) && (attr[2] === undefined || object.attrs[attr[1]] === attr[2]));
  };
  const panel = ids.get('digestores-circuito-panel');
  panel.querySelectorAll = selector => elements.filter(object => matches(object, selector));
  panel.querySelector = selector => elements.find(object => matches(object, selector));
  document.getElementById = id => ids.get(id) || null;
  document.createElement = tag => element(tag);
  const listeners = {};
  const intervals = [];
  const window = { AutomacaoDigestoresCircuitoCore: Core, matchMedia: () => ({ matches: false }),
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    dispatchEvent(event) { for (const fn of listeners[event.type] || []) fn(event); },
    setInterval(fn) { intervals.push(fn); } };
  const forbidden = () => { throw new Error('Circuito mecânico não deve acessar rede ou acionar o simulador térmico.'); };
  window.AutomacaoSimulador = new Proxy({}, { get: forbidden });
  vm.runInNewContext(fs.readFileSync(path.join(rootPath, 'public/js/automacao-digestores-circuito.js'), 'utf8'), {
    window, document, fetch: forbidden, WebSocket: forbidden,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  });
  return { html, panel, elements, ids, window, intervals,
    action: key => panel.querySelector('[data-circuito-action="' + key + '"]'),
    role: key => panel.querySelector('[data-circuito-role="' + key + '"]'),
    snapshot: () => window.AutomacaoDigestoresCircuito.getSnapshot() };
}

test('adaptador permanece LIVE até botão explícito e respeita seleção, pausa e parada', () => {
  const ui = dashboard();
  assert.equal(ui.snapshot().mode, 'LIVE');
  ui.intervals[0]();
  assert.equal(ui.snapshot().mode, 'LIVE');
  assert.equal(ui.role('tacho').textContent, 'Sem sinal');
  ui.ids.get('digestores-circuito-selection').value = 'D3';
  ui.action('start').fire('click');
  assert.deepEqual(ui.snapshot().gates, [false, false, true, false]);
  assert.equal(ui.snapshot().activeDigestor, 'D3');
  assert.equal(ui.panel.querySelector('[data-flow="digestor3"]').dataset.active, 'false');
  assert.equal(ui.panel.querySelector('[data-circuito-unit-status="3"]').textContent, 'Carga virtual');
  ui.intervals[0]();
  assert.ok(ui.snapshot().seconds > 0);
  ui.action('pause').fire('click');
  const elapsed = ui.snapshot().seconds;
  ui.intervals[0]();
  assert.equal(ui.snapshot().seconds, elapsed);
  assert.equal(ui.panel.dataset.running, 'false');
  ui.action('pause').fire('click');
  assert.equal(ui.snapshot().running, true);
  ui.action('stop').fire('click');
  noCommands(ui.snapshot());
  ui.action('live').fire('click');
  assert.equal(ui.snapshot().mode, 'LIVE');
  assert.equal(ui.snapshot().transferredLiters, null);
});

test('supervisão não recebe controles mecânicos nem inicia relógio; seleção por teclado funciona', () => {
  const ui = dashboard(false);
  assert.equal(ui.intervals.length, 0);
  assert.equal(ui.action('start'), undefined);
  assert.equal(ui.action('stop'), undefined);
  assert.equal(ui.ids.has('digestores-circuito-selection'), false);
  const tacho = ui.panel.querySelector('[data-circuito-equipment="tacho"]');
  tacho.fire('keydown', { key: 'Enter' });
  assert.equal(ui.role('title').textContent, 'Tacho coletor à esquerda');
  assert.match(ui.role('status').textContent, /Sem sinal mecânico/);
  assert.equal(ui.snapshot().mode, 'LIVE');
});

test('SVG de fallback mostra volume somente na simulação e a seleção 3D usa a mesma API', () => {
  const ui = dashboard();
  const fill = ui.role('tacho-fill');
  assert.equal(fill.hidden, true);
  ui.ids.get('digestores-circuito-selection').value = 'D1';
  ui.action('start').fire('click');
  for (let index = 0; index < 35; index++) ui.intervals[0]();
  assert.ok(ui.snapshot().tachoLiters > 0);
  assert.equal(fill.hidden, false);
  assert.ok(Number(fill.attrs.height) > 0);
  ui.window.AutomacaoDigestoresCircuito.selectEquipment('serviceTankBoundary');
  assert.match(ui.role('title').textContent, /tanque de serviço/);
  ui.window.dispatchEvent({ type: 'digestores-circuito:3d-ready' });
  assert.equal(ui.ids.get('digestores-circuito-scheme').hidden, true);
  assert.match(ui.ids.get('digestores-circuito-3d-status').textContent, /Arraste para girar/);
  ui.window.dispatchEvent({ type: 'digestores-circuito:3d-unavailable' });
  assert.equal(ui.ids.get('digestores-circuito-scheme').hidden, false);
  assert.equal(ui.ids.get('digestores-circuito-3d').hidden, true);
  ui.action('live').fire('click');
  assert.equal(fill.hidden, true);
});

test('views preservam hooks térmicos e controles mecânicos dependem da autorização do servidor', () => {
  const filename = path.join(rootPath, 'views/automacao/simulador-digestores.ejs');
  const source = fs.readFileSync(filename, 'utf8');
  const locals = { layout() {}, simuladorBancadaAdmin: false, csrfAutomacao: '' };
  const denied = ejs.render(source, { ...locals, simulacaoCircuitoPermitida: false }, { filename });
  const allowed = ejs.render(source, { ...locals, simulacaoCircuitoPermitida: true }, { filename });
  assert.doesNotMatch(denied, /data-circuito-action="start"/);
  assert.match(allowed, /data-circuito-action="start"/);
  for (const html of [denied, allowed]) {
    for (const id of ['sim-start', 'sim-pause', 'sim-reset', 'sim-select-digestor']) assert.match(html, new RegExp('id="' + id + '"'));
    assert.match(html, /automacao-simulador\.js/);
    assert.match(html, /automacao-digestores-circuito-core\.js/);
  }
  const mainFilename = path.join(rootPath, 'views/automacao/digestores.ejs');
  const main = ejs.render(fs.readFileSync(mainFilename, 'utf8'), { layout() {}, digestores: [] }, { filename: mainFilename });
  assert.doesNotMatch(main, /data-circuito-action="start"/);
  assert.match(main, /id="digestores-supervisao"/);
  assert.match(main, /automacao-digestores\.js/);
});

test('novos scripts mecânicos não acessam API, GPIO nem os botões e estados do simulador térmico', () => {
  for (const file of ['automacao-digestores-circuito-core.js', 'automacao-digestores-circuito.js', 'automacao-digestores-3d.mjs']) {
    const source = fs.readFileSync(path.join(rootPath, 'public/js', file), 'utf8');
    assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|new WebSocket|\.click\(|sim-remote-enable|sim-start|AutomacaoSimulador|\/api\//, file);
  }
  const css = fs.readFileSync(path.join(rootPath, 'public/css/automacao-digestores-circuito.css'), 'utf8');
  assert.doesNotMatch(css, /\[data-active="true"\]>.circuito-flow/);
});
