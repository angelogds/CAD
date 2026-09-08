const db = require("../../database/db");
const service = require("./os.service");
const { classifyOSPriority } = require("./os-priority.service");
const osIAService = require("./os-ia.service");
const pushService = require("../push/push.service");
const embeddingsService = require("../ai/ai.embeddings.service");
const whatsappService = require("../whatsapp/whatsapp.service");
const { canViewOSDetails, postCloseRedirectPath } = require("./os.permissions");

let inspecaoService = null;
try { inspecaoService = require("../inspecao/inspecao.service"); } catch (_e) {}

function mapFilesToPublic(files = []) {
  return (files || []).map((f) => ({
    ...f,
    pathPublic: `/uploads/os/${f.filename}`,
  }));
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeTipoOS(tipo) {
  const raw = String(tipo || "CORRETIVA").trim().toUpperCase();
  if (raw === "NR12") return "NRS";
  if (["CORRETIVA", "PREVENTIVA", "ELETRICA", "NRS", "OUTROS"].includes(raw)) return raw;
  return "OUTROS";
}

function normalizeGrau(grau) {
  const raw = String(grau || "MEDIA").trim().toUpperCase();
  if (raw === "EMERGENCIAL") return "CRITICA";
  if (raw === "MÉDIA") return "MEDIA";
  if (raw === "CRÍTICA") return "CRITICA";
  if (["BAIXA", "MEDIA", "ALTA", "CRITICA"].includes(raw)) return raw;
  return "MEDIA";
}

function tableExists(name) {
  try {
    return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(String(name || ""));
  } catch (_e) {
    return false;
  }
}

function getColumns(table) {
  if (!tableExists(table)) return [];
  try { return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name); }
  catch (_e) { return []; }
}

function runDetached(label, task) {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((err) => console.error(`[OS_FAST][${label}]`, err?.stack || err?.message || err));
  });
}

function updateAIColumns(osId, ai = {}) {
  const cols = getColumns("os");
  if (!cols.length) return;

  const map = {
    ai_diagnostico_inicial: ai.diagnostico_inicial,
    ai_causa_provavel: ai.causa_provavel,
    ai_risco_operacional: ai.risco_operacional,
    ai_risco_seguranca: ai.risco_seguranca || ai.observacao_seguranca,
    ai_servico_sugerido: ai.servico_sugerido,
    ai_prioridade_sugerida: ai.prioridade_sugerida,
    ai_criticidade_sugerida: ai.criticidade_sugerida,
    ai_acao_corretiva_sugerida: ai.acao_corretiva,
    ai_acao_preventiva_sugerida: ai.acao_preventiva,
    ai_sugestao_equipe_json: JSON.stringify(ai.sugestao_equipe || {}),
    ai_justificativa_criticidade: ai.justificativa_interna,
    ai_observacao_seguranca: ai.risco_seguranca || ai.observacao_seguranca,
    ai_descricao_tecnica_os: ai.descricao_tecnica_os,
    ai_diagnostico: ai.diagnostico_inicial,
    ai_sugestao: ai.acao_corretiva || ai.servico_sugerido,
    ai_criticidade: ai.criticidade_sugerida,
  };

  const entries = Object.entries(map).filter(([column, value]) => cols.includes(column) && value !== undefined);
  if (!entries.length) return;

  db.prepare(`UPDATE os SET ${entries.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`)
    .run(...entries.map(([, value]) => value ?? null), Number(osId));
}

