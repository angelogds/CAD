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

function decanters(req, res) {
  return res.render('automacao/decanters', {
    title: 'Automação - Decanters',
    activeMenu: 'automacao',
    processo: service.getDecantersOverview(),
    integrationState: service.getIntegrationState(),
  });
}

module.exports = { index, digestores, decanters };
