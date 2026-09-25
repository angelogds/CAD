const express = require('express');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./lubrificacao.controller');

const router = express.Router();
const EXECUTION_ACCESS = ACCESS.lubrificacao_execucao;

router.get('/', requireLogin, requireRole(EXECUTION_ACCESS), ctrl.index);
router.get('/relatorio-semanal.pdf', requireLogin, requireRole(EXECUTION_ACCESS), ctrl.relatorioSemanalPdf);
router.post('/:id/executar', requireLogin, requireRole(EXECUTION_ACCESS), ctrl.executar);

module.exports = router;
