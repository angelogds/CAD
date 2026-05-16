const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serviceSource = fs.readFileSync(path.join(__dirname, '..', 'modules', 'whatsapp', 'whatsapp.service.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(__dirname, '..', 'modules', 'os', 'os.controller.js'), 'utf8');

test('WhatsApp da OS monta mensagem com executor e apoio operacional', () => {
  assert.equal(serviceSource.includes('function getEquipeResumo'), true);
  assert.equal(serviceSource.includes('👥 *Equipe direcionada:*'), true);
  assert.equal(serviceSource.includes('Apoio operacional'), true);
});

test('WhatsApp da OS notifica todos os integrantes direcionados', () => {
  assert.equal(serviceSource.includes('function getUsuariosEquipeOS'), true);
  assert.equal(serviceSource.includes('auxiliar_colaborador_id'), true);
  assert.equal(serviceSource.includes('executor_secundario_colaborador_id'), true);
  assert.equal(serviceSource.includes('function sendOsTeamNotifications'), true);
  assert.equal(controllerSource.includes('sendOsTeamNotifications({ os: osAtual'), true);
});

test('WhatsApp da OS resolve destinatários por função central e respeita provider desativado', () => {
  assert.equal(serviceSource.includes('function resolveWhatsappDestinatariosDaOS'), true);
  assert.equal(serviceSource.includes('normalizeLookupText'), true);
  assert.equal(serviceSource.includes('WHATSAPP_DESATIVADO'), true);
  assert.equal(serviceSource.includes('if (provider === "disabled")'), true);
  assert.equal(serviceSource.includes('MANUAL_LINK_GERADO'), true);
});

test('WhatsApp da OS expõe rota admin de diagnóstico protegida', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.equal(serverSource.includes('/admin/debug-whatsapp-os/:id'), true);
  assert.equal(serverSource.includes('requireRole(["ADMIN"])'), true);
  assert.equal(controllerSource.includes('debugWhatsappOS'), true);
});
