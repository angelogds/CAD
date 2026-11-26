// modules/auth/auth.middleware.js
const { normalizeRole } = require("../../config/rbac");

const ADMIN_DELETE_MESSAGE = "Apenas administradores podem excluir registros do sistema.";

function normRole(role) {
  return normalizeRole(role);
}

// Cliente de API (fetch/XHR/ChatGPT) espera JSON, nunca redirect 302 para HTML de login.
// Navegação de browser (Accept: text/html primeiro) mantém o redirect.
function wantsJson(req) {
  const path = String(req.originalUrl || req.url || "").split("?")[0];
  if (req.xhr) return true;
  const best = typeof req.accepts === "function" ? req.accepts(["html", "json"]) : "html";
  if (/^\/api(\/|$)/.test(path)) return best !== "html" || !String(req.get?.("accept") || "").toLowerCase().startsWith("text/html");
  return best === "json" && String(req.get?.("accept") || "").toLowerCase().includes("json");
}

function denyUnauthenticated(req, res) {
  if (wantsJson(req)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(401).json({ ok: false, error: "unauthenticated", message: "Sessão ausente ou expirada. Faça login novamente." });
  }
  req.flash("error", "Faça login para continuar.");
  return res.redirect(`/auth/login?next=${encodeURIComponent(req.originalUrl || "/dashboard")}`);
}

function requireLogin(req, res, next) {
  if (req.session?.user) return next();
  return denyUnauthenticated(req, res);
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
    if (!user) return denyUnauthenticated(req, res);

    const role = normRole(user.role);
    if (role === "ADMIN") return next();

    if (isMisconfigured) {
      return res.status(500).json({ error: "RBAC misconfiguration: role list is undefined/empty." });
    }
    if (allowed.length === 0) return next(); // sem regra explícita
    if (allowed.includes(role)) return next();

    if (wantsJson(req)) return res.status(403).json({ ok: false, error: "forbidden", message: "Sem permissão" });
    req.flash("error", "Sem permissão para acessar esta área.");
    if (req.accepts("html")) return res.status(403).render("errors/403", { layout: "layout", title: "Sem permissão", message: "Sem permissão para acessar esta área." });
    return res.status(403).json({ error: "Sem permissão" });
  };
}


function requireAdmin(req, res, next) {
  const user = req.session?.user;
  if (!user) return denyUnauthenticated(req, res);

  if (normRole(user.role) === "ADMIN") return next();

  if (wantsJson(req)) return res.status(403).json({ ok: false, error: "forbidden", message: ADMIN_DELETE_MESSAGE });
  if (typeof req.flash === "function") req.flash("error", ADMIN_DELETE_MESSAGE);
  if (req.accepts("html")) {
    const back = req.get("Referrer") || "/dashboard";
    return res.redirect(back);
  }
  return res.status(403).json({ error: ADMIN_DELETE_MESSAGE });
}

module.exports = { wantsJson, requireLogin, requireRole, requireAdmin, ADMIN_DELETE_MESSAGE };
