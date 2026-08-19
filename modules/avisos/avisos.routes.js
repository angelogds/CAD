const express = require('express');
const router = express.Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./avisos.controller');

const viewRoles = ACCESS.avisos_view;
const manageRoles = ACCESS.avisos_manage;
const deleteRoles = ACCESS.avisos_delete;

router.get('/', requireLogin, requireRole(viewRoles), ctrl.index);
router.post('/', requireLogin, requireRole(manageRoles), ctrl.create);
router.post('/:id/editar', requireLogin, requireRole(manageRoles), ctrl.update);
router.post('/:id/publicar', requireLogin, requireRole(manageRoles), ctrl.publishNow);
router.post('/:id/cancelar-agendamento', requireLogin, requireRole(manageRoles), ctrl.cancelSchedule);
router.post('/:id/duplicar', requireLogin, requireRole(manageRoles), ctrl.duplicate);
router.post('/:id/delete', requireLogin, requireRole(deleteRoles), ctrl.remove);

module.exports = router;
