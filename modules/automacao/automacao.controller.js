const service = require('./automacao.service');
const crypto = require('node:crypto');
const esp32Teste = require('./esp32-teste.service');

// Entrada restrita a telemetria: não recebe comandos de válvulas nem estado PT100.
// Autenticação de máquina independente da sessão web.
function receberEsp32(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const esperado = process.env.IHM_ESP32_D1_TOKEN || '';
  if (esperado.length < 32) {
    return res.status(503).json({ error: 'Token do piloto ESP32 não configurado.' });
  }
  const fornecido = /^Bearer (\S+)$/.exec(req.get('authorization') || '')?.[1] || '';
  const hash = (valor) => crypto.createHash('sha256').update(valor, 'utf8').digest();
  if (!fornecido || !crypto.timingSafeEqual(hash(fornecido), hash(esperado))) {
    return res.status(401).json({ error: 'Dispositivo não autorizado.' });
  }
  try {
    const resultado = esp32Teste.registrarLeitura(req.body);
    return res.json(resultado);
  } catch (_erro) {
    return res.status(400).json({ error: 'Payload inválido.' });
  }
}

function consultarEsp32(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.json(esp32Teste.consultarLeitura());
}


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

module.exports = { index, digestores, decanters, prensas, simuladorDigestores, receberEsp32, consultarEsp32 };
