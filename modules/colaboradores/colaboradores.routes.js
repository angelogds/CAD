const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const ctrl = require('./colaboradores.controller');

const router = express.Router();

const fotosDir = path.join(process.cwd(), 'uploads/colaboradores/fotos');
const docsDir = path.join(process.cwd(), 'uploads/colaboradores/documentos');
fs.mkdirSync(fotosDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });

function fileName(_req, file, cb) {
  cb(null, `${Date.now()}-${String(file.originalname || 'arquivo').replace(/\s+/g, '-')}`);
}

const uploadFoto = multer({ storage: multer.diskStorage({ destination: (_req, _f, cb) => cb(null, fotosDir), filename: fileName }) });
const uploadDoc = multer({ storage: multer.diskStorage({ destination: (_req, _f, cb) => cb(null, docsDir), filename: fileName }) });

function safe(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.use(requireLogin, (req, res, next) => {
  res.locals.activeMenu = 'colaboradores';
  return next();
});

router.get('/instalacao', requireRole(['ADMIN', 'RH']), safe(ctrl.installationGuide));
router.get('/', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'COLABORADOR']), safe(ctrl.index));
router.post('/', requireRole(['ADMIN', 'RH']), uploadFoto.single('foto'), safe(ctrl.create));
router.get('/:id', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'COLABORADOR']), safe(ctrl.show));

router.post('/:id/perfil', requireRole(['ADMIN', 'RH']), uploadFoto.single('foto'), safe(ctrl.savePerfil));

router.post('/:id/ferramental', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.lancarFerramental));
router.post('/:id/ferramental/:movId/acao', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.atualizarFerramental));

router.post('/:id/epis', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.lancarEpi));
router.post('/:id/epis/:entregaId/acao', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.atualizarEpi));

router.post('/:id/materiais', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.lancarMateriais));

router.post('/:id/certificados', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), uploadDoc.single('arquivo'), safe(ctrl.criarCertificado));
router.post('/:id/certificados/:certificadoId/validar', requireRole(['ADMIN', 'RH']), safe(ctrl.validarCertificado));

router.post('/:id/documentos', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), uploadDoc.single('arquivo'), safe(ctrl.uploadDocumento));

router.post('/:id/confirmar-ciencia', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'COLABORADOR']), safe(ctrl.confirmarCiencia));

router.get('/:id/relatorios/:tipo', requireRole(['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']), safe(ctrl.relatorio));

module.exports = router;
