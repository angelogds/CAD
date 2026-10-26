const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../public/js/automacao-decanters-core');

function demo() { return core.startDemo(core.createState()); }
function set(state, key, value) {
  const result = core.set(state, key, value);
  assert.equal(result.ok, true, key + ': ' + result.reason);
}
function readyFeed(state, name = 'FAST') {
  set(state, 'temperatureMinC', 70);
  set(state, 'temperatureMaxC', 90);
  set(state, 'tempC', 80);
  set(state, 'mixer', true);
  set(state, 'screw', true);
  set(state, 'selectedDecanter', name);
  core.selectedMachines(state).forEach(machine => set(state, 'ready' + machine, true));
}
function readyOutlet(state, name = 'FAST') {
  set(state, 'selectedTacho', name);
  set(state, 'selectedStorage', 1);
}
const closeTo = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);

test('supervisão inicia sem leituras, sem produção inventada e sem controles liberados', () => {
  const state = core.createState();
  const status = core.evaluate(state);
  assert.equal(state.mode, 'LIVE');
  assert.equal(state.tankLiters, null);
  assert.equal(state.tempC, null);
  assert.equal(state.transferredTotalLiters, null);
  assert.equal(state.inletTotalLiters, null);
  assert.equal(status.level.status, 'SEM_SINAL');
  assert.ok(Object.values(status.permissives).every(value => value === false));
  assert.equal(core.set(state, 'mixer', true).ok, false);
  core.tick(state, 100);
  assert.equal(state.seconds, 0);
  assert.equal(state.tankLiters, null);
});

test('cinco chaves produzem seis faixas sem interpolar uma leitura contínua', () => {
  const expected = [[0,1500],[1500,3750],[3750,7500],[7500,11250],[11250,13500],[13500,15000]];
  expected.forEach(([min, max], wet) => {
    const switches = Array.from({ length: 5 }, (_, index) => index < wet);
    const level = core.levelFromSwitches(switches);
    assert.equal(level.status, 'VALIDO');
    assert.deepEqual([level.minLiters, level.maxLiters], [min, max]);
    assert.equal('liters' in level, false);
  });
  for (let liters = 0; liters <= 15000; liters += 250) {
    const band = core.levelFromSwitches(core.sensorsFromVolume(liters));
    assert.ok(liters >= band.minLiters && liters <= band.maxLiters);
  }
});

test('sensor ausente, não booleano ou combinação incoerente preserva nível desconhecido', () => {
  for (const input of [null, [], [1,1,0,0,0], [true,true,null,false,false]]) {
    const level = core.levelFromSwitches(input);
    assert.equal(level.status, 'SEM_SINAL');
    assert.equal(level.minLiters, null);
  }
  assert.equal(core.levelFromSwitches([true,false,true,false,false]).status, 'INCONSISTENTE');
  assert.equal(core.sensorsFromVolume(NaN)[0], null);
});

test('simulação é escolha explícita e não presume temperatura ideal de processo', () => {
  const state = demo();
  assert.equal(state.mode, 'SIMULACAO');
  assert.equal(state.temperatureMinC, null);
  assert.equal(state.temperatureMaxC, null);
  assert.equal(core.evaluate(state).temperature.configured, false);
  assert.equal(core.set(state, 'feedPump', true).ok, false);
  assert.equal(core.set(state, 'steam', true).ok, false);
  assert.equal(state.feedPump, false);
  assert.equal(state.steam, false);
});

test('alimentação requer faixa térmica, agitador, rosca e máquina pronta selecionada', () => {
  const state = demo();
  readyFeed(state);
  assert.equal(core.evaluate(state).permissives.feedPump, true);
  for (const [key,value,restore] of [['mixer',false,true],['screw',false,true],['readyFAST',false,true],['tempC',60,80]]) {
    set(state, key, value);
    assert.equal(core.set(state, 'feedPump', true).ok, false, key);
    assert.equal(state.feedPump, false);
    set(state, key, restore);
  }
  set(state, 'feedPump', true);
  core.tick(state, 60);
  closeTo(state.tankLiters, 8970);
  closeTo(state.tachos.FAST, 30);
  assert.equal(state.tachos.GRATE, 0);
  assert.equal(state.transferredTotalLiters, 0);
});

