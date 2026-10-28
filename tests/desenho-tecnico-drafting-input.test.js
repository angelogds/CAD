const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const moduleRoot = path.join(__dirname, '../public/js/modules/desenho-tecnico');
const urls = new Map();
function moduleUrl(relativePath) {
  const absolute = path.resolve(moduleRoot, relativePath);
  if (urls.has(absolute)) return urls.get(absolute);
  const source = fs.readFileSync(absolute, 'utf8').replace(/from\s+(['"])(\.[^'"]+)\1/g, (_match, _quote, target) => {
    const dependency = path.relative(moduleRoot, path.resolve(path.dirname(absolute), target));
    return `from '${moduleUrl(dependency)}'`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  urls.set(absolute, url);
  return url;
}

const loadGeometry = () => import(moduleUrl('core/geometry.js'));
const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);

test('coordenadas polares absolutas partem da origem; @polar usa o último ponto', async () => {
  const { parseCadPointInput } = await loadGeometry();
  const base = { x: 50, y: 80 };
  const absolute = parseCadPointInput('10<90', base);
  near(absolute.x, 0);
  near(absolute.y, 10);
  const first = parseCadPointInput('10<180');
  near(first.x, -10);
  near(first.y, 0);
  const relative = parseCadPointInput('@10<90', base);
  near(relative.x, 50);
  near(relative.y, 90);
  assert.equal(parseCadPointInput('@10<90'), null);
});

test('entrada precisa preserva vírgulas XY e permite decimal brasileiro com ponto e vírgula', async () => {
  const { parseCadPointInput } = await loadGeometry();
  assert.deepEqual(parseCadPointInput('100,50'), { x: 100, y: 50 });
  assert.deepEqual(parseCadPointInput('12,5;-8,25'), { x: 12.5, y: -8.25 });
  assert.deepEqual(parseCadPointInput('@2,5;-3,5', { x: 10, y: 20 }), { x: 12.5, y: 16.5 });
  const polar = parseCadPointInput('@10,5<90', { x: 0, y: 0 });
  near(polar.x, 0);
  near(polar.y, 10.5);
});

test('entradas incompletas, hexadecimais e não finitas não criam pontos', async () => {
  const { parseCadPointInput } = await loadGeometry();
  for (const value of ['10<30<90', '10<', '<90', '12,', ',5', '12;3;4', '0x10,5', '@5', '@', 'Infinity,0', '1e309,0', '10abc,2']) {
    assert.equal(parseCadPointInput(value, { x: 10, y: 20 }), null, value);
  }
  assert.equal(parseCadPointInput('@1e308,0', { x: 1e308, y: 0 }), null);
});

test('distância direta preserva direção e usa +X quando cursor coincide com a base', async () => {
  const { parseCadPointInput } = await loadGeometry();
  assert.deepEqual(parseCadPointInput('25', { x: 0, y: 0 }, { x: 3, y: 4 }), { x: 15, y: 20 });
  assert.deepEqual(parseCadPointInput('25', { x: 5, y: 8 }, { x: 5, y: 8 }), { x: 30, y: 8 });
  assert.equal(parseCadPointInput('25'), null);
});

test('rastreamento polar projeta no raio exato dentro da abertura de captura', async () => {
  const { projectPointToPolarRay } = await loadGeometry();
  const projected = projectPointToPolarRay({ x: 20, y: 19 }, { x: 10, y: 10 }, { angleDeg: 45, tolerance: 1 });
  near(projected.x, 19.5);
  near(projected.y, 19.5);
  near(projected.angleDeg, 45);
  near(projected.distance, Math.SQRT1_2);
  assert.equal(projectPointToPolarRay({ x: 20, y: 19 }, { x: 10, y: 10 }, { angleDeg: 45, tolerance: 0.1 }), null);
});

test('rastreamento polar funciona nos quatro quadrantes e rejeita configuração inválida', async () => {
  const { projectPointToPolarRay } = await loadGeometry();
  for (const [point, angle] of [[{ x: -10, y: 0.1 }, 180], [{ x: -0.1, y: -10 }, 270], [{ x: 10, y: -0.1 }, 0], [{ x: 0.1, y: 10 }, 90]]) {
    const projected = projectPointToPolarRay(point, { x: 0, y: 0 }, { angleDeg: 90, tolerance: 0.2 });
    near(projected.angleDeg, angle);
    near(projected.distance, 0.1);
  }
  assert.equal(projectPointToPolarRay({ x: 0, y: 0 }, { x: 0, y: 0 }), null);
  for (const angleDeg of [0, -45, 181, Infinity, NaN]) {
    assert.equal(projectPointToPolarRay({ x: 10, y: 1 }, { x: 0, y: 0 }, { angleDeg }), null);
  }
});

function createContext() {
  const entities = [];
  const preview = { items: [], set(items) { this.items = items; } };
  return {
    entities,
    preview,
    state: { activeLayer: 'contorno' },
    prompt: { set() {} },
    viewport: { worldToScreen: (x, y) => ({ x, y }) },
    getPoint: (point) => point,
    addEntity: (entity) => entities.push(entity),
    hideDynamicInput() {},
  };
}

test('polilinha aceita coordenadas absolutas, relativas e polares antes de fechar com C', async () => {
  const { PolylineTool } = await import(moduleUrl('tools/polyline.tool.js'));
  const ctx = createContext();
  const tool = new PolylineTool(ctx);
  assert.equal(tool.applyInput('10,20'), true);
  assert.equal(tool.applyInput('@30,0'), true);
  assert.equal(tool.applyInput('@20<90'), true);
  assert.equal(tool.applyInput('C'), true);
  assert.equal(ctx.entities.length, 1);
  const { points, closed } = ctx.entities[0].geometry;
  assert.equal(closed, true);
  assert.equal(points.length, 3);
  assert.deepEqual(points[0], { x: 10, y: 20 });
  near(points[2].x, 40);
  near(points[2].y, 40);
  assert.equal(tool.points.length, 0);
});

test('polilinha desfaz vértice, rejeita fechamento insuficiente e evita duplicação em duplo clique', async () => {
  const { PolylineTool } = await import(moduleUrl('tools/polyline.tool.js'));
  const ctx = createContext();
  const tool = new PolylineTool(ctx);
  tool.addPoint({ x: 0, y: 0 });
  tool.addPoint({ x: 10, y: 0 });
  assert.equal(tool.commit(true), false);
  assert.equal(ctx.entities.length, 0);
  tool.addPoint({ x: 10, y: 20 });
  assert.equal(tool.applyInput('U'), true);
  assert.equal(tool.points.length, 2);
  assert.equal(tool.addPoint({ x: 10, y: 0 }), false);
  tool.onDblClick();
  assert.equal(ctx.entities.length, 1);
  assert.equal(ctx.entities[0].geometry.points.length, 2);
  assert.equal(ctx.entities[0].geometry.closed, false);
});

test('polilinha por teclado confirma entrada com Enter e mantém vértices após dado inválido', async () => {
  const { PolylineTool } = await import(moduleUrl('tools/polyline.tool.js'));
  const ctx = createContext();
  const tool = new PolylineTool(ctx);
  const key = (value) => tool.onKeyDown({ key: value, preventDefault() {} });
  for (const character of '10,20') key(character);
  key('Enter');
  for (const character of '@30,0') key(character);
  key('Enter');
  assert.equal(tool.applyInput('@12,'), false);
  assert.equal(tool.points.length, 2);
  key('Backspace');
  assert.equal(tool.points.length, 1);
  assert.equal(ctx.entities.length, 0);
});

test('LINE aceita o primeiro ponto pela barra de comandos e cria segmentos com medidas exatas', async () => {
  const { LineTool } = await import(moduleUrl('tools/line.tool.js'));
  const ctx = createContext();
  const tool = new LineTool(ctx);
  assert.equal(tool.applyInput('@10,0'), false);
  assert.equal(tool.applyInput('100,50'), true);
  assert.equal(ctx.entities.length, 0);
  assert.equal(tool.applyInput('@25,0'), true);
  assert.equal(tool.applyInput('@25<90'), true);
  assert.equal(tool.applyInput(''), false);
  assert.equal(ctx.entities.length, 2);
  assert.deepEqual(ctx.entities[0].geometry, { x1: 100, y1: 50, x2: 125, y2: 50 });
  near(ctx.entities[1].geometry.x2, 125);
  near(ctx.entities[1].geometry.y2, 75);
});

test('aresta de fechamento da polilinha pode ser selecionada sem acrescentar vértices', async () => {
  const { PolylineEntity } = await import(moduleUrl('entities/polyline.entity.js'));
  const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }];
  const closed = new PolylineEntity({ geometry: { points, closed: true } });
  const open = new PolylineEntity({ geometry: { points, closed: false } });
  assert.equal(closed.hitTest({ x: 10, y: 10 }, 0.01), true);
  assert.equal(open.hitTest({ x: 10, y: 10 }, 0.01), false);
  assert.equal(points.length, 3);
});

