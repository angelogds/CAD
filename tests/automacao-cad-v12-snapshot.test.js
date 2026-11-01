const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const thermalCore = require('../public/js/automacao-simulador-core');
const mechanicalCore = require('../public/js/automacao-digestores-circuito-core');

// Usa os mesmos scripts e a ordem defer da página, com relógio/rede controlados.
function simulator({ selection = '1', deferFirstPost = false, relayButton = false, autoSync = true } = {}) {
  function node() {
    const handlers = new Map();
    const classes = new Set();
    return {
      dataset: {}, style: {}, value: '', checked: false, disabled: false, textContent: '', children: [], attributes: {},
      classList: {
        toggle(name, force) { const on = force === undefined ? !classes.has(name) : force; on ? classes.add(name) : classes.delete(name); return on; },
      },
      addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); },
      dispatchEvent(event) { for (const fn of handlers.get(event.type) || []) fn(event); },
      fire(type) { this.dispatchEvent({ type, target: this, preventDefault() {} }); },
      setAttribute(name, value) { this.attributes[name]=String(value); }, removeAttribute() {}, scrollIntoView() {},
      append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); },
      replaceChildren(...items) { this.children = items; },
      querySelector() { return null; }, querySelectorAll() { return []; },
    };
  }
  const ids = new Map();
  const get = id => { if (!ids.has(id)) ids.set(id, node()); return ids.get(id); };
  for (const id of ['sim-digestores', 'sim-start', 'sim-select-digestor', 'sim-selection-status', 'sim-pause',
    'sim-reset', 'sim-presentation', 'sim-speed', 'sim-link-circuits', 'sim-integration-state', 'sim-clock',
    'sim-events-filter', 'sim-events-list', 'sim-remote-enable', 'sim-remote-status', 'sim-auto-sync',
    'sim-connect-esp32', 'sim-remote-rows', 'sim-hardware-indicator', 'digestores-circuito-panel']) get(id);
  if(relayButton){get('sim-real-components');get('sim-real-feedback');}
  get('sim-select-digestor').value = selection;
  get('sim-events-filter').value = 'all';
  get('sim-speed').value = '8';
  get('sim-auto-sync').checked = autoSync;
  get('sim-remote-enable').dataset.csrf = 'test-csrf';
  get('digestores-circuito-panel').dataset.controls = 'true';
  const cards = Array.from({ length: 4 }, (_, index) => {
    const card = node();
    card.dataset.digestor = String(index + 1);
    const roles = new Map();
    const parts = key => { if (!roles.has(key)) roles.set(key, node()); return roles.get(key); };
    card.querySelector = selector => parts(selector);
    card.querySelectorAll = selector => selector === '[data-step]' ? ['CARREGADO', 'AQUECIMENTO', 'COZIMENTO', 'PRONTO'].map(step => {
      const item = parts(step); item.dataset.step = step; return item;
    }) : [];
    return card;
  });
  const root = get('sim-digestores');
  root.querySelectorAll = selector => selector === '[data-digestor]' ? cards : [];
  root.querySelector = selector => cards.find(card => selector === '[data-digestor="' + card.dataset.digestor + '"]') || null;
  const document = {
    hidden: false, getElementById: id => ids.get(id) || null,
    createElement: node, createDocumentFragment: node,
  };
  const timers = new Map();
  let timerId = 0;
  const setInterval = (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; };
  const clearInterval = id => timers.delete(id);
  const window = node();
  window.AutomacaoSimuladorCore = thermalCore;
  window.AutomacaoDigestoresCircuitoCore = mechanicalCore;
  window.setInterval = setInterval;
  window.matchMedia = () => ({ matches: false });
  const posts = [];
  let hardwareRows=relayButton?[{digestor_id:1,conexao:'ONLINE',origem:'SIMULACAO'}]:[],statusFailure=false;
  let releaseFirst;
  window.CGDSimHttp = {
    MSG: { RESPOSTA_INVALIDA: 'Resposta inválida' },
    async fetchJson(_url, options) {
      if (!options || options.method !== 'POST') {if(statusFailure)throw Error('Falha de rede');return { ok: true, digestores: hardwareRows };}
      posts.push(JSON.parse(options.body).estados);
      if (deferFirstPost && posts.length === 1) await new Promise(resolve => { releaseFirst = resolve; });
      return { ok: true };
    },
  };
  const sandbox = vm.createContext({
    window, document, setInterval, clearInterval, confirm: () => true,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
  });
  for (const name of ['automacao-simulador.js', 'automacao-simulador-remoto.js', 'automacao-digestores-circuito.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8'), sandbox, { filename: name });
  const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
  return {
    get, cards, posts, window, flush,
    async status(rows) { hardwareRows=rows;statusFailure=false;const timer=[...timers.values()].find(item=>item.fn.name==='refreshStatus');if(timer)await timer.fn();await flush(); },
    async failStatus() {statusFailure=true;const timer=[...timers.values()].find(item=>item.fn.name==='refreshStatus');if(timer)await timer.fn();await flush();},
    snapshot: () => window.AutomacaoDigestoresCircuito.getSnapshot(),
    async start() { get('sim-start').fire('click'); await flush(); },
    async tick() { const timer = [...timers.values()].find(item => item.fn.name === 'tick'); if (timer) timer.fn(); await flush(); },
    async pause() { get('sim-pause').fire('click'); await flush(); },
    release() { releaseFirst(); },
    async select(value) { get('sim-select-digestor').value = value; get('sim-select-digestor').fire('change'); await flush(); },
  };
}

