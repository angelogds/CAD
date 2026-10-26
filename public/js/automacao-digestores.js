/* Supervisão somente de leitura: espelha o estado informado pelo ESP32. */
(function () {
  'use strict';
  const CORES = { VERDE: ['green', 'Verde fixo'], AMARELO: ['yellow', 'Amarelo fixo'],
    VERMELHO: ['red', 'Vermelho fixo'], VERMELHO_PISCANDO: ['red', 'Vermelho piscando'], DESLIGADO: ['off', 'Desligado'] };
  const FAIXAS = { BAIXA: 'Baixa / início', INTERMEDIARIA: 'Aquecimento intermediário', ALTA: 'Faixa alta de cozimento', PRONTO: 'Pronto para descarga', SENSOR_INDISPONIVEL: 'Sensor indisponível' };
  function apresentacao(d = {}) {
    const real = d.origem === 'REAL';
    const simulacao = d.origem === 'SIMULACAO';
    const atual = d.telemetria_atual === true;
    const temperaturaValida = typeof d.temperatura_c === 'number' && Number.isFinite(d.temperatura_c) && d.temperatura_c >= 0 && d.temperatura_c <= 850;
    const medicaoReal = real && atual && d.medicao_atual === true && d.sensor_status === 'VALIDO' && temperaturaValida;
    const medicaoSimulada = simulacao && atual && d.simulacao_atual === true && d.sensor_status === 'SIMULADO' && temperaturaValida;
    const fonteSimulada = d.fonte_simulacao === 'LOCAL' ? 'gerado no ESP32' : d.fonte_simulacao === 'CAD' ? 'gerado pelo CAD' : 'origem não informada';
    const componentesSimulados = medicaoSimulada && d.estado_simulacao_disponivel === true;
    const medicao = medicaoReal || medicaoSimulada;
    // A cor recebida pertence à origem indicada; nenhuma leitura SIM é tratada como PT100.
    const cor = (medicao || real && atual && d.cor_sinaleiro === 'DESLIGADO') && CORES[d.cor_sinaleiro] ? CORES[d.cor_sinaleiro] : ['off', 'Sem estado atual'];
    const pronto = medicao && d.pronto_descarga === true && d.cor_sinaleiro === 'VERMELHO_PISCANDO';
    return {
      modo: real ? 'OPERAÇÃO REAL · SUPERVISÃO' : simulacao ? 'SIMULAÇÃO · '+fonteSimulada.toUpperCase() : 'AGUARDANDO TELEMETRIA',
      temperatura: medicao ? d.temperatura_c.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' °C' : '--,- °C',
      faixa: medicao || real && atual ? (FAIXAS[d.faixa_temperatura] || 'Faixa não informada') : simulacao ? 'Aguardando temperatura simulada do CAD' : 'Aguardando telemetria atual',
      cor: cor[1], lamp: cor[0], blink: medicao && d.cor_sinaleiro === 'VERMELHO_PISCANDO',
      pronto: pronto ? (medicaoSimulada ? 'PRONTO PARA DESCARGA · SIMULAÇÃO' : 'PRONTO PARA DESCARGA · indicação térmica') : 'Pronto para descarga: não confirmado',
      sensor: real ? (atual ? d.sensor_status || 'SEM_SENSOR' : 'SEM_SINAL') : medicaoSimulada ? 'Sensor simulado · '+fonteSimulada : simulacao ? 'Aguardando temperatura simulada do CAD' : 'Aguardando origem da temperatura',
      contato: d.ultimo_contato_s == null ? 'Nunca' : d.ultimo_contato_s < 2 ? 'Agora' : d.ultimo_contato_s + ' s atrás',
      medicao: medicao && d.timestamp_medicao ? d.timestamp_medicao : medicaoSimulada ? 'Temperatura simulada · '+fonteSimulada : 'Sem leitura atual',
      aquecimento: componentesSimulados && typeof d.aquecimento_simulado === 'boolean' ? (d.aquecimento_simulado ? 'LIGADO · SIM.' : 'DESLIGADO · SIM.') : 'Sem estado simulado',
      purgadores: componentesSimulados && d.purgadores_simulados ? 'Camisa: '+d.purgadores_simulados.camisa+' · Eixo: '+d.purgadores_simulados.eixo+' · SIM.' : 'Sem estado simulado',
      conexao: d.conexao || 'SEM_DISPOSITIVO',
      ready: pronto,
    };
  }
  function expirar(digestores, segundos) {
    return digestores.map(d => {
      const idade = Math.max(Number(d.ultima_confirmacao_s) || 0, Number(d.medicao_idade_s) || 0) + segundos;
      const prazoCad = d.origem === 'SIMULACAO' && d.fonte_simulacao === 'CAD';
      const expirouCad = prazoCad && (!Number.isFinite(d.validade_ms) || segundos * 1000 >= d.validade_ms);
      return idade >= 15 || expirouCad ? { ...d, telemetria_atual: false, medicao_atual: false, simulacao_atual: false, pronto_descarga: false,
        estado_simulacao_disponivel: false, aquecimento_simulado: false, purgadores_simulados: { camisa: 'FECHADO', eixo: 'FECHADO' },
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
    const states = Array(4).fill('DESLIGADO');
    for (const card of cards) {
      const d = digestores.find(item => Number(item.digestor_id) === Number(card.dataset.telemetriaDigestor));
      const state = apresentacao(d);
      const id = Number(card.dataset.telemetriaDigestor);
      if (Number.isInteger(id) && id >= 1 && id <= 4) {
        states[id - 1] = state.blink ? 'VERMELHO_PISCANDO' : state.lamp === 'red' ? 'VERMELHO'
          : state.lamp === 'yellow' ? 'AMARELO' : state.lamp === 'green' ? 'VERDE' : 'DESLIGADO';
      }
      for (const el of card.querySelectorAll('[data-telemetria-role]')) {
        el.textContent = state[el.dataset.telemetriaRole] || '—';
      }
      const tower = card.querySelector('.process-tower');
      tower.className = 'process-tower is-' + state.lamp;
      tower.dataset.blink = String(state.blink);
      tower.setAttribute('aria-label', state.cor);
      card.classList.toggle('thermal-ready', state.ready);
    }
    // O circuito mostra apenas o estado térmico já validado no cartão; nenhuma cor é inferida por temperatura bruta.
    window.CGDThermalState = { states, source: 'TELEMETRIA' };
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function')
      window.dispatchEvent(new CustomEvent('digestores-circuito:thermal', { detail: window.CGDThermalState }));
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
