const service = require("./os.service");
const pushService = require("../push/push.service");
let tracagemService = null;
try { tracagemService = require('../tracagem/tracagem.service'); } catch (_e) {}
const { normalizeRole } = require("../../config/rbac");

function mapFilesToPublic(files = []) {
  return (files || []).map((f) => ({
    ...f,
    pathPublic: `/uploads/os/${f.filename}`,
  }));
}

function osIndex(req, res) {
  res.locals.activeMenu = "os";
  const lista = service.listOS();
  return res.render("os/index", { title: "Ordens de Serviço", lista });
}

function osNewForm(req, res) {
  res.locals.activeMenu = "os";
  const equipamentos = service.listEquipamentosAtivos();
  const graus = service.listGrauOptions();
  const tipos = service.listTipoOptions();
  return res.render("os/new", {
    title: "Nova OS",
    equipamentos,
    graus,
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
      descricao,
      resumo_tecnico,
      causa_diagnostico,
      data_inicio,
      data_fim,
      tipo,
      grau,
      setor_id,
      sintoma_principal,
      severidade,
      observacao_curta,
      equipamento_parado,
      vazamento,
      aquecimento,
      ruido_anormal,
      vibracao,
      odor_anormal,
      baixa_performance,
      travamento,
    } = req.body;

    const id = await service.createOS({
      equipamento_id: equipamento_id ? Number(equipamento_id) : null,
      equipamento_manual,
      descricao,
      resumo_tecnico,
      causa_diagnostico,
      data_inicio,
      data_fim,
      tipo,
      grau,
      setor_id,
      sintoma_principal,
      severidade,
      observacao_curta,
      equipamento_parado: equipamento_parado === "1",
      vazamento: vazamento === "1",
      aquecimento: aquecimento === "1",
      ruido_anormal: ruido_anormal === "1",
      vibracao: vibracao === "1",
      odor_anormal: odor_anormal === "1",
      baixa_performance: baixa_performance === "1",
      travamento: travamento === "1",
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

    await pushService.sendPushToAll({
      title: "Nova Ordem de Serviço",
      body: `OS #${id} - ${equipamento_manual || (equipamento_id ? `Equipamento #${equipamento_id}` : 'Equipamento')}`,
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
    req.flash("error", err.message || "Erro ao salvar a OS.");
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

async function osIniciar(req, res) {
  const id = Number(req.params.id);
  try {
    service.iniciarOS(id, req.session?.user?.id || null);
    await pushService.sendPushToAll({
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

function normalizeCheckboxValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return [String(value).trim()].filter(Boolean);
}

function normalizePecasBody(body) {
  const desc = Array.isArray(body.peca_descricao) ? body.peca_descricao : [body.peca_descricao];
  const qtd = Array.isArray(body.peca_quantidade) ? body.peca_quantidade : [body.peca_quantidade];

  return desc.map((d, idx) => ({
    peca_descricao: d,
    quantidade: qtd[idx],
  }));
}

async function osClose(req, res) {
  const id = Number(req.params.id);
  console.log("[OS_CLOSE] Iniciando fechamento", {
    osId: id,
    userId: req.session?.user?.id || null,
    data_fim_payload: req.body?.data_fim || null,
  });

  try {

    const fotosFechamento = mapFilesToPublic(req.files?.fechamento_fotos || []);
    service.addFotosAberturaFechamento({
      osId: id,
      files: fotosFechamento,
      tipo: "FECHAMENTO",
      userId: req.session?.user?.id || null,
    });

    const acoesExecutadas = normalizeCheckboxValues(req.body.acoes_executadas);
    const pecas = normalizePecasBody(req.body);

    const syncResult = await service.concluirOS(id, {
      closedBy: req.session?.user?.id || null,
      diagnostico: req.body.diagnostico || req.body.causa_diagnostico,
      acaoExecutada: req.body.acao_executada || req.body.resumo_tecnico,
      pecas,
      dataFim: req.body.data_fim,
      fechamentoPayload: {
        acoes_executadas: acoesExecutadas,
        pecas_utilizadas: pecas,
        teste_operacional_realizado: req.body.teste_operacional_realizado === "1",
        falha_eliminada: req.body.falha_eliminada === "1",
        requer_monitoramento: req.body.requer_monitoramento === "1",
        tipo_acao: req.body.tipo_acao || null,
        observacao_curta: req.body.observacao_curta || null,
      },
    });

    await pushService.sendPushToAll({
      title: "OS finalizada",
      body: `OS #${id} foi finalizada.`,
      url: `/os/${id}`,
    }).catch(() => {});

    console.log("[OS_CLOSE] Fechamento concluído", { osId: id, syncResult });
    req.flash("success", "OS concluída com sucesso.");
  } catch (err) {
    console.error("[OS_CLOSE][ERROR]", err);
    req.flash("error", err.message || "Não foi possível concluir a OS.");
  }
  return res.redirect(`/os/${id}`);
}

async function osUpdateStatus(req, res) {
  const id = Number(req.params.id);
  const { status } = req.body;

  try {
    service.updateStatus(id, status, req.session?.user?.id || null);

    const st = String(status || '').toUpperCase();
    if (st === 'ANDAMENTO' || st === 'EM_ANDAMENTO') {
      await pushService.sendPushToAll({
        title: "OS em andamento",
        body: `OS #${id} entrou em andamento.`,
        url: `/os/${id}`,
      }).catch(() => {});
    }
    if (['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CONCLUÍDA'].includes(st)) {
      await pushService.sendPushToAll({
        title: "OS finalizada",
        body: `OS #${id} foi finalizada.`,
        url: `/os/${id}`,
      }).catch(() => {});
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
  osUpdateStatus,
  osAutoAssign,
  osSetEquipe,
};
