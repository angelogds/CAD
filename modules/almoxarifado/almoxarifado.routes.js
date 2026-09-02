const router = require("express").Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./almoxarifado.controller");
const qrCtrl = require("./retiradas-qr.controller");

router.get("/recebimentos", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.recebimentos);
router.get("/retiradas/qr", requireLogin, requireRole(ACCESS.almoxarifado_read), qrCtrl.scanner);
router.post("/reservas/:reservaId/retirar", requireLogin, requireRole(ACCESS.estoque_retirada), qrCtrl.retirar);
router.post("/solicitacoes/:id/iniciar-recebimento", requireLogin, requireRole(ACCESS.almoxarifado_manage), ctrl.iniciarRecebimento);
router.get("/solicitacoes/:id/conferir", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.conferir);
router.post("/solicitacoes/:id/itens/:itemId/receber", requireLogin, requireRole(ACCESS.almoxarifado_manage), ctrl.receberItem);
router.post("/solicitacoes/:id/itens/:itemId/retirar", requireLogin, requireRole(ACCESS.estoque_retirada), ctrl.retirarItem);
router.post("/solicitacoes/:id/retirar-todos", requireLogin, requireRole(ACCESS.estoque_retirada), ctrl.retirarTodos);
router.post("/solicitacoes/:id/finalizar-recebimento", requireLogin, requireRole(ACCESS.almoxarifado_manage), ctrl.finalizar);
router.post("/solicitacoes/:id/fechar", requireLogin, requireRole(ACCESS.almoxarifado_manage), ctrl.fechar);
router.post("/solicitacoes/:id/reabrir", requireLogin, requireRole(ACCESS.almoxarifado_manage), ctrl.reabrir);
router.get("/", (_req, res) => res.redirect("/almoxarifado/recebimentos"));

module.exports = router;
