const service = require("./os.service");
const pushService = require("../push/push.service");
let tracagemService = null;
try { tracagemService = require('../tracagem/tracagem.service'); } catch (_e) {}
const { normalizeRole } = require("../../config/rbac");
const { canViewOSDetails, postCloseRedirectPath } = require("./os.permissions");
const aiService = require("../ai/ai.service");
const embeddingsService = require("../ai/ai.embeddings.service");
const visionService = require("../ai/ai.vision.service");

function mapFilesToPublic(files = []) {
  return (files || []).map((f) => ({
    ...f,
    pathPublic: `/uploads/os/${f.filename}`,
  }));
}

function osIndex(req, res) {
  res.locals.activeMenu = "os";
  const lista = service.listOS();
  const role = normalizeRole(req.session?.user?.role || "");
  return res.render("os/index", { title: "Ordens de Serviço", lista, canDeleteOS: role === "ADMIN" });
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
        const primeira = req.files?.abertura_fotos?.[0];
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
      url: `/os/${id}`,
    }).catch(() => {});

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

  return res.render("os/show", {
    title: `OS #${id}`,
    os: osAtual,
    canAutoAssign: canManageEquipe,
    canManualEditEquipe: canManageEquipe,
    equipeUsuarios,
    tracagens,
    user: req.session?.user || null,
  });
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
      url: `/os/${id}`,
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
      req.flash("error", "Adicione pelo menos uma foto de fechamento para concluir a OS.");
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
      url: `/os/${id}`,
    }).catch(() => {});

    console.log("[OS_CLOSE] Fechamento concluído", { osId: id, syncResult });
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
        url: `/os/${id}`,
      }).catch(() => {});
    }
    if (['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CONCLUÍDA'].includes(st)) {
      await pushService.sendToAll({
        title: "OS finalizada",
        body: `OS #${id} foi finalizada.`,
        url: `/os/${id}`,
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

function osAutoAssign(req, res) {
  const id = Number(req.params.id);
  try {
    const result = service.autoAssignOS(id, req.session?.user?.id || null, { force: true });
    if (result?.aguardando) {
      req.flash("error", result.aviso);
    } else {
      const equipeTxt = result?.auxiliar?.nome
        ? `${result.executor?.nome || result.mecanico?.nome} + ${result.auxiliar.nome}`
        : result?.executor?.nome || result?.mecanico?.nome || "Executor alocado";
      req.flash("success", `Equipe atribuída: ${equipeTxt}.`);
    }
  } catch (err) {
    req.flash("error", err.message || "Não foi possível sugerir a equipe.");
  }
  return res.redirect(`/os/${id}`);
}


function osSetEquipe(req, res) {
  const id = Number(req.params.id);
  try {
    service.setEquipeManual(id, {
      executor_colaborador_id: req.body.executor_colaborador_id ? Number(req.body.executor_colaborador_id) : null,
      auxiliar_colaborador_id: req.body.auxiliar_colaborador_id ? Number(req.body.auxiliar_colaborador_id) : null,
    }, req.session?.user?.id || null);
    req.flash("success", "Equipe atualizada com sucesso.");
  } catch (err) {
    req.flash("error", err.message || "Não foi possível atualizar a equipe.");
  }
  return res.redirect(`/os/${id}`);
}

module.exports = {
  osIndex,
  osNewForm,
  osCreate,
  osShow,
  osCloseForm,
  osIniciar,
  osPausar,
  osClose,
  osGerarDescricaoTecnica,
  osDelete,
  osUpdateStatus,
  osAutoAssign,
  osSetEquipe,
};
