const service = require("./almoxarifado.service");
const estoqueService = require("../estoque/estoque.service");
const { normalizeRole } = require("../../config/rbac");
const { STATUS } = require("../solicitacoes/solicitacoes.service");

function canManageAlmox(user) {
  return ["ADMIN", "ALMOXARIFADO"].includes(normalizeRole(user?.role));
}

function recebimentos(req, res) {
  const requestedStatus = String(req.query.status || STATUS.COMPRADA).trim().toUpperCase();
  const status = service.RECEBIMENTO_STATUS.includes(requestedStatus) ? requestedStatus : STATUS.COMPRADA;
  const q = String(req.query.q || "").trim();
  res.render("almoxarifado/recebimentos", {
    title: "Recebimentos",
    activeMenu: "almoxarifado",
    lista: service.listRecebimentos({ status, query: q }),
    resumo: service.getResumoRecebimentos(q),
    status,
    q,
    canManage: canManageAlmox(req.session.user),
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
    title: `Conferir ${sol.numero || `#${sol.id}`}`,
    activeMenu: "almoxarifado",
    sol,
    locais: estoqueService.listLocais(),
    historico: service.getHistoricoRecebimento(sol.id),
    canManage: canManageAlmox(req.session.user),
  });
}

function receberItem(req, res) {
  try {
    service.receberItem({
      solicitacaoId: Number(req.params.id),
      itemId: Number(req.params.itemId),
      qtdAgora: Number(req.body.qtd_recebida_agora || 0),
      observacao: req.body.observacao_item,
      localId: req.body.local_id ? Number(req.body.local_id) : null,
      userId: req.session.user.id,
    });
    req.flash("success", "Item recebido, movimentação registrada e estoque atualizado.");
  } catch (e) {
    req.flash("error", e.message);
  }
  res.redirect(`/almoxarifado/solicitacoes/${req.params.id}/conferir`);
}

function finalizar(req, res) {
  try {
    const status = service.finalizarRecebimento(Number(req.params.id));
    req.flash("success", status === STATUS.RECEBIDA_TOTAL
      ? "Recebimento concluído integralmente."
      : "Etapa finalizada como recebimento parcial; os saldos pendentes permanecem abertos.");
  } catch (e) {
    req.flash("error", e.message);
  }
  res.redirect("/almoxarifado/recebimentos");
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
  finalizar,
  fechar,
  reabrir,
  registrarSaida,
};
