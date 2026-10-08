const service = require('./automacao.service');

function index(req, res) {
  return res.render('automacao/index', {
    title: 'Automação',
    activeMenu: 'automacao',
    setores: service.listSetores(),
  });
}

function digestores(req, res) {
  return res.render('automacao/digestores', {
    title: 'Automação - Digestores',
    activeMenu: 'automacao',
    digestores: service.getDigestoresOverview(),
    integrationState: service.getIntegrationState(),
  });
}

function digestoresSimulador(req, res) {
  return res.render('automacao/simulador', {
    title: 'Automação - Simulador dos Digestores',
    activeMenu: 'automacao',
    digestores: service.getDigestoresOverview(),
  });
}

module.exports = { index, digestores, digestoresSimulador };
