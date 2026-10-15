/* Simulação 100% local ao navegador. Sem API industrial, sem comandos físicos. */
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
  const speed = document.getElementById('sim-speed');
  const clock = document.getElementById('sim-clock');
  const values = cards.map((card, index) => ({
    card, temp: 30 + index * 2, enabled: false, cycleSeconds: 0, cycleActive: false,
  }));
  let running = false, virtualSeconds = 0, handle = null;
  const get = (card, key) => card.querySelector('[data-role="' + key + '"]');

  function render() {
    clock.textContent = 'Tempo virtual: ' +
      String(Math.floor(virtualSeconds / 60)).padStart(2, '0') + ':' +
      String(virtualSeconds % 60).padStart(2, '0');

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
      get(item.card, 'alarm').textContent =
        nearFinish && !ready ? 'Finalização (amarelo)' : faixa.label;
      get(item.card, 'status').textContent =
        ready ? 'PRONTO (SIM.)' : !item.enabled ? 'Carregado / parado' :
        !running ? 'Pausado' : faixa.label;

      const purga = core.estadoPurgadores(item.cycleSeconds, item.cycleActive);
      get(item.card, 'camisa-state').textContent = purga.camisa;
      get(item.card, 'eixo-state').textContent = purga.eixo;
      get(item.card, 'camisa-box').dataset.state = purga.camisa === 'ABERTO' ? 'open' : 'closed';
      get(item.card, 'eixo-box').dataset.state = purga.eixo === 'ABERTO' ? 'open' : 'closed';
      get(item.card, 'purga-countdown').textContent = !item.cycleActive
        ? 'Aguardando simulação'
        : 'Próxima inversão em ' + purga.proximaTroca + ' s virtuais' + (!running ? ' • pausado' : '');
    }
  }

  function tick() {
    if (!running) return;
    const factor = Number(speed.value) || 1;
    virtualSeconds += factor;
    for (const item of values) core.avancarDigestor(item, factor);
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

  values.forEach(item => {
    get(item.card, 'enabled').addEventListener('change', event => {
      item.enabled = event.target.checked;
      if (!item.enabled) {
        item.cycleActive = false;
        item.cycleSeconds = 0;
      }
      render();
    });
  });

  start.addEventListener('click', () => {
    if (running) return;
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
    values.forEach((item, index) => {
      item.temp = 30 + index * 2;
      item.enabled = false;
      item.cycleActive = false;
      item.cycleSeconds = 0;
      get(item.card, 'enabled').checked = false;
    });
    render();
  });
  window.addEventListener('pagehide', stop, { once: true });
  render();
})();
