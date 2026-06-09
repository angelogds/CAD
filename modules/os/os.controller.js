const service = require("./os.service");
const pushService = require("../push/push.service");
let tracagemService = null;
try { tracagemService = require('../tracagem/tracagem.service'); } catch (_e) {}
const { canAccessModule, normalizeRole } = require("../../config/rbac");
const { canViewOSDetails, canRegisterOSAndamento, postCloseRedirectPath } = require("./os.permissions");
const aiService = require("../ai/ai.service");
const embeddingsService = require("../ai/ai.embeddings.service");
const visionService = require("../ai/ai.vision.service");
const whatsappService = require("../whatsapp/whatsapp.service");
const osDocumentService = require("./os-document.service");
const osChatService = require("../os-chat/os-chat.service");
const { canSendWhatsappNotificationRole } = require("../../middlewares/permissions.middleware");

function mapFilesToPublic(files = []) {
  return (files || []).map((f) => ({
    ...f,
    pathPublic: `/uploads/os/${f.filename}`,
  }));
}


async function notifyResponsavelWhatsapp(osId, tipoEvento, criadoPor) {
  try {
    const osAtual = service.getOSById(osId);
    if (!osAtual) return null;
    return await whatsappService.sendOsTeamNotifications({ os: osAtual, tipoEvento, criadoPor });
  } catch (err) {
    console.error("❌ whatsapp OS:", err && err.stack ? err.stack : err);
    return null;
  }
}

function osIndex(req, res) {
  res.locals.activeMenu = "os";
  const lista = service.listOS();
  const role = normalizeRole(req.session?.user?.role || "");
  const canSendWhatsapp = canSendWhatsappNotificationRole(role);
  const colaboradores = canSendWhatsapp ? service.listUsuariosEquipe() : [];
  return res.render("os/index", {
    title: "Ordens de Serviço",
    lista,
    canDeleteOS: role === "ADMIN",
    canSendWhatsapp,
    colaboradores,
  });
}

function osNewForm(req, res) {
  res.locals.activeMenu = "os";
  const equipamentos = service.listEquipamentosAtivos();
  const tipos = service.listTipoOptions();
  return res.render("os/new", {
    title: "Nova OS",
    equipamentos,
    tipos,
    user: req.session?.user || null,
    prefillEquipamentoId: req.query.equipamento_id || "",
  });
}

