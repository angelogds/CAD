const { normalizeRole, ACCESS } = require('../../config/rbac');
const service = require('./automacao.service');
const crypto = require('node:crypto');
const ciclos = require('./ciclos.service');

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
  if (ACCESS.automacao_decanters_simulate.includes(role) && req.session && !req.session.automacaoCiclosCsrf)
    req.session.automacaoCiclosCsrf=crypto.randomBytes(32).toString('hex');
  return res.render('automacao/simulador-digestores', {
    simuladorBancadaAdmin: podeSincronizarBancada,
    simuladorBancadaPermitida: podeSincronizarBancada,
    configuracaoAdmin: role === 'ADMIN',
    simulacaoCircuitoPermitida: ACCESS.automacao_decanters_simulate.includes(role),
    visualizacaoAutomacaoCompleta: ACCESS.automacao_view.includes(role),
    csrfAutomacao: podeSincronizarBancada && req.session ? req.session.automacaoConfigCsrf : '',
    csrfCiclos: ACCESS.automacao_decanters_simulate.includes(role) && req.session ? req.session.automacaoCiclosCsrf : '',
    title: '2A Automação Industrial · Simulador dos Digestores',
    activeMenu: 'automacao',
  });
}

function ciclosDigestores(req,res) {
  const role = normalizeRole(req.session && req.session.user && req.session.user.role);
  const podeRegistrar = ACCESS.automacao_decanters_simulate.includes(role);
  if (podeRegistrar && !req.session.automacaoCiclosCsrf) req.session.automacaoCiclosCsrf = crypto.randomBytes(32).toString('hex');
  res.setHeader('Cache-Control','no-store');
  try {
    const origem=req.query?.origem === 'SIMULACAO' ? 'SIMULACAO' : 'REAL_MANUAL';
    const filtros={origem,de:req.query?.de||'',ate:req.query?.ate||'',digestor_id:req.query?.digestor_id||'',
      colaborador_id:origem==='REAL_MANUAL'?req.query?.colaborador_id||'':''};
    const relatorio=ciclos.list(filtros);
    return res.render('automacao/digestores-ciclos',{
      title:'2A Automação · Ciclos dos Digestores',activeMenu:'automacao',
      configuracaoAdmin:role==='ADMIN',podeRegistrar,
      ciclosCsrf:podeRegistrar?req.session.automacaoCiclosCsrf:'',
      funcionarios:ciclos.getColaboradores(),relatorio,filtros
    });
  }catch(error){return res.status(error.status||500).send(error.message||'Falha ao consultar ciclos.');}
}
module.exports = { index, digestores, decanters, prensas, simuladorPrensas, simuladorDigestores, simuladorDecanters, ciclosDigestores };
