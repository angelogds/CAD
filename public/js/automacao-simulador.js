/* Simulador V3: demonstração local, sem API, rede industrial nem comandos físicos. */
(() => {
  'use strict';
  const root = document.getElementById('sim-digestores');
  if (!root) return;
  const core = window.AutomacaoSimuladorCore;
  if (!core) throw new Error('Núcleo local do simulador indisponível.');
  const cards = [...root.querySelectorAll('[data-digestor]')];
  const start = document.getElementById('sim-start');
  const selector = document.getElementById('sim-select-digestor');
  const selectionStatus = document.getElementById('sim-selection-status');
  let selection = 'all';
  const pause = document.getElementById('sim-pause');
  const reset = document.getElementById('sim-reset');
  const presentation = document.getElementById('sim-presentation');
  const speed = document.getElementById('sim-speed');
  const purgeTiming = document.getElementById('sim-purge-seconds');
  const purgeSeconds = () => {
    const value = Number(purgeTiming?.value);
    return Number.isFinite(value) && value >= 1 && value <= 300 ? Math.round(value) : core.INTERVALO_PURGA_SEGUNDOS;
  };
  const integrationButton = document.getElementById('sim-link-circuits');
  let integrationOn = Boolean(integrationButton);
  let integrationActive = false;
  const circuit = () => window.AutomacaoDigestoresCircuito;
  const linkedStatus = document.getElementById('sim-integration-state');
  const setLinkedStatus = message => { if (linkedStatus) linkedStatus.textContent = message; };

  const clock = document.getElementById('sim-clock');
  const eventsFilter = document.getElementById('sim-events-filter');
  const eventsList = document.getElementById('sim-events-list');
  const values = cards.map((card, index) => ({
    ...core.criarDigestor(index), card, id: index + 1,
  }));
  const events = [];
  let running = false;
  let virtualSeconds = 0;
  let handle = null;
  const get = (card, key) => card.querySelector('[data-role="' + key + '"]');
  const selected = item => selection === 'all' || item.id === Number(selection);
  function applySelection() {
    root.classList.toggle('sim-single-selection', selection !== 'all');
    const visible = [];
    for (const item of values) {
      const show = selected(item);
      item.card.hidden = !show;
      if (!show) {
        // O digestor oculto volta para CARREGADO e pode iniciar ao ser selecionado novamente.
        core.carregarDigestor(item, core.TEMPERATURA_INICIAL + (item.id - 1) * 2);
      } else visible.push(item.id);
    }
    selectionStatus.textContent = selection === 'all'
      ? 'Quatro digestores selecionados · ' + (integrationOn ? 'ciclo completo integrado' : 'simulação térmica independente')
      : 'Digestor ' + selection + ' selecionado · ' + (integrationOn ? 'ciclo completo integrado' : 'simulação térmica independente');
    eventsFilter.value = selection;
    renderEvents();
    if (integrationOn) {
      const mech = document.getElementById('digestores-circuito-selection');
      if (mech) mech.value = selection === 'all' ? 'TODOS' : 'D' + selection;
    }
    render();
  }


  function formatTime(seconds) {
    const whole = Math.floor(Math.max(0, seconds));
    return String(Math.floor(whole / 60)).padStart(2, '0') + ':' +
      String(whole % 60).padStart(2, '0');
  }

  function renderEvents() {
    const filter = eventsFilter.value;
    const chosen = events.filter(entry => filter === 'all' || entry.id === Number(filter)).slice(0, 32);
    const fragment = document.createDocumentFragment();
    if (!chosen.length) {
      const item = document.createElement('li');
      item.textContent = 'Nenhum evento nesta seleção.';
      fragment.appendChild(item);
    } else {
      for (const event of chosen) {
        const item = document.createElement('li');
        const time = document.createElement('time');
        time.textContent = formatTime(event.time);
        const label = document.createElement('strong');
        label.textContent = 'D' + event.id;
        const message = document.createElement('span');
        message.textContent = event.message;
        item.append(time, label, message);
        fragment.appendChild(item);
      }
    }
    eventsList.replaceChildren(fragment);
  }

  function record(item, message, when) {
    events.unshift({ id: item.id, message, time: when === undefined ? virtualSeconds : when });
    if (events.length > 120) events.length = 120;
    renderEvents();
  }

  function render() {
    const thermalStates = Array(4).fill('DESLIGADO');
    const mechState=integrationActive ? circuit()?.getSnapshot?.() : null;
    clock.textContent = 'Tempo virtual: ' + formatTime(virtualSeconds);
    for (const item of values) {
      const faixa = core.faixaTemperatura(item.temp);
      if (selected(item) && Number.isFinite(item.temp))
        thermalStates[item.id - 1] = faixa.blink ? 'VERMELHO_PISCANDO' : faixa.lamp === 'red' ? 'VERMELHO'
          : faixa.lamp === 'yellow' ? 'AMARELO' : faixa.lamp === 'green' ? 'VERDE' : 'DESLIGADO';
      const ready = faixa.ready;
      const heating = running && item.enabled && !ready;
      item.card.classList.toggle('is-heating', heating);
      item.card.classList.toggle('is-warning', faixa.lamp === 'yellow');
      item.card.classList.toggle('is-danger', false);
      item.card.classList.toggle('sim-stage-red', faixa.lamp === 'red');
      item.card.classList.toggle('sim-stage-yellow', faixa.lamp === 'yellow');
      item.card.classList.toggle('sim-stage-green', faixa.lamp === 'green');

      item.card.dataset.temperaturaC = String(item.temp);
      item.card.dataset.aquecimentoSimulado = String(heating);
      get(item.card, 'temperature').textContent = item.temp.toFixed(1).replace('.', ',') + ' °C';
      get(item.card, 'bar').style.width =
        Math.max(0, Math.min(100, ((item.temp - 30) / (core.TEMPERATURA_PRONTA - 30)) * 100)) + '%';
      get(item.card, 'progress').setAttribute('aria-valuenow', item.temp.toFixed(1));
      get(item.card, 'tower').dataset.stage = faixa.lamp;
      get(item.card, 'tower').dataset.blink = String(faixa.blink);
      get(item.card, 'tower').setAttribute('aria-label', 'Sinaleiro simulado: ' +
        ({ red: 'vermelho', yellow: 'amarelo', green: 'verde' })[faixa.lamp] + (faixa.blink ? ' piscando • pronto para descarga (sim.)' : ' fixo'));

      get(item.card, 'contactor').textContent = heating ? 'LIGADO • SIM.' : 'DESLIGADO';
      const motor=Boolean(mechState?.linked && mechState.running && mechState.activeDigestor==='D'+item.id
        && mechState.stage==='COZIMENTO' && mechState.digestors?.[item.id-1]?.shaft);
      const virtualMotor=item.card.querySelector('[data-role="motor-virtual"]');
      if(virtualMotor) virtualMotor.textContent=motor?'LIGADO · SIMULADO':'PARADO · SIMULADO';
      item.card.dataset.motorVirtual=String(motor);
      get(item.card, 'alarm').textContent = faixa.label;
      const labels = {
        CARREGADO: 'Material carregado',
        AQUECIMENTO: 'Aquecendo',
        COZIMENTO: 'Em cozimento',
        PRONTO: 'PRONTO (SIM.)',
      };
      get(item.card, 'status').textContent = item.fase === 'PRONTO'
        ? labels.PRONTO : item.enabled && !running ? 'Pausado' : labels[item.fase];
      get(item.card, 'cycle-clock').textContent = formatTime(item.cycleSeconds);
      const begin = item.card.querySelector('[data-action="heat"]');
      begin.disabled = integrationActive || item.fase !== 'CARREGADO';
      item.card.querySelector('[data-action="load"]').disabled = integrationActive;
      begin.textContent = item.fase === 'PRONTO' ? '✓ Ciclo concluído' : '▶ Iniciar cozimento';
      for (const step of item.card.querySelectorAll('[data-step]')) {
        step.classList.toggle('is-current', step.dataset.step === item.fase);
        step.classList.toggle('is-done',
          Object.keys(labels).indexOf(step.dataset.step) < Object.keys(labels).indexOf(item.fase));
      }

      const purga = core.estadoPurgadores(item.cycleSeconds, running && item.cycleActive, purgeSeconds());
      item.card.dataset.camisaSimulada = purga.camisa;
      item.card.dataset.eixoSimulado = purga.eixo;
      get(item.card, 'camisa-state').textContent = purga.camisa;
      get(item.card, 'eixo-state').textContent = purga.eixo;
      get(item.card, 'camisa-box').dataset.state = purga.camisa === 'ABERTO' ? 'open' : 'closed';
      get(item.card, 'eixo-box').dataset.state = purga.eixo === 'ABERTO' ? 'open' : 'closed';
      get(item.card, 'purga-countdown').textContent = item.fase === 'PRONTO'
        ? 'Ciclo concluído • ambos fechados'
        : !item.cycleActive ? 'Aguardando ciclo'
        : 'Inversão em ' + purga.proximaTroca + ' s virtuais' + (!running ? ' • pausado' : '');
      get(item.card, 'camisa-icon').textContent = purga.camisa === 'ABERTO' ? '◀  ▶' : '◁▷';
      get(item.card, 'eixo-icon').textContent = purga.eixo === 'ABERTO' ? '◀  ▶' : '◁▷';
    }
    // Réplica somente visual dos cards do simulador; não envia comandos para o ESP32.
    window.CGDThermalState = { states: thermalStates, source: 'SIMULACAO_LOCAL' };
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function')
      window.dispatchEvent(new CustomEvent('digestores-circuito:thermal', { detail: window.CGDThermalState }));
    root.dispatchEvent(new CustomEvent('simulador:estado'));
  }

  function tick() {
    if (!running) return;
    const factor = Number(speed.value) || 1;
    virtualSeconds += factor;
    for (const item of values) {
      if (!item.enabled) continue;
      const previousStage = item.fase;
      const previousSeconds = item.cycleSeconds;
      core.avancarDigestor(item, factor);
      core.registrarAmostra(item);
      const interval = purgeSeconds();
      const lastBoundary = Math.floor(item.cycleSeconds / interval);
      const previousBoundary = Math.floor(previousSeconds / interval);
      for (let boundary = previousBoundary + 1; boundary <= lastBoundary; boundary++) {
        const elapsed = boundary * interval;
        const state = core.estadoPurgadores(elapsed, true, interval);
        record(item, 'Purgadores invertidos: ' + (state.camisa === 'ABERTO' ? 'camisa aberta / eixo fechado' : 'eixo aberto / camisa fechada'),
          virtualSeconds - (item.cycleSeconds - elapsed));
      }
      if (item.fase !== previousStage) {
        if (item.fase === 'COZIMENTO') record(item, 'Entrou na faixa alta de cozimento (vermelho fixo).');
        if (item.fase === 'PRONTO') record(item, 'Temperatura de referência atingida: pronto na simulação; contatores e purgadores desligados.');
      }
    }
    if (integrationActive && circuit()) {
      const before = circuit().getSnapshot();
      circuit().tickLinked(factor, values.map(item => ({
        tempC: item.temp, ready: core.faixaTemperatura(item.temp).ready && item.fase === core.FASES.PRONTO,
      })));
      const after = circuit().getSnapshot();
      if (after.stage === 'COZIMENTO' && (before.stage !== 'COZIMENTO' || before.activeDigestor !== after.activeDigestor)) {
        const id = Number(after.activeDigestor?.slice(1));
        const item = values[id - 1];
        if (item && core.iniciarDigestor(item)) record(item, 'Carga finalizada: guilhotina fechada e cozimento iniciado na simulação integrada.');
      }
      if (after.stage === 'DESCARGA' && before.stage !== 'DESCARGA') {
        const item = values[Number(after.activeDigestor?.slice(1)) - 1];
        if (item) record(item, 'Pronto acima de 120 °C: guilhotina frontal ABERTA na simulação; LED da bancada depende da autorização local.');
      }
      if (after.stage === 'CONCLUIDO') {
        integrationActive = false;
        stop();
        setLinkedStatus('Ciclo completo concluído: material transportado e tacho transferido virtualmente.');
      }
    }
    render();
  }

  function stop() {
    running = false;
    if (handle !== null) clearInterval(handle);
    handle = null;
    start.disabled = false;
    pause.disabled = true;
    if (integrationActive) circuit()?.pauseLinked();
    if (integrationOn) setLinkedStatus('Ciclo pausado. Clique em Iniciar simulação para retomar.');
    if (integrationButton) integrationButton.disabled = false;
    if (purgeTiming) purgeTiming.disabled = false;
    render();
  }

  values.forEach((item, index) => {
    const load = item.card.querySelector('[data-action="load"]');
    const heat = item.card.querySelector('[data-action="heat"]');
    load.addEventListener('click', () => {
      if (integrationActive) return;
      core.carregarDigestor(item, core.TEMPERATURA_INICIAL + index * 2);
      record(item, 'Novo carregamento simulado; contador reiniciado.');
      render();
    });
    heat.addEventListener('click', () => {
      if (integrationActive) return;
      if (core.iniciarDigestor(item)) record(item, 'Aquecimento iniciado no modo demonstração.');
      render();
    });
    record(item, 'Material carregado (simulação).', 0);
  });

  integrationButton?.addEventListener('click', () => {
    if (running) return;
    integrationOn = !integrationOn;
    if (!integrationOn) { circuit()?.exitLinked(); integrationActive = false; }
    integrationButton.setAttribute('aria-pressed', String(integrationOn));
    integrationButton.textContent = integrationOn ? '✓ Integrado · elétrica + mecânica' : 'Vincular simulações elétrica + mecânica';
    setLinkedStatus(integrationOn ? 'Integração ativada: clique em Iniciar simulação para percorrer o ciclo completo.' : 'Modo térmico independente: circuito mecânico desligado.');
    const mech = document.getElementById('digestores-circuito-selection');
    if (mech) mech.value = selection === 'all' ? 'TODOS' : 'D' + selection;
  });
  start.addEventListener('click', () => {
    if (running) return;
    const existing = circuit()?.getSnapshot();
    if (integrationOn) {
      if (!circuit()) { setLinkedStatus('Circuito mecânico indisponível. Recarregue a página.'); return; }
      if (existing?.paused && existing?.linked) circuit().resumeLinked();
      else {
        const result = circuit().startLinked(selection === 'all' ? 'TODOS' : 'D' + selection);
        if (!result.ok) { setLinkedStatus(result.reason || 'Não foi possível iniciar o ciclo mecânico.'); return; }
        for (const item of values) {
          core.carregarDigestor(item, core.TEMPERATURA_INICIAL + (item.id - 1) * 2);
        }
      }
      integrationActive = true;
      setLinkedStatus('Ciclo integrado em execução: carga, cozimento até >120 °C, descarga e transferência virtuais.');
    } else {
      // Modo independente preservado para demonstrar só o circuito elétrico.
      for (const item of values) {
        if (!selected(item)) continue;
        if (core.iniciarDigestor(item)) record(item, 'Aquecimento iniciado pelo comando geral simulado.');
      }
    }
    running = true;
    start.disabled = true;
    pause.disabled = false;
    if (integrationButton) integrationButton.disabled = true;
    if (purgeTiming) purgeTiming.disabled = true;
    handle = setInterval(tick, 1000);
    render();
  });
  pause.addEventListener('click', stop);
  selector.addEventListener('change', () => {
    stop();
    if (integrationActive) circuit()?.stopLinked();
    integrationActive = false;
    selection = selector.value;
    // Trocar seleção nunca deixa aquecimento oculto executando.
    applySelection();
  });
  reset.addEventListener('click', () => {
    stop();
    if (integrationOn) circuit()?.stopLinked();
    integrationActive = false;
    virtualSeconds = 0;
    events.length = 0;
    values.forEach((item, index) => {
      core.carregarDigestor(item, core.TEMPERATURA_INICIAL + index * 2);
      record(item, 'Material carregado após reinício da demonstração.', 0);
    });
    render();
  });
  eventsFilter.addEventListener('change', renderEvents);
  purgeTiming?.addEventListener('change', () => {
    purgeTiming.value = String(purgeSeconds());
    render();
  });
  presentation.addEventListener('click', () => {
    const showing = root.classList.toggle('sim-presenting');
    presentation.setAttribute('aria-pressed', String(showing));
    presentation.textContent = showing ? '⤺ Sair da apresentação' : '⛶ Modo apresentação';
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  window.addEventListener('pagehide', stop, { once: true });
  if (integrationButton) { integrationButton.setAttribute('aria-pressed', 'true'); integrationButton.textContent = '✓ Integrado · elétrica + mecânica'; }
  applySelection();
})();
