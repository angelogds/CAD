const express = require("express");
const router = express.Router();
const { requireLogin, requireRole, requireAdmin } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./avisos.controller");

const avisosViewRoles = ACCESS.avisos_view;
const publishRoles = ACCESS.avisos_manage;

router.get("/", requireLogin, requireRole(avisosViewRoles), ctrl.index);
router.post("/", requireLogin, requireRole(publishRoles), ctrl.create);
router.post("/:id/delete", requireLogin, requireAdmin, ctrl.remove);

module.exports = router;
