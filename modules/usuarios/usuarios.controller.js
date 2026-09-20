// modules/usuarios/usuarios.controller.js
const path = require("path");
const fs = require("fs");
const service = require("./usuarios.service");
const storagePaths = require("../../config/storage");
const { deriveUserFunctionSector } = require("./usuarios.perfil");

const ROLES = [
  { key: "ADMIN", label: "admin" },
  { key: "DIRETORIA", label: "diretoria" },
  { key: "RH", label: "rh" },
  { key: "ENCARREGADO_PRODUCAO", label: "encarregado_producao" },
  { key: "PRODUCAO", label: "producao" },
  { key: "MECANICO", label: "mecanico" },
  { key: "ALMOXARIFADO", label: "almoxarifado" },
  { key: "COMPRAS", label: "compras" },
  { key: "MANUTENCAO_SUPERVISOR", label: "Supervisor de Manutenção" },
  { key: "ENCARREGADO_MANUTENCAO", label: "Encarregado de Manutenção" },
  { key: "ENCARREGADO_LOGISTICA", label: "Encarregado de Logística" },
  { key: "ENCARREGADO_FRIGORIFICO", label: "Encarregado do Frigorífico" },
  { key: "INSPECAO_QUALIDADE", label: "Inspeção e Qualidade" },
];

const ROLES_WITH_CONTEXT = ROLES.map((role) => ({
  ...role,
  ...deriveUserFunctionSector(role.key),
}));

function ensureUploadDir() {
  const dir = path.join(storagePaths.IMAGE_DIR, "users");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function normalizePhotoPath(file) {
  if (!file) return null;
  ensureUploadDir();
  return `/imagens/users/${file.filename}`;
}

function list(req, res) {
  res.locals.activeMenu = "usuarios";

  const q = (req.query.q || "").trim();
  const role = (req.query.role || "").trim().toUpperCase();
  const status = String(req.query.status || "ativos").toLowerCase() === "arquivados" ? "arquivados" : "ativos";

  const lista = service.list({ q, role, status });
  const indicadores = service.getSummary();

  return res.render("usuarios/index", {
    title: "Usuários",
    lista,
    q,
    role,
    status,
    ROLES: ROLES_WITH_CONTEXT,
    indicadores,
  });
}

function newForm(req, res) {
  res.locals.activeMenu = "usuarios";

  return res.render("usuarios/novo", {
    title: "Novo Usuário",
    ROLES: ROLES_WITH_CONTEXT,
  });
}

function create(req, res) {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const role = String(req.body.role || "").trim().toUpperCase();
  const password = (req.body.password || "").trim();
  const photo_path = normalizePhotoPath(req.file);
  const telefone_whatsapp = String(req.body.telefone_whatsapp || "").trim();

  if (!name || !email || !role || !password) {
    req.flash("error", "Preencha nome, e-mail, perfil e senha.");
    return res.redirect("/usuarios/novo");
  }

  try {
    service.create({ name, email, role, password, photo_path, telefone_whatsapp });
    req.flash("success", telefone_whatsapp ? "Usuário criado com sucesso." : "Usuário criado. Atenção: sem WhatsApp cadastrado, ele não receberá notificações de OS.");
    return res.redirect("/usuarios");
  } catch (e) {
    req.flash("error", e.message || "Erro ao criar usuário.");
    return res.redirect("/usuarios/novo");
  }
}

function editForm(req, res) {
  res.locals.activeMenu = "usuarios";

  const id = Number(req.params.id);
  const user = service.getById(id);
  if (!user) return res.status(404).render("errors/404", { title: "Não encontrado" });

  return res.render("usuarios/edit", {
    title: `Editar Usuário #${id}`,
    user,
    ROLES: ROLES_WITH_CONTEXT,
  });
}

function update(req, res) {
  const id = Number(req.params.id);
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const role = String(req.body.role || "").trim().toUpperCase();
  const photo_path = normalizePhotoPath(req.file);
  const telefone_whatsapp = String(req.body.telefone_whatsapp || "").trim();

  if (!name || !email || !role) {
    req.flash("error", "Preencha nome, e-mail e perfil.");
    return res.redirect(`/usuarios/${id}/editar`);
  }

  try {
    service.update(id, { name, email, role, photo_path, telefone_whatsapp });
    req.flash("success", telefone_whatsapp ? "Usuário atualizado com sucesso." : "Usuário atualizado. Atenção: sem WhatsApp cadastrado, ele não receberá notificações de OS.");
    return res.redirect("/usuarios");
  } catch (e) {
    req.flash("error", e.message || "Erro ao atualizar usuário.");
    return res.redirect(`/usuarios/${id}/editar`);
  }
}

function resetPassword(req, res) {
  const id = Number(req.params.id);
  const password = (req.body.password || "").trim();

  if (!password) {
    req.flash("error", "Informe a nova senha.");
    return res.redirect(`/usuarios/${id}/editar`);
  }

  try {
    service.resetPassword(id, password);
    req.flash("success", "Senha resetada com sucesso.");
    return res.redirect(`/usuarios/${id}/editar`);
  } catch (e) {
    req.flash("error", e.message || "Erro ao resetar senha.");
    return res.redirect(`/usuarios/${id}/editar`);
  }
}

function remove(req, res) {
  const id = Number(req.params.id);

  try {
    const result = service.remove(id, req.session?.user?.id || null);
    if (result?.action === "archived") {
      req.flash("success", "Usuário arquivado porque possui histórico vinculado. O acesso foi bloqueado e os registros foram preservados.");
    } else {
      req.flash("success", "Usuário apagado com sucesso.");
    }
    return res.redirect("/usuarios");
  } catch (e) {
    req.flash("error", e.message || "Erro ao remover usuário.");
    return res.redirect("/usuarios");
  }
}

function restore(req, res) {
  const id = Number(req.params.id);

  try {
    service.restore(id);
    req.flash("success", "Usuário restaurado e liberado para acesso novamente.");
    return res.redirect("/usuarios?status=arquivados");
  } catch (e) {
    req.flash("error", e.message || "Erro ao restaurar usuário.");
    return res.redirect("/usuarios?status=arquivados");
  }
}

module.exports = { list, newForm, create, editForm, update, resetPassword, remove, restore };
