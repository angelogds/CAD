/* Supervisão somente de leitura: espelha o estado informado pelo ESP32. */
(function () {
  'use strict';
  const CORES = { VERDE: ['green', 'Verde fixo'], AMARELO: ['yellow', 'Amarelo fixo'],
    VERMELHO: ['red', 'Vermelho fixo'], VERMELHO_PISCANDO: ['red', 'Vermelho piscando'], DESLIGADO: ['off', 'Desligado'] };
  const FAIXAS = { BAIXA: 'Baixa / início', INTERMEDIARIA: 'Aquecimento intermediário', ALTA: 'Faixa alta de cozimento', PRONTO: 'Pronto para descarga', SENSOR_INDISPONIVEL: 'Sensor indisponível' };
  function apresentacao(d = {}) {
    const real = d.origem === 'REAL';
    const atual = d.telemetria_atual === true;
    const medicao = real && atual && d.medicao_atual === true && d.sensor_status === 'VALIDO' && typeof d.temperatura_c === 'number' && Number.isFinite(d.temperatura_c);
    // A cor vem do firmware; não é calculada a partir da temperatura pelo CAD.
    const cor = atual && real && CORES[d.cor_sinaleiro] ? CORES[d.cor_sinaleiro] : ['off', 'Sem estado atual'];
    const pronto = medicao && d.pronto_descarga === true && d.cor_sinaleiro === 'VERMELHO_PISCANDO';
    return {
      modo: real ? 'OPERAÇÃO REAL · SUPERVISÃO' : 'SIMULAÇÃO · SEM MEDIÇÃO REAL',
      temperatura: medicao ? d.temperatura_c.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' °C' : '--,- °C',
      faixa: atual && real ? (FAIXAS[d.faixa_temperatura] || 'Faixa não informada') : 'Aguardando telemetria atual',
      cor: cor[1], lamp: cor[0], blink: atual && real && d.cor_sinaleiro === 'VERMELHO_PISCANDO',
      pronto: pronto ? 'PRONTO PARA DESCARGA · indicação térmica' : 'Pronto para descarga: não confirmado',
      sensor: real ? (atual ? d.sensor_status || 'SEM_SENSOR' : 'SEM_SINAL') : 'SEM MEDIÇÃO REAL',
      contato: d.ultimo_contato_s == null ? 'Nunca' : d.ultimo_contato_s < 2 ? 'Agora' : d.ultimo_contato_s + ' s atrás',
      medicao: medicao && d.timestamp_medicao ? d.timestamp_medicao : 'Sem leitura atual',
      conexao: d.conexao || 'SEM_DISPOSITIVO',
      ready: pronto,
    };
  }
  function expirar(digestores, segundos) {
    return digestores.map(d => {
      const idade = Math.max(Number(d.ultima_confirmacao_s) || 0, Number(d.medicao_idade_s) || 0) + segundos;
      return idade >= 15 ? { ...d, telemetria_atual: false, medicao_atual: false, pronto_descarga: false,
        temperatura_c: null, cor_sinaleiro: null, faixa_temperatura: null, fase_recebida: null, fase_aplicada: null,
        recebida_status: 'PENDENTE', aplicacao_status: 'PENDENTE', saida_status: 'NAO_INFORMADA' } : d;
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { apresentacao, expirar };
  if (typeof window !== 'undefined') window.AutomacaoTelemetriaUI = { apresentacao, expirar };
  if (typeof document === 'undefined') return;
  const root = document.getElementById('digestores-supervisao');
  if (!root || !window.CGDSimHttp) return;
  const cards = [...root.querySelectorAll('[data-telemetria-digestor]')];
  function render(digestores) {
    for (const card of cards) {
      const d = digestores.find(item => Number(item.digestor_id) === Number(card.dataset.telemetriaDigestor));
      const state = apresentacao(d);
      for (const el of card.querySelectorAll('[data-telemetria-role]')) {
        el.textContent = state[el.dataset.telemetriaRole] || '—';
      }
      const tower = card.querySelector('.process-tower');
      tower.className = 'process-tower is-' + state.lamp;
      tower.dataset.blink = String(state.blink);
      tower.setAttribute('aria-label', state.cor);
      card.classList.toggle('thermal-ready', state.ready);
    }
  }
  let busy = false, recebidoEm = null, ultimoEstado = [];
  async function refresh() {
    if (busy) return;
    busy = true;
    const solicitadoEm = Date.now();
    try {
      const data = await window.CGDSimHttp.fetchJson('/automacao/api/digestores/status');
      if (!Array.isArray(data.digestores)) throw new Error('Telemetria inválida.');
      ultimoEstado = data.digestores;
      recebidoEm = solicitadoEm;
      render(expirar(ultimoEstado, (Date.now() - recebidoEm) / 1000));
      document.getElementById('digestores-supervisao-status').textContent = 'Supervisão ativa · decisão local no ESP32';
    } catch (e) {
      ultimoEstado = [];
      recebidoEm = null;
      render([]); // Falha de comunicação nunca mantém um aviso antigo de pronto.
      document.getElementById('digestores-supervisao-status').textContent = 'Supervisão indisponível: ' + e.message;
    } finally { busy = false; }
  }
  void refresh();
  const timer = setInterval(refresh, 2000);
  const validade = setInterval(() => {
    if (recebidoEm !== null) render(expirar(ultimoEstado, (Date.now() - recebidoEm) / 1000));
  }, 1000);
  window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(validade); }, { once: true });
})();
