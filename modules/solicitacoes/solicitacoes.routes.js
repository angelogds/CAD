const router = require("express").Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS, normalizeRole } = require("../../config/rbac");
const ctrl = require("./solicitacoes.controller");
const flowCtrl = require("./solicitacoes.itens-consenso.controller");


function requireAdminDeleteSolicitacao(req, res, next) {
  if (normalizeRole(req.session?.user?.role || req.session?.user?.perfil) === "ADMIN") return next();
  req.flash("error", "Apenas administradores podem excluir solicitações.");
  return res.redirect("/solicitacoes/minhas");
}

router.get("/minhas", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.minhas);
router.get("/nova", requireLogin, requireRole(ACCESS.solicitacoes_create), ctrl.nova);
router.get("/acompanhamento-compras", requireLogin, requireRole(ACCESS.compras_read), ctrl.acompanhamentoCompras);
router.post("/", requireLogin, requireRole(ACCESS.solicitacoes_create), ctrl.criar);
router.get("/:id/pdf", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.pdf);
router.post("/:id/excluir", requireLogin, requireAdminDeleteSolicitacao, requireRole(ACCESS.solicitacoes_delete), ctrl.excluir);
router.post("/:id/cancelar", requireLogin, requireAdminDeleteSolicitacao, requireRole(ACCESS.solicitacoes_delete), ctrl.cancelar);
router.get("/:id/editar", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.editar);
router.post("/:id/editar", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.atualizar);
router.post("/:id/finalizar", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.finalizar);
router.post("/:id/itens/:itemId/exclusao/aprovar", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.aprovarExclusao);
router.post("/:id/itens/:itemId/exclusao/recusar", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.recusarExclusao);
router.get("/:id", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.detalhe);
router.get("/", (_req, res) => res.redirect("/solicitacoes/minhas"));

module.exports = router;
