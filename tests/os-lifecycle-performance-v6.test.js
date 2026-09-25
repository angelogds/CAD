const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const controllerSource = fs.readFileSync(path.join(root, 'modules/os/os.controller.js'), 'utf8');
const serviceSource = fs.readFileSync(path.join(root, 'modules/os/os.service.js'), 'utf8');
const fastSource = fs.readFileSync(path.join(root, 'modules/os/os-fast.controller.js'), 'utf8');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `função ${name} deve existir`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `função seguinte ${nextName} deve existir`);
  return source.slice(start, end);
}

test('iniciar OS não espera push no controller', () => {
  const body = functionBody(controllerSource, 'osIniciar', 'osDelete');
  assert.doesNotMatch(body, /async function osIniciar/);
  assert.doesNotMatch(body, /await\s+pushService\.sendToAll/);
  assert.match(body, /service\.iniciarOS\(/);
});

test('início usa leitura mínima e efeitos colaterais fora do request', () => {
  const body = functionBody(serviceSource, 'iniciarOS', 'pausarOS');
  assert.doesNotMatch(body, /getOSById\(id\)/);
  assert.match(body, /SELECT \$\{select\.join\(", "\)\} FROM os WHERE id = \?/);
  assert.match(body, /runOSLifecycleDetached\("START_SIDE_EFFECTS"/);
  assert.match(body, /pushService\.sendToAll/);
  assert.doesNotMatch(body, /inspecaoService\.syncFromOS/);
});

test('autoalocação reutiliza snapshot de ocupação durante abertura', () => {
  const body = functionBody(serviceSource, 'autoAlocarOS', 'autoAssignOS');
  assert.match(body, /const ocupados = listarOcupados\(\)/);
  assert.match(body, /predicateDisponivel: disponivelNoTurno/);
});

test('rascunho de fechamento não carrega a OS completa só para validar existência', () => {
  const body = functionBody(serviceSource, 'persistirRascunhoFechamento', 'gerarDescricaoTecnicaFechamento');
  assert.doesNotMatch(body, /getOSById\(id\)/);
  assert.match(body, /SELECT id FROM os WHERE id = \?/);
});

test('abertura sem mídia não executa gravação de anexos vazia', () => {
  const body = functionBody(fastSource, 'osCreate', 'closeOSRecordFast');
  assert.match(body, /if \(fotosAbertura\.length\)/);
  assert.match(body, /service\.addFotosAberturaFechamento/);
});