async function osCreate(req, res) {
  try {
    const {
      equipamento_id,
      equipamento_manual,
      nao_conformidade,
      descricao,
      sintoma_principal,
      criticidade,
      grau,
      ai_diagnostico_inicial,
      diagnostico_inicial,
      ai_causa,
      causa_mais_provavel,
      ai_acoes_iniciais,
      acoes_iniciais,
      tipo,
      setor_solicitante,
      setor_destinatario,
      responsavel_manutencao,
    } = req.body;

    const equipamentoIdNum = equipamento_id ? Number(equipamento_id) : null;
    const relatoAbertura = String(nao_conformidade || descricao || '').trim();
    let diagnosticoInicial = String(ai_diagnostico_inicial || diagnostico_inicial || '').trim();
    let causaProvavel = String(ai_causa || causa_mais_provavel || '').trim();
    let acoesIniciais = String(ai_acoes_iniciais || acoes_iniciais || '').trim();

    const equipamentoManualTxt = String(equipamento_manual || "").trim();

    if (!diagnosticoInicial || !causaProvavel || !acoesIniciais) {
      try {
        const iaEstruturada = await aiService.melhorarDescricaoOperador(relatoAbertura, {
          sintoma_principal,
          criticidade,
          equipamento_id: equipamentoIdNum,
          equipamento_manual: equipamentoManualTxt || null,
        });
        diagnosticoInicial = diagnosticoInicial || iaEstruturada.diagnostico;
        causaProvavel = causaProvavel || iaEstruturada.causa_provavel;
        acoesIniciais = acoesIniciais || iaEstruturada.acao_recomendada;
      } catch (_e) {}
    }
    if (!equipamentoIdNum && !equipamentoManualTxt) {
      req.flash("error", "Selecione um equipamento cadastrado ou digite o equipamento manual.");
      return res.redirect("/os/novo");
    }

    const duplicada = service.findRecentDuplicateOS({
      opened_by: req.session?.user?.id || null,
      equipamento_id: equipamentoIdNum,
      equipamento_manual: equipamentoManualTxt,
      nao_conformidade: relatoAbertura,
      sintoma_principal,
      windowSeconds: 45,
    });
    if (duplicada?.id) {
      req.flash("success", `OS #${duplicada.id} já foi aberta há instantes. Evitamos uma abertura duplicada.`);
      return res.redirect(`/os/${duplicada.id}`);
    }

    const id = await service.createOS({
      equipamento_id: equipamentoIdNum,
      equipamento_manual: equipamentoManualTxt || null,
      nao_conformidade: relatoAbertura,
      descricao: relatoAbertura,
      tipo: String(tipo || "CORRETIVA").trim() || "CORRETIVA",
      sintoma_principal,
      severidade: criticidade || null,
      criticidade: criticidade || grau || null,
      grau: grau || criticidade || null,
      resumo_tecnico: acoesIniciais || diagnosticoInicial || null,
      causa_diagnostico: causaProvavel || diagnosticoInicial || null,
      opened_by: req.session?.user?.id || null,
    });

    service.updateInstitutionalMetadata(id, { setor_solicitante, setor_destinatario, responsavel_manutencao });

    let autoResult = null;
    try {
      autoResult = service.autoAssignOS(id, req.session?.user?.id || null);
    } catch (e) {
      console.error("❌ autoAssignOS:", e && e.stack ? e.stack : e);
    }

    const fotosAbertura = mapFilesToPublic(req.files?.abertura_fotos || []);
    service.addFotosAberturaFechamento({
      osId: id,
      files: fotosAbertura,
      tipo: "ABERTURA",
      userId: req.session?.user?.id || null,
    });

    if (fotosAbertura.length) {
      try {
        const primeira = (req.files?.abertura_fotos || []).find((f) =>
          String(f?.mimetype || "").toLowerCase().startsWith("image/")
        );
        if (primeira?.buffer || primeira?.path) {
          const analiseVisual = await visionService.analisarImagemFalha({
            fileBuffer: primeira.buffer || null,
            filePath: primeira.path || null,
            mimeType: primeira.mimetype,
            fileName: primeira.originalname,
          });
          await service.patchAIFields(id, {
            ai_criticidade: analiseVisual.criticidade,
            ai_sugestao: analiseVisual.recomendacao,
          });
        }
      } catch (_e) {}
    }

    embeddingsService.updateOSEmbedding(id);

    await pushService.sendToAll({
      title: "Nova Ordem de Serviço",
      body: `OS #${id} criada automaticamente.`,
      type: "OS_MEDIA",
      url: `/os/${id}`,
      sound: "/audio/os-nova.mp3",
      data: { osId: id, type: "NEW_OS" },
    }).catch(() => {});

    if (!autoResult?.aguardando) {
      await notifyResponsavelWhatsapp(id, "CRIACAO_OS", req.session?.user?.id || null);
    }

    if (autoResult?.aguardando) {
      req.flash("success", "OS criada, aguardando equipe — clique em Reatribuir automaticamente.");
    } else {
      req.flash("success", "OS criada e equipe alocada automaticamente.");
    }
    return res.redirect(`/os/${id}`);
  } catch (err) {
    console.error("❌ osCreate:", err);
    const rawMsg = String(err?.message || "");
    const userMessage = /SQLITE|no such column|syntax error|constraint/i.test(rawMsg)
      ? "Não foi possível salvar agora. Tente novamente e, se persistir, avise a manutenção do sistema."
      : (rawMsg || "Erro ao salvar a OS.");
    req.flash("error", userMessage);
    return res.redirect("/os/novo");
  }
}

