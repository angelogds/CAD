const express = require("express");
const router = express.Router();
const whatsappService = require("./whatsapp.service");

function parseRawJson(rawBody) {
  if (!rawBody || !Buffer.isBuffer(rawBody)) return {};
  const text = rawBody.toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text);
}

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected) {
    return res.status(200).send(String(challenge || ""));
  }
  return res.sendStatus(403);
});

router.post("/", (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const signature = whatsappService.verifyWebhookSignature(rawBody, req.get("x-hub-signature-256"));
  if (!signature.ok) return res.status(403).send("INVALID_SIGNATURE");

  let payload = {};
  try {
    payload = parseRawJson(rawBody);
  } catch (_err) {
    return res.status(400).send("INVALID_JSON");
  }

  res.status(200).send("EVENT_RECEIVED");
  setImmediate(() => {
    try {
      whatsappService.processWebhookPayload(payload);
    } catch (err) {
      console.error("❌ [whatsapp webhook]", err && err.stack ? err.stack : err);
    }
  });
});


module.exports = router;
