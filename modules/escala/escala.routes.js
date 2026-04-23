const express = require("express");
const router = express.Router();

const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const controller = require("./escala.controller");

const safe = (fn, name) =>
  typeof fn === "function"
    ? (req, res, next) => {
        try {
          res.locals.activeMenu = "escala";
          return fn(req, res, next);
        } catch (err) {
          return next(err);
        }
      }
    : (_req, res) => res.status(500).send(`Erro interno: handler ${name} indefinido.`);

router.get("/", requireLogin, requireRole(ACCESS.escala), safe(controller.index, "index"));
router.get("/completa", requireLogin, requireRole(ACCESS.escala), safe(controller.completa, "completa"));
router.get("/ausencias", requireLogin, requireRole(ACCESS.escala), safe(controller.ausencias, "ausencias"));
router.post("/adicionar", requireLogin, requireRole(ACCESS.escala), safe(controller.adicionarRapido, "adicionarRapido"));
router.post("/ausencia", requireLogin, requireRole(ACCESS.escala), safe(controller.lancarAusencia, "lancarAusencia"));
router.post("/ausencia/:id/update", requireLogin, requireRole(ACCESS.escala), safe(controller.atualizarAusencia, "atualizarAusencia"));
router.get("/editar/:id", requireLogin, requireRole(ACCESS.escala), safe(controller.editarSemana, "editarSemana"));
router.post("/editar/:id", requireLogin, requireRole(ACCESS.escala), safe(controller.salvarEdicao, "salvarEdicao"));
router.post("/alocacao/:id/delete", requireLogin, requireRole(ACCESS.escala), safe(controller.removerAlocacao, "removerAlocacao"));

router.get("/pdf/semana", requireLogin, requireRole(ACCESS.escala), safe(controller.pdfSemana, "pdfSemana"));
router.get("/pdf/semana/:id", requireLogin, requireRole(ACCESS.escala), safe(controller.pdfSemanaById, "pdfSemanaById"));
router.get("/pdf/periodo", requireLogin, requireRole(ACCESS.escala), safe(controller.pdfPeriodo, "pdfPeriodo"));
router.get("/pdf", requireLogin, requireRole(ACCESS.escala), safe(controller.pdfPeriodo, "pdfPeriodo"));

module.exports = router;
