const service = require("./solicitacoes.service");
const comprasService = require("../compras/compras.service");
const osChatService = require("../os-chat/os-chat.service");
const osService = require("../os/os.service");

const PENDENTE = "Informação pendente de confirmação";

function fallback(value, fallbackText = "Não informado") {
  if (value === null || value === undefined) return fallbackText;
  const text = String(value).trim();
  return text || fallbackText;
}

function normalizeSolicitacaoForView(solicitacao) {
  return {
    id: solicitacao.id,
    numero: fallback(solicitacao.numero, `#${solicitacao.id}`),
    solicitante_nome: fallback(solicitacao.solicitante_nome, PENDENTE),
    setor_origem: fallback(solicitacao.setor_origem),
    setor_destino: fallback(solicitacao.setor_destino || solicitacao.destino_uso || "Setor de Compras"),
    responsavel_nome: fallback(solicitacao.responsavel_nome || solicitacao.compras_nome || solicitacao.almox_nome, PENDENTE),
    prioridade: fallback(solicitacao.prioridade),
    status: fallback(solicitacao.status),
    created_at: solicitacao.created_at || null,
    titulo: fallback(solicitacao.titulo),
    descricao: fallback(solicitacao.descricao, PENDENTE),
    aplicacao: fallback(solicitacao.equipamento_nome || solicitacao.destino_uso || solicitacao.tipo_origem, PENDENTE),
    observacoes: fallback(solicitacao.observacoes_compras || solicitacao.observacoes || solicitacao.descricao, "Não informado"),
    fornecedor: fallback(solicitacao.fornecedor_nome || solicitacao.fornecedor, "Não informado"),
    previsao_entrega: solicitacao.previsao_entrega || null,
    valor_total: solicitacao.valor_total || null,
    equipamento_nome: fallback(solicitacao.equipamento_nome || solicitacao.destino_uso, "Não informado"),
    motivo: fallback(solicitacao.motivo || solicitacao.descricao, PENDENTE),
    cotacao_inicio_em: solicitacao.cotacao_inicio_em || null,
    comprada_em: solicitacao.comprada_em || null,
    recebida_em: solicitacao.recebida_em || null,
    fechada_em: solicitacao.fechada_em || null,
    os_id: solicitacao.os_id || null,
  };
}

function normalizeItens(itens) {
  return (Array.isArray(itens) ? itens : []).map((item) => ({
    ...item,
    item_nome: fallback(item.item_nome || item.item_descricao),
    unidade: fallback(item.unidade, "UN"),
    qtd_solicitada: item.qtd_solicitada ?? item.quantidade ?? 0,
    item_descricao: fallback(item.item_descricao || item.observacao_item, "Não informado"),
  }));
}

function minhas(req, res) {
  const userId = req.session.user.id;
  const filters = {
    query: (req.query.q || "").trim(),
    status: Object.values(service.STATUS).includes(req.query.status) ? req.query.status : "",
    date: req.query.date || "",
    vinculadasOs: req.query.vinculadas_os === "1",
    urgentes: req.query.urgentes === "1",
  };

  res.render("solicitacoes/minhas", {
    title: "Solicitações de Material",
    activeMenu: "solicitacoes",
    lista: service.listMinhasSolicitacoes(userId, filters, req.session.user),
    counters: service.getCountersForUser(userId, req.session.user),
    filters,
    statuses: service.LIST_STATUS,
  });
}

