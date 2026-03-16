const service = require("./avisos.service");

function canPublishAviso(user) {
  const role = String(user?.role || "").toUpperCase();
  return ["ADMIN", "RH", "ENCARREGADO_PRODUCAO", "DIRECAO", "DIRETORIA"].includes(role);
}

function index(req, res) {
  return res.render("avisos/index", {
    title: "Avisos",
    activeMenu: "avisos",
    avisos: service.listAvisos(200),
    canPublishAviso: canPublishAviso(req.session?.user),
  });
}

function create(req, res) {
  if (!canPublishAviso(req.session?.user)) {
    req.flash("error", "Você não tem permissão para publicar avisos.");
    return res.redirect("/avisos");
  }

  const titulo = String(req.body?.titulo || "").trim();
  const mensagem = String(req.body?.mensagem || "").trim();
  const diasVisiveis = Number(req.body?.dias_visiveis || 7);

  if (!titulo || !mensagem) {
    req.flash("error", "Informe o título e a mensagem do aviso.");
    return res.redirect("/avisos");
  }

  service.createAviso({
    titulo,
    mensagem,
    diasVisiveis,
    createdBy: req.session?.user?.id || null,
  });

  req.flash("success", "Aviso publicado com sucesso.");
  return res.redirect("/avisos");
}

function remove(req, res) {
  if (!canPublishAviso(req.session?.user)) {
    req.flash("error", "Você não tem permissão para excluir avisos.");
    return res.redirect("/avisos");
  }

  const changes = service.deleteAviso(req.params?.id);
  if (!changes) {
    req.flash("error", "Aviso não encontrado.");
    return res.redirect("/avisos");
  }

  req.flash("success", "Aviso excluído com sucesso.");
  return res.redirect("/avisos");
}

module.exports = {
  index,
  create,
  remove,
};