function createOSRecordFast(payload = {}) {
  const relato = String(payload.nao_conformidade || payload.descricao || "").trim();
  if (!relato) throw new Error("Descreva a não conformidade do equipamento.");
  if (relato.length < 10) throw new Error("A não conformidade deve ter pelo menos 10 caracteres.");

  const sintoma = String(payload.sintoma_principal || "").trim();
  if (!sintoma) throw new Error("Selecione o sintoma principal.");

  const openedBy = Number(payload.opened_by || 0);
  if (!openedBy) throw new Error("Usuário logado obrigatório para abrir OS.");

  let equipamentoId = payload.equipamento_id ? Number(payload.equipamento_id) : null;
  let equipamentoManual = String(payload.equipamento_manual || "").trim() || null;
  let equipamentoNome = equipamentoManual || "";
  let equipamento = null;

  if (equipamentoId) {
    const eqCols = getColumns("equipamentos");
    const selected = ["id", "nome", "codigo", "tipo", "criticidade", "setor", "setor_id"].filter((c) => eqCols.includes(c));
    equipamento = selected.length
      ? db.prepare(`SELECT ${selected.join(", ")} FROM equipamentos WHERE id = ?`).get(equipamentoId)
      : null;
    if (equipamento?.nome) {
      equipamentoNome = equipamento.nome;
      equipamentoManual = null;
    } else {
      equipamentoId = null;
    }
  }

  if (!equipamentoNome) throw new Error("Informe um equipamento cadastrado ou manual.");

  const tipo = normalizeTipoOS(payload.tipo);
  const score = classifyOSPriority({ descricao: relato, tipo, equipamento_id: equipamentoId });
  const grau = normalizeGrau(payload.criticidade || payload.grau || payload.severidade || score.prioridade || "MEDIA");
  const cols = getColumns("os");
  const fields = ["equipamento", "descricao", "tipo", "status", "opened_by"];
  const values = [equipamentoNome, relato, tipo, "ABERTA", openedBy];

  const optional = {
    equipamento_id: equipamentoId,
    equipamento_manual: equipamentoManual,
    resumo_tecnico: normalizeText(payload.resumo_tecnico),
    causa_diagnostico: normalizeText(payload.causa_diagnostico),
    sintoma_principal: sintoma,
    severidade: grau,
    criticidade: grau,
    grau,
    prioridade: grau,
    categoria_sugerida: score.categoria_sugerida || null,
    alertar_imediatamente: score.alertar_imediatamente ? 1 : 0,
    data_inicio: normalizeText(payload.data_inicio),
    data_fim: normalizeText(payload.data_fim),
  };

  for (const [column, value] of Object.entries(optional)) {
    if (!cols.includes(column)) continue;
    fields.push(column);
    values.push(value ?? null);
  }

  if (!cols.includes("grau") && cols.includes("grau_dificuldade")) {
    fields.push("grau_dificuldade");
    values.push(grau);
  } else if (!cols.includes("grau") && cols.includes("nivel_grau")) {
    fields.push("nivel_grau");
    values.push(grau);
  }

  const info = db.prepare(
    `INSERT INTO os (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`
  ).run(...values);

  return {
    id: Number(info.lastInsertRowid),
    equipamento,
    equipamentoNome,
    equipamentoId,
    equipamentoManual,
    relato,
    sintoma,
    grau,
    openedBy,
  };
}

function scheduleCreateEnrichment(created) {
  runDetached("CREATE_ENRICHMENT", async () => {
    let ai = null;
    try {
      ai = await osIAService.gerarAberturaAutomaticaDaOS({
        usuario_id: created.openedBy,
        nao_conformidade: {
          equipamento_id: created.equipamentoId,
          equipamento_manual: created.equipamentoManual,
          setor: created.equipamento?.setor_id || created.equipamento?.setor || null,
          sintoma_principal: created.sintoma,
          severidade: created.grau,
          nao_conformidade: created.relato,
          observacao_curta: created.relato,
        },
        contexto: { equipamento: created.equipamento || null },
      });
      updateAIColumns(created.id, ai);
      osIAService.registrarLogIA({
        usuarioId: created.openedBy,
        osId: created.id,
        naoConformidadeId: created.id,
        tipo: "ABERTURA_NC_ASSINCRONA",
        entrada: { equipamento_id: created.equipamentoId, sintoma_principal: created.sintoma, nao_conformidade: created.relato },
        resposta: ai,
        status: "OK",
      });
    } catch (err) {
      osIAService.registrarLogIA({
        usuarioId: created.openedBy,
        osId: created.id,
        naoConformidadeId: created.id,
        tipo: "ABERTURA_NC_ASSINCRONA",
        entrada: { equipamento_id: created.equipamentoId, sintoma_principal: created.sintoma, nao_conformidade: created.relato },
        resposta: null,
        status: "ERRO",
        erro: err?.message || String(err),
      });
    }

    try { service.setupPairsIfEmpty(); } catch (_e) {}
    try { await embeddingsService.updateOSEmbedding(created.id); } catch (_e) {}
    try { inspecaoService?.syncFromOS?.(created.id); } catch (_e) {}
  });
}

function scheduleCreateNotifications({ id, autoResult, userId }) {
  runDetached("CREATE_NOTIFICATIONS", async () => {
    await pushService.sendToAll({
      title: "Nova Ordem de Serviço",
      body: `OS #${id} criada automaticamente.`,
      type: "OS_MEDIA",
      url: `/os/${id}`,
      sound: "/audio/os-nova.mp3",
      data: { osId: id, type: "NEW_OS" },
    }).catch(() => {});

    if (!autoResult?.aguardando) {
      const osAtual = service.getOSById(id);
      if (osAtual) {
        await whatsappService.sendOsTeamNotifications({
          os: osAtual,
          tipoEvento: "CRIACAO_OS",
          criadoPor: userId || null,
        }).catch(() => {});
      }
    }
  });
}

