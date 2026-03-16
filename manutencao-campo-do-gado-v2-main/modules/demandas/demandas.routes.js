const express = require('express');
const router = express.Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./demandas.controller');

router.get('/', requireLogin, requireRole(ACCESS.demandas_view), ctrl.index);
router.get('/new', requireLogin, requireRole(ACCESS.demandas_open), ctrl.newForm);
router.post('/', requireLogin, requireRole(ACCESS.demandas_open), ctrl.create);
router.get('/:id', requireLogin, requireRole(ACCESS.demandas_view), ctrl.show);
router.post('/:id/status', requireLogin, requireRole(ACCESS.demandas_manage), ctrl.updateStatus);
router.post('/:id/update', requireLogin, requireRole(ACCESS.demandas_manage), ctrl.addUpdate);
router.post('/:id/convert-to-os', requireLogin, requireRole(ACCESS.demandas_manage), ctrl.convertToOS);

module.exports = router;