function osShow(req, res) {
  res.locals.activeMenu = "os";
  const id = Number(req.params.id);
  const os = service.getOSById(id);

  if (!os) return res.status(404).render("errors/404", { title: "Não encontrado" });

  const role = normalizeRole(req.session?.user?.role || "");
  const isInspectionQuality = role === "INSPECAO_QUALIDADE";
  const isOpenedByCurrentUser = Number(os.opened_by || 0) === Number(req.session?.user?.id || 0);
  if (isInspectionQuality && !isOpenedByCurrentUser && !service.isOSLinkedToInspecao(id)) {
    return res.status(403).render("errors/403", { layout: "layout", title: "Sem permissão" });
  }

  const canManageEquipe = ["ADMIN", "SUPERVISOR_MANUTENCAO", "MANUTENCAO_SUPERVISOR"].includes(role);

  let osAtual = os;
  if (String(osAtual.status || "").toUpperCase() === "AGUARDANDO_EQUIPE" && !osAtual.executor_colaborador_id) {
    try {
      service.autoAssignOS(id, req.session?.user?.id || null);
    } catch (e) {
      console.error("❌ autoAssignOS(osShow):", e && e.stack ? e.stack : e);
    }
    osAtual = service.getOSById(id) || osAtual;
  }

  const equipeUsuarios = canManageEquipe ? service.listUsuariosEquipe() : [];
  const tracagens = tracagemService ? tracagemService.listByOS(id) : [];
  const whatsappHistoricoCompleto = String(req.query.whatsapp_historico || "").toLowerCase() === "completo";
  const canSendWhatsappNotification = canSendWhatsappNotificationRole(role);
  const canSendWhatsapp = whatsappService.getProvider() !== "disabled" && canSendWhatsappNotification;
  const whatsappHistoricoCompletoSeguro = canSendWhatsappNotification && whatsappHistoricoCompleto;
  const whatsappLogs = canSendWhatsappNotification ? whatsappService.listOsNotificationLogs(id, { limit: whatsappHistoricoCompletoSeguro ? 500 : 10 }) : [];
  const whatsappLast = canSendWhatsappNotification ? (whatsappService.listOsNotificationLogs(id, { limit: 1 })[0] || null) : null;
  const whatsappEventos = canSendWhatsappNotification && whatsappService.listWhatsappStatusEvents ? whatsappService.listWhatsappStatusEvents(id, { limit: whatsappHistoricoCompletoSeguro ? 500 : 10 }) : [];
  const whatsappProvider = canSendWhatsappNotification ? whatsappService.getProvider() : null;
  const whatsappDiagnostico = canSendWhatsappNotification ? whatsappService.getWhatsappOsDiagnostic(id, osAtual) : {};
  const whatsappResponsavel = whatsappDiagnostico.responsavel_resolvido || null;
  const whatsappDestinatarios = whatsappDiagnostico.destinatarios || [];
  const historicoAndamento = service.getHistoricoAndamentoOS(id);
  const metricasAndamento = service.calcularDiasAbertaOS(osAtual);
  const ultimoRegistroHoje = service.temJustificativaAndamentoHoje(id);
  const documentoInstitucional = osDocumentService.getLatestInstitutionalDocument(id);
  let chatResumo = null;
  try { chatResumo = osChatService.buscarConversaPorOS(id, req.session?.user || {}); } catch (_e) { chatResumo = null; }

  return res.render("os/show", {
    title: `OS #${id}`,
    os: osAtual,
    canAutoAssign: canManageEquipe,
    canManualEditEquipe: canManageEquipe,
    canExecuteOS: canAccessModule(role, "os_execute"),
    canRegisterAndamento: canRegisterOSAndamento(role),
    equipeUsuarios,
    tracagens,
    whatsappLogs,
    whatsappHistoricoCompleto: canSendWhatsappNotification && whatsappHistoricoCompleto,
    whatsappLast,
    whatsappEventos,
    whatsappProvider,
    whatsappResponsavel,
    whatsappDestinatarios,
    whatsappDiagnostico,
    canSendWhatsapp,
    canSendWhatsappNotification,
    motivosAndamento: service.listMotivosAndamento(),
    historicoAndamento,
    metricasAndamento,
    alertaJustificativaAndamento: service.isStatusOSEmAndamento(osAtual.status) && metricasAndamento.dias_aberta > 1 && !ultimoRegistroHoje,
    documentoInstitucional,
    chatResumo,
    user: req.session?.user || null,
  });
}

async function osGerarPDFInstitucional(req, res) {
  const id = Number(req.params.id);
  const os = service.getOSById(id);
  if (!os) return res.status(404).render("errors/404", { title: "Não encontrado" });

  try {
    const result = await osDocumentService.gerarPDFInstitucionalOS(os, {
      userId: req.session?.user?.id || null,
    });
    req.flash("success", "PDF institucional da OS gerado com sucesso.");
    if (String(req.query.download || '') === '1') return res.redirect(result.pdfUrl);
    return res.redirect(`/os/${id}`);
  } catch (err) {
    console.error("❌ osGerarPDFInstitucional:", err);
    req.flash("error", err?.message || "Não foi possível gerar o PDF institucional da OS.");
    return res.redirect(`/os/${id}`);
  }
}

