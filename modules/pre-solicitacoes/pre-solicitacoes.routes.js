const router = require('express').Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./pre-solicitacoes.controller');

router.get('/', requireLogin, requireRole(ACCESS.pre_solicitacao_almox_read), ctrl.list);
router.get('/nova', requireLogin, requireRole(ACCESS.pre_solicitacao_almox_create), ctrl.nova);
router.post('/', requireLogin, requireRole(ACCESS.pre_solicitacao_almox_create), ctrl.criar);
router.get('/:id/editar', requireLogin, requireRole(ACCESS.pre_solicitacao_almox_create), ctrl.editar);
router.post('/:id/editar', requireLogin, requireRole(ACCESS.pre_solicitacao_almox_create), ctrl.atualizar);
router.post('/:id/itens/adicionar', requireLogin, requireRole(ACCESS.pre_solicitacao_almox_create), ctrl.adicionarItens);
router.post('/:id/itens/:itemId/decisao', requireLogin, requireRole(ACCESS.pre_solicitacao_setor_approve), ctrl.decidirItem);
router.post('/:id/finalizar', requireLogin, requireRole(ACCESS.pre_solicitacao_setor_approve), ctrl.finalizar);
router.get('/:id', requireLogin, requireRole(ACCESS.pre_solicitacao_almox_read), ctrl.detalhe);

module.exports = router;
