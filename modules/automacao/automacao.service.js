function classifyTemperature(value) {
  const temperatura = Number(value);
  if (!Number.isFinite(temperatura)) {
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

const DECANTERS = Object.freeze([
  {
    id: 'FAST_SATURN_3',
    nome: 'Decanter FAST Saturn 3',
    area: 'ÁREA LIMPA',
    funcao: 'Separação / filtragem de sebo',
  },
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
    {
      key: 'decanters',
      title: 'Decanters',
      description: 'Fluxo Área Suja → Área Limpa, medição do sebo e nível do Tanque de Serviço.',
      href: '/automacao/decanters',
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

function getDecantersOverview() {
  return {
    areas: [
      { key: 'AREA_SUJA', nome: 'Área Suja', estado: 'SEM_SINAL' },
      { key: 'AREA_LIMPA', nome: 'Área Limpa', estado: 'SEM_SINAL' },
    ],
    decanters: DECANTERS.map((decanter) => ({
      ...decanter,
      estado: 'SEM_SINAL',
      comando_habilitado: false,
    })),
    medicaoSebo: {
      estado: 'SEM_SINAL',
      vazao_l_min: null,
      total_l: null,
      unidade_vazao: 'L/min',
      unidade_total: 'L',
    },
    tanqueServico: {
      nome: 'Tanque de Serviço',
      nivel: null,
      nivel_estado: 'SEM_SINAL',
      faixas: ['BAIXO', 'MÉDIO', 'ALTO'],
      comando_habilitado: false,
    },
  };
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
  getDecantersOverview,
  getIntegrationState,
  classifyTemperature,
};
