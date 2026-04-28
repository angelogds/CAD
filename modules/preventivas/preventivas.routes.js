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
        res.locals.activeMenu = "preventivas";
        Promise.resolve()
          .then(() => fn(req, res, next))
          .catch(next);
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


// GET /preventivas/programadas
router.get(
  "/programadas",
  requireLogin,
  requireRole(ACCESS.preventivas_manage),
  safe(ctrl.programadasIndex, "programadasIndex")
);

// POST /preventivas/programadas/gerar
router.post(
  "/programadas/gerar",
  requireLogin,
  requireRole(ACCESS.preventivas_manage),
  safe(ctrl.gerarProgramadas, "gerarProgramadas")
);

// POST /preventivas/programadas/lancar-os-segunda
router.post(
  "/programadas/lancar-os-segunda",
  requireLogin,
  requireRole(ACCESS.preventivas_manage),
  safe(ctrl.gerarOSProgramadasSegunda, "gerarOSProgramadasSegunda")
);

// POST /preventivas/programadas/lancar-os-lote-dia
router.post(
  "/programadas/lancar-os-lote-dia",
  requireLogin,
  requireRole(ACCESS.preventivas_manage),
  safe(ctrl.lancarLoteDiarioPreventivas, "lancarLoteDiarioPreventivas")
);

// Compatibilidade retroativa (rota antiga)
router.post(
  "/programadas/lancar-os-bombas-dia",
  requireLogin,
  requireRole(ACCESS.preventivas_manage),
  safe(ctrl.lancarLoteDiarioPreventivas, "lancarLoteDiarioPreventivas")
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


// POST /preventivas/:id/execucoes/:execId/apagar
router.post(
  "/:id/execucoes/:execId/apagar",
  requireLogin,
  requireRole(ACCESS.preventivas_manage),
  safe(ctrl.apagarExecucao, "apagarExecucao")
);

module.exports = router;