function nova(req, res) {
  try {
    const osId = Number(req.query.os_id || 0) || null;
    const os = osId ? osService.getOSById(osId) : null;
    const equipamento = os?.equipamento_resolvido || os?.equipamento_nome || os?.equipamento || '';
    const motivoParalisacao = os?.ultimo_motivo_andamento || os?.motivo_atual || os?.status || '';
    const justificativaTecnica = os?.ultima_justificativa_andamento || os?.ultima_justificativa || os?.diagnostico || '';
    const acaoNecessaria = os?.acao_corretiva || os?.acao_preventiva || os?.resumo_tecnico || os?.acao_executada || '';
    const prioridade = os?.prioridade || os?.grau || os?.criticidade || 'MEDIA';
    const solicitante = req.session?.user?.name || req.session?.user?.email || '';
    const formData = os ? {
      os_id: os.id,
      equipamento_id: os.equipamento_id || '',
      equipamento_nome: equipamento,
      setor_origem: os.setor_solicitante || os.setor_destinatario || 'Manutenção',
      setor_os: os.setor_solicitante || os.setor_destinatario || '',
      prioridade,
      solicitante_nome: solicitante,
      motivo_paralisacao: motivoParalisacao,
      justificativa_tecnica: justificativaTecnica,
      acao_necessaria: acaoNecessaria,
      titulo: `Material para OS #${os.id}${equipamento ? ` - ${equipamento}` : ''}`,
      descricao: [
        `Número da OS: ${os.id}`,
        `Equipamento: ${equipamento || '-'}`,
        `Setor: ${os.setor_solicitante || os.setor_destinatario || '-'}`,
        `Descrição da OS: ${os.descricao || '-'}`,
        `Motivo da paralisação: ${motivoParalisacao || '-'}`,
        `Justificativa técnica: ${justificativaTecnica || '-'}`,
        `Ação necessária: ${acaoNecessaria || '-'}`,
        `Prioridade: ${prioridade || '-'}`,
        `Usuário solicitante: ${solicitante || '-'}`,
      ].join('\n'),
    } : {};
    res.render("solicitacoes/new", {
      title: "Nova Solicitação",
      activeMenu: "solicitacoes",
      equipamentos: service.listEquipamentos(),
      estoqueItens: service.listEstoqueItens(),
      formData,
      formItens: [],
      editMode: false,
      actionUrl: "/solicitacoes",
    });
  } catch (error) {
    console.error('[OS_SOLICITACAO_VINCULADA_ERRO]', error);
    req.flash("error", "Não foi possível abrir a solicitação vinculada à OS.");
    return res.redirect(req.query.os_id ? `/os/${Number(req.query.os_id)}` : "/solicitacoes/minhas");
  }
}

function criar(req, res) {
  const osId = Number(req.body.os_id || 0) || null;
  try {
    const itens = service.parseItensFromBody(req.body);

    if (!itens.length) {
      req.flash("error", "Informe ao menos um item válido.");
      return res.redirect(osId ? `/solicitacoes/nova?os_id=${osId}` : "/solicitacoes/nova");
    }

    const id = service.createSolicitacao({ ...req.body, userId: req.session.user.id, itens });
    if (osId) {
      osChatService.criarVinculoSolicitacaoOS(osId, id, req.session.user.id);
    }
    req.flash("success", osId ? "✅ Solicitação criada e vinculada à OS com sucesso!" : "✅ Solicitação criada com sucesso!");
    return res.redirect(osId ? `/os/${osId}` : `/solicitacoes/${id}`);
  } catch (error) {
    if (osId) console.error('[OS_SOLICITACAO_VINCULADA_ERRO]', error);
    req.flash("error", error.message || "Não foi possível criar a solicitação.");
    return res.redirect(osId ? `/solicitacoes/nova?os_id=${osId}` : "/solicitacoes/nova");
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
  const id = Number(req.params.id);
  try {
    const solicitacao = service.getSolicitacaoById(id);
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
      solicitacao: normalizeSolicitacaoForView(solicitacao),
      itens: normalizeItens(itens),
      anexos: Array.isArray(solicitacao.anexos) ? solicitacao.anexos : [],
      canEdit: service.canEditSolicitacao(solicitacao, req.session.user),
      backUrl,
    });
  } catch (error) {
    console.error("[solicitacoes.detalhe] Erro ao abrir solicitação", {
      id: req.params.id,
      userId: req.session?.user?.id,
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).send("Não foi possível abrir esta solicitação. Verifique os dados ou contate o suporte.");
  }
}


