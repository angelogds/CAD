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
    ciclo = service.executarCicloProgramadoSemanal(new Date());
    service.sincronizarPreventivasComEscala({ origem: "preventivas.index" });
    lista = service.listPlanos();
    diagnosticoLeitura = service.auditarLeituraEquipamentosPreventivas();
  } catch (err) {
    console.error("[PREVENTIVAS][INDEX] erro ao carregar módulo:", err?.stack || err);
    let mensagemAlerta = "Preventivas carregadas com alertas. Não foi possível sincronizar automaticamente com a escala.";
    try {
      const prevalidacao = service.prevalidarReprocessamentoPreventivas();
      const alertasEscala = (prevalidacao?.alertas || [])
        .filter((alerta) => /^Escala da semana não encontrada|^Sem colaboradores ativos no turno/i.test(String(alerta || "")))
        .slice(0, 2);
      if (alertasEscala.length) {
        mensagemAlerta = `Preventivas carregadas com alertas. ${alertasEscala.join(" ")}`;
      }
    } catch (_e) {}
    req.flash("error", mensagemAlerta);
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
  if (["EM_ANDAMENTO", "ANDAMENTO", "FINALIZADA", "EXECUTADA", "CONCLUIDA"].includes(statusNorm)) {
    service.sincronizarPreventivasComEscala({ origem: "preventivas.execUpdateStatus" });
  }

  const ok = service.updateExecucaoStatus(planoId, execId, statusNorm, data_executada, req.session?.user?.id || null);

  if (!ok) {
    req.flash("error", "Execução não encontrada para este plano.");
    return res.redirect(`/preventivas/${planoId}`);
  }

  req.flash("success", "Status da execução atualizado.");
  return res.redirect(`/preventivas/${planoId}`);
}

function programadasIndex(req, res) {
  const user = req.session?.user || null;
  if (!isAdminOrEncarregado(user)) {
    req.flash("error", "Sem permissão para acessar preventivas programadas.");
    return res.redirect("/preventivas");
  }

  const resumo = service.listarResumoPreventivasProgramadas();
  return res.render("preventivas/programadas", {
    layout: "layout",
    title: "Preventivas Programadas",
    activeMenu: "preventivas",
    resumo,
    canAdminPreventivas: isAdminOrEncarregado(user),
  });
}

function gerarProgramadas(req, res) {
  const user = req.session?.user || null;
  if (!isAdminOrEncarregado(user)) {
    req.flash("error", "Sem permissão para gerar preventivas programadas.");
    return res.redirect("/preventivas");
  }

  try {
    const result = service.gerarPreventivasProgramadasSemanais({ user, refDate: new Date() });
    req.flash(
      "success",
      `Preventivas programadas processadas. Planos novos: ${result.planosCriados || 0}, execuções criadas: ${result.execucoesCriadas || 0}, próxima segunda: ${result.proximaSegunda || "-"}.`
    );
  } catch (err) {
    console.error("[PREVENTIVAS][PROGRAMADAS] erro ao gerar preventivas programadas:", err?.stack || err);
    req.flash("error", "Erro ao gerar preventivas programadas.");
  }

  return res.redirect("/preventivas/programadas");
}

function gerarOSProgramadasSegunda(req, res) {
  const user = req.session?.user || null;
  if (!isAdminOrEncarregado(user)) {
    req.flash("error", "Sem permissão para lançar OS das preventivas programadas.");
    return res.redirect("/preventivas");
  }

  try {
    const result = service.lancarProgramadasComoOSDaSegunda({ user, refDate: new Date(), automatico: false });
    if (result?.skipped) {
      req.flash("success", `OS da segunda-feira (${result.dataSegunda || "-"}) já foram lançadas anteriormente.`);
    } else {
      req.flash(
        "success",
        `OS da segunda-feira ${result.dataSegunda || "-"} processadas. OS geradas: ${result.osGeradas || 0}, já existentes: ${result.osJaExistentes || 0}.`
      );
    }
  } catch (err) {
    console.error("[PREVENTIVAS][PROGRAMADAS_OS] erro ao lançar OS programadas:", err?.stack || err);
    req.flash("error", "Erro ao lançar OS das preventivas programadas.");
  }
  return res.redirect("/preventivas/programadas");
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

module.exports = { index, newForm, create, show, programadasIndex, gerarProgramadas, gerarOSProgramadasSegunda, execCreate, execUpdateStatus , apagarExecucao };
