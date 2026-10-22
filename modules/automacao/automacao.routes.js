const express = require('express');
const router = express.Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./automacao.controller');

// POST autenticado por token de dispositivo; nunca concede controle de atuadores.
router.post('/api/esp32/telemetria', ctrl.receberEsp32);
router.get('/api/esp32/estado', requireLogin, requireRole(ACCESS.automacao_view), ctrl.consultarEsp32);

router.get('/', requireLogin, requireRole(ACCESS.automacao_view), ctrl.index);
router.get('/digestores', requireLogin, requireRole(ACCESS.automacao_view), ctrl.digestores);
router.get('/decanters', requireLogin, requireRole(ACCESS.automacao_view), ctrl.decanters);

router.get('/prensas', requireLogin, requireRole(ACCESS.automacao_view), ctrl.prensas);

router.get('/digestores/simulador', requireLogin, requireRole(ACCESS.automacao_view), ctrl.simuladorDigestores);

module.exports = router;
