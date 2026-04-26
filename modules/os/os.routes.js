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

const DEFAULT_FILE_SIZE_MB = 200;
const maxFileSizeMbRaw = Number(process.env.OS_UPLOAD_FILE_SIZE_MB || DEFAULT_FILE_SIZE_MB);
const maxFileSizeMb = Number.isFinite(maxFileSizeMbRaw) && maxFileSizeMbRaw > 0 ? maxFileSizeMbRaw : DEFAULT_FILE_SIZE_MB;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`),
  }),
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file?.mimetype || "").toLowerCase();
    const isImage = mime.startsWith("image/");
    const isVideo = mime.startsWith("video/");
    if (isImage || isVideo) return cb(null, true);
    return cb(new Error("Formato inválido. Envie somente imagem ou vídeo."));
  },
});

const fechamentoUpload = (req, res, next) => {
  upload.fields([{ name: "fechamento_fotos", maxCount: 10 }])(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      req.flash("error", `Arquivo muito grande. Limite por arquivo: ${maxFileSizeMb}MB.`);
      return res.redirect(`/os/${req.params.id}`);
    }

    if (err instanceof multer.MulterError) {
      req.flash("error", `Falha no upload: ${err.message}`);
      return res.redirect(`/os/${req.params.id}`);
    }

    req.flash("error", err.message || "Falha no upload de mídias de fechamento.");
    return res.redirect(`/os/${req.params.id}`);
  });
};

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
  fechamentoUpload,
  wrap(ctrl.osClose, "osClose")
);

router.post(
  "/:id/concluir",
  requireLogin,
  requireRole(OS_EXECUTION_ACCESS),
  fechamentoUpload,
  wrap(ctrl.osClose, "osClose")
);

router.post("/:id/status", requireLogin, requireRole(OS_DETALHE_ACCESS), wrap(ctrl.osUpdateStatus, "osUpdateStatus"));
router.post("/:id/excluir", requireLogin, requireRole(["ADMIN"]), wrap(ctrl.osDelete, "osDelete"));
router.post("/:id/auto-alocar", requireLogin, requireRole(["ADMIN", "SUPERVISOR_MANUTENCAO", "MANUTENCAO_SUPERVISOR"]), wrap(ctrl.osAutoAssign, "osAutoAssign"));
router.post("/:id/auto-assign", requireLogin, requireRole(["ADMIN", "SUPERVISOR_MANUTENCAO", "MANUTENCAO_SUPERVISOR"]), wrap(ctrl.osAutoAssign, "osAutoAssign"));
router.post("/:id/equipe", requireLogin, requireRole(["ADMIN", "SUPERVISOR_MANUTENCAO", "MANUTENCAO_SUPERVISOR"]), wrap(ctrl.osSetEquipe, "osSetEquipe"));
router.post("/voice/analyze", requireLogin, requireRole(ACCESS.os_open), wrap(ctrl.osVoiceAnalyze, "osVoiceAnalyze"));
router.post("/voice/create", requireLogin, requireRole(ACCESS.os_open), wrap(ctrl.osVoiceCreate, "osVoiceCreate"));
router.post("/voice", requireLogin, requireRole(ACCESS.os_open), wrap(ctrl.osVoiceCreate, "osVoiceCreate"));

module.exports = router;
