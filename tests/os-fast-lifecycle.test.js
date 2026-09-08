const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const routesSource = fs.readFileSync(path.join(root, 'modules/os/os.routes.js'), 'utf8');
const fastSource = fs.readFileSync(path.join(root, 'modules/os/os-fast.controller.js'), 'utf8');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `função ${name} deve existir`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `função seguinte ${nextName} deve existir`);
  return source.slice(start, end);
}

test('rotas críticas de OS usam o controlador rápido', () => {
  assert.match(routesSource, /const fastCtrl = require\("\.\/os-fast\.controller"\)/);
  assert.match(routesSource, /wrap\(fastCtrl\.osCreate, "osCreateFast"\)/);
  assert.equal((routesSource.match(/wrap\(fastCtrl\.osClose, "osCloseFast"\)/g) || []).length, 2);
});

test('abertura rápida não aguarda IA, visão, push ou WhatsApp no request', () => {
  const body = functionBody(fastSource, 'osCreate', 'closeOSRecordFast');
  assert.doesNotMatch(body, /\bawait\b/);
  assert.doesNotMatch(body, /visionService|analisarImagemFalha/);
  assert.match(body, /scheduleCreateEnrichment\(created\)/);
  assert.match(body, /scheduleCreateNotifications/);
});

test('fechamento rápido confirma a OS antes do enriquecimento por IA', () => {
  const body = functionBody(fastSource, 'osClose');
  assert.doesNotMatch(body, /\bawait\b/);
  assert.match(body, /closeOSRecordFast\(id/);
  assert.match(body, /scheduleCloseEnrichment\(id/);
  assert.match(body, /return res\.redirect\(redirectAfterClose\)/);
});

test('processamento complementar usa setImmediate e reutiliza concluirOS existente', () => {
  const detached = functionBody(fastSource, 'runDetached', 'updateAIColumns');
  const closeEnrichment = functionBody(fastSource, 'scheduleCloseEnrichment', 'osClose');
  assert.match(detached, /setImmediate\(/);
  assert.match(closeEnrichment, /runDetached\("CLOSE_ENRICHMENT"/);
  assert.match(closeEnrichment, /service\.concluirOS\(id, payload\)/);
});

test('análise visual automática foi removida do caminho de abertura', () => {
  assert.doesNotMatch(fastSource, /ai\.vision\.service|analisarImagemFalha/);
});
