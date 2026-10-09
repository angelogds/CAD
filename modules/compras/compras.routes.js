const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = require('express').Router();

const { requireLogin, requireRole, requireAdmin } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./compras.controller');
const flowCtrl = require('./compras.itens-consenso.controller');
const approvalGuard = require('./compras.aprovacao.middleware');
const consensusGuard = require('./compras.consenso.middleware');
const itemApprovalCtrl = require('./compras.aprovacao-itens.controller');
const itemCorrecaoCtrl = require('./compras.item-correcao.controller');
const reciclagemScope = require('./compras.reciclagem-scope.middleware');
const storagePaths = require('../../config/storage');

const COMPRAS_READ_ACCESS = [...new Set([...(ACCESS.compras_read || []), ...(ACCESS.compras_reciclagem_read || [])])];
const COMPRAS_MANAGE_ACCESS = [...new Set([...(ACCESS.compras_manage || []), ...(ACCESS.compras_reciclagem_manage || [])])];

const uploadsDir = storagePaths.UPLOAD_DIR;
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${(file.originalname || 'arquivo').replace(/\s+/g, '_')}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new Error('Formato inválido. Use PDF/JPG/PNG.'));
    return cb(null, true);
  },
});

router.get('/demandas/pre-cotacoes.json', requireLogin, requireRole(ACCESS.compras_read), ctrl.preCotacoesDemandasJson);
router.get('/consenso-itens/pendentes.json', requireLogin, requireRole(ACCESS.compras_read), flowCtrl.notificacoesConsensoJson);
router.get('/itens-liberados.json', requireLogin, requireRole(ACCESS.compras_read), itemApprovalCtrl.liberadosDashboardJson);
router.get('/solicitacoes', requireLogin, requireRole(COMPRAS_READ_ACCESS), ctrl.lista);
router.get('/solicitacoes/:id/pdf', requireLogin, requireRole(COMPRAS_READ_ACCESS), reciclagemScope.requireSolicitacaoScope, ctrl.pdf);
router.get('/solicitacoes/:id/aprovacao-itens.json', requireLogin, requireRole(COMPRAS_READ_ACCESS), reciclagemScope.requireSolicitacaoScope, itemApprovalCtrl.statusJson);
router.get('/solicitacoes/:id/consenso-itens.json', requireLogin, requireRole(COMPRAS_READ_ACCESS), reciclagemScope.requireSolicitacaoScope, flowCtrl.consensoItensJson);
router.get('/solicitacoes/:id', requireLogin, requireRole(COMPRAS_READ_ACCESS), reciclagemScope.requireSolicitacaoScope, flowCtrl.detalhe);

router.post('/solicitacoes/:id/cotacoes', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, ctrl.criarCotacao);
router.post('/solicitacoes/:id/cotacoes/:cotacaoId/selecionar', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireCotacaoScope, ctrl.selecionarCotacao);
router.post('/solicitacoes/:id/atualizar-dados', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, ctrl.atualizarDados);
router.post('/solicitacoes/:id/marcar-comprada', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, consensusGuard.blockAnyPendingAlteration, approvalGuard.requireApprovedPurchase, ctrl.marcarComprada);
router.post('/solicitacoes/:id/painel-itens', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireBodyItemsScope, consensusGuard.blockSelectedPendingAlteration, approvalGuard.requireApprovedPurchaseIntent, ctrl.salvarPainelItens);
router.post('/solicitacoes/:id/itens/:itemId/corrigir-compra', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, itemCorrecaoCtrl.corrigirItemCompra);

router.post('/solicitacoes/:id/itens/:itemId/alteracao', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.solicitarAlteracao);
router.post('/solicitacoes/:id/itens/:itemId/alteracao/aprovar', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.aprovarAlteracao);
router.post('/solicitacoes/:id/itens/:itemId/alteracao/recusar', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.recusarAlteracao);
router.post('/solicitacoes/:id/itens/:itemId/exclusao', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.solicitarExclusao);
router.post('/solicitacoes/:id/itens/:itemId/exclusao/cancelar', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.cancelarExclusao);
router.post('/solicitacoes/:id/itens-excepcionais', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, approvalGuard.blockExceptionalDirectPurchase, flowCtrl.adicionarItem);

router.post('/solicitacoes/:id/anexos', requireLogin, requireRole(COMPRAS_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, upload.single('arquivo'), ctrl.uploadAnexo);
router.get('/anexos/:anexoId/download', requireLogin, requireRole(COMPRAS_READ_ACCESS), reciclagemScope.requireAnexoScope, ctrl.downloadAnexo);
router.post('/anexos/:anexoId/delete', requireLogin, requireAdmin, ctrl.deleteAnexo);

router.get('/', (_req, res) => res.redirect('/compras/solicitacoes'));

module.exports = router;
