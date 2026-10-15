/* Simulação 100% no navegador: nunca chama API, CLP ou dispositivos físicos. */
(() => {
  'use strict';
  const root = document.getElementById('sim-digestores');
  if (!root) return;
  const cards = [...root.querySelectorAll('[data-digestor]')];
  const start = document.getElementById('sim-start');
  const pause = document.getElementById('sim-pause');
  const reset = document.getElementById('sim-reset');
  const speed = document.getElementById('sim-speed');
  const clock = document.getElementById('sim-clock');
  const values = cards.map((card, index) => ({ card, temp: 30 + index * 2, enabled: false }));
  let running = false, virtualSeconds = 0, handle = null;
  const get = (card, key) => card.querySelector('[data-role="' + key + '"]');
  const render = () => {
    clock.textContent = 'Tempo virtual: ' + String(Math.floor(virtualSeconds / 60)).padStart(2, '0') + ':' + String(virtualSeconds % 60).padStart(2, '0');
    for (const item of values) {
      const warning = item.temp >= 110, danger = item.temp >= 120;
      const heating = running && item.enabled && !danger;
      const label = danger ? 'ALARME' : warning ? 'ATENÇÃO' : heating ? 'Aquecendo' : 'Parado';
      item.card.classList.toggle('is-heating', heating);
      item.card.classList.toggle('is-warning', warning && !danger);
      item.card.classList.toggle('is-danger', danger);
      get(item.card, 'temperature').textContent = item.temp.toFixed(1).replace('.', ',') + ' °C';
      get(item.card, 'bar').style.width = Math.min(100, (item.temp / 130) * 100) + '%';
      get(item.card, 'bar').style.background = danger ? '#d43b3b' : warning ? '#d98b16' : '#16834b';
      get(item.card, 'contactor').textContent = heating ? 'LIGADO • SIM.' : 'DESLIGADO';
      get(item.card, 'alarm').textContent = danger ? 'Alarme vermelho' : warning ? 'Atenção amarela' : 'Normal';
      get(item.card, 'status').textContent = label;
    }
  };
  const tick = () => {
    if (!running) return;
    virtualSeconds += 1;
    const factor = Number(speed.value) || 1;
    for (const item of values) {
      if (item.enabled && item.temp < 125) item.temp = Math.min(125, item.temp + factor * .22);
    }
    render();
  };
  const stop = () => {
    running = false;
    if (handle !== null) clearInterval(handle);
    handle = null;
    start.disabled = false;
    pause.disabled = true;
    render();
  };
  values.forEach(item => {
    get(item.card, 'enabled').addEventListener('change', event => {
      item.enabled = event.target.checked;
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
      get(item.card, 'enabled').checked = false;
    });
    render();
  });
  window.addEventListener('pagehide', stop, { once: true });
  render();
})();
