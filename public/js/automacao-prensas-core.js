/* Maquete das prensas: estado estritamente local, sem rede, GPIO, CLP ou persistência. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AutomacaoPrensasCore = api;
})(typeof window === 'undefined' ? null : window, () => {
  'use strict';
  const MACHINES = Object.freeze(['FAST', 'P50', 'P46']);
  function createState() {
    return { mode: 'LIVE', running: false, seconds: 0, selected: 'TOLVA',
      mixers: false, cakeScrew: false, returnScrew: false,
      presses: { FAST: false, P50: false, P46: false },
      gates: { FAST: false, P50: false, P46: false } };
  }
  function start(state) {
    Object.assign(state, createState(), {
      mode: 'SIMULACAO', running: true, mixers: true, cakeScrew: true,
      presses: { FAST: true, P50: true, P46: true },
      gates: { FAST: true, P50: true, P46: true }
    });
    return snapshot(state);
  }
  function pause(state) {
    if (state.mode === 'SIMULACAO') state.running = false;
    return snapshot(state);
  }
  function resume(state) {
    if (state.mode === 'SIMULACAO') state.running = true;
    return snapshot(state);
  }
  function reset(state) {
    Object.assign(state, createState());
    return snapshot(state);
  }
  function change(state, type, key, enabled) {
    if (state.mode !== 'SIMULACAO') return snapshot(state);
    if (type === 'gate' && MACHINES.includes(key)) state.gates[key] = Boolean(enabled);
    else if (type === 'press' && MACHINES.includes(key)) state.presses[key] = Boolean(enabled);
    else if (type === 'return') state.returnScrew = Boolean(enabled);
    else if (type === 'mixer') state.mixers = Boolean(enabled);
    else if (type === 'cake') state.cakeScrew = Boolean(enabled);
    return snapshot(state);
  }
  function select(state, key) {
    if (['PERCOLADORA','TOLVA', 'CAKE', 'RETURN', 'OIL', ...MACHINES, ...MACHINES.map(id=>'PUMP_'+id), ...MACHINES.map(id=>'GATE_'+id)].includes(key)) state.selected = key;
    return snapshot(state);
  }
  function tick(state, seconds = 1) {
    if (state.mode === 'SIMULACAO' && state.running && Number.isFinite(seconds) && seconds > 0)
      state.seconds += Math.min(seconds, 60);
    return snapshot(state);
  }
  function snapshot(state) {
    const active = state.mode === 'SIMULACAO' && state.running;
    const mixing = active && state.mixers;
    const presses = {};
    const feed = {};
    const oilPumps = {};
    const guillotines = {};
    for (const id of MACHINES) {
      presses[id] = active && state.presses[id];
      guillotines[id] = active && state.gates[id];
      feed[id] = mixing && presses[id] && guillotines[id];
      oilPumps[id] = presses[id] && feed[id];
    }
    const cakeScrew = active && state.cakeScrew && MACHINES.some(id => feed[id]);
    const returnScrew = cakeScrew && state.returnScrew && feed.P46;
    return { mode: state.mode, running: active, seconds: state.seconds, selected: state.selected,
      mixing, mixers: mixing, presses, guillotines, feed, oilPumps,
      cakeScrew, returnScrew, valvesKnown: false, realSensors: null,
      physicalCommands: false, equipmentConnected: false };
  }
  return { MACHINES, createState, start, pause, resume, reset, change, select, tick, snapshot };
});
