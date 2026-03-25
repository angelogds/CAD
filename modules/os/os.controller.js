const service = require("./os.service");
const pushService = require("../push/push.service");
let tracagemService = null;
try { tracagemService = require('../tracagem/tracagem.service'); } catch (_e) {}
const { normalizeRole } = require("../../config/rbac");
const { canViewOSDetails, postCloseRedirectPath } = require("./os.permissions");

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
      sintoma_principal,
    } = req.body;

    const id = await service.createOS({
      equipamento_id: equipamento_id ? Number(equipamento_id) : null,
      equipamento_manual,
      nao_conformidade,
      descricao: nao_conformidade,
      tipo: "CORRETIVA",
      sintoma_principal,
      severidade: null,
      grau: null,
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


async function osClose(req, res) {
  const id = Number(req.params.id);
  const user = req.session?.user || null;
  const redirectAfterClose = postCloseRedirectPath(user) || `/os/${id}`;

  console.log("[OS_CLOSE] Iniciando fechamento", {
    osId: id,
    userId: user?.id || null,
  });

  try {
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

    const syncResult = await service.concluirOS(id, {
      closedBy: user?.id || null,
      fechamentoPayload: {},
    });

    await pushService.sendPushToAll({
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
  osUpdateStatus,
  osAutoAssign,
  osSetEquipe,
};
