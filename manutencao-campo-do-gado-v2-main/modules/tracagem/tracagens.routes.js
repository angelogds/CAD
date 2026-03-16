const express = require('express');

const router = express.Router();
const ctrl = require('./tracagem.controller');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');

const VIEW_ACCESS = ACCESS.tracagem_view || ['ADMIN'];
const MANAGE_ACCESS = ACCESS.tracagem_manage || ['ADMIN'];

router.get('/', requireLogin, requireRole(VIEW_ACCESS), ctrl.tracagensIndex);
router.post('/vincular', requireLogin, requireRole(MANAGE_ACCESS), ctrl.tracagensVincular);
router.get('/equipamento/:id', requireLogin, requireRole(VIEW_ACCESS), ctrl.tracagensPorEquipamento);
router.get('/pdf/:id', requireLogin, requireRole(VIEW_ACCESS), ctrl.tracagensPdf);

module.exports = router;
