const router = require("express").Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS, normalizeRole } = require("../../config/rbac");
const ctrl = require("./solicitacoes.controller");


function requireAdminDeleteSolicitacao(req, res, next) {
  if (normalizeRole(req.session?.user?.role) === "ADMIN") return next();
  req.flash("error", "Apenas administradores podem excluir solicitações.");
  return res.redirect("/solicitacoes/minhas");
}

router.get("/minhas", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.minhas);
router.get("/nova", requireLogin, requireRole(ACCESS.solicitacoes_create), ctrl.nova);
router.post("/", requireLogin, requireRole(ACCESS.solicitacoes_create), ctrl.criar);
router.get("/:id/pdf", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.pdf);
router.post("/:id/excluir", requireLogin, requireAdminDeleteSolicitacao, requireRole(ACCESS.solicitacoes_delete), ctrl.excluir);
router.get("/:id/editar", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.editar);
router.post("/:id/editar", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.atualizar);
router.get("/:id", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.detalhe);
router.get("/", (_req, res) => res.redirect("/solicitacoes/minhas"));

module.exports = router;
