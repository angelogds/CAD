const service = require("./preventivas.service");

function isAdminOrEncarregado(user = null) {
  const role = String(user?.role || "").toUpperCase();
  return ["ADMIN", "MANUTENCAO_SUPERVISOR", "SUPERVISOR_MANUTENCAO", "ENCARREGADO_MANUTENCAO"].includes(role);
}

function index(req, res) {
  let ciclo = { skipped: true, reason: "erro_ciclo" };
  let lista = [];
  let diagnosticoLeitura = null;
  try {
    ciclo = service.executarCicloAutonomo(new Date());
    lista = service.listPlanos();
    diagnosticoLeitura = service.auditarLeituraEquipamentosPreventivas();
  } catch (err) {
    console.error("[PREVENTIVAS][INDEX] erro ao carregar módulo:", err?.stack || err);
    req.flash("error", "Preventivas carregadas com alertas. Verifique o vínculo da escala com usuários.");
    try {
      lista = service.listPlanos();
      diagnosticoLeitura = service.auditarLeituraEquipamentosPreventivas();
    } catch (_e) {}
  }
  console.log("[PREVENTIVA_IA] ciclo autônomo", ciclo);

  return res.render("preventivas/index", {
    layout: "layout",
    title: "Preventivas",
    activeMenu: "preventivas",
    lista,
    diagnosticoLeitura,
    tvMode: ["1", "true", "tv"].includes(String(req.query.tv || "").toLowerCase()),
    canAdminPreventivas: isAdminOrEncarregado(req.session?.user || null),
  });
}

function newForm(req, res) {
  const equipamentos = service.listEquipamentosAtivos();
  return res.render("preventivas/nova", {
    layout: "layout",
    title: "Nova Preventiva",
    activeMenu: "preventivas",
    equipamentos,
  });
}

function create(req, res) {
  const {
    equipamento_id,
    titulo,
    tipo_preventiva,
    criticidade,
    data_prevista,
    frequencia_tipo,
    frequencia_valor,
    observacao,
  } = req.body;

  if (!equipamento_id || !Number(equipamento_id)) {
    req.flash("error", "Selecione o equipamento da preventiva manual.");
    return res.redirect("/preventivas/nova");
  }
  if (!titulo || !titulo.trim()) {
    req.flash("error", "Informe o título da preventiva.");
    return res.redirect("/preventivas/nova");
  }
  if (!data_prevista || !String(data_prevista).trim()) {
    req.flash("error", "Informe a data prevista da preventiva.");
    return res.redirect("/preventivas/nova");
  }

  const result = service.criarPreventivaManual({
    equipamento_id: Number(equipamento_id),
    titulo: titulo.trim(),
    tipo_preventiva: String(tipo_preventiva || "preventiva").trim(),
    criticidade: String(criticidade || "MEDIA").trim(),
    data_prevista: String(data_prevista || "").trim(),
    frequencia_tipo: (frequencia_tipo || "mensal").trim(),
    frequencia_valor: frequencia_valor ? Number(String(frequencia_valor).replace(",", ".")) : 1,
    observacao: (observacao || "").trim(),
    user: req.session?.user || null,
  });

  req.flash("success", `Preventiva manual criada com sucesso (execução #${result.execucaoId}).`);
  return res.redirect(`/preventivas/${result.planoId}`);
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
    execucoes,
    canAdminPreventivas: isAdminOrEncarregado(req.session?.user || null),
  });
}

function execCreate(req, res) {
  const planoId = Number(req.params.id);
  const { data_prevista, observacao } = req.body;

  const execId = service.createExecucao(planoId, {
    data_prevista: (data_prevista || "").trim(),
    status: "PENDENTE",
    origem: "MANUAL",
    responsavel: "",
    observacao: (observacao || "").trim(),
  });
  service.alocarEquipeExecucaoPreventiva(execId);
  service.registrarLogPreventiva({
    acao: "PREVENTIVA_MANUAL_EXECUCAO_ADICIONADA",
    preventiva_execucao_id: execId,
    preventiva_plano_id: planoId,
    user: req.session?.user || null,
    detalhes: { data_prevista: (data_prevista || "").trim() || null },
  });

  req.flash("success", "Execução adicionada.");
  return res.redirect(`/preventivas/${planoId}`);
}

