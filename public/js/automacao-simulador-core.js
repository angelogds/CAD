/* Núcleo puro da demonstração IHM. Sem acesso a hardware ou rede. */
(function () {
  'use strict';
  const INTERVALO_PURGA_SEGUNDOS = 30;
  const TEMPERATURA_INICIAL = 30;
  const TEMPERATURA_PRONTA = 120;

  function faixaTemperatura(valor) {
    const temp = Number(valor);
    if (!Number.isFinite(temp)) return { key: 'sem-sinal', label: 'Valor inválido', lamp: 'off', ready: false };
    if (temp < 80) return { key: 'carregado', label: 'Carregado / frio', lamp: 'red', ready: false };
    if (temp < TEMPERATURA_PRONTA) return { key: 'aquecendo', label: 'Em cozimento', lamp: 'yellow', ready: false };
    return { key: 'pronto', label: 'Pronto para descarregar (sim.)', lamp: 'green', ready: true };
  }

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

  function avancarDigestor(item, segundosVirtuais) {
    const delta = Number(segundosVirtuais);
    if (!item.enabled || !Number.isFinite(delta) || delta <= 0) return item;
    item.cycleActive = true;
    item.cycleSeconds += delta;
    item.temp = Math.min(TEMPERATURA_PRONTA, item.temp + delta * 0.22);
    return item;
  }

  const api = { INTERVALO_PURGA_SEGUNDOS, TEMPERATURA_INICIAL, TEMPERATURA_PRONTA, faixaTemperatura, estadoPurgadores, avancarDigestor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.AutomacaoSimuladorCore = api;
})();