test('snapshot integrado percorre carga, cozimento e descarga com os mesmos estados publicados ao ESP32', async () => {
  const ui = simulator();
  await ui.select('1');
  await ui.start();
  assert.equal(ui.snapshot().linked, true);
  assert.equal(ui.posts[0][0].guilhotinas_simuladas.carga, 'ABERTA');
  const phases = new Set();
  const purgers = new Set();
  for (let index = 0; index < 100 && ui.snapshot().stage !== 'CONCLUIDO'; index++) {
    await ui.tick();
    const current = ui.posts.at(-1)[0];
    assert.equal(current.digestor_id, 1);
    if (current.fase !== 'PARADO') {
      phases.add(current.etapa_mecanica);
      purgers.add(current.purgadores_visuais.camisa + '/' + current.purgadores_visuais.eixo);
      assert.ok(current.guilhotinas_simuladas.carga !== 'ABERTA' || current.guilhotinas_simuladas.descarga !== 'ABERTA');
    }
    assert.deepEqual(current.purgadores_simulados, { camisa: 'FECHADO', eixo: 'FECHADO' }, 'canal legado continua sem comando industrial');
  }
  assert.equal(ui.snapshot().stage, 'CONCLUIDO');
  for (const phase of ['COZIMENTO', 'DESCARGA', 'TRANSFERENCIA']) assert.ok(phases.has(phase), phase);
  for (const value of ['ABERTO/FECHADO', 'FECHADO/ABERTO']) assert.ok(purgers.has(value), value);
  assert.equal(ui.posts.at(-1)[0].fase, 'PARADO');
});

test('pausa retira publicação ativa e retoma o mesmo instante e seleção do ciclo mecânico', async () => {
  const ui = simulator({ selection: '3' });
  await ui.select('3');
  await ui.start();
  await ui.tick();
  const before = ui.snapshot();
  await ui.pause();
  assert.equal(ui.posts.at(-1)[0].digestor_id, 3);
  assert.equal(ui.posts.at(-1)[0].fase, 'PARADO');
  assert.equal(ui.snapshot().paused, true);
  await ui.start();
  assert.equal(ui.snapshot().seconds, before.seconds);
  assert.equal(ui.snapshot().activeDigestor, 'D3');
  assert.equal(ui.snapshot().running, true);
});

test('troca de seleção durante publicação em voo para os digestores anteriores antes de aceitar a nova seleção', async () => {
  const ui = simulator({ deferFirstPost: true });
  await ui.select('1');
  await ui.start();
  assert.equal(ui.posts.length, 1);
  assert.equal(ui.posts[0][0].digestor_id, 1);
  await ui.select('2');
  ui.release();
  await ui.flush();
  assert.ok(ui.posts.length >= 2, 'PARADO não pode ser descartado pelo busy da publicação anterior');
  assert.ok(ui.posts.slice(1).some(states => states.some(state => state.digestor_id === 1 && state.fase === 'PARADO')),
    'digestor anterior precisa receber PARADO mesmo depois da alteração no seletor');
  assert.equal(ui.get('sim-remote-enable').checked, false);
});