test('mudança FAST/GRATE exclui seleção anterior e exige novo início de alimentação', () => {
  const state = demo();
  readyFeed(state);
  set(state, 'feedPump', true);
  set(state, 'selectedDecanter', 'GRATE');
  assert.equal(state.feedPump, false);
  assert.equal(core.evaluate(state).permissives.feedPump, false);
  set(state, 'readyGRATE', true);
  set(state, 'feedPump', true);
  core.tick(state, 20);
  assert.equal(state.selectedDecanter, 'GRATE');
  assert.equal(state.tachos.FAST, 0);
  closeTo(state.tachos.GRATE, 10);
});

test('perda PT100 e incoerência de nível desarmam alimentação e vapor sem reinício automático', () => {
  for (const [key,value] of [['pt100Fault',true],['levelFault','INCONSISTENTE'],['levelFault','SEM_SINAL']]) {
    const state = demo(); readyFeed(state);
    set(state, 'feedPump', true); set(state, 'steam', true);
    set(state, key, value);
    assert.equal(state.feedPump, false);
    assert.equal(state.steam, false);
    const tank = state.tankLiters;
    core.tick(state, 10);
    assert.equal(state.tankLiters, tank);
    set(state, key, key === 'pt100Fault' ? false : null);
    assert.equal(state.feedPump, false);
    assert.equal(state.steam, false);
  }
});

test('nível mínimo evita esvaziar tanque na maquete e nível alto bloqueia entrada', () => {
  const state = demo(); readyFeed(state);
  set(state, 'tankLiters', 1501); set(state, 'feedPump', true);
  core.tick(state, 30);
  assert.equal(state.tankLiters, 1500);
  assert.equal(state.feedPump, false);
  set(state, 'tankLiters', 1499);
  assert.equal(state.mixer, false);
  assert.equal(core.set(state, 'feedPump', true).ok, false);
  set(state, 'tankLiters', 13499);
  set(state, 'inletFlowLpm', 600);
  core.tick(state, 60);
  assert.equal(state.tankLiters, 13500);
  assert.equal(state.inletFlowLpm, 0);
  closeTo(state.inletTotalLiters, 1);
  assert.equal(state.transferredTotalLiters, 0);
});

test('tacho alto suspende alimentação sem transbordar capacidade ilustrativa', () => {
  const state = demo(); readyFeed(state);
  set(state, 'tachoFAST', 899);
  set(state, 'feedPump', true);
  core.tick(state, 300);
  assert.equal(state.tachos.FAST, 900);
  assert.equal(state.feedPump, false);
  assert.ok(core.evaluate(state).alarms.some(message => /FAST/.test(message)));
});

test('vapor só aquece com nível, agitador, leitura e limite válidos; para no máximo', () => {
  const state = demo(); readyFeed(state);
  set(state, 'tempC', 89.9); set(state, 'steam', true);
  core.tick(state, 30);
  assert.equal(state.tempC, 90);
  assert.equal(state.steam, false);
  assert.equal(core.set(state, 'steam', true).ok, false);
  set(state, 'temperatureMinC', 95);
  assert.equal(core.evaluate(state).temperature.configured, false);
  assert.equal(core.evaluate(state).permissives.feedPump, false);
});

test('bombas de saída são exclusivas, requerem tacho e destino; totaliza somente saída', () => {
  const state = demo();
  assert.equal(core.set(state, 'outletPump', 1).ok, false);
  set(state, 'tachoFAST', 50);
  readyOutlet(state);
  set(state, 'outletPump', 1);
  core.tick(state, 30);
  closeTo(state.transferredTotalLiters, 20);
  closeTo(state.tachos.FAST, 30);
  set(state, 'outletPump', 2);
  assert.equal(state.outletPump, 2);
  core.tick(state, 60);
  closeTo(state.transferredTotalLiters, 50);
  closeTo(state.storageTotals[0], 50);
  assert.equal(state.inletTotalLiters, 0);
  assert.equal(state.outletPump, null);
  assert.equal(state.tachos.FAST, 0);
});

