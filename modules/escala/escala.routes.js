const express = require("express");
const multer = require("multer");
const path = require("node:path");
const fs = require("node:fs");
const router = express.Router();

const { requireLogin, requireRole, requireAdmin } = require("../auth/auth.middleware");
const { ACCESS, ROLE } = require("../../config/rbac");
const controller = require("./escala.controller");
const rhController = require("./escala.rh.controller");
const selfController = require("./escala.self.controller");
const folgaController = require("./escala.folga.controller");
const dateBr = require("../../utils/data-hora-br");

const storagePaths = require("../../config/storage");
const uploadDir = path.join(storagePaths.UPLOAD_DIR, "escala-horas");
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
          res.locals.dateBr = dateBr;
          return fn(req, res, next);
        } catch (err) {
          return next(err);
        }
      }
    : (_req, res) => res.status(500).send(`Erro interno: handler ${name} indefinido.`);

const escalaManage = ACCESS.escala_manage || [ROLE.ADMIN, ROLE.ENCARREGADO_MANUTENCAO, ROLE.MANUTENCAO_SUPERVISOR, ROLE.SUPERVISOR_MANUTENCAO];
const escalaRead = ACCESS.escala;
const escalaSelfRead = ACCESS.escala_self || escalaRead;
const escalaRhRead = ACCESS.escala_rh || [ROLE.ADMIN, ROLE.RH, ROLE.DIRETORIA];

