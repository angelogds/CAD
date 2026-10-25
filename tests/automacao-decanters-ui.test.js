const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ejs = require('ejs');
const core = require('../public/js/automacao-decanters-core');

// Exercita o adaptador com os controles da view renderizada, sem WebGL/rede.
function dashboard(simulationAllowed = true) {
  const file = require('node:path').join(__dirname, '../views/automacao/decanters.ejs');
  const html = ejs.render(fs.readFileSync(file, 'utf8'), { layout() {}, simulacaoDecantersHabilitada: simulationAllowed, modoSimulacaoDecanters: simulationAllowed }, { filename: file });
  const elements = [];
  const ids = new Map();
  const document = { hidden: false, activeElement: null };
  function element(tag = 'div', attributes = '') {
    const attrs = Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
    const handlers = {};
    const classes = new Set((attrs.class || '').split(' '));
    const el = {
      tag, attrs, id: attrs.id, type: attrs.type, value: attrs.value || '', checked: false,
      hidden: /\bhidden(?:\s|$)/.test(attributes), textContent: '', children: [], dataset: {},
      classList: { toggle(key, on) { on ? classes.add(key) : classes.delete(key); }, contains: key => classes.has(key) },
      style: { setProperty(key, value) { this[key] = value; } },
      addEventListener(name, fn) { handlers[name] = fn; },
      setAttribute(key, value) { attrs[key] = value; },
      replaceChildren(...children) { this.children = children; }, append(...children) { this.children.push(...children); },
      blur() { document.activeElement = null; },
      fire(name) { handlers[name]?.({ target: this }); },
    };
    Object.defineProperty(el, 'valueAsNumber', { get: () => Number(el.value) });
    for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) el.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    elements.push(el);
    if (el.id) ids.set(el.id, el);
    return el;
  }
  for (const match of html.matchAll(/<([a-z][\w-]*)(\s[^<>]*?)?>/gi)) element(match[1], match[2] || '');
  const matches = (el, selector) => {
    const attr = selector.match(/^(button)?\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return (!attr[1] || el.tag === attr[1]) && Object.hasOwn(el.attrs, attr[2]) && (attr[3] === undefined || el.attrs[attr[2]] === attr[3]);
    if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
    return false;
  };
  const main = ids.get('decanters-dashboard');
  main.querySelectorAll = selector => elements.filter(el => matches(el, selector));
  main.querySelector = selector => elements.find(el => matches(el, selector));
  document.getElementById = id => ids.get(id) || null;
  document.createElement = tag => element(tag);
  const events = {};
  const intervals = [];
  const window = {
    AutomacaoDecantersCore: core, matchMedia: () => ({ matches: false }),
    addEventListener(name, fn) { (events[name] ||= []).push(fn); },
    dispatchEvent(event) { (events[event.type] || []).forEach(fn => fn(event)); },
    setInterval(fn) { intervals.push(fn); },
  };
  document.addEventListener = () => {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/automacao-decanters'), 'utf8'), {
    window, document, CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    fetch() { throw new Error('A simulação não deve acessar rede.'); },
  });
  return { window, ids, main, intervals, snapshot: () => window.AutomacaoDecantersDashboard.getSnapshot() };
}

test('dashboard inicia sem leituras falsas e coloca os três indicadores ao lado do tanque', () => {
  const ui = dashboard();
  assert.equal(ui.snapshot().mode, 'LIVE');
  assert.equal(ui.ids.get('dec-tank-temperature').textContent, '— °C');
  assert.equal(ui.ids.get('dec-tank-received').textContent, '— L');
  assert.equal(ui.ids.get('dec-tank-remaining').textContent, 'Sem estimativa');
  assert.equal(ui.ids.get('dec-sim-panel').hidden, true);
});

test('supervisão não recebe controles nem inicia relógio de simulação', () => {
  const ui = dashboard(false);
  assert.equal(ui.snapshot().mode, 'LIVE');
  assert.equal(ui.ids.has('dec-demo-start'), false);
  assert.equal(ui.ids.has('dec-sim-panel'), false);
  assert.equal(ui.intervals.length, 0);
  assert.equal(ui.ids.get('dec-tank-received').textContent, '— L');
});

test('ações da view iniciam circuito, atualizam total recebido e distinguem transferência', () => {
  const ui = dashboard();
  ui.ids.get('dec-demo-start').fire('click');
  assert.equal(ui.snapshot().mode, 'SIMULACAO');
  assert.equal(ui.ids.get('dec-sim-panel').hidden, false);
  ui.ids.get('dec-demo-circuit').fire('click');
  assert.equal(ui.snapshot().effective.feedPump, true);
  assert.equal(ui.snapshot().effective.outletPump, 1);
  ui.intervals[0]();
  const snapshot = ui.snapshot();
  assert.ok(snapshot.inletTotalLiters > 0);
  assert.ok(snapshot.transferredTotalLiters > 0);
  assert.notEqual(snapshot.inletTotalLiters, snapshot.transferredTotalLiters);
  assert.equal(ui.ids.get('dec-tank-remaining').textContent, '7.500–11.250 L');
  assert.match(ui.ids.get('dec-shift-label').textContent, /não é produção apurada/);
  ui.window.AutomacaoDecantersDashboard.selectEquipment('FAST');
  assert.equal(ui.ids.get('dec-selected-title').textContent, 'Decanter FAST');
});

test('parar ou voltar à supervisão elimina atuação virtual e dados simulados visíveis', () => {
  const ui = dashboard();
  ui.ids.get('dec-demo-circuit').fire('click');
  ui.ids.get('dec-stop').fire('click');
  assert.equal(ui.snapshot().effective.mixer, false);
  assert.equal(ui.snapshot().effective.feedPump, false);
  ui.ids.get('dec-live-return').fire('click');
  assert.equal(ui.snapshot().mode, 'LIVE');
  assert.equal(ui.ids.get('dec-tank-received').textContent, '— L');
  assert.equal(ui.ids.get('dec-tank-mixer').textContent, 'Sem sinal');
});
