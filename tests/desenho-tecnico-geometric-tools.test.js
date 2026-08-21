const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const geometryUrl = pathToFileURL(path.join(
  process.cwd(),
  'public/js/modules/desenho-tecnico/core/modify.geometry.mjs',
)).href;

function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance, `${actual} deveria ser próximo de ${expected}`);
}

test('ROTATE gira linha em 90 graus preservando comprimento', async () => {
  const { rotateEntitySnapshot } = await import(geometryUrl);
  const result = rotateEntitySnapshot(
    'line',
    { x1: 0, y1: 0, x2: 100, y2: 0 },
    { x: 0, y: 0 },
    Math.PI / 2,
  );

  assert.equal(result.ok, true);
  near(result.geometry.x1, 0);
  near(result.geometry.y1, 0);
  near(result.geometry.x2, 0);
  near(result.geometry.y2, 100);
  near(Math.hypot(result.geometry.x2 - result.geometry.x1, result.geometry.y2 - result.geometry.y1), 100);
});

test('ROTATE mantém círculo circular e reposiciona somente o centro', async () => {
  const { rotateEntitySnapshot } = await import(geometryUrl);
  const result = rotateEntitySnapshot(
    'circle',
    { cx: 50, cy: 0, radius: 25 },
    { x: 0, y: 0 },
    Math.PI / 2,
  );

  assert.equal(result.ok, true);
  near(result.geometry.cx, 0);
  near(result.geometry.cy, 50);
  near(result.geometry.radius, 25);
});

test('ROTATE converte retângulo rotacionado em polilinha sem perder dimensões', async () => {
  const { rotateEntitySnapshot } = await import(geometryUrl);
  const result = rotateEntitySnapshot(
    'rect',
    { x: 0, y: 0, width: 100, height: 50 },
    { x: 0, y: 0 },
    Math.PI / 2,
  );

  assert.equal(result.ok, true);
  assert.equal(result.type, 'polyline');
  assert.equal(result.geometry.closed, true);
  assert.equal(result.geometry.points.length, 4);
  near(result.geometry.points[1].x, 0);
  near(result.geometry.points[1].y, 100);
});

test('FILLET calcula tangências e centro corretos para canto de 90 graus', async () => {
  const { solveFillet } = await import(geometryUrl);
  const horizontal = { x1: 0, y1: 0, x2: 100, y2: 0 };
  const vertical = { x1: 0, y1: 0, x2: 0, y2: 100 };
  const result = solveFillet(horizontal, { x: 80, y: 0 }, vertical, { x: 0, y: 80 }, 10);

  assert.equal(result.ok, true);
  near(result.tangent1.x, 10);
  near(result.tangent1.y, 0);
  near(result.tangent2.x, 0);
  near(result.tangent2.y, 10);
  near(result.center.x, 10);
  near(result.center.y, 10);
  near(result.arc.radius, 10);
  near(result.line1.x1, 10);
  near(result.line2.y1, 10);
});

test('FILLET rejeita linhas paralelas e raio maior que os segmentos', async () => {
  const { solveFillet } = await import(geometryUrl);
  const parallel = solveFillet(
    { x1: 0, y1: 0, x2: 100, y2: 0 },
    { x: 80, y: 0 },
    { x1: 0, y1: 20, x2: 100, y2: 20 },
    { x: 80, y: 20 },
    10,
  );
  assert.equal(parallel.ok, false);
  assert.match(parallel.error, /paralelas|coincidentes/i);

  const tooLarge = solveFillet(
    { x1: 0, y1: 0, x2: 100, y2: 0 },
    { x: 80, y: 0 },
    { x1: 0, y1: 0, x2: 0, y2: 100 },
    { x: 0, y: 80 },
    150,
  );
  assert.equal(tooLarge.ok, false);
  assert.match(tooLarge.error, /maior que o espaço disponível/i);
});

test('CHAMFER calcula distâncias independentes e linha de ligação', async () => {
  const { solveChamfer } = await import(geometryUrl);
  const result = solveChamfer(
    { x1: 0, y1: 0, x2: 100, y2: 0 },
    { x: 80, y: 0 },
    { x1: 0, y1: 0, x2: 0, y2: 100 },
    { x: 0, y: 80 },
    10,
    20,
  );

  assert.equal(result.ok, true);
  near(result.point1.x, 10);
  near(result.point1.y, 0);
  near(result.point2.x, 0);
  near(result.point2.y, 20);
  near(result.chamfer.x1, 10);
  near(result.chamfer.y2, 20);
});

test('CHAMFER rejeita distância maior que o segmento disponível', async () => {
  const { solveChamfer } = await import(geometryUrl);
  const result = solveChamfer(
    { x1: 0, y1: 0, x2: 50, y2: 0 },
    { x: 40, y: 0 },
    { x1: 0, y1: 0, x2: 0, y2: 50 },
    { x: 0, y: 40 },
    60,
    10,
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /maior que o comprimento disponível/i);
});

test('MLightCAD expõe comandos principais atuais e preserva os algoritmos avançados para adaptação', () => {
  const entry = fs.readFileSync(path.join(process.cwd(), 'public/js/cad-engine-v2.js'), 'utf8');
  const core = fs.readFileSync(path.join(process.cwd(), 'frontend/mlightcad-core.entry.js'), 'utf8');
  const geometry = fs.readFileSync(path.join(process.cwd(), 'public/js/modules/desenho-tecnico/core/modify.geometry.mjs'), 'utf8');

  assert.match(entry, /cad-mlight-runtime\.js/);
  assert.match(core, /preset: 'select'/);
  assert.match(core, /preset: 'pan'/);
  assert.match(core, /preset: 'zoom-extent'/);
  assert.match(core, /item\('move', 'Mover', 'move'\)/);
  assert.match(core, /item\('copy', 'Copiar', 'copy'\)/);
  assert.match(core, /item\('rotate', 'Rotacionar', 'rotate'\)/);
  assert.match(core, /item\('offset', 'Offset', 'offset'\)/);
  assert.match(core, /item\('erase', 'Apagar', 'erase'\)/);
  assert.match(core, /item\('dimlinear', 'Cota linear', 'dimlinear'\)/);
  assert.match(geometry, /export function solveFillet/);
  assert.match(geometry, /export function solveChamfer/);
  assert.match(geometry, /export function rotateEntitySnapshot/);
});