function osCreate(req, res) {
  try {
    const equipamentoIdNum = req.body?.equipamento_id ? Number(req.body.equipamento_id) : null;
    const equipamentoManualTxt = String(req.body?.equipamento_manual || "").trim();
    const relatoAbertura = String(req.body?.nao_conformidade || req.body?.descricao || "").trim();
    const userId = req.session?.user?.id || null;

    if (!equipamentoIdNum && !equipamentoManualTxt) {
      req.flash("error", "Selecione um equipamento cadastrado ou digite o equipamento manual.");
      return res.redirect("/os/novo");
    }

    const duplicada = service.findRecentDuplicateOS({
      opened_by: userId,
      equipamento_id: equipamentoIdNum,
      equipamento_manual: equipamentoManualTxt,
      nao_conformidade: relatoAbertura,
      sintoma_principal: req.body?.sintoma_principal,
      windowSeconds: 45,
    });
    if (duplicada?.id) {
      req.flash("success", `OS #${duplicada.id} já foi aberta há instantes. Evitamos uma abertura duplicada.`);
      return res.redirect(`/os/${duplicada.id}`);
    }

    const diagnosticoInicial = String(req.body?.ai_diagnostico_inicial || req.body?.diagnostico_inicial || "").trim();
    const causaProvavel = String(req.body?.ai_causa || req.body?.causa_mais_provavel || "").trim();
    const acoesIniciais = String(req.body?.ai_acoes_iniciais || req.body?.acoes_iniciais || "").trim();

    const created = createOSRecordFast({
      equipamento_id: equipamentoIdNum,
      equipamento_manual: equipamentoManualTxt || null,
      nao_conformidade: relatoAbertura,
      descricao: relatoAbertura,
      tipo: req.body?.tipo,
      sintoma_principal: req.body?.sintoma_principal,
      severidade: req.body?.criticidade || null,
      criticidade: req.body?.criticidade || req.body?.grau || null,
      grau: req.body?.grau || req.body?.criticidade || null,
      resumo_tecnico: acoesIniciais || diagnosticoInicial || null,
      causa_diagnostico: causaProvavel || diagnosticoInicial || null,
      opened_by: userId,
    });

    service.updateInstitutionalMetadata(created.id, {
      setor_solicitante: req.body?.setor_solicitante,
      setor_destinatario: req.body?.setor_destinatario,
      responsavel_manutencao: req.body?.responsavel_manutencao,
    });

    let autoResult = null;
    try { autoResult = service.autoAssignOS(created.id, userId); }
    catch (err) { console.error("[OS_FAST][AUTO_ASSIGN]", err?.stack || err); }

    const fotosAbertura = mapFilesToPublic(req.files?.abertura_fotos || []);
    service.addFotosAberturaFechamento({
      osId: created.id,
      files: fotosAbertura,
      tipo: "ABERTURA",
      userId,
    });

    // IA, embeddings, integração com inspeção e notificações são complementares.
    // Nenhuma delas deve segurar a resposta de abertura da OS.
    scheduleCreateEnrichment(created);
    scheduleCreateNotifications({ id: created.id, autoResult, userId });

    req.flash(
      "success",
      autoResult?.aguardando
        ? "OS criada, aguardando equipe — clique em Reatribuir automaticamente."
        : "OS criada e equipe alocada automaticamente."
    );
    return res.redirect(`/os/${created.id}`);
  } catch (err) {
    console.error("[OS_FAST][CREATE_ERROR]", err?.stack || err);
    const rawMsg = String(err?.message || "");
    const userMessage = /SQLITE|no such column|syntax error|constraint/i.test(rawMsg)
      ? "Não foi possível salvar agora. Tente novamente e, se persistir, avise a manutenção do sistema."
      : (rawMsg || "Erro ao salvar a OS.");
    req.flash("error", userMessage);
    return res.redirect("/os/novo");
  }
}

