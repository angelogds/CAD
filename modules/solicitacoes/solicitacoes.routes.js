const router = require("express").Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./solicitacoes.controller");
const flowCtrl = require("./solicitacoes.itens-consenso.controller");
const reciclagemScope = require("../compras/compras.reciclagem-scope.middleware");

const SOLICITACOES_READ_ACCESS = [...new Set([...(ACCESS.solicitacoes_read || []), ...(ACCESS.solicitacoes_reciclagem_read || [])])];
const SOLICITACOES_CREATE_ACCESS = [...new Set([...(ACCESS.solicitacoes_create || []), ...(ACCESS.solicitacoes_reciclagem_create || [])])];
const SOLICITACOES_MANAGE_ACCESS = [...new Set([...(ACCESS.solicitacoes_read || []), ...(ACCESS.solicitacoes_reciclagem_manage || [])])];
const SOLICITACOES_DELETE_ACCESS = [...new Set([...(ACCESS.solicitacoes_delete || []), ...(ACCESS.solicitacoes_reciclagem_delete || [])])];

const DIRETORIA_COMPRAS = ACCESS.diretoria_compras || [];
const DIRETORIA_COMPRAS_PATH = "/dashboard/diretoria/compras";

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

router.get("/minhas", requireLogin, requireRole(SOLICITACOES_READ_ACCESS), ctrl.minhas);
router.get("/nova", requireLogin, requireRole(SOLICITACOES_CREATE_ACCESS), ctrl.nova);

// Compatibilidade: o acompanhamento executivo saiu de Solicitações. URLs antigas
// continuam válidas para favoritos e notificações existentes.
router.get("/acompanhamento-compras", requireLogin, requireRole(DIRETORIA_COMPRAS), redirectAcompanhamentoCompras);
router.get("/acompanhamento-compras/:id", requireLogin, requireRole(DIRETORIA_COMPRAS), redirectAcompanhamentoCompras);
router.post("/acompanhamento-compras/:id/aprovar-itens-cotados", requireLogin, requireRole(DIRETORIA_COMPRAS), redirectAprovacaoCompras);

router.post("/", requireLogin, requireRole(SOLICITACOES_CREATE_ACCESS), ctrl.criar);
router.get("/:id/pdf", requireLogin, requireRole(SOLICITACOES_READ_ACCESS), reciclagemScope.requireSolicitacaoScope, ctrl.pdf);
router.post("/:id/excluir", requireLogin, requireRole(SOLICITACOES_DELETE_ACCESS), reciclagemScope.requireSolicitacaoScope, ctrl.excluir);
router.post("/:id/cancelar", requireLogin, requireRole(SOLICITACOES_DELETE_ACCESS), reciclagemScope.requireSolicitacaoScope, ctrl.cancelar);
router.get("/:id/editar", requireLogin, requireRole(SOLICITACOES_READ_ACCESS), reciclagemScope.requireSolicitacaoScope, ctrl.editar);
router.post("/:id/editar", requireLogin, requireRole(SOLICITACOES_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, ctrl.atualizar);
router.post("/:id/finalizar", requireLogin, requireRole(SOLICITACOES_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, ctrl.finalizar);

router.post("/:id/itens/adicionar", requireLogin, requireRole(SOLICITACOES_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, flowCtrl.adicionarItem);
router.post("/:id/itens/:itemId/alteracao", requireLogin, requireRole(SOLICITACOES_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.solicitarAlteracao);
router.post("/:id/itens/:itemId/alteracao/aprovar", requireLogin, requireRole(SOLICITACOES_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.aprovarAlteracao);
router.post("/:id/itens/:itemId/alteracao/recusar", requireLogin, requireRole(SOLICITACOES_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.recusarAlteracao);
router.post("/:id/itens/:itemId/exclusao/solicitar", requireLogin, requireRole(SOLICITACOES_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.solicitarExclusao);
router.post("/:id/itens/:itemId/exclusao/aprovar", requireLogin, requireRole(SOLICITACOES_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.aprovarExclusao);
router.post("/:id/itens/:itemId/exclusao/recusar", requireLogin, requireRole(SOLICITACOES_MANAGE_ACCESS), reciclagemScope.requireSolicitacaoScope, reciclagemScope.requireItemScope, flowCtrl.recusarExclusao);

router.get("/:id", requireLogin, requireRole(SOLICITACOES_READ_ACCESS), reciclagemScope.requireSolicitacaoScope, flowCtrl.detalhe);
router.get("/", (_req, res) => res.redirect("/solicitacoes/minhas"));

module.exports = router;
