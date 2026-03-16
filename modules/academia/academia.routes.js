const express = require('express');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./academia.controller');

const router = express.Router();

router.get('/', requireLogin, requireRole(ACCESS.academia_view), ctrl.index);
router.get('/cursos', requireLogin, requireRole(ACCESS.academia_view), ctrl.cursos);
router.get('/curso/:id', requireLogin, requireRole(ACCESS.academia_view), ctrl.cursoDetalhe);
router.get('/minhas-aulas', requireLogin, requireRole(ACCESS.academia_view), ctrl.minhasAulas);
router.get('/ranking', requireLogin, requireRole(ACCESS.academia_view), ctrl.ranking);
router.get('/trilhas', requireLogin, requireRole(ACCESS.academia_view), ctrl.trilhas);
router.get('/biblioteca', requireLogin, requireRole(ACCESS.academia_view), ctrl.biblioteca);

router.post('/iniciar/:curso_id', requireLogin, requireRole(ACCESS.academia_view), ctrl.iniciarCurso);
router.post('/concluir/:curso_id', requireLogin, requireRole(ACCESS.academia_view), ctrl.concluirCurso);
router.post('/certificado', requireLogin, requireRole(ACCESS.academia_view), ctrl.certificado);

router.post('/cursos/criar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.criarCurso);
router.post('/aulas/criar', requireLogin, requireRole(ACCESS.academia_manage), ctrl.criarAula);

module.exports = router;
