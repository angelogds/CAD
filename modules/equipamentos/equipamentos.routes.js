const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();

const { requireLogin } = require("../auth/auth.middleware");
const ctrl = require("./equipamentos.controller");

const fotoDir = path.join(__dirname, "../../public/uploads/equipamentos/fotos");
const docsDir = path.join(__dirname, "../../public/uploads/equipamentos/documentos");
fs.mkdirSync(fotoDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });

const fotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, fotoDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`),
  }),
});

const docsUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, docsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`),
  }),
});

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
router.get("/novo", requireLogin, safe(ctrl.equipNewForm));
router.post("/", requireLogin, fotoUpload.single("foto"), safe(ctrl.equipCreate));

router.get("/:id", requireLogin, safe(ctrl.equipShow));
router.get("/:id/editar", requireLogin, safe(ctrl.equipEditForm));
router.post("/:id/editar", requireLogin, fotoUpload.single("foto"), safe(ctrl.equipUpdate));

router.post("/:id/pecas", requireLogin, safe(ctrl.addPeca));
router.post("/:id/pecas/:associacaoId", requireLogin, safe(ctrl.updatePeca));
router.post("/:id/pecas/:associacaoId/remover", requireLogin, safe(ctrl.removePeca));

router.post("/:id/documentos", requireLogin, docsUpload.single("arquivo"), safe(ctrl.addDocumento));
router.post("/:id/documentos/:documentoId/remover", requireLogin, safe(ctrl.removeDocumento));

router.post("/:id/qrcode", requireLogin, safe(ctrl.gerarQr));
router.get("/:id/qrcode/print", requireLogin, safe(ctrl.qrPrint));

module.exports = router;
