const router = require("express").Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS, normalizeRole } = require("../../config/rbac");
const ctrl = require("./solicitacoes.controller");
const flowCtrl = require("./solicitacoes.itens-consenso.controller");

const DIRETORIA_COMPRAS = ACCESS.diretoria_compras || [];
const DIRETORIA_COMPRAS_PATH = "/dashboard/diretoria/compras";

function requireAdminDeleteSolicitacao(req, res, next) {
  if (normalizeRole(req.session?.user?.role || req.session?.user?.perfil) === "ADMIN") return next();
  req.flash("error", "Apenas administradores podem excluir solicitações.");
  return res.redirect("/solicitacoes/minhas");
}

function redirectAcompanhamentoCompras(req, res) {
  const suffix = req.params?.id ? `/${encodeURIComponent(req.params.id)}` : "";
  const query = new URLSearchParams(req.query || {}).toString();
  const target = `${DIRETORIA_COMPRAS_PATH}${suffix}${query ? `?${query}` : ""}`;
  return res.redirect(["GET", "HEAD"].includes(req.method) ? 301 : 307, target);
}

function redirectAprovacaoCompras(req, res) {
  const id = encodeURIComponent(req.params.id);
  return res.redirect(307, `${DIRETORIA_COMPRAS_PATH}/${id}/aprovar-itens-cotados`);
}

router.get("/minhas", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.minhas);
router.get("/nova", requireLogin, requireRole(ACCESS.solicitacoes_create), ctrl.nova);

// Compatibilidade: o acompanhamento executivo saiu de Solicitações. URLs antigas
// continuam válidas para favoritos e notificações existentes.
router.get("/acompanhamento-compras", requireLogin, requireRole(DIRETORIA_COMPRAS), redirectAcompanhamentoCompras);
router.get("/acompanhamento-compras/:id", requireLogin, requireRole(DIRETORIA_COMPRAS), redirectAcompanhamentoCompras);
router.post("/acompanhamento-compras/:id/aprovar-itens-cotados", requireLogin, requireRole(DIRETORIA_COMPRAS), redirectAprovacaoCompras);

router.post("/", requireLogin, requireRole(ACCESS.solicitacoes_create), ctrl.criar);
router.get("/:id/pdf", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.pdf);
router.post("/:id/excluir", requireLogin, requireAdminDeleteSolicitacao, requireRole(ACCESS.solicitacoes_delete), ctrl.excluir);
router.post("/:id/cancelar", requireLogin, requireAdminDeleteSolicitacao, requireRole(ACCESS.solicitacoes_delete), ctrl.cancelar);
router.get("/:id/editar", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.editar);
router.post("/:id/editar", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.atualizar);
router.post("/:id/finalizar", requireLogin, requireRole(ACCESS.solicitacoes_read), ctrl.finalizar);

router.post("/:id/itens/adicionar", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.adicionarItem);
router.post("/:id/itens/:itemId/alteracao", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.solicitarAlteracao);
router.post("/:id/itens/:itemId/alteracao/aprovar", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.aprovarAlteracao);
router.post("/:id/itens/:itemId/alteracao/recusar", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.recusarAlteracao);
router.post("/:id/itens/:itemId/exclusao/solicitar", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.solicitarExclusao);
router.post("/:id/itens/:itemId/exclusao/aprovar", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.aprovarExclusao);
router.post("/:id/itens/:itemId/exclusao/recusar", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.recusarExclusao);

router.get("/:id", requireLogin, requireRole(ACCESS.solicitacoes_read), flowCtrl.detalhe);
router.get("/", (_req, res) => res.redirect("/solicitacoes/minhas"));

module.exports = router;
