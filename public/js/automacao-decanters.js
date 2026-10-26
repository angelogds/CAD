(function (root) {
  'use strict';
  const Core = root?.AutomacaoDecantersCore || (typeof module !== 'undefined' && module.exports ? require('./automacao-decanters-core') : null);
  const fmt = (value, digits = 0) => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '—';
  const labels = {
    tank: ['Tanque de serviço', 'Reservatório nominal de 15.000 L. Cinco pontos de nível, mexedor, vapor e temperatura do sebo.'],
    mixer: ['Mexedor do tanque', 'Hélices de mistura. Movimento do eixo não comprova a homogeneidade do sebo.'],
    steam: ['Aquecimento por vapor', 'Linha de vapor do tanque. Retorno de posição e fluxo de vapor ainda serão instrumentados.'],
    pt100: ['TT-101 · PT100 do sebo', 'Temperatura no ponto de inserção. Faixa ideal, poço e posicionamento dependem do levantamento de campo.'],
    inlet: ['FT-IN · recebido no tanque', 'Medidor e totalizador propostos na entrada. Material recebido não equivale à produção final.'],
    feed: ['Bomba helicoidal de alimentação', 'Transporte do tanque para FAST, GRATE ou ambas. Na maquete, a vazão total se divide igualmente quando as duas estão selecionadas.'],
    FAST: ['Decanter FAST', 'Separação do sebo e da borra. A liberação real dependerá dos sinais e da sequência do controlador da máquina.'],
    GRATE: ['Decanter GRATE', 'Separação do sebo e da borra. A seleção do coletor deve corresponder aos retornos das válvulas.'],
    valveFAST: ['Válvula de seleção FAST', 'Ramal do coletor de alimentação. O caminho real exigirá retorno de posição.'],
    valveGRATE: ['Válvula de seleção GRATE', 'Ramal do coletor de alimentação. Trocar de linha interrompe a bomba na maquete.'],
    tachoFAST: ['Tacho de coleta FAST', 'Acumulação e mistura sob a FAST antes da transferência. Capacidade e sensores reais ainda a levantar.'],
    tachoGRATE: ['Tacho de coleta GRATE', 'Acumulação e mistura sob a GRATE antes da transferência. A maquete usa um volume ilustrativo.'],
    screw: ['Rosca de transporte de borra', 'Transporte sob as duas decanters. Estudar retorno de rotação, carga e bloqueio da saída.'],
    out1: ['Bomba de saída 1', 'Transferência do tacho selecionado para o coletor externo. Seleção exclusiva na maquete.'],
    out2: ['Bomba de saída 2', 'Segunda bomba para transferência ao coletor externo. Não representa confirmação de funcionamento real.'],
    outlet: ['FT-OUT · transferido ao armazenamento', 'Medidor comum proposto após as bombas. Total transferido no turno, sem somar duas vezes a mesma passagem.'],
  };
  for (let i = 1; i <= 5; i++) {
    labels['sensor' + i] = [['LSL', 'LS2', 'LS3', 'LS4', 'LSH'][i - 1] + ' · sensor de nível',
      'Posição volumétrica conceitual. Altura de instalação depende de cubagem, geometria e condições do tanque.'];
    labels['storage' + i] = ['Tanque de armazenamento ' + i, 'Expansão futura. Capacidade, nível, válvulas e disponibilidade ainda não integrados.'];
  }
  function detailsFor(key, s) {
    const name = labels[key] || labels.tank;
    const sim = s.mode === 'SIMULACAO';
    const machines = Core.selectedMachines(s);
    const selectedLines = machines.length ? machines.join(' e ') : 'Nenhuma';
    const status = value => sim ? (value ? 'Ligado · simulado' : 'Desligado · simulado') : 'Sem sinal';
    const level = s.level?.status === 'VALIDO' ? fmt(s.level.percentMin) + '–' + fmt(s.level.percentMax) + '%' : 'Sem sinal';
    let rows = [];
    if (key === 'tank') rows = [['Capacidade nominal informada', '15.000 L'], ['Faixa de nível', level], ['Temperatura', fmt(s.temperature?.value, 1) + ' °C'], ['Mexedor', status(s.effective?.mixer)], ['Vapor', status(s.effective?.steam)]];
    else if (key === 'mixer') rows = [['Movimento na maquete', status(s.effective?.mixer)], ['Retorno físico de rotação', 'Não integrado'], ['Homogeneidade do sebo', 'Não avaliada']];
    else if (key === 'steam') rows = [['Solicitação na maquete', status(s.effective?.steam)], ['Posição física da válvula', 'Sem retorno'], ['Vazão / pressão do vapor', 'Sem leitura']];
    else if (key === 'pt100') rows = [['Origem', sim ? 'Sensor simulado' : 'Aguardando instrumento'], ['Temperatura', fmt(s.temperature?.value, 1) + ' °C'], ['Faixa da demonstração', s.temperature?.configured ? fmt(s.temperatureMinC) + '–' + fmt(s.temperatureMaxC) + ' °C' : 'A definir'], ['Faixa de processo validada', 'A definir em campo']];
    else if (key.startsWith('sensor')) {
      const index = Number(key.slice(6)) - 1;
      const percent = [10, 25, 50, 75, 90][index];
      rows = [['Patamar volumétrico proposto', percent + '% · ' + fmt(percent * 150) + ' L'], ['Estado', sim && s.level.status === 'VALIDO' ? s.level.switches[index] ? 'Atingido · simulado' : 'Livre · simulado' : 'Sem sinal / indisponível'], ['Altura física', 'A calibrar pela geometria']];
    } else if (key === 'feed') rows = [['Funcionamento', status(s.effective?.feedPump)], ['Linhas selecionadas', sim ? selectedLines : 'Sem sinal'], ['Vazão total da maquete', sim ? fmt(s.effective?.feedPump ? s.feedFlowLpm : 0) + ' L/min' : 'Sem sinal'], ['Divisão da vazão', sim && machines.length === 2 ? 'Metade para FAST e metade para GRATE' : sim ? 'Toda a vazão para a linha selecionada' : 'Sem sinal'], ['Permissivos', sim ? s.permissives.feedPump ? 'Atendidos na maquete' : s.reasons.feedPump.join(' ') : 'Sem dados']];
    else if (key === 'FAST' || key === 'GRATE') rows = [['Liberação na maquete', sim ? s.decanterReady[key] ? 'Pronta · simulado' : 'Indisponível · simulado' : 'Sem sinal'], ['Alimentação', status(s.effective?.feedMachines[key])], ['Vazão desta máquina', sim ? fmt(s.effective?.feedMachines[key] ? s.feedFlowLpm / machines.length : 0, 1) + ' L/min · simulado' : 'Sem sinal'], ['Tambor e rosca interna', sim && s.running && s.decanterReady[key] ? 'Em movimento · corte didático' : sim ? 'Parados na maquete' : 'Sem sinal'], ['Velocidades / diferencial real', 'Não medidos · animação ilustrativa'], ['Rotação / torque / vibração', 'Instrumentação a integrar'], ['Tacho da maquete', sim ? fmt(s.tachos[key], 1) + ' L · ilustrativo' : 'Sem sinal']];
    else if (key.startsWith('valve')) rows = [['Rota virtual', sim ? machines.includes(key.slice(5)) ? 'Selecionada' : 'Não selecionada' : 'Sem sinal'], ['Retorno físico de posição', 'Não integrado']];
    else if (key.startsWith('tacho')) rows = [['Volume da maquete', sim ? fmt(s.tachos[key.slice(5)], 1) + ' L' : 'Sem sinal'], ['Mexedor do tacho', status(s.effective?.tachoMixers[key.slice(5)])], ['Capacidade real', 'A levantar'], ['Capacidade ilustrativa', '1.000 L'], ['Origem / retorno físico', sim ? 'Modelo simulado / não integrado' : 'Sem sinal']];
    else if (key === 'screw') rows = [['Movimento', status(s.effective?.screw)], ['Retorno de rotação / bloqueio', 'Não integrado'], ['Sequência real de parada', 'Conforme fabricante']];
    else if (key === 'out1' || key === 'out2') rows = [['Funcionamento', status(s.effective?.outletPump === Number(key.slice(-1)))], ['Sucção da maquete', sim ? s.selectedTacho || 'Não selecionada' : 'Sem sinal'], ['Destino da maquete', sim && s.selectedStorage ? 'Tanque ' + s.selectedStorage + ' · futuro' : 'Não disponível'], ['Alternância das bombas', sim ? s.autoAlternatePump ? 'Ativada · a cada ' + fmt(s.pumpSwitchSeconds) + ' s virtuais · ilustrativo' : 'Desativada · seleção manual' : 'Sem sinal'], ['Retorno físico / vazão real', 'Não integrado']];
    else if (key === 'inlet') rows = [['Total recebido', fmt(s.inletTotalLiters, 1) + ' L'], ['Vazão', sim ? fmt(s.inletFlowLpm) + ' L/min · simulado' : 'Sem sinal'], ['Produção final', 'Não inferida pela entrada']];
    else if (key === 'outlet') rows = [['Transferido nesta sessão', fmt(s.transferredTotalLiters, 1) + ' L'], ['Produção apurada', 'Fronteira e estoques a validar'], ['Turno noturno', 'Horários a configurar em São Paulo']];
    else if (key.startsWith('storage')) rows = [['Etapa', 'Expansão futura'], ['Capacidade / nível real', 'Não disponíveis'], ['Transferência da maquete', sim ? fmt(s.storageTotals[Number(key.slice(7)) - 1], 1) + ' L' : 'Sem dados']];
    return { title: name[0], description: name[1], rows, quality: sim ? 'Origem: simulação local · sem retorno físico' : 'Sem sinal · aguardando integração' };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { detailsFor, fmt };
  if (!root || typeof document === 'undefined' || !document.getElementById('decanters-dashboard')) return;
  if (!Core) return;
  const state = Core.createState();
  const main = document.getElementById('decanters-dashboard');
  const simulationAllowed = main.dataset.decSimulationAllowed === 'true';
  const $ = id => document.getElementById(id);
  const send = (name, detail) => root.dispatchEvent(new CustomEvent('decanters:' + name, { detail }));
  const text = (id, value) => { const el = $(id); if (el && el.textContent !== value) el.textContent = value; };
  let selected = 'tank';
  let view = '3d';
  let unavailable3d = false;
  let motion = !root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speed = 10;
  const simControls = [...main.querySelectorAll('[data-core]')];

  function selectEquipment(key) {
    if (!labels[key]) return;
    selected = key;
    main.querySelectorAll('button[data-select-key]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.selectKey === key)));
    renderDetail(Core.snapshot(state));
    send('select', { key });
  }
  function renderDetail(s) {
    const details = detailsFor(selected, s);
    text('dec-selected-title', details.title);
    text('dec-selected-description', details.description);
    text('dec-selected-quality', details.quality);
    const list = $('dec-selected-values');
    list.replaceChildren(...details.rows.map(([label, value]) => {
      const row = document.createElement('div');
      const name = document.createElement('dt');
      const content = document.createElement('dd');
      name.textContent = label;
      content.textContent = value;
      row.append(name, content);
      return row;
    }));
  }
  function renderControls(s) {
    simControls.forEach(input => {
      const key = input.dataset.core;
      let value = key.startsWith('ready') ? s.decanterReady[key.slice(5)] : key.startsWith('tacho') ? s.tachos[key.slice(5)]
        : ['mixerFAST', 'mixerGRATE'].includes(key) ? s.tachoMixers[key.slice(5)] : s[key];
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else if (document.activeElement !== input) input.value = value == null ? '' : typeof value === 'number' ? Math.round(value * 10) / 10 : value;
    });
  }
  function render() {
    const s = Core.snapshot(state);
    const sim = s.mode === 'SIMULACAO';
    main.classList.toggle('is-demo', sim);
    main.classList.toggle('motion-paused', !motion || !s.running);
    if ($('dec-demo-start')) $('dec-demo-start').hidden = sim;
    if ($('dec-live-return')) $('dec-live-return').hidden = !sim;
    $('dec-demo-notice').hidden = !sim;
    if ($('dec-sim-panel')) $('dec-sim-panel').hidden = !sim;
    text('dec-source-label', sim ? 'SIMULAÇÃO LOCAL' : 'SUPERVISÃO · SEM SINAL');
    text('dec-source-description', sim ? s.running ? 'Maquete em execução' : 'Maquete pausada / parada' : 'Sem hardware conectado');
    text('dec-mode-description', sim ? 'Explore as seleções e permissivos da maquete. Dados não são gravados como produção.' : 'Comandos: indisponíveis. Instrumentos e comunicação desta área ainda não integrados.');
    text('dec-scene-badge', sim ? s.running ? 'SIMULAÇÃO LOCAL · EM EXECUÇÃO' : 'SIMULAÇÃO LOCAL · PAUSADA / PARADA' : 'SUPERVISÃO · SEM DADOS');
    const validLevel = sim && s.level.status === 'VALIDO';
    text('dec-level', validLevel ? fmt(s.level.percentMin) + '–' + fmt(s.level.percentMax) + '%' : s.level.status === 'INCONSISTENTE' ? 'Incoerente' : 'Sem sinal');
    text('dec-level-volume', validLevel ? 'Aprox. ' + fmt(s.level.minLiters) + '–' + fmt(s.level.maxLiters) + ' L · simulado' : 'Tanque nominal · 15.000 L');
    text('dec-temperature', fmt(s.temperature.value, 1) + ' °C');
    text('dec-temperature-band', sim && s.temperature.configured ? fmt(s.temperatureMinC) + '–' + fmt(s.temperatureMaxC) + ' °C · faixa didática' : 'Faixa de processo a definir');
    text('dec-inlet-total', fmt(s.inletTotalLiters, 1) + ' L');
    text('dec-outlet-total', fmt(s.transferredTotalLiters, 1) + ' L');
    text('dec-shift-label', sim ? 'Sessão simulada · não é produção apurada' : 'Turno noturno · medição a integrar');
    text('dec-tank-temperature', fmt(s.temperature.value, 1) + ' °C');
    text('dec-tank-received', fmt(s.inletTotalLiters, 1) + ' L');
    text('dec-tank-remaining', validLevel ? fmt(s.level.minLiters) + '–' + fmt(s.level.maxLiters) + ' L' : 'Sem estimativa');
    text('dec-tank-level', validLevel ? 'Faixa ' + fmt(s.level.percentMin) + '–' + fmt(s.level.percentMax) + '%' : 'Nível sem sinal');
    text('dec-tank-mixer', sim ? s.effective.mixer ? 'Girando · simulado' : 'Parado · simulado' : 'Sem sinal');
    text('dec-tank-steam', sim ? s.effective.steam ? 'Ligado · simulado' : 'Desligado · simulado' : 'Sem sinal');
    text('dec-tank-turn', sim ? 'Turno de teste · sessão simulada' : 'Turno a configurar · sem medidor');
    const gauge = $('dec-tank-gauge');
    gauge.style.setProperty('--level-min', (validLevel ? s.level.percentMin : 0) + '%');
    gauge.style.setProperty('--level-span', (validLevel ? s.level.percentMax - s.level.percentMin : 0) + '%');
    $('dec-tank-temperature').dataset.condition = !sim || s.temperature.status !== 'SIMULADO' || !s.temperature.configured ? 'unknown' : s.temperature.value > s.temperatureMaxC ? 'high' : s.temperature.inRange ? 'ready' : 'low';
    const elapsed = Math.floor(s.seconds);
    text('dec-sim-clock', 'Tempo virtual · ' + String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0'));
    text('dec-pause', s.running ? 'Pausar simulação' : 'Retomar simulação');
    text('dec-feed-permissives', s.permissives.feedPump ? 'Condições atendidas na maquete.' : s.reasons.feedPump.join(' '));
    text('dec-pump-alternation-state', s.autoAlternatePump ? s.effective.outletPump
      ? 'Bomba ' + s.effective.outletPump + ' · próxima troca em ' + fmt(Math.max(0, s.pumpSwitchSeconds - s.pumpElapsedSeconds)) + ' s virtuais · ilustrativo.'
      : 'Alternância ativada. Selecione uma bomba com produto disponível no tacho.'
      : 'Alternância desativada · seleção manual da bomba.');
    for (let i = 0; i < 5; i++) {
      const reached = validLevel && s.level.switches[i];
      const color = !validLevel ? '#9da5b2' : reached ? i === 4 ? '#ba1931' : '#19835c' : '#d0d3d9';
      main.querySelector('[data-sensor-dot="' + i + '"]').style.background = color;
      main.querySelector('[data-sensor-state="' + i + '"]').textContent = validLevel ? reached ? 'Atingido · SIM' : 'Livre · SIM' : 'Sem sinal';
      main.querySelector('[data-level-sensor="' + i + '"]').style.fill = color;
    }
    const fill = $('dec-svg-tank-fill');
    const height = sim && validLevel ? s.tankLiters / 15000 * 230 : 0;
    fill.setAttribute('height', String(height));
    fill.setAttribute('y', String(395 - height));
    $('dec-svg-mixer').classList.toggle('is-running', Boolean(s.effective.mixer));
    main.querySelectorAll('[data-tacho-mixer]').forEach(mixer => mixer.classList.toggle('is-running', Boolean(s.effective.tachoMixers[mixer.dataset.tachoMixer])));
    text('dec-svg-temperature', 'Temperatura: ' + fmt(s.temperature.value, 1) + ' °C');
    main.querySelectorAll('[data-flow]').forEach(pipe => {
      const key = pipe.dataset.flow;
      const active = ({ inlet: s.inletFlowLpm > 0 && s.permissives.admission, steam: s.effective.steam, feed: s.effective.feedPump,
        FAST: s.effective.feedMachines.FAST, GRATE: s.effective.feedMachines.GRATE,
        tachoFAST: s.effective.feedMachines.FAST, tachoGRATE: s.effective.feedMachines.GRATE,
        borraFAST: s.effective.feedMachines.FAST, borraGRATE: s.effective.feedMachines.GRATE,
        outFAST: s.effective.outletPump && s.selectedTacho === 'FAST', outGRATE: s.effective.outletPump && s.selectedTacho === 'GRATE',
        out1: s.effective.outletPump === 1, out2: s.effective.outletPump === 2 })[key];
      pipe.classList.toggle('is-flowing', Boolean(sim && active));
    });
    const alarms = $('dec-alarm-list');
    if (alarms && alarms.dataset.text !== s.alarms.join('|')) {
      alarms.dataset.text = s.alarms.join('|');
      alarms.replaceChildren(...s.alarms.map(message => { const item = document.createElement('li'); item.textContent = message; return item; }));
    }
    renderDetail(s);
    renderControls(s);
    send('state', s);
  }
  function feedback(message) { text('dec-control-feedback', message); }
  function change(key, value) {
    if (!simulationAllowed) return { ok: false, reason: 'Simulação indisponível nesta página.' };
    const result = Core.set(state, key, value);
    feedback(result.ok ? '' : result.reason);
    render();
    return result;
  }
  main.querySelectorAll('[data-select-key]').forEach(element => element.addEventListener('click', () => selectEquipment(element.dataset.selectKey)));
  if (simulationAllowed) {
    // Consulta autenticada e somente de leitura. Ainda não existe canal ESP32 homologado
    // para as decanters: não usar o dispositivo DIGESTOR-01 nem fingir que a maquete é telemetria.
    async function verificarEsp32Decanter() {
      const status = $('dec-esp32-status');
      if(status) status.textContent = 'Consultando cadastro e integração do ESP32 das decanters…';
      try {
        const response = await fetch('/automacao/api/decanters/esp32/status',
          { credentials: 'same-origin', cache: 'no-store', redirect: 'manual', headers: { Accept: 'application/json' } });
        if(!response.ok || !(response.headers.get('content-type') || '').includes('application/json'))
          throw new Error(response.status === 401 ? 'Sessão expirada' : 'Consulta não disponível');
        const data = await response.json();
        if(status) status.textContent = data.integrado && data.conectado ? 'ESP32 conectado' : data.mensagem || 'ESP32 das decanters ainda não integrado';
      } catch (_e) { if(status) status.textContent = 'Não foi possível verificar o ESP32 das decanters; a simulação continua local.'; }
    }
    $('dec-esp32-connect')?.addEventListener('click', () => { void verificarEsp32Decanter(); });
    simControls.forEach(input => input.addEventListener('change', () => {
      const key = input.dataset.core;
      const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? input.value === '' ? null : input.valueAsNumber
        : ['outletPump', 'selectedStorage'].includes(key) ? input.value === '' ? null : Number(input.value) : input.value || null;
      const result = change(key, value);
      if (!result.ok) { input.blur(); renderControls(Core.snapshot(state)); }
    }));
    $('dec-demo-start').addEventListener('click', () => { void verificarEsp32Decanter(); Core.startDemo(state); $('dec-sim-panel').open = true; render(); feedback('Simulação iniciada. Configure as condições ou escolha Demonstrar FAST e GRATE.'); });
    $('dec-live-return').addEventListener('click', () => { Core.dispatch(state, { type: 'LIVE' }); render(); });
    $('dec-demo-circuit').addEventListener('click', () => {
      Core.startDemo(state);
      for (const [key, value] of Object.entries({ temperatureMinC: 60, temperatureMaxC: 85, tempC: 72, mixer: true, screw: true,
        selectedDecanter: 'AMBAS', readyFAST: true, readyGRATE: true, tachoFAST: 150, tachoGRATE: 150,
        mixerFAST: true, mixerGRATE: true, selectedTacho: 'FAST', selectedStorage: 1, inletFlowLpm: 25,
        feedPump: true, outletPump: 1 })) Core.set(state, key, value);
      render(); feedback('FAST e GRATE em demonstração, com os dois mexedores dos tachos ligados. Faixa 60–85 °C e vazões são exemplos didáticos; não são parâmetros aprovados da fábrica.');
    });
    $('dec-pause').addEventListener('click', () => { Core.dispatch(state, { type: state.running ? 'PAUSE' : 'RESUME' }); render(); });
    $('dec-speed').addEventListener('change', event => { const value = Number(event.target.value); if ([1, 10, 60].includes(value)) speed = value; });
    $('dec-stop').addEventListener('click', () => { Core.stop(state); render(); feedback('Maquete parada. Todos os acionamentos virtuais foram desligados.'); });
    main.querySelectorAll('[data-fault]').forEach(button => button.addEventListener('click', () => {
      const fault = button.dataset.fault;
      if (fault === 'low') change('tankLiters', 1000);
      if (fault === 'level') change('levelFault', 'INCONSISTENTE');
      if (fault === 'pt100') change('pt100Fault', true);
      if (fault === 'full') change('tacho' + (Core.selectedMachines(state)[0] || 'FAST'), 900);
      feedback('Condição de teste aplicada. Consulte os permissivos e os estados dos equipamentos.');
    }));
    $('dec-clear-faults').addEventListener('click', () => { Core.set(state, 'levelFault', null); Core.set(state, 'pt100Fault', false); render(); feedback('Falhas de sensor retiradas. Corrija os níveis e religue os componentes da maquete se necessário.'); });
  }
  function setView(next) {
    view = unavailable3d ? 'scheme' : next;
    $('dec-three-host').hidden = view !== '3d';
    $('dec-scheme-host').hidden = view !== 'scheme';
    main.querySelectorAll('[data-dec-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.decView === view)));
    if (!unavailable3d) text('dec-view-message', view === '3d' ? 'Arraste para girar · pinça ou roda para aproximar · clique em uma máquina' : 'Esquema funcional sem escala · selecione pelo desenho ou pela lista de equipamentos');
    send('fit');
  }
  main.querySelectorAll('[data-dec-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.decView)));
  root.addEventListener('decanters:3d-unavailable', () => { unavailable3d = true; main.querySelector('[data-dec-view="3d"]').disabled = true; setView('scheme'); });
  $('dec-fit').addEventListener('click', () => { if (view === '3d') send('fit'); else $('dec-scheme-host').scrollLeft = 0; });
  $('dec-motion').addEventListener('click', () => {
    motion = !motion;
    $('dec-motion').setAttribute('aria-pressed', String(!motion));
    text('dec-motion', motion ? 'Pausar animação' : 'Ativar animação');
    send('motion', { enabled: motion }); render();
  });
  $('dec-fullscreen').addEventListener('click', async () => {
    const panel = main.querySelector('.dec-visual-panel');
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (panel.requestFullscreen) await panel.requestFullscreen(); else text('dec-view-message', 'Tela cheia indisponível neste navegador.'); }
    catch { text('dec-view-message', 'Não foi possível abrir em tela cheia.'); }
  });
  document.addEventListener('fullscreenchange', () => text('dec-fullscreen', document.fullscreenElement ? 'Recolher' : 'Expandir'));
  $('dec-export-svg').addEventListener('click', () => {
    const drawing = $('dec-process-svg').cloneNode(true);
    const symbols = main.querySelector('.dec-symbols defs').cloneNode(true);
    drawing.prepend(symbols);
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = 'text{font-family:Arial,sans-serif;font-size:13px;fill:#444b57}.dec-svg-pipe path{fill:none;stroke:#aeb5c0;stroke-width:8}.dec-svg-valve path{fill:#d6dae1;stroke:#727a88}.dec-svg-tacho path{fill:#e0e4e9;stroke:#8f97a4}.dec-svg-tag rect,.dec-svg-future rect{fill:#f4f5f7;stroke:#bfc5cf}.dec-svg-sensors path{stroke:#777f8d}.dec-svg-future text,.dec-svg-sensors text,.dec-svg-tag text,.dec-svg-footnote{font-size:10px}.dec-svg-caption text{font-size:11px}.dec-svg-future-feed path{fill:none;stroke:#aeb5c0;stroke-width:5;stroke-dasharray:6 5}.dec-svg-tacho .dec-tacho-shaft{fill:none;stroke:#555d6b;stroke-width:4}';
    drawing.prepend(style);
    const title = drawing.querySelector('title');
    title.textContent += state.mode === 'SIMULACAO' ? ' · retrato da simulação local' : ' · sem dados de campo';
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(drawing)], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = '2A-circuito-decanters-conceitual.svg'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  root.AutomacaoDecantersDashboard = { getSnapshot: () => Core.snapshot(state), selectEquipment };
  if (simulationAllowed) root.setInterval(() => { if (state.mode === 'SIMULACAO' && state.running && !document.hidden) { Core.tick(state, speed); render(); } }, 1000);
  render(); selectEquipment('tank'); send('ready');
})(typeof window === 'undefined' ? null : window);
