const service = require("./solicitacoes.service");
const comprasService = require("../compras/compras.service");

function minhas(req, res) {
  const userId = req.session.user.id;
  const filters = {
    query: (req.query.q || "").trim(),
    status: Object.values(service.STATUS).includes(req.query.status) ? req.query.status : "",
    date: req.query.date || "",
  };

  res.render("solicitacoes/minhas", {
    title: "Minhas Solicitações",
    activeMenu: "solicitacoes",
    lista: service.listMinhasSolicitacoes(userId, filters),
    counters: service.getCountersForUser(userId),
    filters,
    statuses: Object.values(service.STATUS),
  });
}

function nova(req, res) {
  res.render("solicitacoes/new", {
    title: "Nova Solicitação",
    activeMenu: "solicitacoes",
    equipamentos: service.listEquipamentos(),
    estoqueItens: service.listEstoqueItens(),
    formData: {},
    formItens: [],
  });
}

function criar(req, res) {
  try {
    const itens = service.parseItensFromBody(req.body);

    if (!itens.length) {
      req.flash("error", "Informe ao menos um item válido.");
      return res.redirect("/solicitacoes/nova");
    }

    const id = service.createSolicitacao({ ...req.body, userId: req.session.user.id, itens });
    req.flash("success", "✅ Solicitação criada com sucesso!");
    return res.redirect(`/solicitacoes/${id}`);
  } catch (error) {
    req.flash("error", error.message || "Não foi possível criar a solicitação.");
    return res.redirect("/solicitacoes/nova");
  }
}

function editar(req, res) {
  const solicitacao = service.getSolicitacaoById(Number(req.params.id));
  if (!solicitacao) return res.status(404).send("Solicitação não encontrada");
  if (!service.canEditSolicitacao(solicitacao, req.session.user)) {
    req.flash("error", "Esta solicitação não pode ser editada neste status ou por este usuário.");
    return res.redirect(`/solicitacoes/${solicitacao.id}`);
  }

  return res.render("solicitacoes/new", {
    title: "Editar Solicitação",
    activeMenu: "solicitacoes",
    equipamentos: service.listEquipamentos(),
    estoqueItens: service.listEstoqueItens(),
    formData: solicitacao,
    formItens: solicitacao.itens || [],
    editMode: true,
    actionUrl: `/solicitacoes/${solicitacao.id}/editar`,
  });
}

function atualizar(req, res) {
  const id = Number(req.params.id);
  try {
    const solicitacao = service.getSolicitacaoById(id);
    if (!solicitacao) return res.status(404).send("Solicitação não encontrada");
    if (!service.canEditSolicitacao(solicitacao, req.session.user)) {
      req.flash("error", "Esta solicitação não pode ser editada neste status ou por este usuário.");
      return res.redirect(`/solicitacoes/${id}`);
    }

    const itens = service.parseItensFromBody(req.body);
    if (!itens.length) {
      req.flash("error", "Informe ao menos um item válido.");
      return res.redirect(`/solicitacoes/${id}/editar`);
    }

    service.updateSolicitacao(id, { ...req.body, itens });
    req.flash("success", "Solicitação atualizada com sucesso.");
    return res.redirect(`/solicitacoes/${id}`);
  } catch (error) {
    req.flash("error", error.message || "Não foi possível atualizar a solicitação.");
    return res.redirect(`/solicitacoes/${id}/editar`);
  }
}

function detalhe(req, res) {
  try {
    const solicitacao = service.getSolicitacaoById(Number(req.params.id));
    if (!solicitacao) return res.status(404).send("Solicitação não encontrada");

    if (!service.canViewSolicitacao(solicitacao, req.session.user)) {
      req.flash("error", "Sem permissão para esta solicitação.");
      return res.redirect("/solicitacoes/minhas");
    }

    const itens = Array.isArray(solicitacao.itens) ? solicitacao.itens : [];
    const backUrl = req.query.from === "compras" ? "/compras/solicitacoes" : "/solicitacoes/minhas";

    return res.render("solicitacoes/show", {
      title: "Solicitação",
      activeMenu: "solicitacoes",
      solicitacao: {
        id: solicitacao.id,
        numero: solicitacao.numero || null,
        solicitante_nome: solicitacao.solicitante_nome || "-",
        setor_origem: solicitacao.setor_origem || "-",
        prioridade: solicitacao.prioridade || "-",
        status: solicitacao.status || "-",
        created_at: solicitacao.created_at || null,
        titulo: solicitacao.titulo || "-",
        descricao: solicitacao.descricao || "",
        cotacao_inicio_em: solicitacao.cotacao_inicio_em || null,
        comprada_em: solicitacao.comprada_em || null,
        recebida_em: solicitacao.recebida_em || null,
        fechada_em: solicitacao.fechada_em || null,
      },
      itens,
      canEdit: service.canEditSolicitacao(solicitacao, req.session.user),
      backUrl,
    });
  } catch (error) {
    return res.status(500).send("500 - Erro interno");
  }
}

function pdf(req, res) {
  try {
    const solicitacao = service.getSolicitacaoById(Number(req.params.id));
    if (!solicitacao) return res.status(404).send("Solicitação não encontrada");

    if (!service.canViewSolicitacao(solicitacao, req.session.user)) {
      req.flash("error", "Sem permissão para esta solicitação.");
      return res.redirect("/solicitacoes/minhas");
    }

    return comprasService.gerarPdf(solicitacao, res);
  } catch (error) {
    return res.status(500).send(error.message || "Falha ao gerar PDF da solicitação.");
  }
}

module.exports = { minhas, nova, criar, editar, atualizar, detalhe, pdf };
