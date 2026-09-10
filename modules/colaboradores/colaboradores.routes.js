const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const ctrl = require('./colaboradores.controller');
const qrCtrl = require('./colaboradores.qr.controller');
const rhCtrl = require('../rh/rh.controller');
const rhDocuments = require('../rh/rh.documents');
const storagePaths = require('../../config/storage');

const router = express.Router();

const fotosDir = path.join(storagePaths.IMAGE_DIR, 'colaboradores', 'fotos');
const docsDir = path.join(storagePaths.UPLOAD_DIR, 'colaboradores', 'documentos');
// Exames e novos documentos do portal RH ficam fora de /uploads, pois /uploads é público.
const examesDir = path.join(storagePaths.DATA_DIR, 'rh', 'exames');
const rhDocsDir = rhDocuments.PRIVATE_DOCUMENT_DIR;
fs.mkdirSync(fotosDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });
fs.mkdirSync(examesDir, { recursive: true });
fs.mkdirSync(rhDocsDir, { recursive: true });

function fileName(_req, file, cb) {
  cb(null, `${Date.now()}-${String(file.originalname || 'arquivo').replace(/\s+/g, '-')}`);
}

function privateFileName(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
}

const uploadFoto = multer({ storage: multer.diskStorage({ destination: (_req, _f, cb) => cb(null, fotosDir), filename: fileName }) });
const uploadDoc = multer({ storage: multer.diskStorage({ destination: (_req, _f, cb) => cb(null, docsDir), filename: fileName }) });
const rhAllowedMime = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const uploadExame = multer({
  storage: multer.diskStorage({ destination: (_req, _f, cb) => cb(null, examesDir), filename: privateFileName }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!rhAllowedMime.has(String(file.mimetype || '').toLowerCase())) {
      return cb(new Error('Formato de exame inválido. Envie PDF, JPG, PNG ou WEBP.'));
    }
    return cb(null, true);
  },
});
const uploadRhDoc = multer({
  storage: multer.diskStorage({ destination: (_req, _f, cb) => cb(null, rhDocsDir), filename: privateFileName }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!rhAllowedMime.has(String(file.mimetype || '').toLowerCase())) {
      return cb(new Error('Formato de documento inválido. Envie PDF, JPG, PNG ou WEBP.'));
    }
    return cb(null, true);
  },
});

function safe(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function uploadSeguro(upload, area) {
  return (req, res, next) => upload.single('arquivo')(req, res, (err) => {
    if (!err) return next();
    const label = area === 'documentos' ? 'documento' : 'exame';
    const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? `O anexo do ${label} deve ter no máximo 10 MB.`
      : (err.message || `Não foi possível processar o anexo do ${label}.`);
    req.flash?.('error', message);
    return res.redirect(`/escala/rh?colaborador=${Number(req.params.id || 0)}#${area}`);
  });
}

const uploadExameSeguro = uploadSeguro(uploadExame, 'exames');
const uploadRhDocSeguro = uploadSeguro(uploadRhDoc, 'documentos');

router.use(requireLogin, (req, res, next) => {
  res.locals.activeMenu = 'colaboradores';
  return next();
});

router.get('/instalacao', requireRole(['ADMIN', 'RH']), safe(ctrl.installationGuide));
router.get('/', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'COLABORADOR']), safe(ctrl.index));
router.post('/', requireRole(['ADMIN', 'RH']), uploadFoto.single('foto'), safe(ctrl.create));

router.get('/:id/cartao', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(qrCtrl.cartao));
router.post('/:id/cartao/emitir', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(qrCtrl.emitir));
router.post('/:id/cartao/revogar', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(qrCtrl.revogar));

// Fase 3 RH: anexos sensíveis em storage privado e rotas protegidas.
router.post('/:id/exames', requireRole(['ADMIN', 'RH']), uploadExameSeguro, safe(rhCtrl.criarExame));
router.get('/:id/exames/:exameId/arquivo', requireRole(['ADMIN', 'RH']), safe(rhCtrl.exameArquivo));
router.post('/:id/rh-documentos', requireRole(['ADMIN', 'RH']), uploadRhDocSeguro, safe(rhCtrl.criarDocumento));
router.get('/:id/rh-documentos/:documentoId/arquivo', requireRole(['ADMIN', 'RH']), safe(rhCtrl.documentoArquivo));

router.get('/:id', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'COLABORADOR']), safe(ctrl.show));
router.post('/:id/perfil', requireRole(['ADMIN', 'RH']), uploadFoto.single('foto'), safe(ctrl.savePerfil));

router.post('/:id/ferramental', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.lancarFerramental));
router.post('/:id/ferramental/:movId/acao', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.atualizarFerramental));

router.post('/:id/epis', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.lancarEpi));
router.post('/:id/epis/:entregaId/acao', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.atualizarEpi));

router.post('/:id/materiais', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.lancarMateriais));

router.post('/:id/certificados', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), uploadDoc.single('arquivo'), safe(ctrl.criarCertificado));
router.post('/:id/certificados/:certificadoId/validar', requireRole(['ADMIN', 'RH']), safe(ctrl.validarCertificado));

// Rota legada preservada para não quebrar a ficha existente de Colaboradores.
router.post('/:id/documentos', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), uploadDoc.single('arquivo'), safe(ctrl.uploadDocumento));

router.post('/:id/confirmar-ciencia', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'COLABORADOR']), safe(ctrl.confirmarCiencia));

router.get('/:id/relatorios/:tipo', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.relatorio));

module.exports = router;
