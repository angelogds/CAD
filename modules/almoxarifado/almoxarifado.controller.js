const { randomUUID } = require("node:crypto");
const service = require("./almoxarifado.service");
const estoqueService = require("../estoque/estoque.service");
const alertsHub = require("../alerts/alerts.hub");
const { normalizeRole, ACCESS } = require("../../config/rbac");
const { STATUS } = require("../solicitacoes/solicitacoes.service");

function canManageAlmox(user) {
  return ["ADMIN", "ALMOXARIFADO"].includes(normalizeRole(user?.role));
}
function canWithdrawStock(user) {
  return ACCESS.estoque_retirada.includes(normalizeRole(user?.role));
}

function publicarMaterialDisponivel({ solicitacaoId, itemId, quantidadeRecebida, resultado }) {
  try {
    const sol = service.getSolicitacao(solicitacaoId);
    if (!sol?.os_id) return false;

    const item = (sol.itens || []).find((entry) => Number(entry.id) === Number(itemId));
    if (!item) return false;

    const totalRecebido = Number(item.qtd_recebida_calc || item.qtd_recebida_total || 0);
    const eventId = `almox-${randomUUID()}`;
    alertsHub.publish("material_disponivel", {
      event_id: eventId,
      origem: "ALMOXARIFADO_RECEBIMENTO",
      os_id: Number(sol.os_id),
      solicitacao_id: Number(sol.id),
      solicitacao_numero: sol.numero || `#${sol.id}`,
      item_id: Number(item.id),
      estoque_item_id: Number(resultado?.estoqueItemId || item.estoque_item_id || 0) || null,
      material: item.item_nome_exibicao || item.estoque_item_nome || item.item_nome || item.item_descricao || `Item #${item.id}`,
      unidade: String(item.unidade || "UN").toUpperCase(),
      quantidade_recebida: Number(quantidadeRecebida || 0),
      quantidade_total_recebida: totalRecebido,
      quantidade_disponivel: Number(item.disponivel_retirada || 0),
      quantidade_pendente: Number(item.qtd_a_receber || item.pendente || 0),
      local_estoque: item.estoque_local_nome || "Almoxarifado",
      recebimento_parcial: Boolean(resultado?.recebimentoParcial),
      ts: Date.now(),
    });
    return true;
  } catch (error) {
    console.warn("[ALMOX][TV] Não foi possível publicar material disponível:", error?.message || error);
    return false;
  }
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
    const quantidadeRecebida = Number(req.body.qtd_recebida_agora || 0);
    const solicitacaoId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const resultado = service.receberItem({
      solicitacaoId,
      itemId,
      qtdAgora: quantidadeRecebida,
      observacao: req.body.observacao_item,
      localId: req.body.local_id ? Number(req.body.local_id) : null,
      userId: req.session.user.id,
    });

    // O evento só é emitido depois que receberItem conclui a transação e atualiza
    // o estoque. Se a solicitação não estiver vinculada a uma OS, nenhum alerta
    // de oficina é gerado. Falha de notificação nunca desfaz o recebimento físico.
    publicarMaterialDisponivel({ solicitacaoId, itemId, quantidadeRecebida, resultado });

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
    const mensagens = {
      [STATUS.RECEBIDA_TOTAL]: "Recebimento concluído integralmente.",
      [STATUS.SEPARADA_PARA_RETIRADA]: "Recebimento concluído. Materiais reservados e separados para retirada.",
      [STATUS.ENTREGUE_SOLICITANTE]: "Recebimento concluído e todos os materiais já constam como entregues ao solicitante.",
    };
    req.flash("success", mensagens[statusFinal]
      || "Etapa finalizada como recebimento parcial; as quantidades ainda não recebidas continuam abertas.");
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
      : status === STATUS.SEPARADA_PARA_RETIRADA
        ? "Processo reaberto mantendo os materiais separados para retirada."
        : status === STATUS.ENTREGUE_SOLICITANTE
          ? "Processo reaberto mantendo o registro de entrega ao solicitante."
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
  publicarMaterialDisponivel,
};
