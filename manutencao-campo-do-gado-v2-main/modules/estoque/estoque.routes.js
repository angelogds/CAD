const router = require("express").Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./estoque.controller");
const almoxCtrl = require("../almoxarifado/almoxarifado.controller");

router.get("/", requireLogin, requireRole(ACCESS.estoque_view), ctrl.index);
router.get("/itens", requireLogin, requireRole(ACCESS.estoque_view), ctrl.itens);
router.get("/itens/novo", requireLogin, requireRole(ACCESS.estoque_manage), ctrl.novoItem);
router.post("/itens", requireLogin, requireRole(ACCESS.estoque_manage), ctrl.criarItem);
router.get("/itens/:id", requireLogin, requireRole(ACCESS.estoque_view), ctrl.detalheItem);
router.get("/categorias", requireLogin, requireRole(ACCESS.estoque_view), ctrl.categorias);
router.post("/categorias", requireLogin, requireRole(ACCESS.estoque_manage), ctrl.criarCategoria);
router.get("/locais", requireLogin, requireRole(ACCESS.estoque_view), ctrl.locais);
router.post("/locais", requireLogin, requireRole(ACCESS.estoque_manage), ctrl.criarLocal);
router.get("/movimentos", requireLogin, requireRole(ACCESS.estoque_view), ctrl.movimentos);
router.get("/saidas/nova", requireLogin, requireRole(ACCESS.estoque_manage), ctrl.saidaNova);
router.post("/saidas", requireLogin, requireRole(ACCESS.estoque_manage), almoxCtrl.registrarSaida);

module.exports = router;
