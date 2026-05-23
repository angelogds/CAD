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
    if (req.accepts("html")) return res.status(403).render("errors/403", { layout: "layout", title: "Sem permissão" });
    return res.status(403).json({ error: "Sem permissão" });
  };
}

module.exports = { requireLogin, requireRole };
