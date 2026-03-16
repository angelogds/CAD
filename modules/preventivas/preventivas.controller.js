const service = require("./preventivas.service");

function index(req, res) {
  const lista = service.listPlanos();
  return res.render("preventivas/index", {
    layout: "layout",
    title: "Preventivas",
    activeMenu: "preventivas",
    lista
  });
}

function newForm(req, res) {
  const equipamentos = service.listEquipamentosAtivos();
  return res.render("preventivas/nova", {
    layout: "layout",
    title: "Nova Preventiva",
    activeMenu: "preventivas",
    equipamentos
  });
}

function create(req, res) {
  const { equipamento_id, titulo, frequencia_tipo, frequencia_valor, observacao } = req.body;

  if (!titulo || !titulo.trim()) {
    req.flash("error", "Informe o título da preventiva.");
    return res.redirect("/preventivas/nova");
  }

  const id = service.createPlano({
    equipamento_id: equipamento_id ? Number(equipamento_id) : null,
    titulo: titulo.trim(),
    frequencia_tipo: (frequencia_tipo || "mensal").trim(),
    frequencia_valor: frequencia_valor ? Number(String(frequencia_valor).replace(",", ".")) : 1,
    ativo: true,
    observacao: (observacao || "").trim()
  });

  req.flash("success", "Preventiva criada com sucesso.");
  return res.redirect(`/preventivas/${id}`);
}

function show(req, res) {
  const id = Number(req.params.id);
  const plano = service.getPlanoById(id);

  if (!plano) {
    return res.status(404).render("errors/404", { title: "Não encontrado" });
  }

  const execucoes = service.listExecucoes(id);

  return res.render("preventivas/show", {
    layout: "layout",
    title: `Preventiva #${id}`,
    activeMenu: "preventivas",
    plano,
    execucoes
  });
}

function execCreate(req, res) {
  const planoId = Number(req.params.id);
  const { data_prevista, responsavel, observacao } = req.body;

  service.createExecucao(planoId, {
    data_prevista: (data_prevista || "").trim(),
    status: "pendente",
    responsavel: (responsavel || "").trim(),
    observacao: (observacao || "").trim()
  });

  req.flash("success", "Execução adicionada.");
  return res.redirect(`/preventivas/${planoId}`);
}

function execUpdateStatus(req, res) {
  const planoId = Number(req.params.id);
  const execId = Number(req.params.execId);
  const { status, data_executada } = req.body;

  const ok = service.updateExecucaoStatus(planoId, execId, status, data_executada);

  if (!ok) {
    req.flash("error", "Execução não encontrada para este plano.");
    return res.redirect(`/preventivas/${planoId}`);
  }

  req.flash("success", "Status da execução atualizado.");
  return res.redirect(`/preventivas/${planoId}`);
}

module.exports = { index, newForm, create, show, execCreate, execUpdateStatus };