function closeOSRecordFast(id, { closedBy, diagnostico, acaoExecutada, fechamentoPayload = {} }) {
  const os = service.getOSById(id);
  if (!os) throw new Error("OS não encontrada.");

  const cols = getColumns("os");
  const sets = ["status = 'FECHADA'"];
  const args = [];

  if (cols.includes("closed_at")) sets.push("closed_at = COALESCE(closed_at, datetime('now'))");
  if (cols.includes("closed_by")) { sets.push("closed_by = COALESCE(closed_by, ?)"); args.push(closedBy || null); }
  if (cols.includes("data_conclusao")) sets.push("data_conclusao = COALESCE(data_conclusao, datetime('now'))");
  if (cols.includes("data_fim")) sets.push("data_fim = COALESCE(data_fim, datetime('now'))");
  if (cols.includes("diagnostico")) { sets.push("diagnostico = COALESCE(?, diagnostico)"); args.push(diagnostico || null); }
  if (cols.includes("causa_diagnostico")) { sets.push("causa_diagnostico = COALESCE(?, causa_diagnostico)"); args.push(diagnostico || null); }
  if (cols.includes("acao_executada")) { sets.push("acao_executada = COALESCE(?, acao_executada)"); args.push(acaoExecutada || null); }
  if (cols.includes("resumo_tecnico")) { sets.push("resumo_tecnico = COALESCE(?, resumo_tecnico)"); args.push(acaoExecutada || null); }

  const fechamentoCols = {
    acoes_executadas_json: JSON.stringify(fechamentoPayload.acoes_executadas || []),
    pecas_utilizadas_json: JSON.stringify((fechamentoPayload.pecas_utilizadas || []).filter((p) => p && p.peca_descricao)),
    teste_operacional_realizado: fechamentoPayload.teste_operacional_realizado ? 1 : 0,
    falha_eliminada: fechamentoPayload.falha_eliminada ? 1 : 0,
    requer_monitoramento: fechamentoPayload.requer_monitoramento ? 1 : 0,
    tipo_acao_fechamento: fechamentoPayload.tipo_acao || null,
    observacao_curta_fechamento: fechamentoPayload.observacao_curta || null,
  };
  for (const [column, value] of Object.entries(fechamentoCols)) {
    if (!cols.includes(column)) continue;
    sets.push(`${column} = ?`);
    args.push(value);
  }

  args.push(Number(id));
  db.transaction(() => {
    db.prepare(`UPDATE os SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    if (tableExists("os_execucoes")) {
      db.prepare(`UPDATE os_execucoes SET finalizado_em = datetime('now') WHERE os_id = ? AND finalizado_em IS NULL`).run(Number(id));
    }
  })();
}

function scheduleCloseEnrichment(id, payload) {
  runDetached("CLOSE_ENRICHMENT", async () => {
    // Reutiliza o fechamento completo já existente, porém fora do caminho crítico.
    // Ele preenche IA, arquiva chat, sincroniza inspeção, emite eventos e push.
    await service.concluirOS(id, payload);
  });
}

function osClose(req, res) {
  const id = Number(req.params.id);
  const user = req.session?.user || null;
  const redirectAfterClose = postCloseRedirectPath(user) || `/os/${id}`;

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

    const statusAtual = String(osAtual.status || "").trim().toUpperCase();
    const statusPermitidos = ["ANDAMENTO", "EM_ANDAMENTO", "PAUSADA", "AGUARDANDO_MATERIAL"];
    if (!statusPermitidos.includes(statusAtual)) {
      req.flash("error", "Inicie a OS antes de registrar a conclusão.");
      return res.redirect(`/os/${id}#evidencias`);
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
      try { fotosMetadados = JSON.parse(fotosMetadadosBody); }
      catch (_e) { fotosMetadados = []; }
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

    const descricaoAssistida = String(req.body?.descricao_assistida || "").trim();
    const descricaoFinal = versaoFinalAprovada || descricaoAssistida || textoDigitado || transcricaoAudio || "";

    closeOSRecordFast(id, {
      closedBy: user?.id || null,
      diagnostico: descricaoFinal || undefined,
      acaoExecutada: descricaoFinal || undefined,
      fechamentoPayload,
    });

    scheduleCloseEnrichment(id, {
      closedBy: user?.id || null,
      diagnostico: descricaoFinal || undefined,
      acaoExecutada: descricaoFinal || undefined,
      fechamentoPayload,
    });

    req.flash("success", canViewOSDetails(user) ? "OS concluída com sucesso." : "Serviço concluído com sucesso. Retornando ao painel.");
    return res.redirect(redirectAfterClose);
  } catch (err) {
    console.error("[OS_FAST][CLOSE_ERROR]", err?.stack || err);
    req.flash("error", err?.message || "Não foi possível concluir a OS.");
    return res.redirect(`/os/${id}`);
  }
}

module.exports = {
  osCreate,
  osClose,
  _test: {
    normalizeGrau,
    normalizeTipoOS,
    runDetached,
  },
};