test('recirculação conserva volume e não incrementa produção ou tanques de destino', () => {
  const state = demo(); set(state, 'tachoFAST', 100); readyOutlet(state);
  set(state, 'outletDestination', 'RECIRCULACAO');
  set(state, 'outletPump', 1);
  core.tick(state, 60);
  closeTo(state.tankLiters, 9040);
  closeTo(state.tachos.FAST, 60);
  closeTo(state.recirculatedLiters, 40);
  assert.equal(state.transferredTotalLiters, 0);
  assert.ok(state.storageTotals.every(value => value === 0));
  set(state, 'tankLiters', 13500);
  assert.equal(state.outletPump, null);
});

test('balanço de volume da maquete conserva entrada, tanque, tachos e totalizador externo', () => {
  const state = demo(); readyFeed(state);
  const initial = state.tankLiters;
  set(state, 'inletFlowLpm', 10);
  set(state, 'feedPump', true);
  core.tick(state, 120);
  readyOutlet(state); set(state, 'outletPump', 1);
  core.tick(state, 120);
  const inventory = state.tankLiters + state.tachos.FAST + state.tachos.GRATE + state.transferredTotalLiters;
  closeTo(inventory, initial + state.inletTotalLiters);
});

test('stop desliga tudo e retornar ao modo real apaga todos os dados simulados', () => {
  const state = demo(); readyFeed(state); set(state, 'feedPump', true); set(state, 'steam', true);
  set(state, 'inletFlowLpm', 10); core.tick(state, 10);
  core.stop(state);
  assert.equal(state.running, false);
  for (const key of ['mixer','steam','feedPump','screw']) assert.equal(state[key], false);
  assert.equal(state.outletPump, null);
  assert.equal(state.inletFlowLpm, 0);
  assert.equal(state.selectedDecanter, null);
  const tank = state.tankLiters; core.tick(state, 20); assert.equal(state.tankLiters, tank);
  core.dispatch(state, { type: 'LIVE' });
  assert.equal(state.mode, 'LIVE');
  assert.equal(state.tankLiters, null);
  assert.equal(state.transferredTotalLiters, null);
  assert.equal(state.tachos.FAST, null);
});

test('valores inválidos não viram zero e snapshot não expõe referências mutáveis', () => {
  const state = demo();
  for (const [key,value] of [['tankLiters',NaN],['tankLiters',-1],['tempC','80'],['mixer',1],['selectedStorage',6],['outletPump',3],['tachoFAST',1001],['outletDestination','QUALQUER']]) {
    assert.equal(core.set(state, key, value).ok, false, key);
  }
  const before = core.snapshot(state);
  core.tick(state, -1); core.tick(state, Infinity); core.tick(state, 3601);
  assert.deepEqual(core.snapshot(state), before);
  const snapshot = core.snapshot(state);
  snapshot.tachos.FAST = 700;
  snapshot.switches[0] = false;
  assert.equal(state.tachos.FAST, 0);
  assert.equal(state.switches[0], true);
});

test('seleção aceita FAST, GRATE ou ambas e mantém uma única origem de transferência', () => {
  const state = demo();
  assert.deepEqual(core.selectedMachines(state), []);
  for (const [selection, expected] of [['FAST', ['FAST']], ['GRATE', ['GRATE']], ['AMBAS', ['FAST', 'GRATE']], [null, []]]) {
    set(state, 'selectedDecanter', selection);
    assert.deepEqual(core.selectedMachines(state), expected);
  }
  assert.equal(core.set(state, 'selectedDecanter', 'TODAS').ok, false);
  assert.equal(core.set(state, 'selectedTacho', 'AMBAS').ok, false);
  set(state, 'selectedDecanter', 'AMBAS');
  const machines = core.selectedMachines(state);
  machines.pop();
  assert.deepEqual(core.selectedMachines(state), ['FAST', 'GRATE']);
});

