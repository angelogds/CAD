const express = require('express');
const router = express.Router();

const ctrl = require('./tracagem.controller');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');

const VIEW_ACCESS = ACCESS.tracagem_view || ['ADMIN'];
const MANAGE_ACCESS = ACCESS.tracagem_manage || ['ADMIN'];

const withMenu = (handler) => (req, res, next) => {
  res.locals.activeMenu = 'tracagem';
  return handler(req, res, next);
};

router.get('/', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.index));
router.get('/lista', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.lista));

router.get('/rosca-helicoidal', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.roscaForm));
router.post('/rosca-helicoidal/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.roscaCalcular));
router.get('/furacao-flange', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.flangeForm));
router.post('/furacao-flange/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.flangeCalcular));
router.get('/cilindro', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.cilindroForm));
router.post('/cilindro/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.cilindroCalcular));
router.get('/curva-gomos', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.curvaForm));
router.post('/curva-gomos/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.curvaCalcular));
router.get('/quadrado-redondo', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.quadradoRedondoForm));
router.post('/quadrado-redondo/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.quadradoRedondoCalcular));
router.get('/quadrado-para-redondo', requireLogin, requireRole(VIEW_ACCESS), (_req, res) => res.redirect('/tracagem/quadrado-redondo'));
router.post('/quadrado-para-redondo/calcular', requireLogin, requireRole(MANAGE_ACCESS), (_req, res) => res.redirect('/tracagem/quadrado-redondo'));
router.get('/reducao-concentrica', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.reducaoConcentricaForm));
router.post('/reducao-concentrica/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.reducaoConcentricaCalcular));
router.get('/semi-cilindro', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.semiCilindroForm));
router.post('/semi-cilindro/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.semiCilindroCalcular));
router.get('/boca-lobo-excentrica', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.bocaLoboExcentricaForm));
router.post('/boca-lobo-excentrica/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.bocaLoboExcentricaCalcular));
router.get('/boca-de-lobo-45', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.bocaLobo45Form));
router.post('/boca-de-lobo-45/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.bocaLobo45Calcular));
router.get('/boca-de-lobo-90', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.bocaLobo90Form));
router.post('/boca-de-lobo-90/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.bocaLobo90Calcular));
router.get('/boca-de-lobo-excentrica', requireLogin, requireRole(VIEW_ACCESS), (_req, res) => res.redirect('/tracagem/boca-lobo-excentrica'));
router.post('/boca-de-lobo-excentrica/calcular', requireLogin, requireRole(MANAGE_ACCESS), (_req, res) => res.redirect('/tracagem/boca-lobo-excentrica'));
router.get('/boca-lobo-45', requireLogin, requireRole(VIEW_ACCESS), (_req, res) => res.redirect('/tracagem/boca-de-lobo-45'));
router.post('/boca-lobo-45/calcular', requireLogin, requireRole(MANAGE_ACCESS), (_req, res) => res.redirect('/tracagem/boca-de-lobo-45'));
router.get('/boca-lobo-90', requireLogin, requireRole(VIEW_ACCESS), (_req, res) => res.redirect('/tracagem/boca-de-lobo-90'));
router.post('/boca-lobo-90/calcular', requireLogin, requireRole(MANAGE_ACCESS), (_req, res) => res.redirect('/tracagem/boca-de-lobo-90'));
router.get('/boca-de-lobo-45-graus', requireLogin, requireRole(VIEW_ACCESS), (_req, res) => res.redirect('/tracagem/boca-de-lobo-45'));
router.post('/boca-de-lobo-45-graus/calcular', requireLogin, requireRole(MANAGE_ACCESS), (_req, res) => res.redirect('/tracagem/boca-de-lobo-45'));
router.get('/boca-de-lobo-90-graus', requireLogin, requireRole(VIEW_ACCESS), (_req, res) => res.redirect('/tracagem/boca-de-lobo-90'));
router.post('/boca-de-lobo-90-graus/calcular', requireLogin, requireRole(MANAGE_ACCESS), (_req, res) => res.redirect('/tracagem/boca-de-lobo-90'));
router.get('/mao-francesa', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.maoFrancesaForm));
router.post('/mao-francesa/calcular', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.maoFrancesaCalcular));
router.get('/pao-francesa', requireLogin, requireRole(VIEW_ACCESS), (_req, res) => res.redirect('/tracagem/mao-francesa'));
router.post('/pao-francesa/calcular', requireLogin, requireRole(MANAGE_ACCESS), (_req, res) => res.redirect('/tracagem/mao-francesa'));


router.get('/equipamentos/search', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.listarEquipamentosVinculo));
router.post('/relacionar-equipamento', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.relacionarEquipamento));
router.post('/salvar', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.salvar));
router.post('/pdf-calculo', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.gerarPdfCalculo));
router.get('/:id/pdf', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.gerarPdf));
router.get('/:id/pdf/download', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.baixarPdfVinculado));
router.get('/:id', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.show));


module.exports = router;