function registrarCancelamentoNoChatOs(resultado, req) {
  const numero = resultado.solicitacao?.numero || resultado.solicitacao?.id || req.params.id;
  for (const osId of resultado.osIds || []) {
    try {
      osChatService.registrarMensagemSistema(
        osId,
        "SOLICITACAO_CANCELADA",
        `Solicitação de material ${numero} cancelada pelo administrador.`,
        { solicitacao_id: Number(req.params.id), user_id: req.session.user.id }
      );
    } catch (chatError) {
      console.warn("[solicitacoes.cancelar] Não foi possível registrar histórico da OS", {
        solicitacaoId: Number(req.params.id),
        osId,
        message: chatError.message,
      });
    }
  }
}

function excluir(req, res) {
  const id = Number(req.params.id);
  try {
    service.excluirSolicitacao(id, req.session.user.id);
    req.flash("success", "Solicitação excluída com sucesso.");
  } catch (error) {
    console.error("[ERRO_EXCLUIR_SOLICITACAO]", {
      solicitacaoId: req.params.id,
      usuarioId: req.user?.id || req.session?.user?.id,
      perfil: req.user?.perfil || req.user?.role || req.session?.user?.perfil || req.session?.user?.role,
      codigo: error?.code,
      mensagem: error?.message,
      stack: error?.stack,
    });
    req.flash("error", error?.userMessage || "Não foi possível concluir a operação. Nenhuma alteração foi realizada.");
  }
  return res.redirect("/solicitacoes/minhas");
}

function cancelar(req, res) {
  const id = Number(req.params.id);
  try {
    const resultado = service.cancelarSolicitacao(id, req.session.user.id);
    registrarCancelamentoNoChatOs(resultado, req);
    req.flash("success", "Solicitação cancelada com sucesso. O histórico foi preservado.");
  } catch (error) {
    console.error("[ERRO_CANCELAR_SOLICITACAO]", {
      solicitacaoId: req.params.id,
      usuarioId: req.user?.id || req.session?.user?.id,
      perfil: req.user?.perfil || req.user?.role || req.session?.user?.perfil || req.session?.user?.role,
      codigo: error?.code,
      mensagem: error?.message,
      stack: error?.stack,
    });
    req.flash("error", error?.userMessage || "Não foi possível concluir a operação. Nenhuma alteração foi realizada.");
  }
  return res.redirect("/solicitacoes/minhas");
}

function pdf(req, res) {
  const id = Number(req.params.id);
  try {
    const solicitacao = service.getSolicitacaoById(id);
    if (!solicitacao) return res.status(404).send("Solicitação não encontrada");

    if (!service.canViewSolicitacao(solicitacao, req.session.user)) {
      req.flash("error", "Sem permissão para esta solicitação.");
      return res.redirect("/solicitacoes/minhas");
    }

    console.info("[solicitacoes.pdf] Iniciando geração do PDF", {
      solicitacaoId: solicitacao.id,
      usuarioLogado: req.session?.user?.id,
      numero: solicitacao.numero || null,
      status: solicitacao.status || null,
      solicitante: solicitacao.solicitante_nome || null,
      materiais: Array.isArray(solicitacao.itens) ? solicitacao.itens.length : 0,
      fotos: Array.isArray(solicitacao.anexos) ? solicitacao.anexos.length : 0,
      template: "modules/compras/compras.service.js#gerarPdf",
      logo: comprasService.getSolicitacaoPdfLogoPath?.() || null,
    });

    return comprasService.gerarPdf(solicitacao, res);
  } catch (error) {
    console.error("[solicitacoes.pdf] Falha ao gerar PDF", {
      solicitacaoId: id,
      usuarioLogado: req.session?.user?.id,
      message: error.message,
      file: error.stack?.split("\n")?.[1]?.trim(),
      stack: error.stack,
    });

    if (process.env.NODE_ENV !== "production") {
      return res.status(500).send(`Falha ao gerar PDF da solicitação ${id}: ${error.message}\n${error.stack || ""}`);
    }

    return res.status(500).send("Não foi possível gerar o PDF desta solicitação. Verifique os dados da solicitação ou contate o suporte.");
  }
}

module.exports = { minhas, nova, criar, editar, atualizar, detalhe, excluir, cancelar, pdf };
