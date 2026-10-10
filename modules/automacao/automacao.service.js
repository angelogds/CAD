function classifyTemperature(value) {
  const temperatura = Number(value);
  if (value == null || String(value).trim() === '' || !Number.isFinite(temperatura)) {
    return {
      key: 'SEM_SINAL',
      color: 'OFF',
      label: 'Sem sinal',
      detail: 'Aguardando leitura PT100',
      ready: false,
    };
  }

  if (temperatura < 80) {
    return {
      key: 'FRIO',
      color: 'RED',
      label: 'Material frio',
      detail: temperatura < 60 ? 'Abaixo da faixa operacional informada' : 'Material carregado / frio',
      ready: false,
    };
  }

  if (temperatura < 120) {
    return {
      key: temperatura < 100 ? 'FRITANDO' : 'COZIMENTO_FINAL',
      color: 'YELLOW',
      label: temperatura < 100 ? 'Material fritando' : 'Cozimento final',
      detail: temperatura < 100 ? 'Faixa de aquecimento 80–100 °C' : 'Aguardando atingir 120 °C',
      ready: false,
    };
  }

  return {
    key: 'PRONTO',
    color: 'GREEN',
    label: 'Pronto para descarregar',
    detail: 'Temperatura de referência atingida',
    ready: true,
  };
}

const DIGESTORES = Object.freeze([
  { id: 1, nome: 'Digestor 1', sensor: 'PT100', valvulas: [{ key: 'EIXO', nome: 'Eixo' }, { key: 'CAMISA', nome: 'Camisa' }] },
  { id: 2, nome: 'Digestor 2', sensor: 'PT100', valvulas: [{ key: 'EIXO', nome: 'Eixo' }, { key: 'CAMISA', nome: 'Camisa' }] },
  { id: 3, nome: 'Digestor 3', sensor: 'PT100', valvulas: [{ key: 'EIXO', nome: 'Eixo' }, { key: 'CAMISA', nome: 'Camisa' }] },
  { id: 4, nome: 'Digestor 4', sensor: 'PT100', valvulas: [{ key: 'EIXO', nome: 'Eixo' }, { key: 'CAMISA', nome: 'Camisa' }] },
]);

function listSetores() {
  return [
    {
      key: 'digestores',
      title: 'Digestores',
      description: 'Leitura de temperatura PT100 e descargas automáticas para limpeza dos purgadores.',
      href: '/automacao/digestores',
      status: 'EM_IMPLANTACAO',
    },
  ];
}

function getDigestoresOverview() {
  return DIGESTORES.map((digestor) => ({
    ...digestor,
    temperatura_c: null,
    temperatura_status: 'SEM_SINAL',
    processo: classifyTemperature(null),
    valvulas: digestor.valvulas.map((valvula) => ({
      ...valvula,
      estado: 'SEM_SINAL',
      comando_habilitado: false,
    })),
  }));
}

function getIntegrationState() {
  return {
    mode: 'AGUARDANDO_HARDWARE',
    label: 'Aguardando integração com ESP32 / gateway',
    live: false,
    simulator: false,
  };
}

module.exports = {
  listSetores,
  getDigestoresOverview,
  getIntegrationState,
  classifyTemperature,
};
