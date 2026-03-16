const express = require('express');
const router = express.Router();
const ctrl = require('./desenho-tecnico.controller');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');

const VIEW_ACCESS = ACCESS.desenho_tecnico_view || ['ADMIN'];
const MANAGE_ACCESS = ACCESS.desenho_tecnico_manage || ['ADMIN'];

const withMenu = (handler) => (req, res, next) => {
  res.locals.activeMenu = 'desenho-tecnico';
  return handler(req, res, next);
};

router.get('/', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.index));
router.get('/dashboard', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.dashboard));
router.get('/novo', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.novo));
router.post('/', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.create));
router.get('/biblioteca', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.biblioteca));
router.post('/biblioteca/:blocoId/duplicar', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.duplicarBloco));
router.post('/gerar-a-partir-da-tracagem/:origem/:id', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.integrarTracagem));
router.post('/integrar/tracagem', requireLogin, requireRole(MANAGE_ACCESS), withMenu((req, res) => { req.params = { origem: 'tracagem', id: req.body.id }; return ctrl.integrarTracagem(req, res); }));
router.get('/abrir-de-tracagem/:origem/:id', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.integrarTracagem));

router.get('/cad/novo', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.novoCad));
router.post('/cad', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.createCad));
router.get('/cad/:id/editor', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.cadEditor));
router.get('/cad/:id', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.showCad));
router.post('/cad/:id', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.saveCad));
router.post('/cad/:id/metadata', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.updateCadMetadata));
router.post('/cad/:id/objeto', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.saveCad));
router.post('/cad/:id/render-3d', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.renderCad3d));
router.get('/cad/:id/pdf', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.gerarPdf));

router.get('/:id', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.show));
router.get('/:id/editar', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.edit));
router.post('/:id', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.update));
router.post('/:id/inativar', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.remove));
router.post('/:id/duplicar', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.duplicar));
router.post('/:id/pdf', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.gerarPdf));
router.get('/:id/svg', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.gerarSvg));
router.post('/:id/vincular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.vincularEquipamento));
router.post('/:id/camadas', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.adicionarCamada));
router.post('/:id/camadas/:camadaId', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.atualizarCamada));
router.post('/:id/blocos/inserir', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.inserirBloco));
router.post('/:id/cotas', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.adicionarCota));
router.get('/:id/revisoes', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.revisoes));

module.exports = router;
