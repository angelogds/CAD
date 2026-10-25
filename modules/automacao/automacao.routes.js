const express = require('express');
const crypto = require('node:crypto');
const router = express.Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { normalizeRole } = require('../../config/rbac');
const { ACCESS, ROLE } = require('../../config/rbac');
const ctrl = require('./automacao.controller');
const devices = require('./dispositivos.service');
const bancada = require('./sinaleiro-bancada.service');
const telemetria = require('./bancada-telemetria.service');

router.get('/', requireLogin, requireRole(ACCESS.automacao_view), ctrl.index);
router.get('/digestores', requireLogin, requireRole(ACCESS.automacao_view), ctrl.digestores);
router.get('/decanters', requireLogin, requireRole(ACCESS.automacao_view), ctrl.decanters);
router.get('/prensas', requireLogin, requireRole(ACCESS.automacao_view), ctrl.prensas);
router.get('/digestores/simulador', requireLogin, requireRole(ACCESS.automacao_view), ctrl.simuladorDigestores);

// Gestão de credenciais EXCLUSIVA do ADMIN: inclusive endpoints JSON e URL legada.
const admin = [requireLogin, requireRole([ROLE.ADMIN])];
router.get('/dispositivos', ...admin, (_req, res) => res.redirect('/automacao/configuracao'));
router.get('/configuracao', ...admin, (req, res) => {
  if (!req.session.automacaoConfigCsrf) {
    req.session.automacaoConfigCsrf = crypto.randomBytes(32).toString('hex');
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.render('automacao/dispositivos', {
    title: 'Automação - Configuração ESP32',
    activeMenu: 'automacao',
    csrfAutomacao: req.session.automacaoConfigCsrf,
  });
});
// APIs JSON: nunca redirecionam para HTML. 401 = sessão expirada; 403 = sem perfil ADMIN.
function apiAdmin(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  const user = req.session && req.session.user;
  if (!user) return res.status(401).json({ ok: false, code: 'SESSAO_EXPIRADA', error: 'Sessão expirada. Entre novamente no CAD.' });
  if (normalizeRole(user.role) !== 'ADMIN') return res.status(403).json({ ok: false, code: 'SEM_PERMISSAO', error: 'Sem permissão.' });
  return next();
}
const adminApi = [apiAdmin];
function csrfAdmin(req, res, next) {
  const received = req.get('x-cgd-csrf') || '';
  const expected = req.session && req.session.automacaoConfigCsrf;
  if (!expected || received !== expected) {
    return res.status(403).json({ ok: false, code: 'CSRF_INVALIDO', error: 'Sessão de configuração inválida. Recarregue a página.' });
  }
  return next();
}
// O CAD transmite apenas três sinais de bancada, nunca comandos de vapor.
router.post('/api/simulador/sinaleiros', ...adminApi, csrfAdmin, (req,res) => {
  res.setHeader('Cache-Control','no-store');
  try { return res.json(bancada.publish(req.body && req.body.estados, req.session.user.id)); }
  catch (e) { return res.status(e.status||400).json({ok:false,error:e.message}); }
});
router.get('/api/simulador/sinaleiros/status', ...adminApi, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json(telemetria.status());
});
router.get('/api/dispositivos', ...adminApi, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ok: true, dispositivos: devices.listDevices() });
});
// Link local guardado no CAD. Acessado apenas pelo navegador do operador na mesma LAN.
router.post('/api/dispositivos/:deviceId/local-url', ...adminApi, csrfAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    return res.json({ ok: true, ...devices.updateLocalUrl(req.params.deviceId, req.body && req.body.local_url) });
  } catch (e) {
    return res.status(e.status || 400).json({ ok: false, error: e.message });
  }
});
router.post('/api/dispositivos/:deviceId/token', ...adminApi, csrfAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    return res.json({
      ok: true,
      ...devices.issueToken(req.params.deviceId, req.session.user.id, req.body && req.body.escopo),
      aviso: 'Copie agora. O token completo não poderá ser consultado novamente.',
    });
  } catch (e) {
    return res.status(e.status || 400).json({ ok: false, error: e.message });
  }
});
router.post('/api/dispositivos/:deviceId/revogar', ...adminApi, csrfAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    return res.json({ ok: devices.revoke(req.params.deviceId) });
  } catch (e) {
    return res.status(e.status || 400).json({ ok: false, error: e.message });
  }
});
module.exports = router;
