const express = require("express");
const router = express.Router();
const whatsappService = require("./whatsapp.service");

function maskToken(token) {
  const value = String(token || "");
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const tokenMatches = Boolean(expectedToken) && Boolean(verifyToken) && verifyToken === expectedToken;

  console.log("[WhatsApp Webhook Verify]", {
    mode,
    hasChallenge: Boolean(challenge),
    hasExpectedToken: Boolean(expectedToken),
    tokenMatches,
    receivedToken: maskToken(verifyToken),
  });

  if (mode === "subscribe" && tokenMatches) {
    return res.status(200).type("text/plain").send(String(challenge || ""));
  }

  return res.status(403).type("text/plain").send("Forbidden");
});

router.post("/", (req, res) => {
  const payload = req.body || {};

  console.log("[WhatsApp Webhook Event]", JSON.stringify(payload, null, 2));

  res.sendStatus(200);

  setImmediate(() => {
    try {
      whatsappService.processWebhookPayload(payload);
    } catch (err) {
      console.error("❌ [whatsapp webhook]", err && err.stack ? err.stack : err);
    }
  });
});

module.exports = router;