function osCloseForm(req, res) {
  res.locals.activeMenu = "os";
  const id = Number(req.params.id);
  const os = service.getOSById(id);
  if (!os) return res.status(404).render("errors/404", { title: "Não encontrado" });
  return res.render("os/close", {
    title: `Fechar OS #${id}`,
    os,
    user: req.session?.user || null,
  });
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function summarizeSyncResult(syncResult) {
  if (!syncResult || typeof syncResult !== "object") return syncResult;

  const osByCell = syncResult.osByCell && typeof syncResult.osByCell === "object" ? syncResult.osByCell : null;
  const cellEntries = osByCell ? Object.entries(osByCell) : [];
  const resumoCelulas = cellEntries.slice(0, 10).map(([cell, osIds]) => ({
    cell,
    osCount: Array.isArray(osIds) ? osIds.length : 0,
  }));

  return {
    ...syncResult,
    osByCellCount: cellEntries.length,
    osByCellSample: resumoCelulas,
    osByCell: undefined,
  };
}

async function osGerarDescricaoTecnica(req, res) {
  const id = Number(req.params.id);
  const os = service.getOSById(id);
  if (!os) return res.status(404).json({ ok: false, error: "OS não encontrada." });

  const textoDigitado = normalizeText(req.body?.texto_digitado);
  const transcricaoAudio = normalizeText(req.body?.transcricao_audio);
  const fotosMetadados = Array.isArray(req.body?.fotos_metadados) ? req.body.fotos_metadados : [];

  let fonte = "texto";
  if (transcricaoAudio && fotosMetadados.length) fonte = "áudio+foto";
  else if (transcricaoAudio) fonte = "áudio";
  else if (fotosMetadados.length) fonte = "foto";

  try {
    const descricaoTecnica = await service.gerarDescricaoTecnicaFechamento(id, {
      textoDigitado,
      transcricaoAudio,
      fotosMetadados,
      fonte,
      userId: req.session?.user?.id || null,
    });
    return res.json({ ok: true, descricaoTecnica, fonte });
  } catch (err) {
    console.error("[OS_GERAR_DESCRICAO_TECNICA][ERROR]", err);
    return res.status(503).json({ ok: false, error: "Não foi possível gerar a descrição técnica agora." });
  }
}

async function osIniciar(req, res) {
  const id = Number(req.params.id);
  try {
    service.iniciarOS(id, req.session?.user?.id || null);
    await pushService.sendToAll({
      title: "OS em andamento",
      body: `OS #${id} entrou em andamento.`,
      type: "MUDANCA_STATUS",
      url: `/os/${id}`,
      sound: "/audio/os-status.mp3",
      data: { osId: id, type: "STATUS_CHANGE", newStatus: "ANDAMENTO" },
    }).catch(() => {});
    req.flash("success", "OS iniciada e enviada para andamento.");
  } catch (err) {
    req.flash("error", err.message || "Não foi possível iniciar a OS.");
  }
  return res.redirect(`/os/${id}`);
}

function osDelete(req, res) {
  const role = normalizeRole(req.session?.user?.role || "");
  if (role !== "ADMIN") {
    req.flash("error", "Somente administradores podem excluir ordens de serviço.");
    return res.redirect("/os");
  }
  try {
    service.deleteOS(req.params.id);
    req.flash("success", `OS #${req.params.id} excluída com sucesso.`);
  } catch (err) {
    req.flash("error", err.message || "Não foi possível excluir a OS.");
  }
  return res.redirect("/os");
}

function osPausar(req, res) {
  const id = Number(req.params.id);
  try {
    service.pausarOS(id);
    req.flash("success", "OS pausada.");
  } catch (err) {
    req.flash("error", err.message || "Não foi possível pausar a OS.");
  }
  return res.redirect(`/os/${id}`);
}


async function osClose(req, res) {
  const id = Number(req.params.id);
  const user = req.session?.user || null;
  const descricaoAssistida = String(req.body?.descricao_assistida || "").trim();
  const redirectAfterClose = postCloseRedirectPath(user) || `/os/${id}`;

  console.log("[OS_CLOSE] Iniciando fechamento", {
    osId: id,
    userId: user?.id || null,
  });

  try {
    const osAtual = service.getOSById(id);
    if (!osAtual) {
      req.flash("error", "OS não encontrada.");
      return res.redirect("/os");
    }
    if (String(osAtual.status || "").toUpperCase() === "FECHADA") {
      req.flash("success", "Essa OS já estava concluída.");
      return res.redirect(redirectAfterClose);
    }

    const fotosFechamento = mapFilesToPublic(req.files?.fechamento_fotos || []);
    if (!fotosFechamento.length) {
      req.flash("error", "Adicione pelo menos uma mídia (foto ou vídeo) de fechamento para concluir a OS.");
      return res.redirect(`/os/${id}`);
    }

    service.addFotosAberturaFechamento({
      osId: id,
      files: fotosFechamento,
      tipo: "FECHAMENTO",
      userId: user?.id || null,
    });

    const textoDigitado = normalizeText(req.body?.texto_digitado);
    const transcricaoAudio = normalizeText(req.body?.transcricao_audio);
    const versaoTecnicaSugerida = normalizeText(req.body?.versao_tecnica_sugerida);
    const versaoFinalAprovada = normalizeText(req.body?.versao_final_aprovada) || versaoTecnicaSugerida || transcricaoAudio || textoDigitado;
    const fonteDescricao = normalizeText(req.body?.fonte_descricao) || "texto";
    const fotosMetadadosBody = normalizeText(req.body?.fotos_metadados_json);
    let fotosMetadados = [];
    if (fotosMetadadosBody) {
      try {
        fotosMetadados = JSON.parse(fotosMetadadosBody);
      } catch (_e) {
        fotosMetadados = [];
      }
    }
    if (!Array.isArray(fotosMetadados) || !fotosMetadados.length) {
      fotosMetadados = fotosFechamento.map((f) => ({
        nome_arquivo: f.originalname || f.filename,
        tipo_mime: f.mimetype || null,
        tamanho_bytes: Number(f.size || 0) || null,
      }));
    }

    service.persistirRascunhoFechamento(id, {
      transcricaoBruta: transcricaoAudio,
      versaoTecnicaSugerida,
      versaoFinalAprovada,
      fonteDescricao,
      textoDigitado,
      fotosMetadados,
      userId: user?.id || null,
    });

    const fechamentoPayload = {
      fonte_descricao: fonteDescricao,
      texto_digitado: textoDigitado,
      transcricao_audio: transcricaoAudio,
      descricao_aprovada: versaoFinalAprovada,
      versao_tecnica_sugerida: versaoTecnicaSugerida,
      fotos_metadados: fotosMetadados,
      fotos_fechamento: fotosFechamento.map((f) => f.pathPublic || f.path).filter(Boolean),
      observacao_curta: normalizeText(req.body?.observacao_curta_fechamento) || null,
      tipo_acao: normalizeText(req.body?.tipo_acao_fechamento) || null,
      falha_eliminada: true,
      teste_operacional_realizado: true,
    };

    const descricaoFinal = versaoFinalAprovada || descricaoAssistida || textoDigitado || transcricaoAudio || "";

    const syncResult = await service.concluirOS(id, {
      closedBy: user?.id || null,
      diagnostico: descricaoFinal || undefined,
      acaoExecutada: descricaoFinal || undefined,
      fechamentoPayload,
    });

    await pushService.sendToAll({
      title: "OS finalizada",
      body: `OS #${id} foi finalizada.`,
      type: "MUDANCA_STATUS",
      url: `/os/${id}`,
      sound: "/audio/os-finalizada.mp3",
      data: { osId: id, type: "OS_FINALIZADA", newStatus: "FINALIZADA" },
    }).catch(() => {});

    console.log("[OS_CLOSE] Fechamento concluído", {
      osId: id,
      syncResult: summarizeSyncResult(syncResult),
    });
    req.flash("success", canViewOSDetails(user) ? "OS concluída com sucesso." : "Serviço concluído com sucesso. Retornando ao painel.");
  } catch (err) {
    console.error("[OS_CLOSE][ERROR]", err);
    req.flash("error", err.message || "Não foi possível concluir a OS.");
    return res.redirect(`/os/${id}`);
  }

  return res.redirect(redirectAfterClose);
}

async function osUpdateStatus(req, res) {
  const id = Number(req.params.id);
  const { status } = req.body;

  try {
    service.updateStatus(id, status, req.session?.user?.id || null);

    const st = String(status || '').toUpperCase();
    if (st === 'ANDAMENTO' || st === 'EM_ANDAMENTO') {
      await pushService.sendToAll({
        title: "OS em andamento",
        body: `OS #${id} entrou em andamento.`,
        type: "MUDANCA_STATUS",
        url: `/os/${id}`,
        sound: "/audio/os-status.mp3",
        data: { osId: id, type: "STATUS_CHANGE", newStatus: st },
      }).catch(() => {});
    }
    if (['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CONCLUÍDA'].includes(st)) {
      await pushService.sendToAll({
        title: "OS finalizada",
        body: `OS #${id} foi finalizada.`,
        type: "MUDANCA_STATUS",
        url: `/os/${id}`,
        sound: "/audio/os-finalizada.mp3",
        data: { osId: id, type: "OS_FINALIZADA", newStatus: st },
      }).catch(() => {});
    }

    const isCloseStatus = ['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CONCLUÍDA'].includes(st);
    if (isCloseStatus && !canViewOSDetails(req.session?.user)) {
      req.flash("success", "Status atualizado. Retornando ao painel.");
      return res.redirect('/painel-operacional');
    }

    req.flash("success", "Status atualizado.");
    return res.redirect(`/os/${id}`);
  } catch (err) {
    console.error("❌ osUpdateStatus:", err);
    req.flash("error", "Erro ao atualizar status.");
    return res.redirect(`/os/${id}`);
  }
}

async function osAutoAssign(req, res) {
  const id = Number(req.params.id);
  try {
    const result = service.autoAssignOS(id, req.session?.user?.id || null, { force: true });
    if (result?.aguardando) {
      req.flash("error", result.aviso);
    } else {
      const equipeTxt = result?.auxiliar?.nome
        ? `${result.executor?.nome || result.mecanico?.nome} + ${result.auxiliar.nome}`
        : result?.executor?.nome || result?.mecanico?.nome || "Executor alocado";
      if (result?.responsavelChanged) {
        await notifyResponsavelWhatsapp(id, "REATRIBUICAO_AUTO", req.session?.user?.id || null);
      }
      req.flash("success", result?.changed ? `Equipe atribuída: ${equipeTxt}.` : `Equipe mantida sem alteração: ${equipeTxt}.`);
    }
  } catch (err) {
    req.flash("error", err.message || "Não foi possível sugerir a equipe.");
  }
  return res.redirect(`/os/${id}`);
}


async function osSetEquipe(req, res) {
  const id = Number(req.params.id);
  try {
    service.setEquipeManual(id, {
      executor_colaborador_id: req.body.executor_colaborador_id ? Number(req.body.executor_colaborador_id) : null,
      auxiliar_colaborador_id: req.body.auxiliar_colaborador_id ? Number(req.body.auxiliar_colaborador_id) : null,
      executor_secundario_colaborador_id: req.body.executor_secundario_colaborador_id ? Number(req.body.executor_secundario_colaborador_id) : null,
      auxiliar_secundario_colaborador_id: req.body.auxiliar_secundario_colaborador_id ? Number(req.body.auxiliar_secundario_colaborador_id) : null,
    }, req.session?.user?.id || null);
    await notifyResponsavelWhatsapp(id, "ATRIBUICAO", req.session?.user?.id || null);
    req.flash("success", "Equipe atualizada com sucesso.");
  } catch (err) {
    req.flash("error", err.message || "Não foi possível atualizar a equipe.");
  }
  return res.redirect(`/os/${id}`);
}


async function osEnviarAbertasColaborador(req, res) {
  const role = normalizeRole(req.session?.user?.role || "");
  const canSend = canSendWhatsappNotificationRole(role);
  if (!canSend) {
    req.flash("error", "Sem permissão para enviar OS abertas por WhatsApp.");
    return res.redirect("/os");
  }

  const colaboradorId = Number(req.body?.colaborador_id || 0);
  if (!colaboradorId) {
    req.flash("error", "Selecione um colaborador para enviar as OS abertas.");
    return res.redirect("/os");
  }

  const colaborador = service.listUsuariosEquipe().find((item) => Number(item.id) === colaboradorId);
  if (!colaborador) {
    req.flash("error", "Colaborador não encontrado ou inativo.");
    return res.redirect("/os");
  }

  const ordensAbertas = service.listOpenOSByColaborador(colaboradorId);
  if (!ordensAbertas.length) {
    req.flash("error", `Nenhuma OS aberta encontrada para ${colaborador.name}.`);
    return res.redirect("/os");
  }

  let enviadas = 0;
  let linksGerados = 0;
  let semTelefone = 0;
  let erros = 0;

  for (const ordem of ordensAbertas) {
    const os = service.getOSById(ordem.id);
    if (!os) {
      erros += 1;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const result = await whatsappService.sendOsTeamNotifications({
      os,
      tipoEvento: "REENVIO_ABERTAS_COLABORADOR",
      criadoPor: req.session?.user?.id || null,
    });

    enviadas += Number(result?.sent || 0);
    linksGerados += Number(result?.generatedLinks?.length || 0);
    if ((result?.results || []).some((r) => r?.status === "SEM_TELEFONE")) semTelefone += 1;
    if (!result?.ok && !(result?.generatedLinks || []).length) erros += 1;
  }

  const partes = [
    `${ordensAbertas.length} OS aberta(s) localizada(s) para ${colaborador.name}`,
    `${enviadas} envio(s) confirmado(s)`,
  ];
  if (linksGerados) partes.push(`${linksGerados} link(s) manual(is) de WhatsApp gerado(s)`);
  if (semTelefone) partes.push(`${semTelefone} OS com integrante sem telefone`);
  if (erros) partes.push(`${erros} falha(s)`);

  req.flash(erros && !enviadas && !linksGerados ? "error" : "success", partes.join("; ") + ".");
  return res.redirect("/os");
}

function osNotificacoes(req, res) {
  return osShow(req, res);
}

function osColaboradoresContato(req, res) {
  const id = Number(req.params.id);
  const os = service.getOSById(id);
  if (!os) return res.status(404).json({ ok: false, error: "OS não encontrada." });

  const diagnostico = whatsappService.getWhatsappOsDiagnostic(id, os);
  const colaboradores = (diagnostico.destinatarios || []).map((destinatario) => ({
    id: destinatario.id || destinatario.colaborador_id || destinatario.user_id || null,
    nome: destinatario.nome || destinatario.name || destinatario.colaborador_nome || "-",
    origem: destinatario.origem || null,
    telefone: destinatario.telefone_normalizado || destinatario.colaborador_telefone_whatsapp || destinatario.telefone_whatsapp || destinatario.user_telefone_whatsapp || destinatario.colaborador_telefone || destinatario.telefone || null,
  }));

  return res.json({ ok: true, os_id: id, colaboradores });
}

async function osEnviarWhatsapp(req, res) {
  const id = Number(req.params.id);
  const role = normalizeRole(req.session?.user?.role || "");
  const canSend = canSendWhatsappNotificationRole(role);
  if (!canSend) {
    req.flash("error", "Sem permissão para reenviar WhatsApp.");
    return res.redirect(`/os/${id}`);
  }

  const os = service.getOSById(id);
  if (!os) return res.status(404).render("errors/404", { title: "Não encontrado" });

  const result = await whatsappService.sendOsTeamNotifications({
    os,
    tipoEvento: "REENVIO_MANUAL",
    criadoPor: req.session?.user?.id || null,
  });

  if (String(req.originalUrl || req.path || "").startsWith("/api/")) {
    return res.status(result?.ok ? 200 : 400).json({ ok: !!result?.ok, os_id: id, ...result });
  }

  if (result?.generatedLinks?.length) {
    if (result.generatedLinks.length > 1) {
      req.flash("success", `Links de WhatsApp gerados para ${result.generatedLinks.length} integrante(s); abrindo o primeiro destinatário.`);
    }
    return res.redirect(result.generatedLinks[0]);
  }
  if (result?.sent > 0) req.flash("success", `WhatsApp enviado para ${result.sent} integrante(s) da equipe.`);
  else if ((result?.results || []).some((r) => r?.status === "WHATSAPP_DESATIVADO")) req.flash("error", "WhatsApp desativado. Configure WHATSAPP_PROVIDER=manual ou cloud_api.");
  else if ((result?.results || []).some((r) => r?.status === "SEM_TELEFONE")) req.flash("error", "Equipe sem número de WhatsApp cadastrado no perfil do funcionário/apoio operacional.");
  else if ((result?.results || []).some((r) => r?.status === "IGNORADO")) req.flash("error", "Integração WhatsApp desabilitada.");
  else req.flash("error", (result?.results || []).find((r) => r?.error)?.error || "Não foi possível enviar WhatsApp.");
  return res.redirect(`/os/${id}`);
}

function debugWhatsappOS(req, res) {
  const role = normalizeRole(req.session?.user?.role || "");
  if (role !== "ADMIN") return res.status(403).json({ ok: false, error: "Acesso restrito a Admin." });
  const id = Number(req.params.id);
  const os = service.getOSById(id);
  if (!os) return res.status(404).json({ ok: false, error: "OS não encontrada." });
  const diagnostico = whatsappService.getWhatsappOsDiagnostic(id, os);
  return res.json({ ok: true, ...diagnostico });
}

async function osVoiceAnalyze(req, res) {
  const userId = Number(req.session?.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "Usuário não autenticado." });
  const texto = String(req.body?.texto || "").trim();
  if (!texto) return res.status(400).json({ ok: false, error: "Texto transcrito é obrigatório." });
  try {
    const preview = await service.analyzeVoiceOS({ texto, userId });
    return res.json({ ok: true, preview });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message || "Falha ao analisar voz." });
  }
}