test('falha ao obter snapshot encerra a sincronização e retira o estado ativo', async () => {
  const ui = simulator();
  await ui.start();
  ui.window.AutomacaoDigestoresCircuito.getSnapshot = () => { throw new Error('snapshot indisponível'); };
  assert.doesNotThrow(() => ui.get('sim-digestores').dispatchEvent({ type: 'simulador:estado' }));
  await ui.flush();
  assert.equal(ui.get('sim-remote-enable').checked, false);
  assert.match(ui.get('sim-remote-status').textContent, /snapshot indisponível/);
});

test('ciclo integrado bloqueia carregamento e partida individuais durante execução e pausa', async () => {
  const ui = simulator();
  await ui.select('1');
  await ui.start();
  await ui.tick();
  await ui.tick();
  const card = ui.cards[0];
  const load = card.querySelector('[data-action="load"]');
  const heat = card.querySelector('[data-action="heat"]');
  const before = card.dataset.temperaturaC;
  assert.equal(ui.snapshot().stage, 'COZIMENTO');
  for (const paused of [false, true]) {
    if (paused) await ui.pause();
    assert.equal(load.disabled, true);
    assert.equal(heat.disabled, true);
    load.fire('click');
    heat.fire('click');
    assert.equal(card.dataset.temperaturaC, before, 'eventos individuais não podem reiniciar o ciclo integrado');
    assert.equal(ui.snapshot().stage, 'COZIMENTO');
  }
});

test('reinício rápido na nova seleção preserva PARADO da seleção anterior na fila de publicação', async () => {
  const ui = simulator({ deferFirstPost: true });
  await ui.select('1');
  await ui.start();
  await ui.select('2');
  await ui.start();
  ui.release();
  await ui.flush();
  assert.ok(ui.posts.slice(1).some(states => states.some(state => state.digestor_id === 1 && state.fase === 'PARADO')));
  assert.ok(ui.posts.slice(1).some(states => states.some(state => state.digestor_id === 2 && state.fase !== 'PARADO')));
  assert.equal(ui.snapshot().activeDigestor, 'D2');
  assert.equal(ui.get('sim-remote-enable').checked, true);
});

test('os quatro digestores publicam ciclos em sequência com apenas um par de guilhotinas ativo', async () => {
  const ui = simulator({ selection: 'all' });
  await ui.select('all');
  await ui.start();
  const visited = new Set();
  for (let index = 0; index < 300 && ui.snapshot().stage !== 'CONCLUIDO'; index++) {
    const snapshot = ui.snapshot();
    if (snapshot.stage === 'CARGA') visited.add(snapshot.activeDigestor);
    await ui.tick();
    const batch = ui.posts.at(-1);
    assert.equal(batch.length, 4);
    if (batch.every(item => item.fase === 'PARADO')) continue;
    assert.ok(batch.filter(item => item.guilhotinas_simuladas.carga === 'ABERTA' || item.guilhotinas_simuladas.descarga === 'ABERTA').length <= 1);
    assert.ok(batch.filter(item => item.motor_digestor_simulado).length <= 1);
    assert.ok(batch.filter(item => item.purgadores_visuais.camisa === 'ABERTO' || item.purgadores_visuais.eixo === 'ABERTO').length <= 1);
  }
  assert.deepEqual([...visited], ['D1', 'D2', 'D3', 'D4']);
  assert.equal(ui.snapshot().stage, 'CONCLUIDO');
  assert.ok(ui.posts.at(-1).every(item => item.fase === 'PARADO'));
});

test('pausa e retomada rápidas do mesmo digestor preservam PARADO antes da próxima publicação ativa', async () => {
  const ui = simulator({ selection: '1', deferFirstPost: true });
  await ui.select('1');
  await ui.start();
  assert.equal(ui.posts.length, 1);
  assert.notEqual(ui.posts[0][0].fase, 'PARADO');
  await ui.pause();
  await ui.start();
  ui.release();
  await ui.flush();
  assert.ok(ui.posts.length >= 3, 'a retomada não pode substituir a parada aguardando o POST anterior');
  assert.equal(ui.posts[1][0].digestor_id, 1);
  assert.equal(ui.posts[1][0].fase, 'PARADO');
  assert.equal(ui.posts[2][0].digestor_id, 1);
  assert.notEqual(ui.posts[2][0].fase, 'PARADO');
  assert.equal(ui.get('sim-remote-enable').checked, true);
});


