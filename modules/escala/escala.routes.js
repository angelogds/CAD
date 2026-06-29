const express = require("express");
const multer = require("multer");
const path = require("node:path");
const fs = require("node:fs");
const router = express.Router();

const { requireLogin, requireRole, requireAdmin } = require("../auth/auth.middleware");
const { ACCESS, ROLE } = require("../../config/rbac");
const controller = require("./escala.controller");

const uploadDir = path.resolve(process.cwd(), "public/uploads/escala-horas");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(file.originalname || '')}`),
  }),
});

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

const escalaManage = [ROLE.ADMIN, ROLE.ENCARREGADO_MANUTENCAO, ROLE.MANUTENCAO_SUPERVISOR, ROLE.SUPERVISOR_MANUTENCAO];
const escalaRead = ACCESS.escala;

router.get("/", requireLogin, requireRole(escalaRead), safe(controller.index, "index"));
router.get("/semana", requireLogin, requireRole(escalaRead), safe(controller.semana, "semana"));
router.get("/completa", requireLogin, requireRole(escalaRead), safe(controller.completa, "completa"));
router.get("/ausencias", requireLogin, requireRole(escalaRead), safe(controller.ausencias, "ausencias"));

router.get("/hora-extra/nova", requireLogin, requireRole(escalaRead), safe(controller.horaExtraNova, "horaExtraNova"));
router.post("/hora-extra/iniciar", requireLogin, requireRole(escalaRead), upload.single("foto_inicio"), safe(controller.iniciarHoraExtra, "iniciarHoraExtra"));
router.post("/hora-extra/:id/finalizar", requireLogin, requireRole(escalaRead), upload.single("foto_fim"), safe(controller.finalizarHoraExtra, "finalizarHoraExtra"));
router.get("/hora-extra/pendentes", requireLogin, requireRole(escalaManage), safe(controller.horasExtrasPendentes, "horasExtrasPendentes"));
router.post("/hora-extra/:id/aprovar", requireLogin, requireRole(escalaManage), safe(controller.aprovarHoraExtra, "aprovarHoraExtra"));
router.post("/hora-extra/:id/reprovar", requireLogin, requireRole(escalaManage), safe(controller.reprovarHoraExtra, "reprovarHoraExtra"));
router.post("/hora-extra/:id/ajustar", requireLogin, requireRole(escalaManage), safe(controller.ajustarHoraExtra, "ajustarHoraExtra"));
router.post("/hora-extra/:id/cancelar", requireLogin, requireRole(escalaManage), safe(controller.cancelarHoraExtra, "cancelarHoraExtra"));

router.get("/banco-horas", requireLogin, requireRole(escalaRead), safe(controller.bancoHoras, "bancoHoras"));
router.get("/banco-horas/:colaboradorId", requireLogin, requireRole(escalaRead), safe(controller.bancoHorasFuncionario, "bancoHorasFuncionario"));
router.get("/folgas", requireLogin, requireRole(escalaRead), safe(controller.folgas, "folgas"));
router.post("/folgas/programar", requireLogin, requireRole(escalaManage), safe(controller.programarFolga, "programarFolga"));
router.post("/folgas/:id/cancelar", requireLogin, requireRole(escalaManage), safe(controller.cancelarFolga, "cancelarFolga"));
router.post("/folgas/:id/realizar", requireLogin, requireRole(escalaManage), safe(controller.realizarFolga, "realizarFolga"));

router.get("/relatorios", requireLogin, requireRole(escalaRead), safe(controller.relatorios, "relatorios"));
router.get("/relatorios/pdf", requireLogin, requireRole(escalaRead), safe(controller.relatorioPdf, "relatorioPdf"));
router.get("/relatorios/funcionario/:colaboradorId/pdf", requireLogin, requireRole(escalaRead), safe(controller.relatorioFuncionarioPdf, "relatorioFuncionarioPdf"));
router.get("/relatorios/os/:osId/pdf", requireLogin, requireRole(escalaRead), safe(controller.relatorioOsPdf, "relatorioOsPdf"));

router.post("/adicionar", requireLogin, requireRole(escalaManage), safe(controller.adicionarRapido, "adicionarRapido"));
router.post("/ausencia", requireLogin, requireRole(escalaManage), safe(controller.lancarAusencia, "lancarAusencia"));
router.post("/ausencia/:id/update", requireLogin, requireRole(escalaManage), safe(controller.atualizarAusencia, "atualizarAusencia"));
router.post("/ausencia/:id/delete", requireLogin, requireAdmin, safe(controller.removerAusencia, "removerAusencia"));
router.get("/editar/:id", requireLogin, requireRole(escalaManage), safe(controller.editarSemana, "editarSemana"));
router.post("/editar/:id", requireLogin, requireRole(escalaManage), safe(controller.salvarEdicao, "salvarEdicao"));
router.post("/alocacao/:id/delete", requireLogin, requireRole(escalaManage), safe(controller.removerAlocacao, "removerAlocacao"));
router.post("/completa/recalcular", requireLogin, requireRole(escalaManage), safe(controller.recalcularCompleta, "recalcularCompleta"));

router.get("/pdf/semana", requireLogin, requireRole(escalaRead), safe(controller.pdfSemana, "pdfSemana"));
router.get("/pdf/semana/:id", requireLogin, requireRole(escalaRead), safe(controller.pdfSemanaById, "pdfSemanaById"));
router.get("/pdf/periodo", requireLogin, requireRole(escalaRead), safe(controller.pdfPeriodo, "pdfPeriodo"));
router.get("/pdf", requireLogin, requireRole(escalaRead), safe(controller.pdfPeriodo, "pdfPeriodo"));

module.exports = router;
