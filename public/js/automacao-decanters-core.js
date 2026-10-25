/* Modelo didático local. Não publica comandos, leituras ou produção no CAD/CLP. */
(function (root) {
  'use strict';

  const CAPACITY_LITERS = 15000;
  const TACHO_CAPACITY_LITERS = 1000; // Apenas maquete: capacidade real ainda não levantada.
  const SENSOR_POINTS = Object.freeze([
    Object.freeze({ tag: 'LSL', percent: 10, liters: 1500 }),
    Object.freeze({ tag: 'LS2', percent: 25, liters: 3750 }),
    Object.freeze({ tag: 'LS3', percent: 50, liters: 7500 }),
    Object.freeze({ tag: 'LS4', percent: 75, liters: 11250 }),
    Object.freeze({ tag: 'LSH', percent: 90, liters: 13500 }),
  ]);
  const MACHINES = ['FAST', 'GRATE'];
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const clone = value => JSON.parse(JSON.stringify(value));

  function sensorsFromVolume(liters) {
    if (!finite(liters) || liters < 0 || liters > CAPACITY_LITERS) return Array(5).fill(null);
    return SENSOR_POINTS.map(point => liters >= point.liters);
  }

  // Cinco chaves apontam uma faixa. Não há interpolação de um volume medido.
  // A relação altura/volume precisa de arqueação antes de uso em campo.
  function levelFromSwitches(switches) {
    if (!Array.isArray(switches) || switches.length !== 5 || switches.some(value => typeof value !== 'boolean')) {
      return { status: 'SEM_SINAL', minLiters: null, maxLiters: null, percentMin: null, percentMax: null, switches: Array(5).fill(null) };
    }
    const firstDry = switches.indexOf(false);
    if (firstDry !== -1 && switches.slice(firstDry).some(Boolean)) {
      return { status: 'INCONSISTENTE', minLiters: null, maxLiters: null, percentMin: null, percentMax: null, switches: switches.slice() };
    }
    const count = firstDry === -1 ? 5 : firstDry;
    const minLiters = count ? SENSOR_POINTS[count - 1].liters : 0;
    const maxLiters = count < 5 ? SENSOR_POINTS[count].liters : CAPACITY_LITERS;
    return { status: 'VALIDO', minLiters, maxLiters, percentMin: minLiters / CAPACITY_LITERS * 100,
      percentMax: maxLiters / CAPACITY_LITERS * 100, switches: switches.slice() };
  }

  function createState() {
    return { mode: 'LIVE', running: false, seconds: 0, tankLiters: null, tempC: null,
      switches: Array(5).fill(null), temperatureMinC: null, temperatureMaxC: null,
      mixer: false, steam: false, feedPump: false, screw: false, selectedDecanter: null,
      decanterReady: { FAST: false, GRATE: false }, outletPump: null, selectedTacho: null,
      selectedStorage: null, outletDestination: 'ARMAZENAMENTO', tachos: { FAST: null, GRATE: null },
      // FT-OUT totaliza transferência. Estoque anterior impede chamar isto de produção.
      inletFlowLpm: 0, inletTotalLiters: null, transferredTotalLiters: null, recirculatedLiters: null,
      feedFlowLpm: 30, outletFlowLpm: 40, levelFault: null, pt100Fault: false,
      storageTotals: [null, null, null, null, null] };
  }

  // As funções modificam a mesma instância; todos os dados se perdem ao sair da página.
  function startDemo(state) {
    Object.assign(state, createState(), { mode: 'SIMULACAO', running: true, tankLiters: 9000, tempC: 45,
      switches: sensorsFromVolume(9000), tachos: { FAST: 0, GRATE: 0 },
      inletTotalLiters: 0, transferredTotalLiters: 0, recirculatedLiters: 0, storageTotals: [0, 0, 0, 0, 0] });
    return state;
  }

  function stop(state) {
    state.running = false;
    state.mixer = false;
    state.steam = false;
    state.feedPump = false;
    state.screw = false;
    state.outletPump = null;
    state.inletFlowLpm = 0;
    state.selectedDecanter = null;
    state.decanterReady = { FAST: false, GRATE: false };
    return state;
  }

  function levelFor(state) {
    if (state.mode !== 'SIMULACAO' || state.levelFault === 'SEM_SINAL') return levelFromSwitches(null);
    if (state.levelFault === 'INCONSISTENTE') return levelFromSwitches([false, true, false, false, false]);
    return levelFromSwitches(state.switches);
  }

  function evaluate(state) {
    const demo = state.mode === 'SIMULACAO';
    const level = levelFor(state);
    const tempValid = demo && !state.pt100Fault && finite(state.tempC);
    const configured = finite(state.temperatureMinC) && finite(state.temperatureMaxC)
      && state.temperatureMinC < state.temperatureMaxC;
    const inRange = tempValid && configured && state.tempC >= state.temperatureMinC && state.tempC <= state.temperatureMaxC;
    const low = level.status === 'VALIDO' && level.switches[0] === false;
    const high = level.status === 'VALIDO' && level.switches[4] === true;
    const reasons = { mixer: [], steam: [], feedPump: [], outletPump: [], admission: [] };
    const requireAll = (condition, keys, message) => { if (!condition) keys.forEach(key => reasons[key].push(message)); };
    requireAll(demo, Object.keys(reasons), 'Sem hardware conectado; comandos reais indisponíveis.');
    requireAll(demo && state.running, Object.keys(reasons), 'Inicie ou retome a simulação local.');
    requireAll(level.status === 'VALIDO', ['mixer', 'steam', 'feedPump', 'admission'], level.status === 'INCONSISTENTE' ? 'Sensores de nível incoerentes.' : 'Nível sem sinal.');
    requireAll(!low, ['mixer', 'steam', 'feedPump'], 'Nível abaixo do sensor mínimo LSL.');
    requireAll(!high, ['admission'], 'Nível alto LSH: interromper entrada.');
    requireAll(tempValid, ['steam', 'feedPump'], 'PT100 sem leitura válida.');
    requireAll(configured, ['steam', 'feedPump'], 'Defina a faixa térmica da demonstração.');
    requireAll(!tempValid || !configured || state.tempC < state.temperatureMaxC, ['steam'], 'Limite térmico superior atingido.');
    requireAll(state.mixer, ['steam', 'feedPump'], 'Homogeneizador simulado parado.');
    requireAll(inRange, ['feedPump'], 'Temperatura fora da faixa configurada.');
    requireAll(MACHINES.includes(state.selectedDecanter), ['feedPump'], 'Selecione FAST ou GRATE.');
    requireAll(Boolean(state.selectedDecanter && state.decanterReady[state.selectedDecanter]), ['feedPump'], 'Decanter selecionada sem confirmação simulada de pronta.');
    requireAll(state.screw, ['feedPump'], 'Rosca de borra simulada parada.');
    const targetTacho = state.selectedDecanter && state.tachos[state.selectedDecanter];
    requireAll(finite(targetTacho) && targetTacho < TACHO_CAPACITY_LITERS * 0.9, ['feedPump'], 'Tacho sem leitura ou no limite alto da maquete.');
    const sourceTacho = state.selectedTacho && state.tachos[state.selectedTacho];
    requireAll(MACHINES.includes(state.selectedTacho) && finite(sourceTacho) && sourceTacho > 0, ['outletPump'], 'Selecione um tacho com volume simulado disponível.');
    if (state.outletDestination === 'RECIRCULACAO') {
      requireAll(level.status === 'VALIDO' && !high, ['outletPump'], 'Recirculação bloqueada por nível alto ou indisponível.');
    } else {
      requireAll(Number.isInteger(state.selectedStorage) && state.selectedStorage >= 1 && state.selectedStorage <= 5,
        ['outletPump'], 'Selecione um dos cinco destinos futuros da maquete.');
    }
    const permissives = Object.fromEntries(Object.entries(reasons).map(([key, value]) => [key, value.length === 0]));
    const alarms = [];
    if (demo) {
      if (level.status !== 'VALIDO') alarms.push(level.status === 'INCONSISTENTE' ? 'Nível: combinação incoerente de sensores.' : 'Nível sem sinal.');
      if (low) alarms.push('Nível mínimo: alimentação, vapor e agitador inibidos na maquete.');
      if (high) alarms.push('Nível alto: entrada e recirculação inibidas na maquete.');
      if (!tempValid) alarms.push('PT100 simulado indisponível.');
      if (tempValid && configured && state.tempC > state.temperatureMaxC) alarms.push('Temperatura acima da faixa de demonstração.');
      MACHINES.forEach(name => { if (finite(state.tachos[name]) && state.tachos[name] >= TACHO_CAPACITY_LITERS * 0.9) alarms.push('Tacho ' + name + ': nível alto simulado.'); });
    }
    return { level, temperature: { status: tempValid ? 'SIMULADO' : 'SEM_SINAL', configured, inRange,
      value: tempValid ? state.tempC : null }, permissives, reasons, alarms,
      effective: { mixer: Boolean(state.mixer && permissives.mixer), steam: Boolean(state.steam && permissives.steam),
        feedPump: Boolean(state.feedPump && permissives.feedPump), screw: Boolean(demo && state.running && state.screw),
        outletPump: permissives.outletPump ? state.outletPump : null } };
  }

  function reconcile(state) {
    const status = evaluate(state);
    ['mixer', 'steam', 'feedPump'].forEach(key => { if (!status.permissives[key]) state[key] = false; });
    if (!status.permissives.outletPump) state.outletPump = null;
    if (!status.permissives.admission) state.inletFlowLpm = 0;
    return evaluate(state);
  }

  function set(state, key, value) {
    if (state.mode !== 'SIMULACAO') return { ok: false, reason: 'Controles disponíveis somente na simulação local.' };
    const booleans = ['mixer', 'steam', 'feedPump', 'screw', 'pt100Fault', 'readyFAST', 'readyGRATE'];
    const nonnegative = ['tankLiters', 'inletFlowLpm', 'tachoFAST', 'tachoGRATE'];
    const thermal = ['tempC', 'temperatureMinC', 'temperatureMaxC'];
    let valid = false;
    if (booleans.includes(key)) valid = typeof value === 'boolean';
    if (nonnegative.includes(key)) valid = finite(value) && value >= 0 && value <= (key === 'tankLiters' ? CAPACITY_LITERS : 1000);
    if (thermal.includes(key)) valid = value === null || finite(value) && value >= -50 && value <= 200;
    if (['selectedDecanter', 'selectedTacho'].includes(key)) valid = value === null || MACHINES.includes(value);
    if (key === 'outletPump') valid = value === null || value === 1 || value === 2;
    if (key === 'selectedStorage') valid = value === null || Number.isInteger(value) && value >= 1 && value <= 5;
    if (key === 'outletDestination') valid = ['ARMAZENAMENTO', 'RECIRCULACAO'].includes(value);
    if (key === 'levelFault') valid = [null, 'SEM_SINAL', 'INCONSISTENTE'].includes(value);
    if (!valid) return { ok: false, reason: 'Valor de demonstração inválido.' };
    const previous = clone(state);
    if (key === 'readyFAST' || key === 'readyGRATE') state.decanterReady[key.slice(5)] = value;
    else if (key === 'tachoFAST' || key === 'tachoGRATE') state.tachos[key.slice(5)] = value;
    else state[key] = value;
    if (key === 'tankLiters') state.switches = sensorsFromVolume(value);
    // Toda troca da linha de alimentação exige novo início deliberado da bomba.
    if (key === 'selectedDecanter' && previous.selectedDecanter !== value) state.feedPump = false;
    if (['selectedTacho', 'selectedStorage', 'outletDestination'].includes(key) && previous[key] !== value) state.outletPump = null;
    const status = reconcile(state);
    const requestedOn = value === true || key === 'outletPump' && value !== null || key === 'inletFlowLpm' && value > 0;
    if (requestedOn && Object.hasOwn(status.permissives, key) && !status.permissives[key]) {
      return { ok: false, reason: status.reasons[key].join(' ') };
    }
    if (key === 'inletFlowLpm' && value > 0 && !status.permissives.admission) return { ok: false, reason: status.reasons.admission.join(' ') };
    return { ok: true, reason: '' };
  }

  function tick(state, seconds) {
    if (state.mode !== 'SIMULACAO' || !state.running || !finite(seconds) || seconds <= 0 || seconds > 3600) return state;
    // Subpassos evitam ultrapassar LSL/LSH/limites dos tachos em um salto de relógio.
    let remaining = seconds;
    while (remaining > 0) {
      const delta = Math.min(1, remaining);
      const status = reconcile(state);
      state.seconds += delta;
      if (status.effective.steam) state.tempC = Math.min(state.temperatureMaxC, state.tempC + delta * 0.08);
      if (state.inletFlowLpm > 0 && status.permissives.admission) {
        const volume = Math.min(state.inletFlowLpm * delta / 60, SENSOR_POINTS[4].liters - state.tankLiters);
        state.tankLiters += Math.max(0, volume);
        state.inletTotalLiters += Math.max(0, volume);
      }
      if (status.effective.feedPump) {
        const name = state.selectedDecanter;
        const volume = Math.min(state.feedFlowLpm * delta / 60,
          Math.max(0, state.tankLiters - SENSOR_POINTS[0].liters), Math.max(0, TACHO_CAPACITY_LITERS * 0.9 - state.tachos[name]));
        state.tankLiters -= volume;
        state.tachos[name] += volume;
        if (state.tankLiters <= SENSOR_POINTS[0].liters) state.feedPump = false;
      }
      if (status.effective.outletPump) {
        const name = state.selectedTacho;
        const room = state.outletDestination === 'RECIRCULACAO' ? Math.max(0, SENSOR_POINTS[4].liters - state.tankLiters) : Infinity;
        const volume = Math.min(state.outletFlowLpm * delta / 60, state.tachos[name], room);
        state.tachos[name] -= volume;
        if (state.outletDestination === 'RECIRCULACAO') {
          state.tankLiters += volume;
          state.recirculatedLiters += volume;
        } else {
          state.transferredTotalLiters += volume;
          state.storageTotals[state.selectedStorage - 1] += volume;
        }
      }
      state.switches = sensorsFromVolume(state.tankLiters);
      remaining -= delta;
    }
    reconcile(state);
    return state;
  }

  function snapshot(state) { return { ...clone(state), ...evaluate(state) }; }
  function dispatch(state, action) {
    if (!action || typeof action !== 'object') return { ok: false, reason: 'Ação inválida.' };
    if (action.type === 'START_DEMO') { startDemo(state); return { ok: true, reason: '' }; }
    if (action.type === 'STOP') { stop(state); return { ok: true, reason: '' }; }
    if (action.type === 'LIVE') { Object.assign(state, createState()); return { ok: true, reason: '' }; }
    if (action.type === 'PAUSE') { state.running = false; return { ok: true, reason: '' }; }
    if (action.type === 'RESUME' && state.mode === 'SIMULACAO') { state.running = true; reconcile(state); return { ok: true, reason: '' }; }
    if (action.type === 'SET') return set(state, action.key, action.value);
    return { ok: false, reason: 'Ação inválida.' };
  }

  const api = { CAPACITY_LITERS, TACHO_CAPACITY_LITERS, SENSOR_POINTS, createState, startDemo, stop,
    set, tick, evaluate, snapshot, dispatch, sensorsFromVolume, levelFromSwitches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AutomacaoDecantersCore = api;
})(typeof window === 'undefined' ? null : window);
