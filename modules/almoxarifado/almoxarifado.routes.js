const router = require("express").Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./almoxarifado.controller");

router.get("/recebimentos", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.recebimentos);
router.post("/solicitacoes/:id/iniciar-recebimento", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.iniciarRecebimento);
router.get("/solicitacoes/:id/conferir", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.conferir);
router.post("/solicitacoes/:id/itens/:itemId/receber", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.receberItem);
router.post("/solicitacoes/:id/finalizar-recebimento", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.finalizar);
router.post("/solicitacoes/:id/fechar", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.fechar);
router.post("/solicitacoes/:id/reabrir", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.reabrir);
router.get("/", (_req, res) => res.redirect("/almoxarifado/recebimentos"));

module.exports = router;
