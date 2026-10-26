/* Circuito mecânico ilustrativo e local. Independente da simulação térmica. */
(function (root) {
  'use strict';
  const DIGESTORS = Object.freeze(['D1', 'D2', 'D3', 'D4']);
  // Todos os valores abaixo são exemplos da maquete, sem medição ou receita industrial.
  const EXAMPLE = Object.freeze({ tachoCapacityLiters: 1000, chargeLiters: 600, liquidFraction: 0.25,
    loadSeconds: 6, mixSeconds: 10, dischargeSeconds: 8, transferSeconds: 12 });
  const STAGES = Object.freeze(['CARGA', 'MISTURA', 'DESCARGA', 'TRANSFERENCIA']);
  const DURATIONS = Object.freeze({ CARGA: EXAMPLE.loadSeconds, MISTURA: EXAMPLE.mixSeconds,
    DESCARGA: EXAMPLE.dischargeSeconds, TRANSFERENCIA: EXAMPLE.transferSeconds });
  const PHASE_LABELS = Object.freeze({ SEM_SINAL: 'Sem sinal mecânico', CARGA: 'Carga virtual', MISTURA: 'Mistura virtual',
    DESCARGA: 'Descarga virtual', TRANSFERENCIA: 'Transferência virtual', PARADO: 'Maquete parada', CONCLUIDO: 'Demonstração concluída' });
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const selectedDigestors = selection => selection === 'TODOS' ? DIGESTORS.slice() : DIGESTORS.includes(selection) ? [selection] : [];

  function createState() {
    return { mode: 'LIVE', running: false, paused: false, seconds: 0, selection: null, queue: [], completed: [],
      activeDigestor: null, stage: 'SEM_SINAL', stageSeconds: 0, stageDurationSeconds: null,
      feedAuger: null, gates: Array(4).fill(null),
      digestors: DIGESTORS.map(() => ({ tempC: null, shaft: null, loading: null, discharging: null, chargeLiters: null })),
      percolator: null, tachoMixer: null, pump: null, tachoLiters: null, tachoCapacityLiters: null,
      collectedLiters: null, transferredLiters: null, illustrative: true };
  }
  function clearCommands(state) {
    state.feedAuger = false;
    state.gates = Array(4).fill(false);
    state.digestors.forEach(unit => { unit.shaft = false; unit.loading = false; unit.discharging = false; });
    state.percolator = false;
    state.tachoMixer = false;
    state.pump = false;
  }
  function applyStage(state) {
    clearCommands(state);
    const index = DIGESTORS.indexOf(state.activeDigestor);
    if (index < 0 || !STAGES.includes(state.stage)) return;
    if (state.stage === 'CARGA') {
      state.feedAuger = true;
      state.gates[index] = true;
      state.digestors[index].loading = true;
    } else if (state.stage === 'MISTURA') state.digestors[index].shaft = true;
    else if (state.stage === 'DESCARGA') {
      state.digestors[index].discharging = true;
      state.percolator = true;
      state.tachoMixer = state.tachoLiters > 0;
    } else if (state.stage === 'TRANSFERENCIA') {
      state.tachoMixer = state.tachoLiters > 0;
      state.pump = state.tachoLiters > 0;
    }
  }
  function startDemo(state, selection = 'TODOS') {
    const queue = selectedDigestors(selection);
    if (!queue.length) return { ok: false, reason: 'Selecione D1, D2, D3, D4 ou todos.' };
    Object.assign(state, createState(), { mode: 'SIMULACAO', running: true, selection, queue,
      activeDigestor: queue[0], stage: 'CARGA', stageDurationSeconds: DURATIONS.CARGA,
      tachoLiters: 0, tachoCapacityLiters: EXAMPLE.tachoCapacityLiters, collectedLiters: 0, transferredLiters: 0,
      digestors: DIGESTORS.map(() => ({ tempC: null, shaft: false, loading: false, discharging: false, chargeLiters: 0 })) });
    applyStage(state);
    return { ok: true };
  }
  function nextStage(state) {
    const next = STAGES.indexOf(state.stage) + 1;
    state.stageSeconds = 0;
    if (next < STAGES.length) state.stage = STAGES[next];
    else {
      state.completed.push(state.activeDigestor);
      const nextUnit = state.queue[state.completed.length];
      if (!nextUnit) {
        state.stage = 'CONCLUIDO';
        state.stageDurationSeconds = null;
        state.activeDigestor = null;
        state.running = false;
        state.paused = false;
        clearCommands(state);
        return;
      }
      state.activeDigestor = nextUnit;
      state.stage = 'CARGA';
    }
    state.stageDurationSeconds = DURATIONS[state.stage];
    applyStage(state);
  }
  function tick(state, elapsedSeconds) {
    if (state.mode !== 'SIMULACAO' || state.running !== true || !finite(elapsedSeconds) || elapsedSeconds <= 0) return state;
    let remaining = Math.min(elapsedSeconds, 3600);
    while (remaining > 0.0000001 && state.running && STAGES.includes(state.stage)) {
      const step = Math.min(remaining, Math.max(0, state.stageDurationSeconds - state.stageSeconds));
      if (step <= 0.0000001) { nextStage(state); continue; }
      const unit = state.digestors[DIGESTORS.indexOf(state.activeDigestor)];
      if (state.stage === 'CARGA') unit.chargeLiters = Math.min(EXAMPLE.chargeLiters, unit.chargeLiters + EXAMPLE.chargeLiters / EXAMPLE.loadSeconds * step);
      else if (state.stage === 'DESCARGA') {
        const charge = Math.min(unit.chargeLiters, EXAMPLE.chargeLiters / EXAMPLE.dischargeSeconds * step);
        const collected = Math.min(state.tachoCapacityLiters - state.tachoLiters, charge * EXAMPLE.liquidFraction);
        unit.chargeLiters = Math.max(0, unit.chargeLiters - charge);
        state.tachoLiters += collected;
        state.collectedLiters += collected;
      } else if (state.stage === 'TRANSFERENCIA') {
        const transferred = Math.min(state.tachoLiters, EXAMPLE.chargeLiters * EXAMPLE.liquidFraction / EXAMPLE.transferSeconds * step);
        state.tachoLiters = Math.max(0, state.tachoLiters - transferred);
        state.transferredLiters += transferred;
      }
      state.stageSeconds += step;
      state.seconds += step;
      remaining -= step;
      applyStage(state);
      if (state.stageSeconds >= state.stageDurationSeconds - 0.0000001) nextStage(state);
    }
    return state;
  }
  function pause(state) {
    if (state.mode === 'SIMULACAO' && state.running === true) { state.running = false; state.paused = true; }
    return state;
  }
  function resume(state) {
    if (state.mode === 'SIMULACAO' && state.paused === true && STAGES.includes(state.stage)) { state.running = true; state.paused = false; }
    return state;
  }
  function stop(state) {
    if (state.mode !== 'SIMULACAO') return state;
    clearCommands(state);
    Object.assign(state, { running: false, paused: false, stage: 'PARADO', stageSeconds: 0,
      stageDurationSeconds: null, activeDigestor: null, queue: [] });
    return state;
  }
  function returnLive(state) {
    Object.assign(state, createState());
    return state;
  }
  function snapshot(state) {
    const current = clone(state.mode === 'SIMULACAO' ? state : createState());
    current.phaseLabel = PHASE_LABELS[current.stage] || 'Sem sinal mecânico';
    current.selectionLabel = current.selection === 'TODOS' ? 'D1 → D2 → D3 → D4' : current.selection || 'Sem seleção virtual';
    current.quality = current.mode === 'SIMULACAO' ? 'Simulação local · volumes e tempos ilustrativos' : 'Sem sinal mecânico · aguardando instrumentação';
    return current;
  }
  const api = { DIGESTORS, EXAMPLE, STAGES, PHASE_LABELS, createState, selectedDigestors,
    startDemo, tick, pause, resume, stop, returnLive, snapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AutomacaoDigestoresCircuitoCore = api;
})(typeof window !== 'undefined' ? window : null);
