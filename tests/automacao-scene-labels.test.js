const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('rótulos próximos recebem posições distintas dentro da cena', async () => {
  const { layoutLabels } = await import('../public/js/automacao-scene-labels.mjs');
  const items = Array.from({ length: 6 }, (_, id) => ({ id, x: 240, y: 170, width: 95, height: 28, priority: 2 }));
  const placed = layoutLabels(items, 500, 350);
  for (const box of placed) {
    assert.equal(box.hidden, false);
    assert.ok(box.x >= 8 && box.x + box.width <= 492);
    assert.ok(box.y >= 44 && box.y + box.height <= 342);
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
      * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    assert.equal(intersection, 0);
  }
});

test('nome mantém tamanho em pixels com zoom e continua clicável pelo equipamento correto', async () => {
  const { createSceneLabels } = await import('../public/js/automacao-scene-labels.mjs');
  const THREE = await import('../public/vendor/three-0.172.0/three.module.min.js');
  const document = { createElement() { return { style: {}, attrs: {}, children: [], handlers: {},
    append(...children) { this.children.push(...children); }, setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(key, fn) { this.handlers[key] = fn; }, remove() { this.removed = true; } }; } };
  const host = { ownerDocument: document, appendChild(element) { this.layer = element; } };
  let selected;
  const labels = createSceneLabels({ host, onSelect: key => { selected = key; } });
  const anchor = labels.makeLabel('DECANTER FAST');
  anchor.userData.selectKey = 'FAST';
  const camera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 100);
  camera.position.z = 10;
  labels.update(camera, 800, 480);
  const button = labels.entries[0].button;
  const originalWidth = button.style.width;
  camera.zoom = 2; camera.updateProjectionMatrix();
  labels.update(camera, 800, 480);
  assert.equal(button.style.width, originalWidth);
  button.handlers.click({ stopPropagation() {} });
  assert.equal(selected, 'FAST');
  labels.select('FAST');
  assert.equal(button.attrs['aria-pressed'], 'true');
  labels.dispose();
  assert.equal(host.layer.removed, true);
  const css = fs.readFileSync(require.resolve('../public/css/automacao.css'), 'utf8');
  assert.match(css, /font:700 12px\/14px/);
});

test('seleção compartilhada encontra peças dos dois circuitos pelo ancestral', async () => {
  const { selectionKey } = await import('../public/js/automacao-industrial-viewer.mjs');
  assert.equal(selectionKey({ userData: {}, parent: { userData: { selectKey: 'gate2' } } }), 'gate2');
  assert.equal(selectionKey({ userData: { selectKey: 'FAST' } }), 'FAST');
  assert.equal(selectionKey({ userData: {} }), null);
});

test('tanques futuros ficam atrás do coletor de alimentação e os mexedores dos tachos animam', async () => {
  const core = require('../public/js/automacao-decanters-core');
  const { createIndustrialScene } = await import('../public/js/automacao-decanters-scene.mjs');
  const model = createIndustrialScene();
  try {
    for (let i = 1; i <= 5; i++) assert.ok(model.equipment.get('storage' + i).position.z < -8);
    const state = core.startDemo(core.createState());
    for (const [key, value] of Object.entries({ tachoFAST: 150, tachoGRATE: 150, mixerFAST: true, mixerGRATE: true })) assert.equal(core.set(state, key, value).ok, true);
    model.update(core.snapshot(state), 2);
    const mixers = model.rotors.filter(rotor => rotor.axis === 'y' && /^tacho/.test(rotor.mesh.parent.userData.selectKey || ''));
    assert.equal(mixers.length, 2);
    assert.ok(mixers.every(rotor => rotor.mesh.rotation.y > 0));
    assert.equal(model.equipment.get('feed').userData.selectKey, 'feed');
    assert.ok(model.equipment.get('feed').children.length > 4); // O destaque pertence à bomba, não à tubulação.
  } finally { model.dispose(); }
});
