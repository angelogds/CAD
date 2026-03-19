const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./academia.controller');

const router = express.Router();

const certUploadDir = path.join(__dirname, '../../public/uploads/academia/certificados-externos');
fs.mkdirSync(certUploadDir, { recursive: true });

const certUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, certUploadDir),
    filename: (_req, file, cb) => {
      const clean = String(file.originalname || 'certificado').replace(/[^a-zA-Z0-9_.-]+/g, '-');
      cb(null, `${Date.now()}-${clean}`);
    },
  }),
});

router.get('/', requireLogin, requireRole(ACCESS.academia_view), ctrl.index);
router.get('/cursos', requireLogin, requireRole(ACCESS.academia_view), ctrl.cursos);
router.get('/curso/:id', requireLogin, requireRole(ACCESS.academia_view), ctrl.cursoDetalhe);
router.get('/trilha/:id', requireLogin, requireRole(ACCESS.academia_view), ctrl.trilhaDetalhe);
router.get('/minhas-aulas', requireLogin, requireRole(ACCESS.academia_view), ctrl.minhasAulas);
router.get('/avaliacoes', requireLogin, requireRole(ACCESS.academia_view), ctrl.avaliacoes);
router.get('/certificados', requireLogin, requireRole(ACCESS.academia_view), ctrl.certificados);
router.get('/certificados-externos', requireLogin, requireRole(ACCESS.academia_view), ctrl.certificadosExternos);
router.get('/documentos-internos', requireLogin, requireRole(ACCESS.academia_view), ctrl.documentosInternos);
router.get('/ranking', requireLogin, requireRole(ACCESS.academia_view), ctrl.ranking);
router.get('/trilhas', requireLogin, requireRole(ACCESS.academia_view), ctrl.trilhas);
router.get('/biblioteca', requireLogin, requireRole(ACCESS.academia_view), ctrl.biblioteca);
router.get('/professor-ia', requireLogin, requireRole(ACCESS.academia_view), ctrl.professorIA);

router.post('/iniciar/:curso_id', requireLogin, requireRole(ACCESS.academia_view), ctrl.iniciarCurso);
router.post('/continuar/:curso_id', requireLogin, requireRole(ACCESS.academia_view), ctrl.continuarCurso);
router.post('/curso/:curso_id/bloco/:bloco_id/concluir', requireLogin, requireRole(ACCESS.academia_view), ctrl.concluirBloco);
router.post('/concluir/:curso_id', requireLogin, requireRole(ACCESS.academia_view), ctrl.concluirCurso);
router.post('/avaliacoes/:curso_id/enviar', requireLogin, requireRole(ACCESS.academia_view), ctrl.enviarAvaliacao);
router.post('/certificado', requireLogin, requireRole(ACCESS.academia_view), ctrl.certificado);
router.post('/certificado/upload', requireLogin, requireRole(ACCESS.academia_view), certUpload.single('certificado_externo'), ctrl.certificadoUpload);
router.post('/professor-ia/perguntar', requireLogin, requireRole(ACCESS.academia_view), ctrl.professorIAPerguntar);

router.post('/cursos/:curso_id/liberar-etapa-externa', requireLogin, requireRole(ACCESS.academia_manage), ctrl.liberarEtapaExterna);
router.post('/etapas-externas/:id/validar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.validarEtapaExterna);
router.post('/cursos/criar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.criarCurso);
router.post('/aulas/criar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.criarAula);
router.post('/blocos/criar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.criarBloco);
router.post('/ebooks/criar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.criarEbook);

module.exports = router;
