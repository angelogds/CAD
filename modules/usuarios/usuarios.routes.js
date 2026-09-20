const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = express.Router();
const storagePaths = require("../../config/storage");

const { requireLogin, requireRole, requireAdmin } = require("../auth/auth.middleware");
const { ACCESS } = require("../../config/rbac");

let ctrl = {};
try {
  ctrl = require("./usuarios.controller");
  console.log("✅ [usuarios] controller exports:", Object.keys(ctrl));
} catch (e) {
  console.error("❌ [usuarios] Falha ao carregar usuarios.controller:", e.message);
}

const uploadDir = path.join(storagePaths.IMAGE_DIR, "users");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `user-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || ".jpg"}`);
  },
});

const upload = multer({ storage });

const safe = (fn, name) =>
  typeof fn === "function"
    ? fn
    : (_req, res) => {
        console.error(`❌ [usuarios] Handler ${name} indefinido.`);
        return res.status(500).send(`Erro interno: handler ${name} indefinido.`);
      };

const USERS_ACCESS = ACCESS.usuarios;

// Rotas canônicas vivem sob /usuarios. Os caminhos /usuarios/* abaixo são
// aliases históricos do router antes de sua montagem em /usuarios no server.
// Eles permanecem no mesmo handler para compatibilidade, sem duplicar lógica.
router.get(["/", "/usuarios"], requireLogin, requireRole(USERS_ACCESS), safe(ctrl.list, "list"));
router.get(["/novo", "/usuarios/novo"], requireLogin, requireRole(USERS_ACCESS), safe(ctrl.newForm, "newForm"));

router.post(["/", "/usuarios"], requireLogin, requireRole(USERS_ACCESS), upload.single("photo"), safe(ctrl.create, "create"));

router.get(["/:id/editar", "/usuarios/:id/editar"], requireLogin, requireRole(USERS_ACCESS), safe(ctrl.editForm, "editForm"));
router.post(["/:id", "/usuarios/:id"], requireLogin, requireRole(USERS_ACCESS), upload.single("photo"), safe(ctrl.update, "update"));

router.post(["/:id/reset-senha", "/usuarios/:id/reset-senha"], requireLogin, requireRole(USERS_ACCESS), safe(ctrl.resetPassword, "resetPassword"));
router.post(["/:id/excluir", "/usuarios/:id/excluir"], requireLogin, requireAdmin, safe(ctrl.remove, "remove"));
router.post(["/:id/restaurar", "/usuarios/:id/restaurar"], requireLogin, requireAdmin, safe(ctrl.restore, "restore"));

module.exports = router;
