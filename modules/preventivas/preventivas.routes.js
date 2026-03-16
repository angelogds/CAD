// modules/preventivas/preventivas.routes.js
const express = require("express");
const router = express.Router();

const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");

// controller
let ctrl = {};
try {
  ctrl = require("./preventivas.controller");
  console.log("✅ [preventivas] controller exports:", Object.keys(ctrl));
} catch (e) {
  console.error("❌ [preventivas] Falha ao carregar preventivas.controller:", e.message);
}

const safe = (fn, name) =>
  typeof fn === "function"
    ? (req, res, next) => {
        try {
          res.locals.activeMenu = "preventivas";
          return fn(req, res, next);
        } catch (err) {
          return next(err);
        }
      }
    : (_req, res) => {
        console.error(`❌ [preventivas] Handler ${name} indefinido (export errado).`);
        return res.status(500).send(`Erro interno: handler ${name} indefinido.`);
      };

// Quem pode ver preventivas (ajuste se quiser)
const PREV_ACCESS = ACCESS.preventivas_view;

// =====================================================
// ✅ ROTAS (prefixo já é /preventivas no server.js)
// Então aqui é: /, /nova, /:id...
// =====================================================

// GET  /preventivas
router.get(
  "/",
  requireLogin,
  requireRole(PREV_ACCESS),
  safe(ctrl.index, "index")
);

// GET  /preventivas/nova
router.get(
  "/nova",
  requireLogin,
  requireRole(ACCESS.preventivas_manage),
  safe(ctrl.newForm, "newForm")
);

// POST /preventivas
router.post(
  "/",
  requireLogin,
  requireRole(ACCESS.preventivas_manage),
  safe(ctrl.create, "create")
);

// GET  /preventivas/:id
router.get(
  "/:id",
  requireLogin,
  requireRole(PREV_ACCESS),
  safe(ctrl.show, "show")
);

// POST /preventivas/:id/execucoes
router.post(
  "/:id/execucoes",
  requireLogin,
  requireRole(ACCESS.preventivas_manage),
  safe(ctrl.execCreate, "execCreate")
);

// POST /preventivas/:id/execucoes/:execId/status
router.post(
  "/:id/execucoes/:execId/status",
  requireLogin,
  requireRole(ACCESS.preventivas_manage),
  safe(ctrl.execUpdateStatus, "execUpdateStatus")
);

module.exports = router;
