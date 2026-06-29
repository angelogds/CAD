// modules/auth/auth.middleware.js
const { normalizeRole } = require("../../config/rbac");

const ADMIN_DELETE_MESSAGE = "Apenas administradores podem excluir registros do sistema.";

function normRole(role) {
  return normalizeRole(role);
}

function requireLogin(req, res, next) {
  if (req.session?.user) return next();
  req.flash("error", "Faça login para continuar.");
  return res.redirect(`/auth/login?next=${encodeURIComponent(req.originalUrl || "/dashboard")}`);
}

/**
 * requireRole(["COMPRAS","DIRETORIA"...])
 * - ADMIN sempre passa
 * - compara role da sessão (case-insensitive)
 */
function requireRole(roles) {
  const raw = typeof roles === "undefined" ? [undefined] : (Array.isArray(roles) ? roles : [roles]);
  const allowed = raw.filter((r) => !!r).map(normRole);
  const isMisconfigured = raw.length > 0 && allowed.length === 0;

  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) {
      req.flash("error", "Faça login para continuar.");
      return res.redirect(`/auth/login?next=${encodeURIComponent(req.originalUrl || "/dashboard")}`);
    }

    const role = normRole(user.role);
    if (role === "ADMIN") return next();

    if (isMisconfigured) {
      return res.status(500).json({ error: "RBAC misconfiguration: role list is undefined/empty." });
    }
    if (allowed.length === 0) return next(); // sem regra explícita
    if (allowed.includes(role)) return next();

    req.flash("error", "Sem permissão para acessar esta área.");
    if (req.accepts("html")) return res.status(403).render("errors/403", { layout: "layout", title: "Sem permissão", message: "Sem permissão para acessar esta área." });
    return res.status(403).json({ error: "Sem permissão" });
  };
}


function requireAdmin(req, res, next) {
  const user = req.session?.user;
  if (!user) {
    req.flash("error", "Faça login para continuar.");
    return res.redirect(`/auth/login?next=${encodeURIComponent(req.originalUrl || "/dashboard")}`);
  }

  if (normRole(user.role) === "ADMIN") return next();

  if (typeof req.flash === "function") req.flash("error", ADMIN_DELETE_MESSAGE);
  if (req.accepts("html")) {
    const back = req.get("Referrer") || "/dashboard";
    return res.redirect(back);
  }
  return res.status(403).json({ error: ADMIN_DELETE_MESSAGE });
}

module.exports = { requireLogin, requireRole, requireAdmin, ADMIN_DELETE_MESSAGE };
