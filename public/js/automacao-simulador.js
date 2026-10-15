/* Simulador V3: demonstração local, sem API, rede industrial nem comandos físicos. */
(() => {
  'use strict';
  const root = document.getElementById('sim-digestores');
  if (!root) return;
  const core = window.AutomacaoSimuladorCore;
  if (!core) throw new Error('Núcleo local do simulador indisponível.');
  const cards = [...root.querySelectorAll('[data-digestor]')];
  const start = document.getElementById('sim-start');
  const pause = document.getElementById('sim-pause');
  const reset = document.getElementById('sim-reset');
  const presentation = document.getElementById('sim-presentation');
  const speed = document.getElementById('sim-speed');
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

  function drawChart(item) {
    const line = get(item.card, 'chart-line');
    line.setAttribute('points', core.pontosGrafico(item.samples, 260, 90));
  }

  function render() {
    clock.textContent = 'Tempo virtual: ' + formatTime(virtualSeconds);
    for (const item of values) {
      const faixa = core.faixaTemperatura(item.temp);
      const nearFinish = item.temp >= 110;
      const ready = item.temp >= 120;
      const heating = running && item.enabled && !ready;
      item.card.classList.toggle('is-heating', heating);
      item.card.classList.toggle('is-warning', faixa.lamp === 'yellow');
      item.card.classList.toggle('is-danger', false);
      item.card.classList.toggle('sim-stage-red', faixa.lamp === 'red');
      item.card.classList.toggle('sim-stage-yellow', faixa.lamp === 'yellow');
      item.card.classList.toggle('sim-stage-green', faixa.lamp === 'green');

      get(item.card, 'temperature').textContent = item.temp.toFixed(1).replace('.', ',') + ' °C';
      get(item.card, 'bar').style.width =
        Math.max(0, Math.min(100, ((item.temp - 30) / (core.TEMPERATURA_PRONTA - 30)) * 100)) + '%';
      get(item.card, 'progress').setAttribute('aria-valuenow', item.temp.toFixed(1));
      get(item.card, 'tower').dataset.stage = faixa.lamp;
      get(item.card, 'tower').setAttribute('aria-label', 'Sinaleiro simulado: ' +
        ({ red: 'vermelho', yellow: 'amarelo', green: 'verde' })[faixa.lamp] + ' ligado');

      get(item.card, 'contactor').textContent = heating ? 'LIGADO • SIM.' : 'DESLIGADO';
      get(item.card, 'alarm').textContent = nearFinish && !ready ? 'Finalização (amarelo)' : faixa.label;
      const labels = {
        CARREGADO: 'Material carregado',
        AQUECIMENTO: 'Aquecendo',
        COZIMENTO: 'Em cozimento',
        PRONTO: 'PRONTO (SIM.)',
      };
      get(item.card, 'status').textContent = item.fase === 'PRONTO'
        ? labels.PRONTO : item.enabled && !running ? 'Pausado' : labels[item.fase];
      get(item.card, 'cycle-clock').textContent = formatTime(item.cycleSeconds);
      const begin = get(item.card, 'heat');
      begin.disabled = item.fase !== 'CARREGADO';
      begin.textContent = item.fase === 'PRONTO' ? '✓ Ciclo concluído' : '▶ Iniciar cozimento';
      for (const step of item.card.querySelectorAll('[data-step]')) {
        step.classList.toggle('is-current', step.dataset.step === item.fase);
        step.classList.toggle('is-done',
          Object.keys(labels).indexOf(step.dataset.step) < Object.keys(labels).indexOf(item.fase));
      }

      const purga = core.estadoPurgadores(item.cycleSeconds, item.cycleActive);
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
      drawChart(item);
    }
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
      const lastBoundary = Math.floor(item.cycleSeconds / core.INTERVALO_PURGA_SEGUNDOS);
      const previousBoundary = Math.floor(previousSeconds / core.INTERVALO_PURGA_SEGUNDOS);
      for (let boundary = previousBoundary + 1; boundary <= lastBoundary; boundary++) {
        const elapsed = boundary * core.INTERVALO_PURGA_SEGUNDOS;
        const state = core.estadoPurgadores(elapsed, true);
        record(item, 'Purgadores invertidos: ' + (state.camisa === 'ABERTO' ? 'camisa aberta / eixo fechado' : 'eixo aberto / camisa fechada'),
          virtualSeconds - (item.cycleSeconds - elapsed));
      }
      if (item.fase !== previousStage) {
        if (item.fase === 'COZIMENTO') record(item, 'Entrou em cozimento (amarelo).');
        if (item.fase === 'PRONTO') record(item, 'Temperatura de referência atingida: pronto na simulação; contatores e purgadores desligados.');
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
    render();
  }

  values.forEach((item, index) => {
    const load = item.card.querySelector('[data-action="load"]');
    const heat = item.card.querySelector('[data-action="heat"]');
    load.addEventListener('click', () => {
      core.carregarDigestor(item, core.TEMPERATURA_INICIAL + index * 2);
      record(item, 'Novo carregamento simulado; contador e gráfico reiniciados.');
      render();
    });
    heat.addEventListener('click', () => {
      if (core.iniciarDigestor(item)) record(item, 'Aquecimento iniciado no modo demonstração.');
      render();
    });
    record(item, 'Material carregado (simulação).', 0);
  });

  start.addEventListener('click', () => {
    if (running) return;
    // Uma partida geral inicia apenas os digestores carregados; os outros mantêm seu próprio ciclo.
    for (const item of values) {
      if (core.iniciarDigestor(item)) record(item, 'Aquecimento iniciado pelo comando geral simulado.');
    }
    running = true;
    start.disabled = true;
    pause.disabled = false;
    handle = setInterval(tick, 1000);
    render();
  });
  pause.addEventListener('click', stop);
  reset.addEventListener('click', () => {
    stop();
    virtualSeconds = 0;
    events.length = 0;
    values.forEach((item, index) => {
      core.carregarDigestor(item, core.TEMPERATURA_INICIAL + index * 2);
      record(item, 'Material carregado após reinício da demonstração.', 0);
    });
    render();
  });
  eventsFilter.addEventListener('change', renderEvents);
  presentation.addEventListener('click', () => {
    const showing = root.classList.toggle('sim-presenting');
    presentation.setAttribute('aria-pressed', String(showing));
    presentation.textContent = showing ? '⤺ Sair da apresentação' : '⛶ Modo apresentação';
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  window.addEventListener('pagehide', stop, { once: true });
  render();
})();
