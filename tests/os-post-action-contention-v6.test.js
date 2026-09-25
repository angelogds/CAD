const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const serviceSource = fs.readFileSync(path.join(root, 'modules/os/os.service.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'modules/os/os.controller.js'), 'utf8');
const fastSource = fs.readFileSync(path.join(root, 'modules/os/os-fast.controller.js'), 'utf8');
const inspectionControllerSource = fs.readFileSync(path.join(root, 'modules/inspecao/inspecao.controller.js'), 'utf8');

function body(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} deve existir`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `${nextName} deve existir`);
  return source.slice(start, end);
}

test('efeitos complementares da OS começam depois do redirect', () => {
  const lifecycle = body(serviceSource, 'runOSLifecycleDetached', 'normalizeStatusOS');
  const fast = body(fastSource, 'runDetached', 'updateAIColumns');
  assert.match(lifecycle, /setTimeout\(/);
  assert.match(lifecycle, /1000/);
  assert.match(fast, /setTimeout\(/);
  assert.match(fast, /1000/);
});

test('iniciar OS não recalcula matriz mensal de inspeção', () => {
  const start = body(serviceSource, 'iniciarOS', 'pausarOS');
  assert.doesNotMatch(start, /syncFromOS|syncFromClosedOS|recalculate/);
});

test('fechamento complementar não recalcula inspeção mensal', () => {
  const close = serviceSource.slice(
    serviceSource.indexOf('async function concluirOS'),
    serviceSource.indexOf('function liberarEquipeQuandoFechar')
  );
  assert.doesNotMatch(close, /syncFromClosedOS|syncFromOS/);
});

test('abertura assíncrona não dispara recálculo completo de inspeção', () => {
  const create = body(fastSource, 'scheduleCreateEnrichment', 'scheduleCreateNotifications');
  assert.doesNotMatch(create, /syncFromOS|syncFromClosedOS/);
});

test('rota genérica de status não espera web push', () => {
  const status = body(controllerSource, 'osUpdateStatus', 'osAutoAssign');
  assert.doesNotMatch(status, /async function osUpdateStatus/);
  assert.doesNotMatch(status, /await\s+pushService\.sendToAll/);
  assert.match(status, /service\.updateStatus/);
});

test('módulo de inspeção continua recalculando dados quando é aberto', () => {
  assert.match(inspectionControllerSource, /service\.recalculate\(inspecao\.id, mes, ano\)/);
});
