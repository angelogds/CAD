const router = require('express').Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./acompanhamento-compras.controller');

const READ_ACCESS = ACCESS.acompanhamento_compras || [];

router.get('/', requireLogin, requireRole(READ_ACCESS), ctrl.index);
router.get('/:id', requireLogin, requireRole(READ_ACCESS), ctrl.detalhe);

module.exports = router;
