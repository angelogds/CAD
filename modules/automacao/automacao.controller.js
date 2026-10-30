const { normalizeRole, ACCESS } = require('../../config/rbac');
const service = require('./automacao.service');
const crypto = require('node:crypto');

function index(req, res) {
  const role = normalizeRole(req.session && req.session.user && req.session.user.role);
  const visualizacaoAutomacaoCompleta = ACCESS.automacao_view.includes(role);
  return res.render('automacao/index', {
    title: '2A Automação Industrial',
    activeMenu: 'automacao',
    setores: service.listSetores().filter(setor => visualizacaoAutomacaoCompleta || ['decanters', 'digestores'].includes(setor.key))
      .map(setor => !visualizacaoAutomacaoCompleta && setor.key === 'digestores' ? { ...setor, href: '/automacao/digestores/simulador', description: 'Simuladores locais dos digestores e do circuito mecânico.' } : setor),
    visualizacaoAutomacaoCompleta,
    configuracaoAdmin: role === 'ADMIN',
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
  return renderDecanters(req, res, false);
}

function simuladorDecanters(req, res) {
  return renderDecanters(req, res, true);
}

function renderDecanters(req, res, modoSimulacaoDecanters) {
  const role = normalizeRole(req.session && req.session.user && req.session.user.role);
  res.setHeader('Cache-Control', 'no-store');
  return res.render('automacao/decanters', {
    title: '2A Automação Industrial · ' + (modoSimulacaoDecanters ? 'Simulador das Decanters' : 'Decanters e Tanque de Serviço'),
    activeMenu: 'automacao',
    visualizacaoAutomacaoCompleta: ACCESS.automacao_view.includes(role),
    simulacaoDecantersHabilitada: ACCESS.automacao_decanters_simulate.includes(role),
    modoSimulacaoDecanters,
    equipamentos: service.getDecantersOverview(),
    integrationState: service.getIntegrationState(),
  });
}

function prensas(req, res) {
  return renderPrensas(req, res, false);
}

function simuladorPrensas(req, res) {
  return renderPrensas(req, res, true);
}

function renderPrensas(req, res, simular) {
  const role = normalizeRole(req.session && req.session.user && req.session.user.role);
  const admin = role === 'ADMIN';
  res.setHeader('Cache-Control', 'no-store');
  return res.render('automacao/prensas', {
    title: '2A Automação Industrial · ' + (simular ? 'Simulador das Prensas' : 'Prensas'),
    activeMenu: 'automacao',
    prensas: service.getPrensasOverview(),
    integrationState: service.getIntegrationState(),
    simulacaoPrensasHabilitada: admin && simular,
    configuracaoAdmin: admin,
  });
}

function simuladorDigestores(req, res) {
  const role = normalizeRole(req.session && req.session.user && req.session.user.role);
  res.setHeader('Cache-Control', 'no-store');
  const podeSincronizarBancada = ACCESS.automacao_bancada_simulate.includes(role);
  if (podeSincronizarBancada && req.session && !req.session.automacaoConfigCsrf) req.session.automacaoConfigCsrf=crypto.randomBytes(32).toString('hex');
  return res.render('automacao/simulador-digestores', {
    simuladorBancadaAdmin: podeSincronizarBancada,
    simuladorBancadaPermitida: podeSincronizarBancada,
    configuracaoAdmin: role === 'ADMIN',
    simulacaoCircuitoPermitida: ACCESS.automacao_view.includes(role) || ACCESS.automacao_decanters_simulate.includes(role),
    visualizacaoAutomacaoCompleta: ACCESS.automacao_view.includes(role),
    csrfAutomacao: podeSincronizarBancada && req.session ? req.session.automacaoConfigCsrf : '',
    title: '2A Automação Industrial · Simulador dos Digestores',
    activeMenu: 'automacao',
  });
}

module.exports = { index, digestores, decanters, prensas, simuladorPrensas, simuladorDigestores, simuladorDecanters };
