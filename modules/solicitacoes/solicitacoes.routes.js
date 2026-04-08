const router = require("express").Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./solicitacoes.controller");

router.get("/minhas", requireLogin, requireRole(ACCESS.solicitacoes), ctrl.minhas);
router.get("/nova", requireLogin, requireRole(ACCESS.solicitacoes), ctrl.nova);
router.post("/", requireLogin, requireRole(ACCESS.solicitacoes), ctrl.criar);
router.get("/:id/pdf", requireLogin, requireRole(ACCESS.solicitacoes), ctrl.pdf);
router.get("/:id", requireLogin, requireRole(ACCESS.solicitacoes), ctrl.detalhe);
router.get("/", (_req, res) => res.redirect("/solicitacoes/minhas"));

module.exports = router;