test('S · Simulação real exige ação explícita e Conectar não aciona relés',async()=>{
 const ui=simulator({relayButton:true,autoSync:false});await ui.flush();
 assert.equal(ui.get('sim-real-components').disabled,false);
 ui.get('sim-connect-esp32').fire('click');await ui.flush();assert.equal(ui.posts.length,0);
 await ui.start();assert.equal(ui.posts.length,0);assert.equal(ui.get('sim-remote-enable').checked,false);
 ui.get('sim-real-components').fire('click');await ui.flush();
 assert.equal(ui.get('sim-remote-enable').checked,true);
 assert.equal(ui.get('sim-real-components').attributes['aria-pressed'],'true');
 assert.notEqual(ui.posts.at(-1)[0].fase,'PARADO');
 await ui.pause();assert.equal(ui.posts.at(-1)[0].fase,'PARADO');
 assert.equal(ui.get('sim-real-components').attributes['aria-pressed'],'false');
});
test('teste real pode ser preparado antes de iniciar; desativar envia PARADO',async()=>{
 const ui=simulator({relayButton:true,autoSync:false});await ui.flush();
 ui.get('sim-real-components').fire('click');await ui.flush();assert.equal(ui.posts.at(-1)[0].fase,'PARADO');
 await ui.start();assert.notEqual(ui.posts.at(-1)[0].fase,'PARADO');
 ui.get('sim-real-components').fire('click');await ui.flush();assert.equal(ui.posts.at(-1)[0].fase,'PARADO');
 const count=ui.posts.length;await ui.tick();assert.equal(ui.posts.length,count);
});
test('sem comunicação ou ESP32 em operação REAL não aceita ativação de componentes',async()=>{
 const ui=simulator({relayButton:true,autoSync:false});await ui.flush();
 await ui.status([{digestor_id:1,conexao:'OFFLINE',origem:'SIMULACAO'}]);
 assert.equal(ui.get('sim-real-components').disabled,true);
 ui.get('sim-real-components').fire('click');await ui.flush();assert.equal(ui.posts.length,0);
 await ui.status([{digestor_id:1,conexao:'ONLINE',origem:'SIMULACAO'}]);
 ui.get('sim-real-components').fire('click');await ui.flush();await ui.start();
 await ui.status([{digestor_id:1,conexao:'ONLINE',origem:'REAL'}]);
 assert.equal(ui.get('sim-remote-enable').checked,false);assert.equal(ui.posts.at(-1)[0].fase,'PARADO');
 assert.equal(ui.get('sim-real-components').disabled,true);
});
test('perda do status interrompe teste real e reconexão não rearma automaticamente',async()=>{
 const ui=simulator({relayButton:true,autoSync:false});await ui.flush();await ui.start();
 ui.get('sim-real-components').fire('click');await ui.flush();
 await ui.failStatus();assert.equal(ui.get('sim-remote-enable').checked,false);
 assert.equal(ui.posts.at(-1)[0].fase,'PARADO');
 await ui.status([{digestor_id:1,conexao:'ONLINE',origem:'SIMULACAO'}]);
 assert.equal(ui.get('sim-real-components').attributes['aria-pressed'],'false');
 const count=ui.posts.length;await ui.tick();assert.equal(ui.posts.length,count);
});
test('botão real preserva parada pendente quando desativado durante POST',async()=>{
 const ui=simulator({relayButton:true,autoSync:false,deferFirstPost:true});await ui.flush();await ui.start();
 ui.get('sim-real-components').fire('click');await ui.flush();assert.equal(ui.posts.length,1);
 ui.get('sim-real-components').fire('click');await ui.flush();ui.release();await ui.flush();
 assert.equal(ui.posts.at(-1)[0].fase,'PARADO');assert.equal(ui.get('sim-remote-enable').checked,false);
});
