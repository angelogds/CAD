import * as THREE from '../vendor/three-0.172.0/three.module.min.js';

// Maquete funcional sem escala. Não contém rede, comandos industriais ou dados reais.
export function createIndustrialScene({ makeLabel } = {}) {
  const root = new THREE.Group();
  const equipment = new Map();
  const flows = [];
  const rotors = [];
  const liquid = [];
  const sensors = [];
  const indicators = [];
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.24, ...extra });
  const steel = material(0xc5c8ce);
  const dark = material(0x444851);
  const red = material(0xba1931);
  const light = material(0xe7e8eb);
  const oil = material(0xc2913b, { transparent: true, opacity: 0.78, metalness: 0.05 });
  const pipeMaterial = material(0x9298a3);
  const brown = material(0x8f7051);
  const neutral = 0x9096a1;
  const point = xyz => new THREE.Vector3(...xyz);

  function mesh(parent, geometry, mat, position = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(...position);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(parent, size, position, mat = steel) {
    return mesh(parent, new THREE.BoxGeometry(...size), mat, position);
  }
  function cylinder(parent, radius, length, position, mat = steel, axis = 'y', radiusBottom = radius) {
    const object = mesh(parent, new THREE.CylinderGeometry(radius, radiusBottom, length, 28), mat, position);
    if (axis === 'x') object.rotation.z = Math.PI / 2;
    if (axis === 'z') object.rotation.x = Math.PI / 2;
    return object;
  }
  function label(text, position, width = 2.3, key = null) {
    if (!makeLabel) return;
    const object = makeLabel(text, width);
    object.position.set(...position);
    if (key) object.userData.selectKey = key;
    root.add(object);
  }
  function register(key, group) {
    group.userData.selectKey = key;
    equipment.set(key, group);
    return group;
  }
  function group(key, position = [0, 0, 0]) {
    const object = new THREE.Group();
    object.position.set(...position);
    root.add(object);
    return register(key, object);
  }
  function pipe(key, positions, active, mat = pipeMaterial, radius = 0.065) {
    const curve = new THREE.CurvePath();
    for (let i = 1; i < positions.length; i++) curve.add(new THREE.LineCurve3(point(positions[i - 1]), point(positions[i])));
    const object = new THREE.Group();
    mesh(object, new THREE.TubeGeometry(curve, Math.max(24, positions.length * 12), radius, 7, false), mat);
    root.add(object);
    if (key) register(key, object);
    const particles = Array.from({ length: 6 }, () => {
      const particle = mesh(root, new THREE.SphereGeometry(radius * 1.65, 8, 6), oil);
      particle.visible = false;
      return particle;
    });
    flows.push({ curve, particles, active });
    return object;
  }
  function indicator(key, position, active) {
    const object = group(key, position);
    cylinder(object, 0.15, 0.22, [0, 0, 0], dark, 'z');
    const lamp = mesh(object, new THREE.SphereGeometry(0.13, 12, 8), material(neutral), [0, 0, 0.14]);
    indicators.push({ lamp, active });
    return object;
  }
  function valve(key, position, active) {
    const object = group(key, position);
    const housing = cylinder(object, 0.16, 0.35, [0, 0, 0], material(neutral));
    box(object, [0.48, 0.055, 0.08], [0, 0.25, 0], red);
    indicators.push({ lamp: housing, active });
    return object;
  }
  function helix(parent, length, radius, position, mat = steel, turns = 7) {
    const vertices = [];
    for (let i = 0; i <= 160; i++) {
      const angle = i / 160 * Math.PI * 2 * turns;
      vertices.push(new THREE.Vector3(i / 160 * length - length / 2, Math.cos(angle) * radius, Math.sin(angle) * radius));
    }
    const curve = new THREE.CatmullRomCurve3(vertices);
    return mesh(parent, new THREE.TubeGeometry(curve, 160, 0.045, 5, false), mat, position);
  }

  const platform = box(root, [25, 0.15, 15.8], [0, -0.13, -0.7], material(0xe9eaed, { metalness: 0 }));
  platform.castShadow = false;
  const grid = new THREE.GridHelper(24, 24, 0xcdd0d6, 0xdfe1e6);
  grid.position.set(0, -0.04, -0.7);
  root.add(grid);

  const tank = group('tank', [-8.1, 0, 0]);
  mesh(tank, new THREE.CylinderGeometry(1.6, 1.6, 4.5, 48, 1, true, Math.PI / 2, Math.PI),
    material(0xb9bec7, { side: THREE.DoubleSide }), [0, 3.05, 0]);
  cylinder(tank, 1.6, 0.13, [0, 0.8, 0], dark);
  [0.88, 5.29].forEach(y => {
    const ring = mesh(tank, new THREE.TorusGeometry(1.6, 0.055, 8, 48), steel, [0, y, 0]);
    ring.rotation.x = Math.PI / 2;
  });
  for (const x of [-1.1, 1.1]) for (const z of [-0.8, 0.8]) box(tank, [0.15, 0.8, 0.15], [x, 0.35, z], dark);
  const tankLiquid = cylinder(tank, 1.51, 1, [0, 1.35, 0], oil);
  tankLiquid.visible = false;
  liquid.push({ mesh: tankLiquid, volume: s => s.tankLiters, valid: s => s.level.status === 'VALIDO', capacity: 15000, bottom: 0.88, height: 4.3 });

  const mixer = new THREE.Group();
  tank.add(mixer);
  register('mixer', mixer);
  cylinder(mixer, 0.055, 4.5, [0, 3.25, 0], dark);
  for (const y of [1.65, 3.45]) {
    const propeller = new THREE.Group();
    propeller.position.y = y;
    for (const angle of [0, Math.PI / 2]) {
      const blade = box(propeller, [2.2, 0.12, 0.28], [0, 0, 0], steel);
      blade.rotation.y = angle;
      blade.rotation.z = 0.12;
    }
    mixer.add(propeller);
    rotors.push({ mesh: propeller, axis: 'y', active: s => s.effective.mixer });
  }
  box(mixer, [0.7, 0.6, 0.7], [0, 5.75, 0], red);
  box(tank, [3.2, 0.1, 0.35], [0, 5.42, 0], dark);
  label('TANQUE DE SERVIÇO · 15.000 L', [-8.1, 6.6, 0], 4.0, 'tank');
  label('Corte didático · cinco patamares', [-8.1, 0.3, 2.2], 3.8, 'tank');

  const percentages = [10, 25, 50, 75, 90];
  percentages.forEach((percent, index) => {
    const sensor = group('sensor' + (index + 1), [-6.43, 0.88 + percent / 100 * 4.3, 0.45]);
    cylinder(sensor, 0.045, 0.42, [-0.15, 0, 0], dark, 'x');
    const lamp = mesh(sensor, new THREE.SphereGeometry(0.115, 12, 8), material(neutral));
    sensors.push(lamp);
  });
  indicator('pt100', [-6.4, 1.7, 0.85], s => s.temperature.status === 'SIMULADO');
  label('PT100', [-6.15, 1.45, 1.25], 1.1, 'pt100');
  const steam = group('steam', [-9.95, 1.5, -0.25]);
  cylinder(steam, 0.17, 0.48, [0, 0, 0], dark, 'x');
  valve('steam', [-9.95, 1.8, -0.25], s => s.effective.steam);
  pipe('steam', [[-11, 1.5, -0.25], [-9.9, 1.5, -0.25], [-9.1, 1.5, -0.25]], s => s.effective.steam, brown);
  label('VAPOR', [-10.45, 2.4, -0.25], 1.2, 'steam');
  pipe('inlet', [[-11, 4.9, 0], [-10.1, 4.9, 0], [-8.1, 4.9, 0], [-8.1, 4.3, 0]],
    s => s.inletFlowLpm > 0 && s.permissives.admission);
  indicator('inlet', [-10.25, 4.9, 0], s => s.inletFlowLpm > 0);
  label('FT-IN · recebido', [-10.3, 5.55, 0], 2.2, 'inlet');

  function pump(key, position, feed = false) {
    const object = group(key, position);
    box(object, [2.05, 0.14, 0.85], [0, -0.43, 0], dark);
    cylinder(object, 0.34, 0.8, [-0.54, 0, 0], red, 'x');
    cylinder(object, 0.22, feed ? 1.2 : 0.65, [0.45, 0, 0], steel, 'x');
    for (let i = 0; i < 4; i++) cylinder(object, 0.36, 0.04, [-0.84 + i * 0.18, 0, 0], dark, 'x');
    const rotor = helix(object, feed ? 1.2 : 0.6, 0.17, [0.45, 0, 0], dark, feed ? 4 : 2);
    rotors.push({ mesh: rotor, axis: 'x', active: s => feed ? s.effective.feedPump : s.effective.outletPump === Number(key.slice(-1)) });
    return object;
  }
  pump('feed', [-4.65, 0.86, 1.7], true);
  label('BOMBA HELICOIDAL', [-4.65, 1.65, 2.1], 2.8, 'feed');
  pipe('feed', [[-6.6, 1.05, 0], [-5.85, 1.05, 0], [-5.85, 0.86, 1.7], [-5.6, 0.86, 1.7]], s => s.effective.feedPump);
  pipe('feed', [[-3.55, 0.86, 1.7], [-3.1, 0.86, 1.7], [-3.1, 4.4, 1.7], [0, 4.4, 1.7]], s => s.effective.feedPump);
  pipe(null, [[0, 4.4, 1.7], [4.8, 4.4, 1.7]], s => s.effective.feedPump && s.selectedDecanter === 'GRATE');

  function decanter(name, x) {
    const object = group(name, [x, 2.25, 0]);
    // Carcaça em corte e tambor transparente deixam a rosca interna visível.
    const casing = mesh(object, new THREE.CylinderGeometry(0.63, 0.63, 2.5, 36, 1, true, Math.PI / 2, Math.PI),
      material(0xc5c8ce, { side: THREE.DoubleSide }), [-0.25, 0, 0]);
    casing.rotation.z = Math.PI / 2;
    cylinder(object, 0.28, 1.0, [1.45, 0, 0], material(0xb7bdc7, { transparent: true, opacity: 0.34 }), 'x', 0.58);
    const bowl = new THREE.Group();
    object.add(bowl);
    cylinder(bowl, 0.55, 2.4, [-0.25, 0, 0], material(0xd6dbe3, { transparent: true, opacity: 0.12, depthWrite: false }), 'x');
    for (const end of [-1.4, 0.9]) {
      const ring = mesh(bowl, new THREE.TorusGeometry(0.55, 0.03, 6, 30), dark, [end, 0, 0]);
      ring.rotation.y = Math.PI / 2;
    }
    box(bowl, [2.3, 0.035, 0.035], [-0.25, 0.48, 0.24], red);
    rotors.push({ mesh: bowl, axis: 'x', speed: 2.5, active: s => Boolean(s.decanterReady[name] && s.running) });
    const scroll = new THREE.Group();
    object.add(scroll);
    cylinder(scroll, 0.13, 3.1, [0.1, 0, 0], dark, 'x');
    helix(scroll, 2.6, 0.4, [-0.1, 0, 0], material(0xb18238), 8);
    rotors.push({ mesh: scroll, axis: 'x', speed: 2.05, active: s => Boolean(s.decanterReady[name] && s.running) });
    cylinder(object, 0.63, 0.09, [-1.48, 0, 0], dark, 'x');
    cylinder(object, 0.35, 0.48, [-1.82, 0, 0], red, 'x');
    for (const foot of [-1.2, 1.15]) box(object, [0.12, 1.75, 0.85], [foot, -1.35, 0], dark);
    box(object, [4.1, 0.14, 1.15], [0, -0.66, 0], dark);
    const rotor = new THREE.Group();
    rotor.position.set(-2.08, 0, 0);
    for (let a = 0; a < 3; a++) {
      const blade = box(rotor, [0.08, 0.52, 0.07], [0, 0, 0], light);
      blade.rotation.x = a * Math.PI / 3;
    }
    object.add(rotor);
    rotors.push({ mesh: rotor, axis: 'x', active: s => Boolean(s.decanterReady[name] && s.running) });
    label('DECANTER ' + name, [x, 3.35, -0.7], 2.7, name);
    pipe('valve' + name, [[x, 4.4, 1.7], [x, 4.4, 0], [x, 2.85, 0]], s => s.effective.feedPump && s.selectedDecanter === name);
    valve('valve' + name, [x, 3.75, 0], s => s.effective.feedPump && s.selectedDecanter === name);
    pipe('tacho' + name, [[x + 0.55, 1.65, 0.28], [x + 0.55, 1.18, 1.5]], s => s.effective.feedPump && s.selectedDecanter === name);
    pipe('screw', [[x - 0.75, 1.65, -0.3], [x - 0.75, 1.15, -1.6], [x - 0.75, 0.57, -1.6]],
      s => s.effective.feedPump && s.selectedDecanter === name, brown);
    const tacho = group('tacho' + name, [x + 0.55, 0, 1.5]);
    mesh(tacho, new THREE.CylinderGeometry(0.7, 0.63, 0.75, 32, 1, true),
      material(0xb9bec7, { side: THREE.DoubleSide, transparent: true, opacity: 0.48 }), [0, 0.76, 0]);
    cylinder(tacho, 0.63, 0.1, [0, 0.38, 0], dark);
    for (const f of [-0.45, 0.45]) box(tacho, [0.1, 0.4, 0.1], [f, 0.2, 0], dark);
    const fluid = cylinder(tacho, 0.62, 1, [0, 0.6, 0], oil);
    fluid.visible = false;
    liquid.push({ mesh: fluid, volume: s => s.tachos[name], capacity: 1000, bottom: 0.44, height: 0.65 });
    label('TACHO ' + name, [x + 0.55, 0.1, 2.5], 2.0, 'tacho' + name);
    pipe('tacho' + name, [[x + 0.55, 0.45, 1.5], [x + 0.55, 0.45, 3.5], [6.2, 0.45, 3.5]],
      s => Boolean(s.effective.outletPump && s.selectedTacho === name));
  }
  decanter('FAST', 0);
  decanter('GRATE', 4.8);

  const screw = group('screw', [2.2, 0.58, -1.6]);
  box(screw, [9.1, 0.22, 0.7], [0, -0.22, 0], dark);
  box(screw, [9.1, 0.38, 0.1], [0, 0, -0.34], steel);
  cylinder(screw, 0.05, 9.1, [0, 0, 0], dark, 'x');
  const auger = helix(screw, 9, 0.23, [0, 0, 0], brown, 18);
  rotors.push({ mesh: auger, axis: 'x', active: s => s.effective.screw });
  cylinder(screw, 0.3, 0.55, [-4.85, 0, 0], red, 'x');
  label('ROSCA DE BORRA', [2.2, 0.15, -2.7], 3.0, 'screw');

  for (const [i, z] of [[1, 0.4], [2, 2.9]]) {
    pump('out' + i, [7.7, 0.9, z]);
    label('SAÍDA · BOMBA ' + i, [7.7, 1.85, z], 2.4, 'out' + i);
    pipe('out' + i, [[6.2, 0.45, 3.5], [6.2, 0.45, z], [6.2, 0.9, z], [6.65, 0.9, z]], s => s.effective.outletPump === i);
    pipe('out' + i, [[8.7, 0.9, z], [10.35, 0.9, z], [10.35, 2.2, z]], s => s.effective.outletPump === i);
  }
  pipe('outlet', [[10.35, 2.2, 2.9], [10.35, 2.2, -4.2], [-2.8, 2.2, -4.2]],
    s => Boolean(s.effective.outletPump && s.outletDestination === 'ARMAZENAMENTO'));
  indicator('outlet', [10.35, 2.2, -1.8], s => Boolean(s.effective.outletPump));
  label('FT-OUT · transferido', [10.1, 3, -1.8], 2.7, 'outlet');
  for (let i = 1; i <= 5; i++) {
    const x = -3 + (i - 1) * 3.0;
    const storage = group('storage' + i, [x, 0, -6.4]);
    cylinder(storage, 0.78, 2.25, [0, 1.25, 0], material(0xc6c9d0, { transparent: true, opacity: 0.27 }));
    const rim = mesh(storage, new THREE.TorusGeometry(0.78, 0.035, 6, 28), dark, [0, 2.38, 0]);
    rim.rotation.x = Math.PI / 2;
    label('T' + i + ' · FUTURO', [x, 3.0, -6.4], 2.05, 'storage' + i);
    pipe('storage' + i, [[x, 2.2, -4.2], [x, 2.2, -6.4], [x, 2.4, -6.4]],
      s => Boolean(s.effective.outletPump && s.outletDestination === 'ARMAZENAMENTO' && s.selectedStorage === i));
  }

  function update(snapshot, phase = 0, { motion = true } = {}) {
    const sim = snapshot.mode === 'SIMULACAO';
    for (const fill of liquid) {
      const value = fill.volume(snapshot);
      fill.mesh.visible = sim && (!fill.valid || fill.valid(snapshot)) && typeof value === 'number' && value > 0;
      const height = Math.max(0.001, Math.min(1, (value || 0) / fill.capacity)) * fill.height;
      fill.mesh.scale.y = height;
      fill.mesh.position.y = fill.bottom + height / 2;
    }
    sensors.forEach((sensor, index) => {
      const valid = sim && snapshot.level.status === 'VALIDO';
      const active = valid && snapshot.level.switches[index];
      sensor.material.color.setHex(!valid ? neutral : active ? index === 4 ? 0xba1931 : 0x19835c : 0xd0d3d9);
    });
    indicators.forEach(({ lamp, active }) => lamp.material.color.setHex(sim && active(snapshot) ? 0x19835c : neutral));
    rotors.forEach(rotor => {
      if (sim && motion && rotor.active(snapshot)) rotor.mesh.rotation[rotor.axis] = phase * (rotor.speed || 2.5);
    });
    flows.forEach(({ curve, particles, active }) => {
      const visible = sim && Boolean(active(snapshot));
      particles.forEach((particle, index) => {
        particle.visible = visible;
        if (visible) particle.position.copy(curve.getPoint(((motion ? phase * 0.15 : 0) + index / particles.length) % 1));
      });
    });
  }
  function dispose() {
    const geometries = new Set();
    const materials = new Set();
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(mat => { if (mat.map) mat.map.dispose(); mat.dispose(); });
  }
  return { root, equipment, update, dispose, sensors, liquid, flows, rotors };
}

export function selectionKey(object) {
  for (let current = object; current; current = current.parent) {
    if (current.userData.selectKey) return current.userData.selectKey;
  }
  return null;
}
