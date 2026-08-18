const crypto = require("crypto");

function resolveSessionSecret(env = process.env) {
  const secret = String(env?.SESSION_SECRET || "").trim();
  if (secret) return secret;

  const mode = String(env?.NODE_ENV || "").trim().toLowerCase();
  if (mode === "development" || mode === "test") {
    return `dev-${crypto.randomBytes(32).toString("hex")}`;
  }

  const error = new Error(
    "SESSION_SECRET é obrigatória fora dos ambientes development/test. Configure a variável antes de iniciar o servidor."
  );
  error.code = "SESSION_SECRET_REQUIRED";
  throw error;
}

module.exports = { resolveSessionSecret };