function normalizeTextRole(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function isMecanicoProfile(user = {}) {
  const values = [user.role, user.funcao, user.cargo, user.perfil];
  return values.some((value) => normalizeTextRole(value).includes('MECANICO'));
}

function requireHoraExtraAccess(req, res, next) {
  const user = req.session?.user || {};
  const role = normalizeTextRole(user.role);
  if (role === ROLE.ADMIN || isMecanicoProfile(user)) return next();
  req.flash?.('error', 'Apenas mecânicos podem registrar hora extra.');
  if (req.accepts('html')) {
    return res.status(403).render('errors/403', { layout: 'layout', title: 'Sem permissão', message: 'Apenas mecânicos podem registrar hora extra.' });
  }
  return res.status(403).json({ error: 'Apenas mecânicos podem registrar hora extra.' });
}

function redirectRoleDashboard(req, res, next) {
  const role = normalizeTextRole(req.session?.user?.role);
  if (role === ROLE.RH) return res.redirect('/escala/rh');
  if (role === ROLE.COLABORADOR) return res.redirect('/escala/meu-painel');
  return next();
}

router.get("/", requireLogin, requireRole(escalaSelfRead), redirectRoleDashboard, safe(controller.index, "index"));
router.get("/meu-painel", requireLogin, requireRole(escalaSelfRead), safe(selfController.index, "selfIndex"));
router.get("/rh", requireLogin, requireRole(escalaRhRead), safe(rhController.index, "rhIndex"));
router.get("/semana", requireLogin, requireRole(escalaRead), safe(controller.semana, "semana"));
router.get("/completa", requireLogin, requireRole(escalaRead), safe(controller.completa, "completa"));
router.get("/ausencias", requireLogin, requireRole(escalaRead), safe(controller.ausencias, "ausencias"));

router.get("/rodizio", requireLogin, requireRole(escalaManage), safe(controller.rodizioIndex, "rodizioIndex"));
router.post("/rodizio/salvar", requireLogin, requireRole(escalaManage), safe(controller.salvarRodizio, "salvarRodizio"));
router.post("/rodizio/salvar-aplicar", requireLogin, requireRole(escalaManage), safe(controller.salvarAplicarRodizio, "salvarAplicarRodizio"));
router.post("/rodizio/preview", requireLogin, requireRole(escalaManage), safe(controller.previewRodizio, "previewRodizio"));
router.post("/rodizio/aplicar", requireLogin, requireRole(escalaManage), safe(controller.aplicarRodizio, "aplicarRodizio"));
router.post("/rodizio/recalcular", requireLogin, requireRole(escalaManage), safe(controller.recalcularRodizio, "recalcularRodizio"));
router.post("/rodizio/:id/desativar", requireLogin, requireRole(escalaManage), safe(controller.desativarRodizio, "desativarRodizio"));

router.get("/hora-extra/nova", requireLogin, requireHoraExtraAccess, safe(controller.horaExtraNova, "horaExtraNova"));
router.post("/hora-extra/iniciar", requireLogin, requireHoraExtraAccess, upload.single("foto_inicio"), safe(controller.iniciarHoraExtra, "iniciarHoraExtra"));
router.post("/hora-extra/:id/finalizar", requireLogin, requireHoraExtraAccess, upload.single("foto_fim"), safe(controller.finalizarHoraExtra, "finalizarHoraExtra"));
router.get("/hora-extra/pendentes", requireLogin, requireRole(escalaManage), safe(controller.horasExtrasPendentes, "horasExtrasPendentes"));
router.post("/hora-extra/:id/aprovar", requireLogin, requireRole(escalaManage), safe(controller.aprovarHoraExtra, "aprovarHoraExtra"));
router.post("/hora-extra/:id/reprovar", requireLogin, requireRole(escalaManage), safe(controller.reprovarHoraExtra, "reprovarHoraExtra"));
router.post("/hora-extra/:id/ajustar", requireLogin, requireRole(escalaManage), safe(controller.ajustarHoraExtra, "ajustarHoraExtra"));
router.post("/hora-extra/:id/cancelar", requireLogin, requireRole(escalaManage), safe(controller.cancelarHoraExtra, "cancelarHoraExtra"));
router.post("/hora-extra/:id/excluir", requireLogin, requireAdmin, safe(controller.apagarHoraExtra, "apagarHoraExtra"));

router.get("/banco-horas", requireLogin, requireRole(escalaSelfRead), safe(controller.bancoHoras, "bancoHoras"));
router.get("/banco-horas/:colaboradorId", requireLogin, requireRole(escalaSelfRead), safe(controller.bancoHorasFuncionario, "bancoHorasFuncionario"));
router.get("/folgas", requireLogin, requireRole(escalaRead), safe(folgaController.index, "folgas"));
router.get("/folgas-sabado", requireLogin, requireRole(escalaRead), safe(controller.folgasSabado, "folgasSabado"));
router.post("/folgas-sabado/:semanaId", requireLogin, requireRole(escalaManage), safe(controller.salvarFolgaSabado, "salvarFolgaSabado"));

router.post("/folgas/solicitar", requireLogin, requireRole(escalaSelfRead), safe(folgaController.solicitar, "solicitarFolga"));
router.post("/folgas/solicitacoes/:id/cancelar", requireLogin, requireRole(escalaSelfRead), safe(folgaController.cancelarSolicitacao, "cancelarSolicitacaoFolga"));
router.post("/folgas/solicitacoes/:id/aprovar", requireLogin, requireRole(escalaManage), safe(folgaController.aprovarSolicitacao, "aprovarSolicitacaoFolga"));
router.post("/folgas/solicitacoes/:id/reprovar", requireLogin, requireRole(escalaManage), safe(folgaController.reprovarSolicitacao, "reprovarSolicitacaoFolga"));
router.post("/folgas/programar", requireLogin, requireRole(escalaManage), upload.single("anexo"), safe(folgaController.programar, "programarFolga"));
router.post("/folgas/:id/cancelar", requireLogin, requireRole(escalaManage), safe(folgaController.cancelar, "cancelarFolga"));
router.post("/folgas/:id/realizar", requireLogin, requireRole(escalaManage), safe(folgaController.realizar, "realizarFolga"));

router.get("/relatorios", requireLogin, requireRole(escalaRead), safe(controller.relatorios, "relatorios"));
router.get("/relatorios/pdf", requireLogin, requireRole(ACCESS.escala_reports || escalaRead), safe(controller.relatorioPdf, "relatorioPdf"));
router.get("/relatorios/funcionario/:colaboradorId/pdf", requireLogin, requireRole(ACCESS.escala_reports || escalaRead), safe(controller.relatorioFuncionarioPdf, "relatorioFuncionarioPdf"));
router.get("/relatorios/os/:osId/pdf", requireLogin, requireRole(ACCESS.escala_reports || escalaRead), safe(controller.relatorioOsPdf, "relatorioOsPdf"));
router.post("/adicionar", requireLogin, requireRole(escalaManage), safe(controller.adicionarRapido, "adicionarRapido"));
router.post("/ausencia", requireLogin, requireRole(escalaManage), safe(controller.lancarAusencia, "lancarAusencia"));
router.post("/ausencia/:id/update", requireLogin, requireRole(escalaManage), safe(controller.atualizarAusencia, "atualizarAusencia"));
router.post("/ausencia/:id/delete", requireLogin, requireAdmin, safe(controller.removerAusencia, "removerAusencia"));
router.get("/editar/:id", requireLogin, requireRole(escalaManage), safe(controller.editarSemana, "editarSemana"));
router.post("/editar/:id", requireLogin, requireRole(escalaManage), safe(controller.salvarEdicao, "salvarEdicao"));
router.post("/alocacao/:id/delete", requireLogin, requireRole(escalaManage), safe(controller.removerAlocacao, "removerAlocacao"));
router.post("/completa/recalcular", requireLogin, requireRole(escalaManage), safe(controller.recalcularCompleta, "recalcularCompleta"));
router.get("/pdf/semana", requireLogin, requireRole(ACCESS.escala_reports || escalaRead), safe(controller.pdfSemana, "pdfSemana"));
router.get("/pdf/semana/:id", requireLogin, requireRole(ACCESS.escala_reports || escalaRead), safe(controller.pdfSemanaById, "pdfSemanaById"));
router.get("/pdf/periodo", requireLogin, requireRole(ACCESS.escala_reports || escalaRead), safe(controller.pdfPeriodo, "pdfPeriodo"));
router.get("/pdf", requireLogin, requireRole(ACCESS.escala_reports || escalaRead), safe(controller.pdfPeriodo, "pdfPeriodo"));

module.exports = router;
