const { normalizeRole } = require('../../config/rbac');
const service = require('./automacao.service');

function index(req, res) {
  return res.render('automacao/index', {
    title: 'Automação',
    activeMenu: 'automacao',
    setores: service.listSetores(),
    configuracaoAdmin: normalizeRole(req.session && req.session.user && req.session.user.role) === 'ADMIN',
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
    title: 'Automação - Decanters e Tanque de Serviço',
    activeMenu: 'automacao',
    equipamentos: service.getDecantersOverview(),
    integrationState: service.getIntegrationState(),
  });
}

function prensas(req, res) {
  return res.render('automacao/prensas', {
    title: 'Automação - Prensas',
    activeMenu: 'automacao',
    prensas: service.getPrensasOverview(),
    integrationState: service.getIntegrationState(),
  });
}

function simuladorDigestores(req, res) {
  return res.render('automacao/simulador-digestores', {
    title: 'Automação - Simulador dos Digestores',
    activeMenu: 'automacao',
  });
}

module.exports = { index, digestores, decanters, prensas, simuladorDigestores };
