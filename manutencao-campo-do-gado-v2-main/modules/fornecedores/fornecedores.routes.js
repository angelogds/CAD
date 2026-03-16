const express = require('express');
const router = express.Router();

const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./fornecedores.controller');

router.get('/', requireLogin, requireRole(ACCESS.fornecedores), ctrl.list);
router.get('/novo', requireLogin, requireRole(ACCESS.fornecedores), ctrl.newForm);
router.post('/', requireLogin, requireRole(ACCESS.fornecedores), ctrl.create);
router.get('/:id/editar', requireLogin, requireRole(ACCESS.fornecedores), ctrl.editForm);
router.post('/:id', requireLogin, requireRole(ACCESS.fornecedores), ctrl.update);

module.exports = router;