async function osVoiceCommand(req, res) {
  const userId = Number(req.session?.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "Usuário não autenticado." });
  const comando = String(req.body?.comando || req.body?.texto || "").trim();
  const parsed = service.parseVoiceCommand(comando);

  if (parsed.action === "open_os") return res.json({ ok: true, action: parsed.action, redirect: "/os/novo" });
  if (parsed.action === "show_preventivas") return res.json({ ok: true, action: parsed.action, redirect: "/preventivas" });
  if (parsed.action === "close_os" && parsed.osId) {
    if (!canAccessModule(req.session?.user?.role, "os_execute")) {
      return res.status(403).json({ ok: false, error: "Sem permissão para finalizar OS." });
    }
    try {
      service.updateStatus(parsed.osId, "FINALIZADA", userId);
      return res.json({ ok: true, action: parsed.action, os_id: parsed.osId, redirect: `/os/${parsed.osId}` });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message || "Falha ao finalizar OS por comando de voz." });
    }
  }
  return res.status(400).json({ ok: false, error: "Comando de voz não reconhecido." });
}

async function osVoiceCreate(req, res) {
  const userId = Number(req.session?.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "Usuário não autenticado." });
  const preview = req.body?.preview || null;
  const texto = String(req.body?.texto || "").trim();
  if (!preview && !texto) return res.status(400).json({ ok: false, error: "Texto ou preview são obrigatórios." });
  try {
    const resolvedPreview = preview || (await service.analyzeVoiceOS({ texto, userId }));
    const created = await service.createVoiceOSFromPreview(resolvedPreview, userId);
    return res.json({
      ok: true,
      os_id: created.osId,
      message: "OS criada com sucesso a partir da voz.",
      data: created.os || null,
    });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message || "Falha ao criar OS por voz." });
  }
}


