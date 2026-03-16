const service = require("./almoxarifado.service");
const estoqueService = require("../estoque/estoque.service");

function recebimentos(req, res) {
  res.render("almoxarifado/recebimentos", { title: "Recebimentos", activeMenu: "almoxarifado", lista: service.listRecebimentos(), status: req.query.status || "" });
}

function iniciarRecebimento(req, res) {
  try { service.iniciarRecebimento(Number(req.params.id), req.session.user.id); req.flash("success", "Recebimento iniciado."); }
  catch (e) { req.flash("error", e.message); }
  res.redirect(`/almoxarifado/solicitacoes/${req.params.id}/conferir`);
}

function conferir(req, res) {
  const sol = service.getSolicitacao(Number(req.params.id));
  if (!sol) return res.status(404).send("Solicitação não encontrada");
  res.render("almoxarifado/conferir", { title: `Conferir ${sol.numero}`, activeMenu: "almoxarifado", sol });
}

function receberItem(req, res) {
  try {
    service.receberItem({ solicitacaoId: Number(req.params.id), itemId: Number(req.params.itemId), qtdAgora: Number(req.body.qtd_recebida_agora || 0), observacao: req.body.observacao_item, userId: req.session.user.id });
    req.flash("success", "Item recebido e estoque atualizado.");
  } catch (e) { req.flash("error", e.message); }
  res.redirect(`/almoxarifado/solicitacoes/${req.params.id}/conferir`);
}

function finalizar(req, res) { try { service.finalizarRecebimento(Number(req.params.id)); req.flash("success", "Recebimento finalizado."); } catch (e) { req.flash("error", e.message); } res.redirect("/almoxarifado/recebimentos"); }
function fechar(req, res) { try { service.fechar(Number(req.params.id)); req.flash("success", "Solicitação fechada."); } catch (e) { req.flash("error", e.message); } res.redirect("/almoxarifado/recebimentos"); }
function reabrir(req, res) { try { service.reabrir(Number(req.params.id)); req.flash("success", "Solicitação reaberta."); } catch (e) { req.flash("error", e.message); } res.redirect("/almoxarifado/recebimentos"); }

function registrarSaida(req, res) {
  try { estoqueService.registrarSaida({ ...req.body, usuario_id: req.session.user.id }); req.flash("success", "Saída registrada."); }
  catch (e) { req.flash("error", e.message); }
  res.redirect("/estoque/saidas/nova");
}

module.exports = { recebimentos, iniciarRecebimento, conferir, receberItem, finalizar, fechar, reabrir, registrarSaida };
