// /modules/motores/motores.routes.js
const express = require("express");
const router = express.Router();

const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");

let ctrl = {};
try {
  ctrl = require("./motores.controller");
  console.log("✅ [motores] controller exports:", Object.keys(ctrl));
} catch (e) {
  console.error("❌ [motores] Falha ao carregar motores.controller:", e.message);
}

const safe = (fn, name) =>
  typeof fn === "function"
    ? (req, res, next) => {
        try {
          res.locals.activeMenu = "motores";
          return fn(req, res, next);
        } catch (err) {
          return next(err);
        }
      }
    : (_req, res) => {
        console.error(`❌ [motores] Handler ${name} indefinido.`);
        return res.status(500).send(`Erro interno: handler ${name} indefinido.`);
      };

const MOTORES_ACCESS = ACCESS.motores;

// GET /motores
router.get("/", requireLogin, requireRole(MOTORES_ACCESS), safe(ctrl.index, "index"));

// GET /motores/new
router.get("/new", requireLogin, requireRole(MOTORES_ACCESS), safe(ctrl.newForm, "newForm"));

// POST /motores
router.post("/", requireLogin, requireRole(MOTORES_ACCESS), safe(ctrl.create, "create"));

// GET /motores/:id
router.get("/:id", requireLogin, requireRole(MOTORES_ACCESS), safe(ctrl.show, "show"));

// POST /motores/:id/enviar
router.post("/:id/enviar", requireLogin, requireRole(MOTORES_ACCESS), safe(ctrl.enviar, "enviar"));

// POST /motores/:id/retorno
router.post("/:id/retorno", requireLogin, requireRole(MOTORES_ACCESS), safe(ctrl.retorno, "retorno"));

module.exports = router;