function execUpdateStatus(req, res) {
  const planoId = Number(req.params.id);
  const execId = Number(req.params.execId);
  const { status, data_executada } = req.body;
  const statusNorm = service.normalizePreventivaStatus(status);

  if (["PENDENTE", "ATRASADA", "EM_ANDAMENTO", "ANDAMENTO"].includes(statusNorm)) {
    service.alocarEquipeExecucaoPreventiva(execId);
  }

  const ok = service.updateExecucaoStatus(planoId, execId, statusNorm, data_executada, req.session?.user?.id || null);

  if (!ok) {
    req.flash("error", "Execução não encontrada para este plano.");
    return res.redirect(`/preventivas/${planoId}`);
  }

  req.flash("success", "Status da execução atualizado.");
  return res.redirect(`/preventivas/${planoId}`);
}

async function reprocessarModulo(req, res) {
  const user = req.session?.user || null;
  if (!isAdminOrEncarregado(user)) {
    req.flash("error", "Sem permissão para reprocessar preventivas.");
    return res.redirect("/dashboard");
  }

  try {
    const result = await service.reprocessarModuloPreventivas({ user });
    const pre = result.prevalidacao || {};
    const alertas = Array.isArray(pre.alertas) ? pre.alertas : [];
    const prefixo = alertas.length
      ? `Reprocesso concluído com alertas de pré-validação (${alertas.length}). `
      : "Preventivas reprocessadas e equipes atualizadas com sucesso. ";
    req.flash(
      "success",
      prefixo +
        `Semana ativa: ${pre.semanaAtiva ? "SIM" : "NÃO"}, ` +
        `turnos (D/A/N): ${pre.colaboradoresTurno?.diurno || 0}/${pre.colaboradoresTurno?.apoio || 0}/${pre.colaboradoresTurno?.noturnoPlantao || 0}, ` +
        `Equipamentos elegíveis: ${result.auditoria?.equipamentosElegiveis || 0}, ` +
        `planos ativos: ${result.auditoria?.planosAtivos || 0}, ` +
        `execuções sincronizadas/atualizadas: ${result.reorganizacao?.atualizadas || 0}.`
    );
    if (alertas.length) {
      req.flash("error", `Pré-validação: ${alertas.join(" | ")}`);
    }
  } catch (err) {
    console.error("[PREVENTIVAS][REPROCESSAR] erro ao reprocessar módulo:", err?.stack || err);
    req.flash("error", "Erro ao reprocessar preventivas. Verifique os logs.");
  }
  return res.redirect("/dashboard");
}

function apagarExecucao(req, res) {
  const user = req.session?.user || null;
  if (!isAdminOrEncarregado(user)) {
    req.flash("error", "Sem permissão para apagar preventiva.");
    return res.redirect("/preventivas");
  }

  const planoId = Number(req.params.id);
  const execId = Number(req.params.execId);
  const forcar = ["1", "true", "sim"].includes(String(req.body.force_delete || "").toLowerCase());

  const result = service.apagarPreventivaExecucao({
    planoId,
    execucaoId: execId,
    user,
    forcar,
  });

  if (!result.ok) {
    req.flash("error", result.message || "Não foi possível apagar a preventiva.");
    return res.redirect(`/preventivas/${planoId}`);
  }

  req.flash("success", `Preventiva #${execId} apagada com sucesso.`);
  return res.redirect(`/preventivas/${planoId}`);
}

module.exports = { index, newForm, create, show, execCreate, execUpdateStatus, reprocessarModulo, apagarExecucao };