test('ambas dividem a vazão total igualmente depois de confirmar as duas prontas', () => {
  const state = demo(); readyFeed(state, 'AMBAS');
  set(state, 'readyGRATE', false);
  assert.equal(core.set(state, 'feedPump', true).ok, false);
  assert.deepEqual(core.evaluate(state).effective.feedMachines, { FAST: false, GRATE: false });
  set(state, 'readyGRATE', true);
  assert.equal(state.feedPump, false);
  set(state, 'feedPump', true);
  assert.deepEqual(core.evaluate(state).effective.feedMachines, { FAST: true, GRATE: true });
  core.tick(state, 60);
  closeTo(state.tankLiters, 8970);
  closeTo(state.tachos.FAST, 15);
  closeTo(state.tachos.GRATE, 15);
  assert.equal(state.transferredTotalLiters, 0);
  set(state, 'selectedDecanter', 'FAST');
  assert.equal(state.feedPump, false);
  set(state, 'feedPump', true);
  assert.deepEqual(core.evaluate(state).effective.feedMachines, { FAST: true, GRATE: false });
});

test('permissivo perdido em qualquer máquina para ambas e recuperar não rearma alimentação', () => {
  for (const name of ['FAST', 'GRATE']) {
    for (const [key, value, restore] of [['ready' + name, false, true], ['tacho' + name, 900, 200]]) {
      const state = demo(); readyFeed(state, 'AMBAS'); set(state, 'feedPump', true);
      set(state, key, value);
      assert.equal(state.feedPump, false);
      assert.deepEqual(core.evaluate(state).effective.feedMachines, { FAST: false, GRATE: false });
      const inventory = [state.tankLiters, state.tachos.FAST, state.tachos.GRATE];
      core.tick(state, 10);
      assert.deepEqual([state.tankLiters, state.tachos.FAST, state.tachos.GRATE], inventory);
      set(state, key, restore);
      assert.equal(core.evaluate(state).permissives.feedPump, true);
      assert.equal(state.feedPump, false);
    }
  }
});

test('limite de um tacho corta a divisão igualmente sem transbordar o outro nem perder volume', () => {
  const state = demo(); readyFeed(state, 'AMBAS');
  set(state, 'tachoFAST', 899.9); set(state, 'tachoGRATE', 100);
  const initial = state.tankLiters + state.tachos.FAST + state.tachos.GRATE;
  set(state, 'feedPump', true); core.tick(state, 120);
  closeTo(state.tachos.FAST, 900);
  closeTo(state.tachos.GRATE, 100.1);
  closeTo(state.tankLiters, 8999.8);
  closeTo(state.tankLiters + state.tachos.FAST + state.tachos.GRATE, initial);
  assert.equal(state.feedPump, false);
  set(state, 'tachoFAST', 100);
  assert.equal(state.feedPump, false);
});

test('alimentação dupla com transferência de uma origem conserva todos os inventários', () => {
  const state = demo(); readyFeed(state, 'AMBAS');
  const initial = state.tankLiters;
  set(state, 'inletFlowLpm', 12); set(state, 'feedPump', true);
  core.tick(state, 120);
  readyOutlet(state, 'FAST'); set(state, 'autoAlternatePump', true); set(state, 'outletPump', 1);
  core.tick(state, 90);
  closeTo(state.tachos.GRATE, 52.5);
  closeTo(state.tankLiters + state.tachos.FAST + state.tachos.GRATE + state.transferredTotalLiters,
    initial + state.inletTotalLiters);
  closeTo(state.storageTotals[0], state.transferredTotalLiters);
  assert.ok(state.storageTotals.slice(1).every(volume => volume === 0));
});

test('saída simultânea não rearma alimentação depois de um tacho atingir nível alto', () => {
  const state = demo(); readyFeed(state, 'AMBAS');
  set(state, 'tachoFAST', 899.9); readyOutlet(state);
  set(state, 'outletPump', 1); set(state, 'feedPump', true);
  const initial = state.tankLiters + state.tachos.FAST + state.tachos.GRATE;
  core.tick(state, 10);
  assert.ok(state.tachos.FAST < 900);
  assert.equal(core.evaluate(state).permissives.feedPump, true);
  assert.equal(state.feedPump, false);
  closeTo(state.tachos.GRATE, 0.1);
  closeTo(state.tankLiters + state.tachos.FAST + state.tachos.GRATE + state.transferredTotalLiters, initial);
});

