const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const routeContent = fs.readFileSync(require.resolve('../modules/whatsapp/whatsapp.routes'), 'utf8');
const serverContent = fs.readFileSync(require.resolve('../server'), 'utf8');

test('whatsapp webhook GET reads Meta verification query params and returns text/plain challenge', () => {
  assert.match(routeContent, /req\.query\["hub\.mode"\]/);
  assert.match(routeContent, /req\.query\["hub\.verify_token"\]/);
  assert.match(routeContent, /req\.query\["hub\.challenge"\]/);
  assert.match(routeContent, /process\.env\.WHATSAPP_VERIFY_TOKEN/);
  assert.match(routeContent, /status\(200\)\.type\("text\/plain"\)\.send\(String\(challenge/);
  assert.match(routeContent, /status\(403\)\.type\("text\/plain"\)\.send\("Forbidden"\)/);
});

test('whatsapp webhook POST logs payload and acknowledges publicly', () => {
  assert.match(routeContent, /router\.post\("\/"/);
  assert.match(routeContent, /\[WhatsApp Webhook Event\]/);
  assert.match(routeContent, /res\.sendStatus\(200\)/);
});

test('server mounts whatsapp webhook after express.json and before session middleware', () => {
  const jsonIndex = serverContent.indexOf('app.use(express.json({ limit: "2mb" }))');
  const webhookIndex = serverContent.indexOf('app.use("/webhooks/whatsapp"');
  const sessionIndex = serverContent.indexOf('app.use(\n  session({');

  assert.notEqual(jsonIndex, -1);
  assert.notEqual(webhookIndex, -1);
  assert.notEqual(sessionIndex, -1);
  assert.ok(jsonIndex < webhookIndex);
  assert.ok(webhookIndex < sessionIndex);
});
