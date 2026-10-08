const express = require('express');
const router = express.Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./automacao.controller');

router.get('/', requireLogin, requireRole(ACCESS.automacao_view), ctrl.index);
router.get('/digestores', requireLogin, requireRole(ACCESS.automacao_view), ctrl.digestores);
router.get('/digestores/simulador', requireLogin, requireRole(ACCESS.automacao_view), ctrl.digestoresSimulador);

module.exports = router;
