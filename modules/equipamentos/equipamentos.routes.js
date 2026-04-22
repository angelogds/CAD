const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const storagePaths = require("../../config/storage");

const { requireLogin } = require("../auth/auth.middleware");
const ctrl = require("./equipamentos.controller");

const fotoDir = path.join(storagePaths.IMAGE_DIR, "equipamentos", "fotos");
const docsDir = path.join(storagePaths.UPLOAD_DIR, "equipamentos", "documentos");
fs.mkdirSync(fotoDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });

function safeUploadFileName(file) {
  const originalName = String(file?.originalname || "arquivo");
  const ext = path.extname(originalName).slice(0, 10).toLowerCase();
  const baseName = path.basename(originalName, ext);

  const normalizedBase = baseName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  const safeBase = normalizedBase || "arquivo";
  const truncatedBase = safeBase.slice(0, 80);
  const safeExt = ext || "";

  return `${Date.now()}-${truncatedBase}${safeExt}`;
}

const fotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, fotoDir),
    filename: (_req, file, cb) => cb(null, safeUploadFileName(file)),
  }),
});

const docsUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, docsDir),
    filename: (_req, file, cb) => cb(null, safeUploadFileName(file)),
  }),
  limits: {
    // Limite alto para suportar manuais grandes; pode ser ajustado por variável de ambiente.
    fileSize: Number(process.env.EQUIPAMENTOS_DOC_MAX_BYTES || 1024 * 1024 * 1024),
  },
  fileFilter: (_req, file, cb) => {
    if (String(file?.mimetype || "").toLowerCase() !== "application/pdf") {
      const error = new multer.MulterError("LIMIT_UNEXPECTED_FILE", file?.fieldname || "arquivo");
      error.message = "Envie apenas arquivos PDF.";
      return cb(error);
    }
    return cb(null, true);
  },
});

function docsUploadSingle(req, res, next) {
  return docsUpload.single("arquivo")(req, res, (err) => {
    if (!err) return next();

    let msg = "Não foi possível anexar o documento.";
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        const maxBytes = Number(process.env.EQUIPAMENTOS_DOC_MAX_BYTES || 1024 * 1024 * 1024);
        const maxMb = Math.round(maxBytes / (1024 * 1024));
        msg = `O PDF excede o tamanho máximo permitido (${maxMb} MB).`;
      } else if (err.message) {
        msg = err.message;
      }
    } else if (err?.message) {
      msg = err.message;
    }

    req.flash("error", msg);
    return res.redirect(`/equipamentos/${Number(req.params.id)}?tab=documentos`);
  });
}

const safe = (fn) => (req, res, next) => {
  try {
    res.locals.activeMenu = "equipamentos";
    return Promise.resolve(fn(req, res, next)).catch(next);
  } catch (err) {
    return next(err);
  }
};

router.get("/qrcode/:token", safe(ctrl.qrPublicPage));

router.get("/", requireLogin, safe(ctrl.equipIndex));
router.get("/pdf/lista", requireLogin, safe(ctrl.exportListaPdf));
router.get("/novo", requireLogin, safe(ctrl.equipNewForm));
router.post("/", requireLogin, fotoUpload.single("foto"), safe(ctrl.equipCreate));

router.get("/:id", requireLogin, safe(ctrl.equipShow));
router.get("/:id/pdf", requireLogin, safe(ctrl.exportEquipamentoPdf));
router.get("/:id/editar", requireLogin, safe(ctrl.equipEditForm));
router.post("/:id/editar", requireLogin, fotoUpload.single("foto"), safe(ctrl.equipUpdate));
router.post("/:id/excluir", requireLogin, safe(ctrl.equipDelete));

router.post("/:id/pecas", requireLogin, safe(ctrl.addPeca));
router.post("/:id/pecas/:associacaoId", requireLogin, safe(ctrl.updatePeca));
router.post("/:id/pecas/:associacaoId/remover", requireLogin, safe(ctrl.removePeca));

router.post("/:id/documentos", requireLogin, docsUploadSingle, safe(ctrl.addDocumento));
router.post("/:id/documentos/:documentoId/remover", requireLogin, safe(ctrl.removeDocumento));

router.post("/:id/qrcode", requireLogin, safe(ctrl.gerarQr));
router.get("/:id/qrcode/print", requireLogin, safe(ctrl.qrPrint));

module.exports = router;
