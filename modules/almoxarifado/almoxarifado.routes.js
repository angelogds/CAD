const router = require("express").Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./almoxarifado.controller");
const gerencialCtrl = require("./almoxarifado.gerencial.controller");
const gerencialPdf = require("./almoxarifado.gerencial.pdf");
const qrCtrl = require("./retiradas-qr.controller");

const RETIRADA_QR_ACCESS = Array.from(new Set([...(ACCESS.almoxarifado_read || []), ...(ACCESS.estoque_retirada || [])]));

router.get("/", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.index);
router.get("/gerencial", requireLogin, requireRole(ACCESS.almoxarifado_read), gerencialCtrl.index);
router.get("/gerencial/pdf", requireLogin, requireRole(ACCESS.almoxarifado_read), gerencialPdf.exportar);
router.get("/estoque", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.estoqueOperacional);
router.get("/estoque/inventario", requireLogin, requireRole(ACCESS.estoque_manage), ctrl.inventarioArmazemFardo);
router.post("/estoque/inventario", requireLogin, requireRole(ACCESS.estoque_manage), ctrl.salvarInventarioArmazemFardo);
router.post("/estoque/:itemId/classificar", requireLogin, requireRole(ACCESS.estoque_manage), ctrl.classificarEstoqueItem);
router.get("/recebimentos", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.recebimentos);
router.get("/retiradas/qr", requireLogin, requireRole(RETIRADA_QR_ACCESS), qrCtrl.scanner);
router.post("/reservas/:reservaId/retirar", requireLogin, requireRole(ACCESS.estoque_retirada), qrCtrl.retirar);
router.post("/solicitacoes/:id/iniciar-recebimento", requireLogin, requireRole(ACCESS.almoxarifado_manage), ctrl.iniciarRecebimento);
router.get("/solicitacoes/:id/conferir", requireLogin, requireRole(ACCESS.almoxarifado_read), ctrl.conferir);
router.post("/solicitacoes/:id/itens/:itemId/receber", requireLogin, requireRole(ACCESS.almoxarifado_manage), ctrl.receberItem);
router.post("/solicitacoes/:id/itens/:itemId/retirar", requireLogin, requireRole(ACCESS.estoque_retirada), ctrl.retirarItem);
router.post("/solicitacoes/:id/retirar-todos", requireLogin, requireRole(ACCESS.estoque_retirada), ctrl.retirarTodos);
router.post("/solicitacoes/:id/finalizar-recebimento", requireLogin, requireRole(ACCESS.almoxarifado_manage), ctrl.finalizar);
router.post("/solicitacoes/:id/fechar", requireLogin, requireRole(ACCESS.almoxarifado_manage), ctrl.fechar);
router.post("/solicitacoes/:id/reabrir", requireLogin, requireRole(ACCESS.almoxarifado_manage), ctrl.reabrir);

module.exports = router;
