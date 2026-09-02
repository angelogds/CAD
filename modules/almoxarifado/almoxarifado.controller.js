const service = require("./almoxarifado.service");
const estoqueService = require("../estoque/estoque.service");
const { normalizeRole, ACCESS } = require("../../config/rbac");
const { STATUS } = require("../solicitacoes/solicitacoes.service");

function canManageAlmox(user) {
  return ["ADMIN", "ALMOXARIFADO"].includes(normalizeRole(user?.role));
}
function canWithdrawStock(user) {
  return ACCESS.estoque_retirada.includes(normalizeRole(user?.role));
}

function recebimentos(req, res) {
  const requestedStatus = String(req.query.status || "TODAS").trim().toUpperCase();
  const status = requestedStatus === "TODAS" || service.ALMOX_STATUS.includes(requestedStatus) ? requestedStatus : "TODAS";
  const q = String(req.query.q || "").trim();
  res.render("almoxarifado/recebimentos", {
    title: "Almoxarifado",
    activeMenu: "almoxarifado",
    lista: service.listRecebimentos({ status, query: q }),
    resumo: service.getResumoRecebimentos(q),
    status,
    q,
    canManage: canManageAlmox(req.session.user),
    canWithdraw: canWithdrawStock(req.session.user),
  });
}

function iniciarRecebimento(req, res) {
  try {
    service.iniciarRecebimento(Number(req.params.id), req.session.user.id);
    req.flash("success", "Recebimento iniciado. Faça a conferência física dos itens.");
  } catch (e) {
    req.flash("error", e.message);
  }
  res.redirect(`/almoxarifado/solicitacoes/${req.params.id}/conferir`);
}

function conferir(req, res) {
  const sol = service.getSolicitacao(Number(req.params.id));
  if (!sol) return res.status(404).send("Solicitação não encontrada");
  res.render("almoxarifado/conferir", {
    title: `Solicitação ${sol.numero || `#${sol.id}`}`,
    activeMenu: "almoxarifado",
    sol,
    locais: estoqueService.listLocais(),
    historico: service.getHistoricoRecebimento(sol.id),
    canManage: canManageAlmox(req.session.user),
    canWithdraw: canWithdrawStock(req.session.user),
  });
}

function receberItem(req, res) {
  try {
    const resultado = service.receberItem({
      solicitacaoId: Number(req.params.id),
      itemId: Number(req.params.itemId),
      qtdAgora: Number(req.body.qtd_recebida_agora || 0),
      observacao: req.body.observacao_item,
      localId: req.body.local_id ? Number(req.body.local_id) : null,
      userId: req.session.user.id,
    });
    if (resultado.recebimentoParcial) {
      req.flash("success", `Recebimento parcial registrado e estoque atualizado. Faltam ${resultado.faltanteApos} unidade(s); Compras será sinalizada enquanto houver essa diferença.`);
    } else {
      req.flash("success", "Item recebido integralmente, entrada registrada e saldo do estoque atualizado.");
    }
  } catch (e) {
    req.flash("error", e.message);
  }
  res.redirect(`/almoxarifado/solicitacoes/${req.params.id}/conferir#materiais`);
}

function retirarItem(req, res) {
  try {
    estoqueService.registrarSaida({
      solicitacao_id: Number(req.params.id),
      solicitacao_item_id: Number(req.params.itemId),
      quantidade: Number(req.body.quantidade || 0),
      usuario_id: req.session.user.id,
      observacao: req.body.observacao || null,
      origem: "SOLICITACAO",
    });
    req.flash("success", "Retirada registrada na solicitação e saldo do estoque atualizado.");
  } catch (e) {
    req.flash("error", e.message);
  }
  res.redirect(`/almoxarifado/solicitacoes/${req.params.id}/conferir#materiais`);
}

function retirarTodos(req, res) {
  try {
    const resultados = estoqueService.registrarSaidasSolicitacao({
      solicitacao_id: Number(req.params.id),
      usuario_id: req.session.user.id,
      observacao: req.body.observacao || null,
    });
    req.flash("success", `${resultados.length} item(ns) disponível(is) retirado(s) da solicitação.`);
  } catch (e) {
    req.flash("error", e.message);
  }
  res.redirect(`/almoxarifado/solicitacoes/${req.params.id}/conferir#materiais`);
}

function finalizar(req, res) {
  let statusFinal = STATUS.COMPRADA;
  try {
    statusFinal = service.finalizarRecebimento(Number(req.params.id));
    req.flash("success", statusFinal === STATUS.RECEBIDA_TOTAL
      ? "Recebimento concluído integralmente."
      : "Etapa finalizada como recebimento parcial; as quantidades ainda não recebidas continuam abertas.");
  } catch (e) {
    req.flash("error", e.message);
  }
  res.redirect(`/almoxarifado/recebimentos?status=${encodeURIComponent(statusFinal)}`);
}

function fechar(req, res) {
  try {
    service.fechar(Number(req.params.id));
    req.flash("success", "Solicitação fechada no Almoxarifado.");
  } catch (e) {
    req.flash("error", e.message);
  }
  res.redirect("/almoxarifado/recebimentos?status=FECHADA");
}

function reabrir(req, res) {
  try {
    const status = service.reabrir(Number(req.params.id));
    req.flash("success", status === STATUS.EM_RECEBIMENTO
      ? "Recebimento parcial reaberto para continuidade."
      : "Recebimento fechado reaberto para conferência.");
  } catch (e) {
    req.flash("error", e.message);
  }
  res.redirect(`/almoxarifado/solicitacoes/${req.params.id}/conferir`);
}

function registrarSaida(req, res) {
  try {
    estoqueService.registrarSaida({ ...req.body, usuario_id: req.session.user.id });
    req.flash("success", "Saída registrada e saldo do estoque atualizado.");
  } catch (e) {
    req.flash("error", e.message);
  }
  const contexto = String(req.body.contexto || "").toLowerCase() === "almoxarifado" ? "?contexto=almoxarifado" : "";
  res.redirect(`/estoque/saidas/nova${contexto}`);
}

module.exports = {
  recebimentos,
  iniciarRecebimento,
  conferir,
  receberItem,
  retirarItem,
  retirarTodos,
  finalizar,
  fechar,
  reabrir,
  registrarSaida,
};