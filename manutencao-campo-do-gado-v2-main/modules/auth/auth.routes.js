// modules/auth/auth.routes.js
const express = require("express");
const router = express.Router();

let controller = {};
try {
  controller = require("./auth.controller");
  console.log("✅ [auth] controller exports:", Object.keys(controller));
} catch (e) {
  console.error("❌ [auth] Falha ao carregar auth.controller:", e.message);
}

const safe = (fn, name) =>
  typeof fn === "function"
    ? fn
    : (_req, res) => {
        console.error(`❌ [auth] Handler ${name} indefinido.`);
        return res.status(500).send(`Erro interno: handler ${name} indefinido.`);
      };

router.get("/login", safe(controller.showLogin, "showLogin"));
router.post("/login", safe(controller.doLogin, "doLogin"));
router.post("/logout", safe(controller.logout, "logout"));

module.exports = router;
