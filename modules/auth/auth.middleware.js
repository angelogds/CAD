// modules/auth/auth.middleware.js
const { normalizeRole } = require("../../config/rbac");

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
function requireRole(roles = []) {
  const allowed = (Array.isArray(roles) ? roles : [roles]).map(normRole);

  return (req, res, next) => {
    const user = req.session?.user;
    if (!user) {
      req.flash("error", "Faça login para continuar.");
      return res.redirect(`/auth/login?next=${encodeURIComponent(req.originalUrl || "/dashboard")}`);
    }

    const role = normRole(user.role);
    if (role === "ADMIN") return next();

    if (allowed.length === 0) return next(); // sem regra -> libera
    if (allowed.includes(role)) return next();

    req.flash("error", "Sem permissão para acessar esta área.");
    if (req.accepts("html")) return res.status(403).render("errors/403", { layout: "layout", title: "Sem permissão" });
    return res.status(403).json({ error: "Sem permissão" });
  };
}

module.exports = { requireLogin, requireRole };
