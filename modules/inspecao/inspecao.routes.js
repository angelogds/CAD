const express = require("express");

const router = express.Router();
const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS, ROLE } = require("../../config/rbac");
const ctrl = require("./inspecao.controller");

const VIEW_ACCESS = ACCESS.inspecao_view || [
  ROLE.ADMIN,
  ROLE.MANUTENCAO_SUPERVISOR,
  ROLE.MECANICO,
  ROLE.DIRETORIA,
  ROLE.PRODUCAO,
  ROLE.COMPRAS,
  ROLE.ALMOXARIFADO,
  ROLE.RH,
];

const EDIT_ACCESS = ACCESS.inspecao_edit || [ROLE.ADMIN, ROLE.MANUTENCAO_SUPERVISOR];

const wrap = (fn) => (req, res, next) => {
  res.locals.activeMenu = "inspecao";
  try {
    return fn(req, res, next);
  } catch (err) {
    return next(err);
  }
};

router.get("/", requireLogin, requireRole(VIEW_ACCESS), wrap(ctrl.index));
router.get("/:ano/:mes", requireLogin, requireRole(VIEW_ACCESS), wrap(ctrl.viewMonth));

router.post("/recalcular", requireLogin, requireRole(EDIT_ACCESS), wrap(ctrl.recalculateCurrent));
router.post("/atualizar", requireLogin, requireRole(EDIT_ACCESS), wrap(ctrl.recalculateCurrent));

router.post("/:ano/:mes/recalcular", requireLogin, requireRole(EDIT_ACCESS), wrap(ctrl.recalculate));
router.post("/:ano/:mes/observacao/salvar", requireLogin, requireRole(EDIT_ACCESS), wrap(ctrl.saveObservation));

router.get("/:ano/:mes/pdf", requireLogin, requireRole(VIEW_ACCESS), wrap(ctrl.exportPDF));
router.get("/:ano/:mes/export/pdf", requireLogin, requireRole(VIEW_ACCESS), wrap(ctrl.exportPDF));
router.get("/:ano/:mes/export/csv", requireLogin, requireRole(VIEW_ACCESS), wrap(ctrl.exportCSV));
router.get("/:ano/:mes/export/xls", requireLogin, requireRole(VIEW_ACCESS), wrap(ctrl.exportCSV));

module.exports = router;
