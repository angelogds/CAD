const { normalizeRole } = require('../../config/rbac');
const service = require('./automacao.service');
const crypto = require('node:crypto');

function index(req, res) {
  return res.render('automacao/index', {
    title: '2A Automação Industrial',
    activeMenu: 'automacao',
    setores: service.listSetores(),
    configuracaoAdmin: normalizeRole(req.session && req.session.user && req.session.user.role) === 'ADMIN',
  });
}

function digestores(req, res) {
  return res.render('automacao/digestores', {
    title: '2A Automação Industrial · Digestores',
    activeMenu: 'automacao',
    digestores: service.getDigestoresOverview(),
    integrationState: service.getIntegrationState(),
  });
}

function decanters(req, res) {
  return res.render('automacao/decanters', {
    title: '2A Automação Industrial · Decanters e Tanque de Serviço',
    activeMenu: 'automacao',
    equipamentos: service.getDecantersOverview(),
    integrationState: service.getIntegrationState(),
  });
}

function prensas(req, res) {
  return res.render('automacao/prensas', {
    title: '2A Automação Industrial · Prensas',
    activeMenu: 'automacao',
    prensas: service.getPrensasOverview(),
    integrationState: service.getIntegrationState(),
  });
}

function simuladorDigestores(req, res) {
  const admin = normalizeRole(req.session && req.session.user && req.session.user.role) === 'ADMIN';
  if (admin && req.session && !req.session.automacaoConfigCsrf) req.session.automacaoConfigCsrf=crypto.randomBytes(32).toString('hex');
  return res.render('automacao/simulador-digestores', {
    simuladorBancadaAdmin: admin,
    csrfAutomacao: admin && req.session ? req.session.automacaoConfigCsrf : '',
    title: '2A Automação Industrial · Simulador dos Digestores',
    activeMenu: 'automacao',
  });
}

module.exports = { index, digestores, decanters, prensas, simuladorDigestores };
