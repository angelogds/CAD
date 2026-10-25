// Contrato comum da sinalização. Em operação REAL o CAD valida e espelha o estado informado.
const FAIXAS = Object.freeze(['BAIXA', 'INTERMEDIARIA', 'ALTA', 'PRONTO', 'SENSOR_INDISPONIVEL']);
const CORES = Object.freeze(['VERDE', 'AMARELO', 'VERMELHO', 'VERMELHO_PISCANDO', 'DESLIGADO']);
function classifyTemperature(t) {
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > 850) return null;
  if (t <= 50) return { faixa_temperatura: 'BAIXA', cor_sinaleiro: 'VERDE', pronto_descarga: false, fase: 'INICIO' };
  if (t < 100) return { faixa_temperatura: 'INTERMEDIARIA', cor_sinaleiro: 'AMARELO', pronto_descarga: false, fase: 'MEIO' };
  if (t <= 120) return { faixa_temperatura: 'ALTA', cor_sinaleiro: 'VERMELHO', pronto_descarga: false, fase: 'MEIO' };
  return { faixa_temperatura: 'PRONTO', cor_sinaleiro: 'VERMELHO_PISCANDO', pronto_descarga: true, fase: 'FINAL' };
}
function legacySignal(fase) {
  return ({ INICIO: { faixa_temperatura: 'BAIXA', cor_sinaleiro: 'VERDE', pronto_descarga: false },
    MEIO: { faixa_temperatura: 'INTERMEDIARIA', cor_sinaleiro: 'AMARELO', pronto_descarga: false },
    FINAL: { faixa_temperatura: 'PRONTO', cor_sinaleiro: 'VERMELHO_PISCANDO', pronto_descarga: true },
    PARADO: { faixa_temperatura: 'SENSOR_INDISPONIVEL', cor_sinaleiro: 'DESLIGADO', pronto_descarga: false } })[fase];
}
module.exports = { classifyTemperature, legacySignal, FAIXAS, CORES };
