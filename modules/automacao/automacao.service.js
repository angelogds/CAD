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
};
