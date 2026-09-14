const router = require('express').Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./diretoria.controller');
const comprasCtrl = require('../solicitacoes/solicitacoes.acompanhamento.controller');
const pcmCtrl = require('../pcm/pcm.controller');

const DIRETORIA_ACCESS = ACCESS.diretoria_dashboard;
const DIRETORIA_COMPRAS = ACCESS.diretoria_compras || DIRETORIA_ACCESS;
const DIRETORIA_MANUTENCAO = ACCESS.diretoria_manutencao || DIRETORIA_ACCESS;
const DIRETORIA_BASE_PATH = '/dashboard/diretoria';

function comprasContext(req, res, next) {
  req.executivePurchasesBasePath = `${DIRETORIA_BASE_PATH}/compras`;
  req.executivePurchasesActiveMenu = 'diretoria';
  res.locals.activeMenu = 'diretoria';
  return next();
}

router.get('/', requireLogin, requireRole(DIRETORIA_ACCESS), ctrl.index);

router.get('/compras', requireLogin, requireRole(DIRETORIA_COMPRAS), comprasContext, comprasCtrl.lista);
router.get('/compras/:id', requireLogin, requireRole(DIRETORIA_COMPRAS), comprasContext, comprasCtrl.detalhe);
router.post('/compras/:id/aprovar-itens-cotados', requireLogin, requireRole(DIRETORIA_COMPRAS), comprasContext, comprasCtrl.aprovarItensCotados);

router.get('/manutencao', requireLogin, requireRole(DIRETORIA_MANUTENCAO), ctrl.manutencao);
router.get('/manutencao/dados', requireLogin, requireRole(DIRETORIA_MANUTENCAO), ctrl.manutencaoDados);
router.get('/manutencao/pdf', requireLogin, requireRole(DIRETORIA_MANUTENCAO), pcmCtrl.dashboardPdf);
router.get('/manutencao/excel', requireLogin, requireRole(DIRETORIA_MANUTENCAO), pcmCtrl.dashboardExcel);

module.exports = router;
