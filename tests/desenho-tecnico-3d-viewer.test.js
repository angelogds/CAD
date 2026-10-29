'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modules = Promise.all([
  import(pathToFileURL(path.join(__dirname, '../public/js/cad-shaft-3d.mjs'))),
  import(pathToFileURL(path.join(__dirname, '../public/vendor/three-0.172.0/three.module.min.js'))),
]);

function signedVolume(geometry) {
  const positions = geometry.getAttribute('position');
  const indices = geometry.getIndex();
  const count = indices ? indices.count : positions.count;
  let volume = 0;
  for (let index = 0; index < count; index += 3) {
    const vertices = [0, 1, 2].map(offset => {
      const n = indices ? indices.getX(index + offset) : index + offset;
      return [positions.getX(n), positions.getY(n), positions.getZ(n)];
    });
    const [a, b, c] = vertices;
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1])
      + a[1] * (b[2] * c[0] - b[0] * c[2])
      + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(volume);
}

function approx(actual, expected, relative = .002) {
  assert.ok(Math.abs(actual - expected) <= Math.max(.00001, Math.abs(expected) * relative), `${actual} ≠ ${expected}`);
}

test('malha do flange subtrai alojamento central e furos passantes nas posições reais', async () => {
  const [{ createModelGeometry }, THREE] = await modules;
  const item = { kind: 'flange', profile: { type: 'circle', radius: 50 }, thickness: 12,
    holes: [{ x: 0, y: 0, radius: 10 }, { x: 30, y: 0, radius: 5 }, { x: -20, y: 20, radius: 4 }] };
  const geometry = createModelGeometry(item);
  try {
    approx(signedVolume(geometry), Math.PI * (50 ** 2 - 10 ** 2 - 5 ** 2 - 4 ** 2) * 12);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
    for (const hole of item.holes) {
      const ray = new THREE.Raycaster(new THREE.Vector3(hole.x, hole.y, 20), new THREE.Vector3(0, 0, -1));
      assert.equal(ray.intersectObject(mesh).length, 0, 'Furo não pode ter tampa ou material no centro');
    }
    const solid = new THREE.Raycaster(new THREE.Vector3(15, 0, 20), new THREE.Vector3(0, 0, -1));
    assert.ok(solid.intersectObject(mesh).length > 0);
    material.dispose();
  } finally { geometry.dispose(); }
});

test('malha do eixo conserva dimensões e não inventa chanfros nas extremidades', async () => {
  const [{ createModelGeometry }] = await modules;
  const geometry = createModelGeometry({ kind: 'shaft', segments: [
    { length: 40, diameter: 25 }, { length: 60, diameter: 40 }, { length: 40, diameter: 25 },
  ] });
  try {
    geometry.computeBoundingBox();
    approx(geometry.boundingBox.max.y - geometry.boundingBox.min.y, 140, .000001);
    approx(geometry.boundingBox.max.x - geometry.boundingBox.min.x, 40, .000001);
    approx(signedVolume(geometry), Math.PI * (12.5 ** 2 * 80 + 20 ** 2 * 60));
  } finally { geometry.dispose(); }
});

test('alojamento cego conserva fundo na profundidade real; alojamento passante permanece aberto', async () => {
  const [{ createModelGeometry }, THREE] = await modules;
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const depth of [35, 100]) {
    const geometry = createModelGeometry({ kind: 'shaft', segments: [{ length: 100, diameter: 40 }], bore: { diameter: 10, depth } });
    try {
      approx(signedVolume(geometry), Math.PI * (20 ** 2 * 100 - 5 ** 2 * depth));
      const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
      const ray = new THREE.Raycaster(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0));
      const hits = ray.intersectObject(mesh);
      if (depth === 100) assert.equal(hits.length, 0);
      else approx(hits[0].distance, depth + 1, .000001);
    } finally { geometry.dispose(); }
  }
  material.dispose();
});

test('extrusão de perfil fechado conserva área e espessura sem bevel', async () => {
  const [{ createModelGeometry }] = await modules;
  const geometry = createModelGeometry({ kind: 'plate', profile: { type: 'polygon', points: [
    { x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 50 }, { x: 0, y: 50 },
  ] }, thickness: 7, holes: [] });
  try { approx(signedVolume(geometry), (80 * 20 + 30 * 30) * 7, .000001); }
  finally { geometry.dispose(); }
});

test('ajuste mantém oito cantos visíveis em isometria e vistas alinhadas, em telas largas e estreitas', async () => {
  const [{ frameModelBounds }, THREE] = await modules;
  const bounds = { min: { x: 950, y: -800, z: -20 }, max: { x: 2350, y: -760, z: 70 } };
  for (const aspect of [.28, 1, 2.4]) for (const direction of [[1, -1, 1], [0, -1, 0], [0, 0, 1], [1, 0, 0]]) {
    const info = frameModelBounds(bounds, aspect, direction);
    for (const perspective of [false, true]) {
      const camera = perspective
        ? new THREE.PerspectiveCamera(38, aspect, .0001, info.distance + info.span * 10)
        : new THREE.OrthographicCamera(-info.height * aspect / 2, info.height * aspect / 2, info.height / 2, -info.height / 2, .0001, info.distance + info.span * 10);
      camera.up.copy(info.up);
      camera.position.copy(info.target).addScaledVector(info.direction, info.distance);
      camera.lookAt(info.target); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);
        assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1,
          `Canto cortado: ${projected.toArray()} (${aspect}, ${direction}, perspectiva=${perspective})`);
      }
    }
  }
});
