const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./academia.controller');

const router = express.Router();

const certUploadDir = path.join(__dirname, '../../public/uploads/academia/certificados-externos');
let certUploadReady = false;
try {
  fs.mkdirSync(certUploadDir, { recursive: true });
  certUploadReady = true;
} catch (err) {
  console.warn('[academia] Falha ao preparar diretório de upload de certificados externos:', err.message || err);
}

const certUpload = multer({
  storage: certUploadReady
    ? multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, certUploadDir),
      filename: (_req, file, cb) => {
        const clean = String(file.originalname || 'certificado').replace(/[^a-zA-Z0-9_.-]+/g, '-');
        cb(null, `${Date.now()}-${clean}`);
      },
    })
    : multer.memoryStorage(),
});
const requireCertUploadStorage = (_req, res, next) => {
  if (certUploadReady) return next();
  return res.status(503).send('Upload de certificado externo indisponível no momento.');
};

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
router.post('/curso/:curso_id/bloco/:bloco_id/avaliar', requireLogin, requireRole(ACCESS.academia_view), ctrl.enviarAvaliacaoBloco);
router.post('/concluir/:curso_id', requireLogin, requireRole(ACCESS.academia_view), ctrl.concluirCurso);
router.post('/avaliacoes/:curso_id/enviar', requireLogin, requireRole(ACCESS.academia_view), ctrl.enviarAvaliacao);
router.post('/avaliacoes/:curso_id/final', requireLogin, requireRole(ACCESS.academia_view), ctrl.enviarAvaliacaoFinal);
router.post('/certificado', requireLogin, requireRole(ACCESS.academia_view), ctrl.certificado);
router.post('/certificado/upload', requireLogin, requireRole(ACCESS.academia_view), requireCertUploadStorage, certUpload.single('certificado_externo'), ctrl.certificadoUpload);
router.post('/professor-ia/perguntar', requireLogin, requireRole(ACCESS.academia_view), ctrl.professorIAPerguntar);
router.post('/ia/perguntar', requireLogin, requireRole(ACCESS.academia_view), ctrl.professorIAPerguntar);
router.post('/ia/resumir-bloco', requireLogin, requireRole(ACCESS.academia_view), ctrl.professorIAResumirBloco);
router.post('/ia/gerar-perguntas-bloco', requireLogin, requireRole(ACCESS.academia_view), ctrl.professorIAGerarPerguntasBloco);
router.post('/ia/recomendar-proximo', requireLogin, requireRole(ACCESS.academia_view), ctrl.professorIARecomendarProximo);

router.post('/cursos/:curso_id/liberar-etapa-externa', requireLogin, requireRole(ACCESS.academia_manage), ctrl.liberarEtapaExterna);
router.post('/etapas-externas/:id/validar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.validarEtapaExterna);
router.post('/cursos/criar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.criarCurso);
router.post('/aulas/criar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.criarAula);
router.post('/blocos/criar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.criarBloco);
router.post('/ebooks/criar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.criarEbook);
router.post('/admin/seed-conteudo-cursos', requireLogin, requireRole(ACCESS.academia_manage), ctrl.executarSeedConteudoCursos);

module.exports = router;
