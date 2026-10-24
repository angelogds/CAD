const express = require('express');
const crypto = require('node:crypto');
const router = express.Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS, ROLE } = require('../../config/rbac');
const ctrl = require('./automacao.controller');
const devices = require('./dispositivos.service');
const bancada = require('./sinaleiro-bancada.service');

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
function csrfAdmin(req, res, next) {
  const received = req.get('x-cgd-csrf') || '';
  const expected = req.session && req.session.automacaoConfigCsrf;
  if (!expected || received !== expected) {
    return res.status(403).json({ ok: false, error: 'Sessão de configuração inválida. Recarregue a página.' });
  }
  return next();
}
// O CAD transmite apenas três sinais de bancada, nunca comandos de vapor.
router.post('/api/simulador/sinaleiros', ...admin, csrfAdmin, (req,res) => {
  res.setHeader('Cache-Control','no-store');
  try { return res.json(bancada.publish(req.body && req.body.estados, req.session.user.id)); }
  catch (e) { return res.status(e.status||400).json({ok:false,error:e.message}); }
});
router.get('/api/dispositivos', ...admin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ok: true, dispositivos: devices.listDevices() });
});
router.post('/api/dispositivos/:deviceId/token', ...admin, csrfAdmin, (req, res) => {
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
router.post('/api/dispositivos/:deviceId/revogar', ...admin, csrfAdmin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    return res.json({ ok: devices.revoke(req.params.deviceId) });
  } catch (e) {
    return res.status(e.status || 400).json({ ok: false, error: e.message });
  }
});
module.exports = router;