test('renderização e prévia de modificação fecham o contorno sem mudar os pontos salvos', async () => {
  const { DesenhoTecnicoRenderer } = await import(moduleUrl('desenho-tecnico.renderer.js'));
  const { PolylineEntity } = await import(moduleUrl('entities/polyline.entity.js'));
  const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }];
  const entity = new PolylineEntity({ geometry: { points, closed: true } });
  const markup = { entities: '', preview: '' };
  const layers = Object.fromEntries(Object.keys(markup).map((name) => [name, {
    innerHTML: '',
    insertAdjacentHTML(_position, html) { markup[name] += html; },
  }]));
  const renderer = Object.assign(Object.create(DesenhoTecnicoRenderer.prototype), {
    layers,
    state: { entities: [entity], preview: [{ type: 'ghost-entity', entity }] },
    selection: { includes: () => false },
    viewport: { worldToScreen: (x, y) => ({ x, y }) },
    getScreenStroke: (color) => color,
  });
  renderer.renderEntities();
  renderer.renderPreview();
  assert.match(markup.entities, /points='0,0 20,0 20,20 0,0'/);
  assert.match(markup.preview, /points='0,0 20,0 20,20 0,0'/);
  assert.equal(points.length, 3);
});

test('teclas em formulários, atalhos e composição não vazam para ferramentas de desenho', async () => {
  const { InteractionController } = await import(moduleUrl('interaction/interaction.controller.js'));
  const previousWindow = global.window;
  const handlers = {};
  global.window = { addEventListener: (name, handler) => { handlers[name] = handler; } };
  try {
    const forwarded = [];
    const svg = { addEventListener() {} };
    const toolManager = { active: { onKeyDown: (event) => forwarded.push(event.key), onKeyUp: (event) => forwarded.push(`up:${event.key}`) } };
    const interaction = new InteractionController(svg, toolManager, {}, {});
    interaction.bind();
    const canvas = { closest: () => null };
    const input = { closest: () => ({ tagName: 'INPUT' }) };
    const editChild = { isContentEditable: true };
    for (const target of [input, editChild]) {
      handlers.keydown({ key: '5', target });
      handlers.keyup({ key: '5', target });
    }
    for (const property of ['defaultPrevented', 'ctrlKey', 'altKey', 'metaKey', 'isComposing']) {
      handlers.keydown({ key: '5', target: canvas, [property]: true });
    }
    assert.deepEqual(forwarded, []);
    handlers.keydown({ key: '5', target: canvas });
    assert.deepEqual(forwarded, ['5']);
    handlers.keydown({ key: ' ', code: 'Space', target: canvas, preventDefault() {} });
    assert.equal(interaction.spacePan, true);
    handlers.keyup({ key: ' ', code: 'Space', target: input });
    assert.equal(interaction.spacePan, false);
  } finally {
    global.window = previousWindow;
  }
});
