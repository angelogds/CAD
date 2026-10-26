const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ejs = require('ejs');
const core = require('../public/js/automacao-decanters-core');

// Exercita o adaptador com os controles da view renderizada, sem WebGL/rede.
function dashboard(simulationAllowed = true, simulationPage = simulationAllowed) {
  const file = require('node:path').join(__dirname, '../views/automacao/decanters.ejs');
  const html = ejs.render(fs.readFileSync(file, 'utf8'), { layout() {}, simulacaoDecantersHabilitada: simulationAllowed, modoSimulacaoDecanters: simulationPage }, { filename: file });
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
  return { window, ids, main, intervals, html, snapshot: () => window.AutomacaoDecantersDashboard.getSnapshot() };
}

function control(ui, key) { return ui.main.querySelector('[data-core="' + key + '"]'); }
function change(ui, key, value) {
  const input = control(ui, key);
  assert.ok(input, 'Controle presente: ' + key);
  if (input.type === 'checkbox') input.checked = value;
  else input.value = String(value);
  input.fire('change');
}
function detailRows(ui) {
  return Object.fromEntries(ui.ids.get('dec-selected-values').children.map(row => row.children.map(cell => cell.textContent)));
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

test('controles exigem permissão do servidor e página de simulação ao mesmo tempo', () => {
  for (const [allowed, simulationPage] of [[true, false], [false, true]]) {
    const ui = dashboard(allowed, simulationPage);
    assert.equal(ui.main.dataset.decSimulationAllowed, 'false');
    assert.equal(ui.ids.has('dec-demo-circuit'), false);
    assert.equal(control(ui, 'selectedDecanter'), undefined);
    assert.equal(control(ui, 'mixerFAST'), undefined);
    assert.equal(control(ui, 'autoAlternatePump'), undefined);
    assert.equal(ui.intervals.length, 0);
    assert.equal(ui.snapshot().mode, 'LIVE');
  }
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

test('preset demonstra ambas com dois tachos misturados e uma origem de saída explícita', () => {
  const ui = dashboard();
  assert.match(ui.html, /<option value="AMBAS">FAST e GRATE<\/option>/);
  ui.ids.get('dec-demo-circuit').fire('click');
  const s = ui.snapshot();
  assert.equal(control(ui, 'selectedDecanter').value, 'AMBAS');
  assert.deepEqual(s.decanterReady, { FAST: true, GRATE: true });
  assert.deepEqual(s.effective.feedMachines, { FAST: true, GRATE: true });
  assert.deepEqual(s.tachos, { FAST: 150, GRATE: 150 });
  assert.deepEqual(s.effective.tachoMixers, { FAST: true, GRATE: true });
  assert.equal(control(ui, 'mixerFAST').checked, true);
  assert.equal(control(ui, 'mixerGRATE').checked, true);
  assert.equal(s.selectedTacho, 'FAST');
  assert.equal(s.selectedStorage, 1);
  assert.equal(s.effective.outletPump, 1);
  assert.equal(s.autoAlternatePump, false);
  assert.equal(control(ui, 'autoAlternatePump').checked, false);
  for (const branch of ['FAST', 'GRATE', 'tachoFAST', 'tachoGRATE', 'borraFAST', 'borraGRATE']) {
    const pipes = ui.main.querySelectorAll('[data-flow="' + branch + '"]');
    assert.ok(pipes.length > 0, branch);
    assert.ok(pipes.every(pipe => pipe.classList.contains('is-flowing')), branch);
  }
  ui.window.AutomacaoDecantersDashboard.selectEquipment('feed');
  assert.equal(detailRows(ui)['Linhas selecionadas'], 'FAST e GRATE');
  ui.window.AutomacaoDecantersDashboard.selectEquipment('GRATE');
  assert.equal(detailRows(ui)['Alimentação'], 'Ligado · simulado');
  assert.equal(detailRows(ui)['Vazão desta máquina'], '15 L/min · simulado');
  ui.window.AutomacaoDecantersDashboard.selectEquipment('tachoFAST');
  assert.equal(detailRows(ui)['Mexedor do tacho'], 'Ligado · simulado');
});

test('seleção de máquina pelos controles atualiza ramais e exige novo início da alimentação', () => {
  const ui = dashboard(); ui.ids.get('dec-demo-circuit').fire('click');
  change(ui, 'selectedDecanter', 'GRATE');
  assert.equal(ui.snapshot().effective.feedPump, false);
  change(ui, 'feedPump', true);
  assert.deepEqual(ui.snapshot().effective.feedMachines, { FAST: false, GRATE: true });
  assert.ok(ui.main.querySelectorAll('[data-flow="FAST"]').every(pipe => !pipe.classList.contains('is-flowing')));
  change(ui, 'selectedDecanter', 'AMBAS');
  assert.equal(ui.snapshot().effective.feedPump, false);
  change(ui, 'feedPump', true);
  assert.deepEqual(ui.snapshot().effective.feedMachines, { FAST: true, GRATE: true });
  change(ui, 'mixerFAST', false);
  assert.deepEqual(ui.snapshot().effective.tachoMixers, { FAST: false, GRATE: true });
  assert.equal(control(ui, 'mixerFAST').checked, false);
  assert.equal(control(ui, 'mixerGRATE').checked, true);
});

test('alternância é opt-in e mostra bomba exclusiva e contagem de sessenta segundos virtuais', () => {
  const ui = dashboard(); ui.ids.get('dec-demo-circuit').fire('click');
  assert.match(ui.ids.get('dec-pump-alternation-state').textContent, /desativada/);
  change(ui, 'autoAlternatePump', true);
  assert.match(ui.ids.get('dec-pump-alternation-state').textContent, /Bomba 1.*60 s virtuais.*ilustrativo/);
  ui.intervals[0]();
  assert.match(ui.ids.get('dec-pump-alternation-state').textContent, /Bomba 1.*50 s virtuais/);
  for (let i = 1; i < 6; i++) ui.intervals[0]();
  assert.equal(ui.snapshot().effective.outletPump, 2);
  assert.equal(control(ui, 'outletPump').value, 2);
  assert.equal(ui.snapshot().selectedTacho, 'FAST');
  assert.equal(control(ui, 'autoAlternatePump').checked, true);
  assert.match(ui.ids.get('dec-pump-alternation-state').textContent, /Bomba 2.*60 s virtuais/);
  assert.ok(ui.main.querySelectorAll('[data-flow="out1"]').every(pipe => !pipe.classList.contains('is-flowing')));
  assert.ok(ui.main.querySelectorAll('[data-flow="out2"]').every(pipe => pipe.classList.contains('is-flowing')));
});

test('tacho seco interrompe saída e seu mexedor sem selecionar outra origem ou rearmar sozinho', () => {
  const ui = dashboard(); ui.ids.get('dec-demo-circuit').fire('click');
  change(ui, 'autoAlternatePump', true);
  change(ui, 'tachoFAST', 0);
  assert.equal(ui.snapshot().effective.outletPump, null);
  assert.equal(control(ui, 'outletPump').value, '');
  assert.equal(ui.snapshot().effective.tachoMixers.FAST, false);
  assert.equal(ui.snapshot().selectedTacho, 'FAST');
  assert.match(ui.ids.get('dec-pump-alternation-state').textContent, /Selecione uma bomba/);
  change(ui, 'tachoFAST', 100); ui.intervals[0]();
  assert.equal(ui.snapshot().effective.outletPump, null);
  assert.equal(ui.snapshot().selectedTacho, 'FAST');
  assert.equal(ui.snapshot().effective.tachoMixers.FAST, false);
  assert.equal(ui.snapshot().effective.tachoMixers.GRATE, true);
});

test('teste de tacho cheio funciona na seleção dupla e desarma os dois ramais', () => {
  const ui = dashboard(); ui.ids.get('dec-demo-circuit').fire('click');
  ui.main.querySelector('[data-fault="full"]').fire('click');
  assert.equal(ui.snapshot().tachos.FAST, 900);
  assert.equal(ui.snapshot().feedPump, false);
  assert.deepEqual(ui.snapshot().effective.feedMachines, { FAST: false, GRATE: false });
  change(ui, 'tachoFAST', 150);
  assert.equal(ui.snapshot().feedPump, false);
  assert.equal(control(ui, 'selectedDecanter').value, 'AMBAS');
});