function osAndamento(req, res) {
  return res.redirect(`/os/${Number(req.params.id)}#justificativa-andamento`);
}

async function osRegistrarAndamento(req, res) {
  const id = Number(req.params.id);
  try {
    await service.registrarJustificativaAndamento(id, {
      motivo_codigo: req.body?.motivo_codigo,
      observacao_mecanico: req.body?.observacao_mecanico,
      usuario_id: req.session?.user?.id,
    });
    req.flash("success", "Justificativa de andamento registrada com sucesso.");
  } catch (err) {
    req.flash("error", err.message || "Não foi possível registrar a justificativa de andamento.");
  }
  return res.redirect(`/os/${id}#justificativa-andamento`);
}

async function osMaterialChegou(req, res) {
  req.body = { ...(req.body || {}), motivo_codigo: "MATERIAL_CHEGOU" };
  return osRegistrarAndamento(req, res);
}

module.exports = {
  osIndex,
  osNewForm,
  osCreate,
  osShow,
  osAndamento,
  osRegistrarAndamento,
  osMaterialChegou,
  osCloseForm,
  osIniciar,
  osPausar,
  osClose,
  osGerarDescricaoTecnica,
  osGerarPDFInstitucional,
  osDelete,
  osUpdateStatus,
  osAutoAssign,
  osSetEquipe,
  osNotificacoes,
  osColaboradoresContato,
  osEnviarWhatsapp,
  osEnviarAbertasColaborador,
  debugWhatsappOS,
  osVoiceAnalyze,
  osVoiceCommand,
  osVoiceCreate,
};
