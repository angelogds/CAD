const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const storagePaths = require("../../config/storage");

const { requireLogin, requireRole } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");
const ctrl = require("./os.controller");
const { OS_EXECUTION_ACCESS, OS_DETALHE_ACCESS } = require("./os.permissions");

const uploadDir = path.join(storagePaths.UPLOAD_DIR, "os");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`),
  }),
});

const wrap = (fn, name) =>
  typeof fn === "function"
    ? (req, res, next) => {
        res.locals.activeMenu = "os";
        try {
          return fn(req, res, next);
        } catch (err) {
          return next(err);
        }
      }
    : (_req, res) => {
        console.error(`❌ [os] Handler ${name} indefinido.`);
        return res.status(500).send(`Erro interno: handler ${name} indefinido.`);
      };

router.get("/", requireLogin, requireRole(ACCESS.os_view), wrap(ctrl.osIndex, "osIndex"));
router.get("/novo", requireLogin, requireRole(ACCESS.os_open), wrap(ctrl.osNewForm, "osNewForm"));
router.get("/nova", requireLogin, requireRole(ACCESS.os_open), wrap(ctrl.osNewForm, "osNewForm"));
router.post(
  "/",
  requireLogin,
  requireRole(ACCESS.os_open),
  upload.fields([{ name: "abertura_fotos", maxCount: 10 }]),
  wrap(ctrl.osCreate, "osCreate")
);

router.get("/:id", requireLogin, requireRole(OS_DETALHE_ACCESS), wrap(ctrl.osShow, "osShow"));
router.post("/:id/iniciar", requireLogin, requireRole(OS_EXECUTION_ACCESS), wrap(ctrl.osIniciar, "osIniciar"));
router.post("/:id/pausar", requireLogin, requireRole(OS_EXECUTION_ACCESS), wrap(ctrl.osPausar, "osPausar"));
router.get("/:id/fechar", requireLogin, requireRole(OS_EXECUTION_ACCESS), wrap(ctrl.osCloseForm, "osCloseForm"));
router.post(
  "/:id/gerar-descricao-tecnica",
  requireLogin,
  requireRole(OS_EXECUTION_ACCESS),
  wrap(ctrl.osGerarDescricaoTecnica, "osGerarDescricaoTecnica")
);
router.post(
  "/:id/fechar",
  requireLogin,
  requireRole(OS_EXECUTION_ACCESS),
  upload.fields([{ name: "fechamento_fotos", maxCount: 10 }]),
  wrap(ctrl.osClose, "osClose")
);

router.post(
  "/:id/concluir",
  requireLogin,
  requireRole(OS_EXECUTION_ACCESS),
  upload.fields([{ name: "fechamento_fotos", maxCount: 10 }]),
  wrap(ctrl.osClose, "osClose")
);

router.post("/:id/status", requireLogin, requireRole(OS_DETALHE_ACCESS), wrap(ctrl.osUpdateStatus, "osUpdateStatus"));
router.post("/:id/excluir", requireLogin, requireRole(["ADMIN"]), wrap(ctrl.osDelete, "osDelete"));
router.post("/:id/auto-alocar", requireLogin, requireRole(["ADMIN", "SUPERVISOR_MANUTENCAO", "MANUTENCAO_SUPERVISOR"]), wrap(ctrl.osAutoAssign, "osAutoAssign"));
router.post("/:id/auto-assign", requireLogin, requireRole(["ADMIN", "SUPERVISOR_MANUTENCAO", "MANUTENCAO_SUPERVISOR"]), wrap(ctrl.osAutoAssign, "osAutoAssign"));
router.post("/:id/equipe", requireLogin, requireRole(["ADMIN", "SUPERVISOR_MANUTENCAO", "MANUTENCAO_SUPERVISOR"]), wrap(ctrl.osSetEquipe, "osSetEquipe"));

module.exports = router;
