function classifyTemperature(value) {
  const numero = typeof value === 'number' || typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  const estado = require('./temperatura-sinaleiro').classifyTemperature(numero) || { faixa_temperatura: 'SENSOR_INDISPONIVEL', cor_sinaleiro: 'DESLIGADO', pronto_descarga: false };
  const labels = { BAIXA: 'Temperatura baixa / início', INTERMEDIARIA: 'Aquecimento intermediário', ALTA: 'Faixa alta de cozimento', PRONTO: 'Pronto para descarga', SENSOR_INDISPONIVEL: 'Sem sinal' };
  const colors = { VERDE: 'GREEN', AMARELO: 'YELLOW', VERMELHO: 'RED', VERMELHO_PISCANDO: 'RED', DESLIGADO: 'OFF' };
  return { key: estado.faixa_temperatura, color: colors[estado.cor_sinaleiro], label: labels[estado.faixa_temperatura],
    detail: labels[estado.faixa_temperatura], ready: estado.pronto_descarga, blink: estado.cor_sinaleiro === 'VERMELHO_PISCANDO' };
}

const DIGESTORES = Object.freeze([
  { id: 1, nome: 'Digestor 1', sensor: 'PT100', valvulas: [{ key: 'EIXO', nome: 'Eixo' }, { key: 'CAMISA', nome: 'Camisa' }] },
  { id: 2, nome: 'Digestor 2', sensor: 'PT100', valvulas: [{ key: 'EIXO', nome: 'Eixo' }, { key: 'CAMISA', nome: 'Camisa' }] },
  { id: 3, nome: 'Digestor 3', sensor: 'PT100', valvulas: [{ key: 'EIXO', nome: 'Eixo' }, { key: 'CAMISA', nome: 'Camisa' }] },
  { id: 4, nome: 'Digestor 4', sensor: 'PT100', valvulas: [{ key: 'EIXO', nome: 'Eixo' }, { key: 'CAMISA', nome: 'Camisa' }] },
]);

// Inventário preliminar da área; tags e vínculos com o cadastro são pendências de campo.
// Nenhum status real de máquina é inferido sem telemetria validada.
const DECANTERS = Object.freeze([
  { key: 'bomba-entrada', nome: 'Bomba de entrada', tipo: 'bomba', area: 'entrada' },
  { key: 'decanter-fast', nome: 'Decanter FAST', tipo: 'decanter', area: 'processo' },
  { key: 'decanter-grate', nome: 'Decanter GRATE', tipo: 'decanter', area: 'processo' },
  { key: 'rosca-borra', nome: 'Rosca de saída da borra', tipo: 'rosca', area: 'borra' },
  { key: 'bomba-saida-1', nome: 'Bomba de saída 1', tipo: 'bomba', area: 'saida' },
  { key: 'bomba-saida-2', nome: 'Bomba de saída 2', tipo: 'bomba', area: 'saida' },
  { key: 'tanque-servico', nome: 'Tanque de serviço', tipo: 'tanque', area: 'tanque' },
]);


// Representação provisória das três prensas, sujeita à conferência com o cadastro e com a fábrica.
// A prensa já equipada com CLP/IHM é apenas indicada; não há conexão ou telemetria neste módulo.
const PRENSAS = Object.freeze([
  { key: 'prensa-clp', nome: 'Prensa com CLP / IHM', descricao: 'Alimentação automática existente', tipo: 'prensa', integracaoPrevista: 'Leitura do CLP existente' },
  { key: 'prensa-p50', nome: 'Prensa P50', descricao: 'Identificação de campo a validar', tipo: 'prensa', integracaoPrevista: 'Instrumentação a definir' },
  { key: 'prensa-p46', nome: 'Prensa P46', descricao: 'Identificação de campo a validar', tipo: 'prensa', integracaoPrevista: 'Instrumentação a definir' },
]);
function getPrensasOverview() {
  return PRENSAS.map(item => ({ ...item, estado: 'SEM_SINAL', estadoLabel: 'Sem sinal', integrado: false, comando_habilitado: false }));
}

function listSetores() {
  return [
    { key: 'digestores', title: 'Digestores', description: 'Leitura de temperatura PT100 e descargas automáticas para limpeza dos purgadores.', href: '/automacao/digestores', status: 'EM_IMPLANTACAO' },
    { key: 'prensas', title: 'Prensas', description: 'Três prensas em visão esquemática; estudo futuro de monitoramento do CLP e da IHM existente.', href: '/automacao/prensas', status: 'EM_IMPLANTACAO' },
    { key: 'decanters', title: 'Decanters e tanque de serviço', description: 'Visão esquemática das duas decanters, bombas, tanque e rosca da borra.', href: '/automacao/decanters', status: 'EM_IMPLANTACAO' },
  ];
}

function getDigestoresOverview() {
  return DIGESTORES.map((digestor) => ({
    ...digestor,
    temperatura_c: null,
    temperatura_status: 'SEM_SINAL',
    processo: classifyTemperature(null),
    valvulas: digestor.valvulas.map((valvula) => ({ ...valvula, estado: 'SEM_SINAL', comando_habilitado: false })),
  }));
}

function getDecantersOverview() {
  return DECANTERS.map((equipamento) => ({
    ...equipamento,
    estado: 'SEM_SINAL',
    estadoLabel: 'Sem sinal',
    integrado: false,
    telemetria: null,
    comando_habilitado: false,
  }));
}

function getIntegrationState() {
  return { mode: 'AGUARDANDO_HARDWARE', label: 'Aguardando integração com ESP32 / gateway', live: false, simulator: false };
}

module.exports = { listSetores, getDigestoresOverview, getDecantersOverview, getPrensasOverview, getIntegrationState, classifyTemperature };