test('misturadores dos tachos são independentes e exigem produto, sem rearme após secar', () => {
  const state = demo();
  for (const name of ['FAST', 'GRATE']) {
    assert.equal(core.set(state, 'mixer' + name, true).ok, false);
    assert.equal(state.tachoMixers[name], false);
    set(state, 'tacho' + name, 10);
    set(state, 'mixer' + name, true);
  }
  assert.deepEqual(core.evaluate(state).effective.tachoMixers, { FAST: true, GRATE: true });
  set(state, 'tachoFAST', 0);
  assert.deepEqual(core.evaluate(state).effective.tachoMixers, { FAST: false, GRATE: true });
  set(state, 'tachoFAST', 20);
  assert.equal(state.tachoMixers.FAST, false);
  const snapshot = core.snapshot(state);
  snapshot.tachoMixers.GRATE = false;
  snapshot.effective.tachoMixers.GRATE = false;
  assert.equal(state.tachoMixers.GRATE, true);
  core.stop(state);
  assert.deepEqual(state.tachoMixers, { FAST: false, GRATE: false });
  assert.deepEqual(core.evaluate(state).effective.tachoMixers, { FAST: false, GRATE: false });
});

test('modo sem hardware nunca informa movimentos reais das máquinas ou dos tachos', () => {
  const state = core.createState();
  state.selectedDecanter = 'AMBAS'; state.feedPump = true;
  state.tachoMixers = { FAST: true, GRATE: true };
  assert.deepEqual(core.evaluate(state).effective.feedMachines, { FAST: false, GRATE: false });
  assert.deepEqual(core.evaluate(state).effective.tachoMixers, { FAST: false, GRATE: false });
  assert.equal(core.set(state, 'mixerFAST', true).ok, false);
  assert.equal(core.set(state, 'autoAlternatePump', true).ok, false);
});

test('tacho sem leitura suspende alimentação dupla e seu misturador sem assumir volume zero', () => {
  const state = demo(); readyFeed(state, 'AMBAS');
  set(state, 'tachoGRATE', 100); set(state, 'mixerGRATE', true); set(state, 'feedPump', true);
  state.tachos.GRATE = null; // Ausência de leitura; nenhum volume é inventado para recuperá-la.
  core.tick(state, 1);
  assert.equal(state.tachos.GRATE, null);
  assert.equal(state.feedPump, false);
  assert.equal(state.tachoMixers.GRATE, false);
  assert.deepEqual(core.evaluate(state).effective.feedMachines, { FAST: false, GRATE: false });
  set(state, 'tachoGRATE', 100);
  assert.equal(state.feedPump, false);
  assert.equal(state.tachoMixers.GRATE, false);
});

test('alternância opcional usa sessenta segundos virtuais e depende da seleção explícita de bomba', () => {
  const state = demo(); set(state, 'tachoFAST', 500); readyOutlet(state);
  assert.equal(state.autoAlternatePump, false);
  assert.equal(state.pumpSwitchSeconds, 60);
  set(state, 'outletPump', 1); core.tick(state, 120);
  assert.equal(state.outletPump, 1);
  set(state, 'outletPump', null); set(state, 'autoAlternatePump', true);
  const before = state.transferredTotalLiters;
  core.tick(state, 120);
  assert.equal(state.outletPump, null);
  assert.equal(state.transferredTotalLiters, before);
  set(state, 'outletPump', 1);
  core.tick(state, 59.5); assert.equal(state.outletPump, 1);
  core.tick(state, 0.5); assert.equal(state.outletPump, 2);
  core.tick(state, 60); assert.equal(state.outletPump, 1);
  closeTo(state.transferredTotalLiters - before, 80);
});

test('alternância mantém só uma bomba efetiva e conserva a vazão durante várias trocas', () => {
  const state = demo(); set(state, 'tachoGRATE', 500); readyOutlet(state, 'GRATE');
  set(state, 'autoAlternatePump', true); set(state, 'outletPump', 2);
  const pumps = new Set();
  for (let second = 0; second < 240; second += 0.5) {
    const effective = core.evaluate(state).effective.outletPump;
    assert.ok(effective === 1 || effective === 2);
    pumps.add(effective);
    core.tick(state, 0.5);
  }
  assert.deepEqual([...pumps].sort(), [1, 2]);
  assert.equal(state.outletPump, 2);
  closeTo(state.transferredTotalLiters, 160);
  closeTo(state.tachos.GRATE, 340);
  assert.equal(state.tachos.FAST, 0);
});

