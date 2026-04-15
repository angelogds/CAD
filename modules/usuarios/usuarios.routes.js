const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = express.Router();
const storagePaths = require("../../config/storage");

const { requireLogin, requireRole } = require("../auth/auth.middleware");
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

router.get("/", requireLogin, requireRole(USERS_ACCESS), safe(ctrl.list, "list"));
router.get("/usuarios", requireLogin, requireRole(USERS_ACCESS), safe(ctrl.list, "list"));

router.get("/novo", requireLogin, requireRole(USERS_ACCESS), safe(ctrl.newForm, "newForm"));
router.get("/usuarios/novo", requireLogin, requireRole(USERS_ACCESS), safe(ctrl.newForm, "newForm"));

router.post("/", requireLogin, requireRole(USERS_ACCESS), upload.single("photo"), safe(ctrl.create, "create"));
router.post("/usuarios", requireLogin, requireRole(USERS_ACCESS), upload.single("photo"), safe(ctrl.create, "create"));

router.get("/:id/editar", requireLogin, requireRole(USERS_ACCESS), safe(ctrl.editForm, "editForm"));
router.get("/usuarios/:id/editar", requireLogin, requireRole(USERS_ACCESS), safe(ctrl.editForm, "editForm"));

router.post("/:id", requireLogin, requireRole(USERS_ACCESS), upload.single("photo"), safe(ctrl.update, "update"));
router.post("/usuarios/:id", requireLogin, requireRole(USERS_ACCESS), upload.single("photo"), safe(ctrl.update, "update"));

router.post("/:id/reset-senha", requireLogin, requireRole(USERS_ACCESS), safe(ctrl.resetPassword, "resetPassword"));
router.post("/usuarios/:id/reset-senha", requireLogin, requireRole(USERS_ACCESS), safe(ctrl.resetPassword, "resetPassword"));
router.post("/:id/excluir", requireLogin, requireRole(USERS_ACCESS), safe(ctrl.remove, "remove"));
router.post("/usuarios/:id/excluir", requireLogin, requireRole(USERS_ACCESS), safe(ctrl.remove, "remove"));

module.exports = router;
