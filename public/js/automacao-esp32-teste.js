/* Piloto de telemetria ESP32 D1: somente indicação do LED GPIO2, sem comandos físicos. */
(() => {
  'use strict';
  const estado = document.getElementById('esp32-d1-estado');
  if (!estado) return;
  const gpio = document.getElementById('esp32-d1-gpio2');
  const ultima = document.getElementById('esp32-d1-ultima');
  const selo = document.getElementById('esp32-d1-selo');
  const cabecalho = document.querySelector('.auto-integration .auto-state');
  const detalheCabecalho = document.querySelector('.auto-integration small');

  function apresentar({ conectado, gpio2, recebido_em }) {
    estado.textContent = conectado ? 'Conectado via Wi-Fi' : 'Sem comunicação';
    gpio.textContent = conectado ? (gpio2 ? 'Ligado' : 'Desligado') : 'Sem sinal';
    gpio.style.color = conectado && gpio2 ? '#16834b' : '#64748b';
    ultima.textContent = recebido_em
      ? 'Último pacote: ' + new Date(recebido_em).toLocaleTimeString('pt-BR')
      : 'Nenhum pacote recebido';
    selo.textContent = conectado ? 'ESP32 em teste' : 'Sem sinal';
    selo.classList.toggle('offline', !conectado);
    selo.style.background = conectado ? '#e9f9ef' : '';
    selo.style.color = conectado ? '#166534' : '';
    if (cabecalho) {
      cabecalho.textContent = conectado ? 'ESP32 D1 conectado (teste)' : 'Sem telemetria real';
      cabecalho.classList.toggle('waiting', !conectado);
    }
    if (detalheCabecalho) {
      detalheCabecalho.textContent = 'PT100 e acionamentos ainda não integrados';
    }
  }

  async function atualizar() {
    try {
      const resposta = await fetch('/automacao/api/esp32/estado', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!resposta.ok) throw new Error('Resposta HTTP ' + resposta.status);
      apresentar(await resposta.json());
    } catch (_erro) {
      apresentar({ conectado: false, gpio2: null, recebido_em: null });
      estado.textContent = 'Sem acesso à telemetria';
    }
  }

  atualizar();
  setInterval(atualizar, 800);
})();
