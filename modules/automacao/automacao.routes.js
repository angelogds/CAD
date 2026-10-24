const express = require('express');
const router = express.Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./automacao.controller');

router.get('/', requireLogin, requireRole(ACCESS.automacao_view), ctrl.index);
router.get('/digestores', requireLogin, requireRole(ACCESS.automacao_view), ctrl.digestores);
router.get('/decanters', requireLogin, requireRole(ACCESS.automacao_view), ctrl.decanters);

router.get('/prensas', requireLogin, requireRole(ACCESS.automacao_view), ctrl.prensas);

router.get('/digestores/simulador', requireLogin, requireRole(ACCESS.automacao_view), ctrl.simuladorDigestores);

router.get('/dispositivos', requireLogin, requireRole(ACCESS.automacao_manage), (req, res) => res.render('automacao/dispositivos', { title: 'Automação - Dispositivos ESP32', activeMenu: 'automacao' }));
const dev = require('./dispositivos.service');
const manage = [requireLogin, requireRole(ACCESS.automacao_manage)];
router.get('/api/dispositivos', ...manage, (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ok: true, dispositivos: dev.listDevices() }); });
router.post('/api/dispositivos/:deviceId/token', ...manage, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, ...dev.issueToken(req.params.deviceId, req.session && req.session.user && req.session.user.id), aviso: 'Guarde agora: o token não será mostrado novamente.' });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
router.post('/api/dispositivos/:deviceId/revogar', ...manage, (req, res) => {
  try { res.json({ ok: dev.revoke(req.params.deviceId) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

module.exports = router;
