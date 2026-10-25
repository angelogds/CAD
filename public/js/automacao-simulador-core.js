/* Núcleo puro da IHM demonstrativa: nunca comunica com CLP ou equipamentos reais. */
(function () {
  'use strict';

  const INTERVALO_PURGA_SEGUNDOS = 30;
  const TEMPERATURA_INICIAL = 30;
  const TEMPERATURA_PRONTA = 121; // A indicação de pronto exige leitura acima de 120 °C.
  const TEMPERATURA_COZIMENTO = 100;
  const MAX_AMOSTRAS = 90;
  const FASES = Object.freeze({ CARREGADO: 'CARREGADO', AQUECIMENTO: 'AQUECIMENTO', COZIMENTO: 'COZIMENTO', PRONTO: 'PRONTO' });

  function faixaTemperatura(valor) {
    const temp = Number(valor);
    if (valor == null || typeof valor === 'boolean' || String(valor).trim() === '' || !Number.isFinite(temp) || temp < 0 || temp > 850) {
      return { key: 'sem-sinal', label: 'Valor inválido', lamp: 'off', blink: false, ready: false };
    }
    if (temp <= 50) return { key: 'BAIXA', label: 'Temperatura baixa / início', lamp: 'green', blink: false, ready: false };
    if (temp < 100) return { key: 'INTERMEDIARIA', label: 'Aquecimento intermediário', lamp: 'yellow', blink: false, ready: false };
    if (temp <= 120) return { key: 'ALTA', label: 'Faixa alta de cozimento', lamp: 'red', blink: false, ready: false };
    return { key: 'PRONTO', label: 'Pronto para descarga (sim.)', lamp: 'red', blink: true, ready: true };
  }

  // Intertravamento apenas gráfico. Inativo significa os dois fechados.
  function estadoPurgadores(tempoCicloSegundos, ativado) {
    if (!ativado) return { camisa: 'FECHADO', eixo: 'FECHADO', proximaTroca: INTERVALO_PURGA_SEGUNDOS, fase: 'inativo' };
    const tempo = Math.max(0, Number(tempoCicloSegundos) || 0);
    const faseCamisa = Math.floor(tempo / INTERVALO_PURGA_SEGUNDOS) % 2 === 0;
    const restante = INTERVALO_PURGA_SEGUNDOS - (tempo % INTERVALO_PURGA_SEGUNDOS);
    return {
      camisa: faseCamisa ? 'ABERTO' : 'FECHADO',
      eixo: faseCamisa ? 'FECHADO' : 'ABERTO',
      proximaTroca: Math.ceil(restante),
      fase: faseCamisa ? 'camisa' : 'eixo',
    };
  }

  function criarDigestor(indice) {
    const temp = TEMPERATURA_INICIAL + indice * 2;
    return { temp, enabled: false, cycleActive: false, cycleSeconds: 0, fase: FASES.CARREGADO,
      samples: [{ t: 0, temp }] };
  }

  function carregarDigestor(item, temperatura) {
    const t = temperatura === undefined ? TEMPERATURA_INICIAL : Number(temperatura);
    item.temp = Number.isFinite(t) ? Math.max(0, Math.min(50, t)) : TEMPERATURA_INICIAL;
    item.enabled = false;
    item.cycleActive = false;
    item.cycleSeconds = 0;
    item.fase = FASES.CARREGADO;
    item.samples = [{ t: 0, temp: item.temp }];
    return item;
  }

  function iniciarDigestor(item) {
    if (item.fase !== FASES.CARREGADO || item.enabled) return false;
    item.enabled = true;
    // A alternância só começa quando o relógio global estiver rodando.
    item.cycleActive = false;
    item.fase = FASES.AQUECIMENTO;
    return true;
  }

  // Mantém a API da V2 para preservar os testes e estados simples já suportados.
  function avancarDigestor(item, segundosVirtuais) {
    const delta = Number(segundosVirtuais);
    if (!item.enabled || !Number.isFinite(delta) || delta <= 0) return item;
    if (item.fase === FASES.PRONTO) return item;
    item.cycleActive = true;
    item.cycleSeconds += delta;
    item.temp = Math.min(TEMPERATURA_PRONTA, item.temp + delta * 0.22);
    if (item.fase) {
      if (item.temp > 120) {
        item.fase = FASES.PRONTO;
        item.enabled = false;
        item.cycleActive = false;
      } else if (item.temp >= TEMPERATURA_COZIMENTO) {
        item.fase = FASES.COZIMENTO;
      } else {
        item.fase = FASES.AQUECIMENTO;
      }
    }
    return item;
  }

  function registrarAmostra(item) {
    if (!Array.isArray(item.samples)) item.samples = [];
    const last = item.samples[item.samples.length - 1];
    if (!last || item.cycleSeconds !== last.t) {
      item.samples.push({ t: item.cycleSeconds, temp: item.temp });
      if (item.samples.length > MAX_AMOSTRAS) item.samples.splice(0, item.samples.length - MAX_AMOSTRAS);
    }
    return item.samples;
  }

  function pontosGrafico(samples, largura, altura) {
    if (!Array.isArray(samples) || !samples.length) return '';
    const w = largura || 260;
    const h = altura || 90;
    const tempos = samples.map(s => s.t);
    const inicio = Math.min(...tempos);
    const fim = Math.max(...tempos);
    const alcance = Math.max(1, fim - inicio);
    return samples.map(s => {
      const x = 14 + ((s.t - inicio) / alcance) * (w - 28);
      const y = h - 13 - (Math.max(0, Math.min(1, (s.temp - TEMPERATURA_INICIAL) / 90))) * (h - 28);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }

  const api = { INTERVALO_PURGA_SEGUNDOS, TEMPERATURA_INICIAL, TEMPERATURA_PRONTA,
    TEMPERATURA_COZIMENTO, MAX_AMOSTRAS, FASES, faixaTemperatura, estadoPurgadores,
    criarDigestor, carregarDigestor, iniciarDigestor, avancarDigestor, registrarAmostra, pontosGrafico };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.AutomacaoSimuladorCore = api;
})();
