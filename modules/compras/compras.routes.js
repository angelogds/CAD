const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = require('express').Router();

const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./compras.controller');
const storagePaths = require('../../config/storage');

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

router.get('/solicitacoes', requireLogin, requireRole(ACCESS.compras_read), ctrl.lista);
router.get('/solicitacoes/:id', requireLogin, requireRole(ACCESS.compras_read), ctrl.detalhe);
router.get('/solicitacoes/:id/pdf', requireLogin, requireRole(ACCESS.compras_manage), ctrl.pdf);

router.post('/solicitacoes/:id/cotacoes', requireLogin, requireRole(ACCESS.compras_manage), ctrl.criarCotacao);
router.post('/solicitacoes/:id/cotacoes/:cotacaoId/selecionar', requireLogin, requireRole(ACCESS.compras_manage), ctrl.selecionarCotacao);
router.post('/solicitacoes/:id/atualizar-dados', requireLogin, requireRole(ACCESS.compras_manage), ctrl.atualizarDados);
router.post('/solicitacoes/:id/marcar-comprada', requireLogin, requireRole(ACCESS.compras_manage), ctrl.marcarComprada);

router.post('/solicitacoes/:id/anexos', requireLogin, requireRole(ACCESS.compras_manage), upload.single('arquivo'), ctrl.uploadAnexo);
router.get('/anexos/:anexoId/download', requireLogin, requireRole(ACCESS.compras_read), ctrl.downloadAnexo);
router.post('/anexos/:anexoId/delete', requireLogin, requireRole(ACCESS.compras_manage), ctrl.deleteAnexo);

router.get('/', (_req, res) => res.redirect('/compras/solicitacoes'));

module.exports = router;
