(function (root) {
  'use strict';
  const fmt = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—';
  const names = {
    feedAuger: ['Rosca comum de alimentação', 'Alimentação superior dos quatro digestores. A rotação e a vazão reais ainda não são informadas ao circuito.'],
    percolator: ['Percoladora', 'Caixa sob as descargas frontais, com rosca interna de transporte. A saída à direita marca a expansão para as prensas.'],
    tacho: ['Tacho coletor à esquerda', 'Recolhe o líquido sob a percoladora. Geometria e capacidade são ilustrativas; nível físico ainda não integrado.'],
    tachoMixer: ['Mexedor do tacho', 'Eixo central representado no tacho coletor. Movimento não comprova a homogeneidade do sebo.'],
    pump: ['Bomba de sebo', 'Transfere o líquido do tacho ao limite do circuito dos decanters. Não aciona bombas ou equipamentos físicos.'],
    serviceTankBoundary: ['Limite · tanque de serviço dos decanters', 'Continuação para a página de decanters. O total da sessão representa apenas uma transferência virtual, sem alterar outra tela.'],
    gasHeader: ['Coletor comum de gases', 'Referência física comum atrás dos digestores. Vazão, pressão, composição e estado real não estão integrados.']
  };
  for (let index = 1; index <= 4; index++) {
    names['digestor' + index] = ['Digestor D' + index, 'Digestor horizontal elevado, com entrada superior e descarga frontal para a percoladora. A temperatura continua no painel térmico existente.'];
    names['gate' + index] = ['Guilhotina pneumática D' + index, 'Entrada superior individual. Posição na maquete não é retorno físico nem comando para o cilindro pneumático.'];
    names['dischargeGate' + index] = ['Guilhotina frontal D' + index, 'Descarga virtual para a percoladora. Posição gráfica não equivale a sensor de fim de curso nem comanda a bobina.'];
  }
  function activeFor(key, s) {
    if (s.mode !== 'SIMULACAO' || !s.running) return false;
    if (/^digestor[1-4]$/.test(key)) {
      const unit = s.digestors[Number(key.slice(-1)) - 1];
      return Boolean(unit.shaft || unit.loading || unit.discharging);
    }
    if (/^gate[1-4]$/.test(key)) return s.gates[Number(key.slice(-1)) - 1] === true;
    if (/^dischargeGate[1-4]$/.test(key)) return s.dischargeGates?.[Number(key.slice(-1)) - 1] === true;
    if (key === 'serviceTankBoundary') return s.pump === true && s.tachoLiters > 0;
    if (key === 'gasHeader') return false;
    return s[key] === true;
  }
  function detailsFor(key, s) {
    const item = names[key] || names.digestor1;
    const sim = s.mode === 'SIMULACAO';
    const state = active => !sim ? 'Sem sinal' : s.paused ? 'Pausado · simulado' : active ? 'Ativo · simulado' : 'Parado · simulado';
    let rows = [];
    if (/^digestor[1-4]$/.test(key)) {
      const unit = s.digestors[Number(key.slice(-1)) - 1];
      rows = [['Eixo', state(unit.shaft)], ['Carga / descarga', !sim ? 'Sem sinal' : unit.loading ? 'Carga virtual' : unit.discharging ? 'Descarga virtual' : 'Sem fluxo virtual'],
        ['Temperatura', 'Consultar painel térmico'], ['Volume na maquete', sim ? fmt(unit.chargeLiters) + ' L · ilustrativo' : 'Sem sinal'], ['Capacidade real', 'A levantar']];
    } else if (/^gate[1-4]$/.test(key)) rows = [['Posição', !sim ? 'Sem sinal' : s.gates[Number(key.slice(-1)) - 1] ? 'Aberta · simulada' : 'Fechada · simulada'], ['Retorno físico', 'Não integrado'], ['Comando industrial', 'Indisponível neste circuito']];
    else if (/^dischargeGate[1-4]$/.test(key)) rows = [['Posição', !sim ? 'Sem sinal' : s.dischargeGates?.[Number(key.slice(-1)) - 1] ? 'Aberta · simulada' : 'Fechada · simulada'], ['Bobina real', 'Não conectada'], ['Retorno de fim de curso', 'Não integrado']];
    else if (key === 'tacho') rows = [['Volume', sim ? fmt(s.tachoLiters) + ' L · ilustrativo' : 'Sem sinal'], ['Capacidade da maquete', sim ? fmt(s.tachoCapacityLiters) + ' L · ilustrativa' : 'Não aplicada'], ['Capacidade real', 'A levantar'], ['Nível físico', 'Não integrado']];
    else if (key === 'serviceTankBoundary') rows = [['Transferido nesta sessão', sim ? fmt(s.transferredLiters) + ' L · virtual' : 'Sem sinal'], ['Produção apurada', 'Não inferida pela maquete'], ['Próxima área', 'Decanters e tanque de serviço']];
    else if (key === 'gasHeader') rows = [['Fluxo / pressão', 'Sem sinal'], ['Representação', 'Estática · sem estado inferido']];
    else rows = [['Movimento na maquete', state(activeFor(key, s))], ['Retorno físico', 'Não integrado'],
      ...(key === 'tachoMixer' ? [['Homogeneidade do sebo', 'Não avaliada']] : [])];
    return { title: item[0], description: item[1], quality: s.quality, rows };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { detailsFor, activeFor };
  if (!root || typeof document === 'undefined') return;
  const panel = document.getElementById('digestores-circuito-panel');
  const Core = root.AutomacaoDigestoresCircuitoCore;
  if (!panel || !Core) return;
  const controls = panel.dataset.controls === 'true';
  const state = Core.createState();
  let linked = false;
  let thermalStates = Array(4).fill('DESLIGADO');
  const media = root.matchMedia?.('(prefers-reduced-motion: reduce)');
  let motion = !media?.matches;
  let selected = 'digestor1';
  const initialSpeed = Number(document.getElementById('digestores-circuito-speed')?.value);
  let speed = [1, 3, 8].includes(initialSpeed) ? initialSpeed : 1;
  let unavailable = false;
  let threeReady = false;
  let requestedView = '3d';
  const send = (name, detail) => root.dispatchEvent(new CustomEvent('digestores-circuito:' + name, { detail }));
  const role = key => panel.querySelector('[data-circuito-role="' + key + '"]');
  const text = (key, value) => { const element = role(key); if (element) element.textContent = value; };
  const action = key => panel.querySelector('[data-circuito-action="' + key + '"]');
  function applyThermal(detail) {
    const allowed = new Set(['VERDE', 'AMARELO', 'VERMELHO', 'VERMELHO_PISCANDO']);
    thermalStates = Array.from({ length: 4 }, (_, index) => allowed.has(detail?.states?.[index]) ? detail.states[index] : 'DESLIGADO');
    panel.querySelectorAll('[data-circuito-tower]').forEach(element => {
      const id = Number(element.dataset.circuitoTower);
      element.dataset.thermal = Number.isInteger(id) && id >= 1 && id <= 4 ? thermalStates[id - 1] : 'DESLIGADO';
    });
  }
  root.addEventListener('digestores-circuito:thermal', event => applyThermal(event.detail));
  applyThermal(root.CGDThermalState);
  function renderDetail(s) {
    const detail = detailsFor(selected, s);
    text('title', detail.title);
    text('description', detail.description);
    text('status', detail.quality);
    const rows = role('rows');
    if (rows) rows.replaceChildren(...detail.rows.map(([label, value]) => {
      const row = document.createElement('div');
      const title = document.createElement('dt');
      const description = document.createElement('dd');
      title.textContent = label;
      description.textContent = value;
      row.append(title, description);
      return row;
    }));
  }
  function selectEquipment(key) {
    if (!Object.hasOwn(names, key)) return;
    selected = key;
    panel.querySelectorAll('[data-circuito-equipment]').forEach(element => {
      const isSelected = element.dataset.circuitoEquipment === key;
      element.classList.toggle('is-selected', isSelected);
      element.setAttribute('aria-pressed', String(isSelected));
    });
    renderDetail(Core.snapshot(state));
    send('select', { key });
  }
  function render() {
    const s = Core.snapshot(state);
    panel.dataset.running = String(s.running);
    panel.dataset.motion = String(motion && !media?.matches);
    panel.dataset.mode = s.mode;
    text('mode', s.mode === 'SIMULACAO' ? linked ? 'SIMULAÇÃO INTEGRADA · ELÉTRICA + MECÂNICA' : 'SIMULAÇÃO LOCAL' : 'SUPERVISÃO · SEM SINAL MECÂNICO');
    text('phase', s.phaseLabel + (s.paused ? ' · pausada' : '') + (s.activeDigestor ? ' · ' + s.activeDigestor : ''));
    text('selection', s.selectionLabel);
    text('tacho', s.mode === 'SIMULACAO' ? fmt(s.tachoLiters) + ' L · ilustrativo' : 'Sem sinal');
    text('tacho-level', s.mode === 'SIMULACAO' ? s.tachoLevel.replace('_VIRTUAL', '') + ' · SIMULADO' : 'SEM SINAL');
    text('transferred', s.mode === 'SIMULACAO' ? fmt(s.transferredLiters) + ' L · virtual' : 'Sem sinal');
    panel.querySelectorAll('[data-circuito-equipment]').forEach(element => {
      const key = element.dataset.circuitoEquipment;
      element.dataset.active = String(activeFor(key, s));
      if (/^gate[1-4]$/.test(key)) element.dataset.gateState = s.mode !== 'SIMULACAO' ? 'unknown' : s.gates[Number(key.slice(-1)) - 1] ? 'open' : 'closed';
      if (/^dischargeGate[1-4]$/.test(key)) element.dataset.gateState = s.mode !== 'SIMULACAO' ? 'unknown' : s.dischargeGates[Number(key.slice(-1)) - 1] ? 'open' : 'closed';
    });
    panel.querySelectorAll('[data-flow]').forEach(element => {
      const key = element.dataset.flow;
      let active = activeFor(key, s);
      if (/^digestor[1-4]$/.test(key)) active = s.mode === 'SIMULACAO' && s.running && s.digestors[Number(key.slice(-1)) - 1].discharging;
      if (/^gate[1-4]$/.test(key)) active = active && s.feedAuger;
      if (key === 'tacho') active = s.mode === 'SIMULACAO' && s.running && s.percolator && s.digestors.some(unit => unit.discharging);
      element.dataset.active = String(Boolean(active));
    });
    panel.querySelectorAll('[data-circuito-unit-status]').forEach(element => {
      const unit = s.digestors[Number(element.dataset.circuitoUnitStatus) - 1];
      element.textContent = s.mode !== 'SIMULACAO' ? 'Sem sinal mecânico' : s.paused ? 'Pausado · virtual'
        : unit.loading ? 'Carga virtual' : unit.shaft ? 'Mistura virtual' : unit.discharging ? 'Descarga virtual' : 'Parado · virtual';
    });
    const fill = role('tacho-fill');
    if (fill) {
      const visible = s.mode === 'SIMULACAO' && s.tachoLiters > 0;
      if (visible) fill.removeAttribute('hidden'); else fill.setAttribute('hidden', '');
      const fraction = s.tachoCapacityLiters ? Math.max(0, Math.min(1, s.tachoLiters / s.tachoCapacityLiters)) : 0;
      fill.setAttribute('opacity', visible ? '0.8' : '0');
      fill.setAttribute('height', String(fraction * 75));
      fill.setAttribute('y', String(577 - fraction * 75));
    }
    if (controls) {
      const pauseButton = action('pause');
      if (pauseButton) { pauseButton.disabled = linked || s.mode !== 'SIMULACAO' || !s.running && !s.paused; pauseButton.textContent = s.paused ? 'Retomar' : 'Pausar'; }
      if (action('start')) action('start').disabled = linked;
      if (action('stop')) action('stop').disabled = linked || s.mode !== 'SIMULACAO' || !s.running && !s.paused;
      if (action('live')) action('live').disabled = linked || s.mode !== 'SIMULACAO';
      const selection = document.getElementById('digestores-circuito-selection');
      if (selection) selection.disabled = linked || s.running || s.paused;
    }
    renderDetail(s);
    send('state', s);
  }
  panel.querySelectorAll('[data-circuito-equipment]').forEach(element => {
    const select = () => selectEquipment(element.dataset.circuitoEquipment);
    element.addEventListener('click', select);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
  });
  function showView(next) {
    requestedView = next;
    const actual = next === '3d' && threeReady && !unavailable ? '3d' : 'scheme';
    const host = document.getElementById('digestores-circuito-3d');
    const scheme = document.getElementById('digestores-circuito-scheme');
    if (host) host.hidden = actual !== '3d';
    if (scheme) scheme.hidden = actual !== 'scheme';
    panel.dataset.view = actual;
    action('view-3d')?.setAttribute('aria-pressed', String(actual === '3d'));
    action('view-scheme')?.setAttribute('aria-pressed', String(actual === 'scheme'));
    send('fit');
  }
  action('view-3d')?.addEventListener('click', () => showView('3d'));
  action('view-scheme')?.addEventListener('click', () => showView('scheme'));
  action('fit')?.addEventListener('click', () => send('fit'));
  action('motion')?.addEventListener('click', () => {
    motion = !motion;
    action('motion').setAttribute('aria-pressed', String(!motion));
    action('motion').textContent = motion ? 'Pausar animação' : 'Ativar animação';
    send('motion', { enabled: motion && !media?.matches });
    render();
  });
  if (controls) {
    action('start')?.addEventListener('click', () => {
      const result = Core.startDemo(state, document.getElementById('digestores-circuito-selection')?.value || 'TODOS');
      text('feedback', result.ok ? 'Nova sessão local. Tempos, volumes e separação de líquido são exemplos ilustrativos.' : result.reason);
      render();
    });
    action('pause')?.addEventListener('click', () => { state.paused ? Core.resume(state) : Core.pause(state); render(); });
    action('stop')?.addEventListener('click', () => { Core.stop(state); text('feedback', 'Circuito virtual parado. Todas as ações virtuais foram retiradas.'); render(); });
    action('live')?.addEventListener('click', () => { Core.returnLive(state); text('feedback', 'Retorno à supervisão: estados mecânicos sem sinal.'); render(); });
    document.getElementById('digestores-circuito-speed')?.addEventListener('change', event => {
      const next = Number(event.target.value);
      if ([1, 3, 8].includes(next)) speed = next;
    });
    root.setInterval(() => { if (!linked && !document.hidden && state.running) { Core.tick(state, 0.2 * speed); render(); } }, 200);
  }
  root.addEventListener('digestores-circuito:3d-unavailable', () => {
    unavailable = true;
    if (action('view-3d')) action('view-3d').disabled = true;
    showView('scheme');
  });
  root.addEventListener('digestores-circuito:3d-ready', () => {
    if (unavailable) return;
    threeReady = true;
    showView(requestedView);
    const status = document.getElementById('digestores-circuito-3d-status');
    if (status) status.textContent = 'Arraste para girar · selecione um equipamento pelo nome ou desenho';
    send('state', Core.snapshot(state));
    send('select', { key: selected });
  });
  media?.addEventListener?.('change', () => { send('motion', { enabled: motion && !media.matches }); render(); });
  root.AutomacaoDigestoresCircuito = {
    getSnapshot: () => Core.snapshot(state), selectEquipment,
    startLinked(selection) {
      if (!controls) return { ok: false, reason: 'Sem permissão de simulação mecânica.' };
      Core.stop(state);
      const result = Core.startLinkedDemo(state, selection);
      if (result.ok) { linked = true; text('feedback', 'Simulações unidas: o vermelho piscando (>120 °C) libera apenas a descarga VIRTUAL.'); }
      render();
      return result;
    },
    tickLinked(delta, readings) { if (linked) { Core.tick(state, delta, readings); render(); } },
    pauseLinked() { if (linked) { Core.pause(state); render(); } },
    resumeLinked() { if (linked) { Core.resume(state); render(); } },
    stopLinked() { if (linked) { Core.stop(state); render(); } },
    exitLinked() { linked = false; Core.returnLive(state); render(); },
  };
  render();
  selectEquipment(selected);
  send('ready');
})(typeof window !== 'undefined' ? window : null);