test('desabilitar alternância conserva seleção manual e reabilitar reinicia seu relógio', () => {
  const state = demo(); set(state, 'tachoFAST', 500); readyOutlet(state);
  for (const key of ['mixerFAST', 'mixerGRATE', 'autoAlternatePump']) {
    assert.equal(core.set(state, key, 'true').ok, false);
  }
  set(state, 'autoAlternatePump', true); set(state, 'outletPump', 1); core.tick(state, 30);
  set(state, 'autoAlternatePump', false); core.tick(state, 120);
  assert.equal(state.outletPump, 1);
  assert.equal(state.pumpElapsedSeconds, 0);
  set(state, 'autoAlternatePump', true); core.tick(state, 59);
  assert.equal(state.outletPump, 1);
  core.tick(state, 1);
  assert.equal(state.outletPump, 2);
});

test('tacho seco desarma alternância e misturador sem rearmar quando chega produto', () => {
  const state = demo(); set(state, 'tachoFAST', 1); readyOutlet(state);
  set(state, 'mixerFAST', true); set(state, 'autoAlternatePump', true); set(state, 'outletPump', 1);
  core.tick(state, 180);
  assert.equal(state.tachos.FAST, 0);
  assert.equal(state.outletPump, null);
  assert.equal(state.pumpElapsedSeconds, 0);
  assert.equal(state.tachoMixers.FAST, false);
  closeTo(state.transferredTotalLiters, 1);
  set(state, 'tachoFAST', 100); core.tick(state, 120);
  assert.equal(state.outletPump, null);
  assert.equal(state.tachoMixers.FAST, false);
  closeTo(state.transferredTotalLiters, 1);
});

test('pausa elimina comandos ativos e retomada exige novo início deliberado', () => {
  const state = demo(); readyFeed(state, 'AMBAS');
  set(state, 'tachoFAST', 100); readyOutlet(state);
  set(state, 'mixerFAST', true); set(state, 'feedPump', true); set(state, 'steam', true);
  set(state, 'autoAlternatePump', true); set(state, 'outletPump', 1); set(state, 'inletFlowLpm', 10);
  core.tick(state, 20);
  core.dispatch(state, { type: 'PAUSE' });
  const inventory = [state.tankLiters, state.tachos.FAST, state.tachos.GRATE, state.transferredTotalLiters];
  core.tick(state, 120);
  core.dispatch(state, { type: 'RESUME' }); core.tick(state, 120);
  assert.deepEqual([state.tankLiters, state.tachos.FAST, state.tachos.GRATE, state.transferredTotalLiters], inventory);
  for (const key of ['mixer', 'steam', 'feedPump', 'screw']) assert.equal(state[key], false);
  assert.equal(state.outletPump, null);
  assert.equal(state.pumpElapsedSeconds, 0);
  assert.deepEqual(state.tachoMixers, { FAST: false, GRATE: false });
  assert.equal(state.inletFlowLpm, 0);
});

test('troca de origem e bloqueio de recirculação não são contornados pela alternância', () => {
  const state = demo(); set(state, 'tachoFAST', 300); set(state, 'tachoGRATE', 100); readyOutlet(state);
  set(state, 'autoAlternatePump', true); set(state, 'outletPump', 1); core.tick(state, 30);
  set(state, 'selectedTacho', 'GRATE');
  assert.equal(state.outletPump, null);
  assert.equal(state.pumpElapsedSeconds, 0);
  core.tick(state, 90); assert.equal(state.tachos.GRATE, 100);
  set(state, 'outletDestination', 'RECIRCULACAO'); set(state, 'outletPump', 2);
  set(state, 'tankLiters', 13500);
  assert.equal(state.outletPump, null);
  set(state, 'tankLiters', 9000); core.tick(state, 90);
  assert.equal(state.outletPump, null);
  assert.equal(state.recirculatedLiters, 0);
});
