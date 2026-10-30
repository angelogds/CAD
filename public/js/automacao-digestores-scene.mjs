import * as THREE from '../vendor/three-0.172.0/three.module.min.js';

// Maquete ilustrativa, sem escala, rede, comandos de campo ou capacidade aferida.
export function createDigestorScene({ makeLabel } = {}) {
  const root = new THREE.Group();
  root.name = 'circuito-digestores';
  root.userData.illustrative = true;
  const equipment = new Map();
  const rotors = [];
  const flows = [];
  const liquid = [];
  const gates = [];
  const dischargeGates = [];
  const towers = [];
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.22, ...extra });
  const steel = material(0xc7cbd1);
  const light = material(0xf0f1f3);
  const dark = material(0x555d68);
  const red = material(0xba1931);
  const paddleSteel = material(0xc0904f);
  const oil = material(0xc69a43, { transparent: true, opacity: 0.83, metalness: 0.05 });
  const product = material(0xa88b62);
  const pipeMaterial = material(0x939ca7);
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
  function cylinder(parent, radius, length, position, mat = steel, axis = 'y') {
    const object = mesh(parent, new THREE.CylinderGeometry(radius, radius, length, 28), mat, position);
    if (axis === 'x') object.rotation.z = Math.PI / 2;
    if (axis === 'z') object.rotation.x = Math.PI / 2;
    return object;
  }
  function register(key, object) {
    object.userData.selectKey = key;
    equipment.set(key, object);
    return object;
  }
  function group(key, position = [0, 0, 0], parent = root) {
    const object = new THREE.Group();
    object.position.set(...position);
    parent.add(object);
    return register(key, object);
  }
  function label(text, position, width, key) {
    if (!makeLabel) return;
    const object = makeLabel(text, width);
    if (!object) return;
    object.position.set(...position);
    object.userData.labelText = text;
    if (key) object.userData.selectKey = key;
    root.add(object);
  }
  function path(positions) {
    const curve = new THREE.CurvePath();
    for (let i = 1; i < positions.length; i++) curve.add(new THREE.LineCurve3(point(positions[i - 1]), point(positions[i])));
    return curve;
  }
  function pipe(parent, positions, radius = 0.075, mat = pipeMaterial) {
    const curve = path(positions);
    mesh(parent, new THREE.TubeGeometry(curve, Math.max(24, positions.length * 10), radius, 8, false), mat);
    return curve;
  }
  function flow(key, positions, active, mat = product, radius = 0.1) {
    const curve = path(positions);
    const particles = Array.from({ length: 7 }, () => {
      const particle = mesh(root, new THREE.SphereGeometry(radius, 8, 6), mat);
      particle.userData.selectKey = key;
      particle.visible = false;
      return particle;
    });
    flows.push({ key, curve, particles, active });
  }
  function helix(parent, length, radius, turns, mat = steel) {
    const points = [];
    const segments = Math.max(100, turns * 12);
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2 * turns;
      points.push(new THREE.Vector3(i / segments * length - length / 2, Math.cos(angle) * radius, Math.sin(angle) * radius));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return mesh(parent, new THREE.TubeGeometry(curve, segments, 0.065, 5, false), mat);
  }
  function rotor(parent, key, position, axis, active, speed = 2.2) {
    const object = new THREE.Group();
    object.position.set(...position);
    parent.add(object);
    rotors.push({ key, mesh: object, axis, active, speed });
    return object;
  }
  function arrow(parent, position, direction, length, mat = steel) {
    cylinder(parent, 0.055, length, [position[0] + direction * length / 2, position[1], position[2]], mat, 'x');
    const head = mesh(parent, new THREE.ConeGeometry(0.24, 0.52, 18), mat,
      [position[0] + direction * (length + 0.16), position[1], position[2]]);
    head.rotation.z = -direction * Math.PI / 2;
  }
  const on = value => value === true;
  const unit = (snapshot, index) => snapshot.digestors?.[index] || {};

  // Piso e estrutura elevada: o tacho e a percoladora ficam visivelmente abaixo.
  const floor = box(root, [28, 0.12, 11], [0, -0.14, 1.2], material(0xe9ebee, { metalness: 0 }));
  floor.castShadow = false;
  const grid = new THREE.GridHelper(28, 28, 0xcfd3d9, 0xe0e3e7);
  grid.position.set(0, -0.065, 1.2);
  grid.scale.z = 11 / 28;
  root.add(grid);
  box(root, [21.2, 0.18, 4.4], [0, 2.48, -0.7], steel);
  for (const x of [-10, -5, 0, 5, 10]) {
    for (const z of [-2.55, 1.15]) {
      box(root, [0.22, 2.4, 0.22], [x, 1.18, z], dark);
      box(root, [0.5, 0.1, 0.5], [x, 0.02, z], steel);
    }
    box(root, [0.085, 0.98, 0.085], [x, 3.04, -2.85], dark);
  }
  for (const y of [2.95, 3.5]) box(root, [21, 0.07, 0.07], [0, y, -2.85], dark);
  for (const z of [-2.3, 1.2]) box(root, [21, 0.25, 0.16], [0, 2.25, z], dark);
  for (let i = 0; i < 7; i++) {
    box(root, [1.2, 0.16, 0.5], [11.1, 0.18 + i * 0.35, 2.6 - i * 0.48], steel);
  }

  const feedAuger = group('feedAuger', [0, 6.9, -0.35]);
  box(feedAuger, [21, 0.12, 0.85], [0, -0.33, 0], dark);
  box(feedAuger, [21, 0.48, 0.085], [0, -0.07, -0.43], steel);
  box(feedAuger, [21, 0.2, 0.085], [0, -0.21, 0.43], steel);
  const feedScrew = rotor(feedAuger, 'feedAuger', [0, 0, 0], 'x', s => on(s.feedAuger));
  cylinder(feedScrew, 0.065, 20.8, [0, 0, 0], dark, 'x');
  helix(feedScrew, 20.6, 0.3, 32);
  cylinder(feedAuger, 0.32, 0.7, [-10.9, 0, 0], red, 'x');
  box(feedAuger, [1.0, 0.65, 0.9], [-9.55, 0.45, 0], light);
  for (const x of [-9.6, 9.6]) for (const z of [-0.9, 0.4]) box(root, [0.12, 4.3, 0.12], [x, 4.65, z], dark);
  label('ROSCA COMUM DE ALIMENTAÇÃO', [0, 7.75, -0.35], 5, 'feedAuger');
  flow('feedAuger', [[-9.3, 6.95, -0.35], [9.6, 6.95, -0.35]], s => on(s.feedAuger));

  const percolator = group('percolator', [0, 1.93, 3.1]);
  box(percolator, [21.8, 0.14, 1.3], [0, -0.49, 0], dark);
  box(percolator, [21.8, 0.94, 0.11], [0, -0.06, -0.65], steel);
  box(percolator, [21.8, 0.32, 0.11], [0, -0.35, 0.65], steel);
  for (const x of [-10.85, 10.85]) box(percolator, [0.12, 0.94, 1.3], [x, -0.06, 0], steel);
  for (const x of [-10, -3.5, 3.5, 10]) for (const z of [-0.45, 0.45]) box(percolator, [0.14, 1.35, 0.14], [x, -1.18, z], dark);
  const percolatorScrew = rotor(percolator, 'percolator', [0, 0, 0], 'x', s => on(s.percolator), 1.5);
  cylinder(percolatorScrew, 0.1, 21.5, [0, 0, 0], dark, 'x');
  helix(percolatorScrew, 21.3, 0.4, 29);
  cylinder(percolator, 0.36, 0.65, [-11.25, 0, 0], red, 'x');
  arrow(percolator, [11, 0, 0], 1, 1.6, dark);
  label('PERCOLADORA · ROSCA INTERNA', [0, 0.85, 4.15], 5, 'percolator');
  label('PARA PRENSAS · EXPANSÃO', [11.45, 2.85, 3.2], 3.6, 'percolator');
  flow('percolator', [[-10.4, 2.06, 3.1], [10.5, 2.06, 3.1], [12.4, 2.06, 3.1]], s => on(s.percolator));

  [-7.5, -2.5, 2.5, 7.5].forEach((x, index) => {
    const key = 'digestor' + (index + 1);
    const digestor = group(key, [x, 4.08, -0.1]);
    // Corte superior didático revela o eixo; as portas frontais permanecem grandes.
    const casing = mesh(digestor, new THREE.CylinderGeometry(1.17, 1.17, 3.65, 40, 1, true, Math.PI * 4 / 3, Math.PI * 4 / 3),
      material(0xd8dce1, { side: THREE.DoubleSide, transparent: true, opacity: 0.63, depthWrite: false }));
    casing.rotation.x = Math.PI / 2;
    for (const z of [-1.84, 1.84]) {
      const rim = mesh(digestor, new THREE.TorusGeometry(1.17, 0.075, 8, 40), steel, [0, 0, z]);
      rim.name = 'anel-digestor';
    }
    cylinder(digestor, 1.1, 0.18, [0, 0, 1.89], light, 'z');
    const door = cylinder(digestor, 0.92, 0.12, [0, 0, 2.04], steel, 'z');
    door.name = 'porta-frontal';
    const doorRing = mesh(digestor, new THREE.TorusGeometry(0.86, 0.04, 8, 36), dark, [0, 0, 2.115]);
    doorRing.name = 'vedacao-porta';
    box(digestor, [0.5, 0.11, 0.13], [0, 0, 2.17], dark);
    for (let bolt = 0; bolt < 8; bolt++) {
      const angle = bolt * Math.PI / 4;
      cylinder(digestor, 0.045, 0.08, [Math.cos(angle), Math.sin(angle), 2.04], dark, 'z');
    }
    for (const z of [-1.05, 1.05]) {
      box(digestor, [1.55, 0.2, 0.35], [0, -1.16, z], dark);
      for (const side of [-0.65, 0.65]) box(digestor, [0.15, 0.42, 0.35], [side, -1.34, z], steel);
    }
    cylinder(digestor, 0.39, 0.64, [0, 0, -2.27], red, 'z');
    box(digestor, [0.95, 0.14, 0.75], [0, -0.48, -2.27], dark);
    const shaft = rotor(digestor, key, [0, 0, 0], 'z', s => on(unit(s, index).shaft), 1.4);
    shaft.name = 'eixo-interno-d' + (index + 1);
    cylinder(shaft, 0.085, 4.3, [0, 0, -0.12], dark, 'z');
    for (const z of [-1.15, 0, 1.15]) {
      for (const angle of [0, Math.PI / 2]) {
        const paddle = box(shaft, [1.75, 0.1, 0.32], [0, 0, z], paddleSteel);
        paddle.rotation.z = angle;
        paddle.rotation.y = 0.2;
      }
    }
    // Sinaleiro 3D na tampa superior: réplica visual da cor validada pelo painel térmico.
    // Não comanda pinos, vapor, descarga ou motor; o eixo real segue sem retorno físico.
    const towerGroup = new THREE.Group();
    towerGroup.name = 'torre-termica-d' + (index + 1);
    towerGroup.position.set(0.94, 1.48, 1.28);
    digestor.add(towerGroup);
    const towerHousing = box(towerGroup, [0.4, 0.94, 0.36], [0, 0, 0], dark);
    towerHousing.name = 'corpo-sinaleiro';
    cylinder(towerGroup, 0.045, 0.37, [0, -0.64, 0], steel);
    const lenses = {};
    const lensColors = { red: 0xf13750, yellow: 0xffc531, green: 0x18e477 };
    for (const [color, y] of [['red', 0.29], ['yellow', 0], ['green', -0.29]]) {
      const glass = material(0x33404a, { emissive: 0x000000, emissiveIntensity: 0 });
      const bulb = mesh(towerGroup, new THREE.SphereGeometry(0.146, 16, 12), glass, [0, y, 0.19]);
      bulb.name = 'lente-' + color;
      lenses[color] = { bulb, bright: lensColors[color] };
    }
    towers.push({ index, key, group: towerGroup, lenses, state: 'DESLIGADO' });
    const gateKey = 'gate' + (index + 1);
    const gate = group(gateKey, [x, 5.85, -0.35]);
    cylinder(gate, 0.33, 1.15, [0, 0.13, 0], steel);
    box(gate, [0.95, 0.18, 0.85], [0, 0, 0], dark);
    box(gate, [0.08, 0.9, 0.1], [-0.47, 0.45, 0.4], steel);
    box(gate, [0.08, 0.9, 0.1], [0.47, 0.45, 0.4], steel);
    const slide = box(gate, [0.77, 0.65, 0.08], [0, 0.18, 0.4], steel);
    slide.name = 'guilhotina-movel';
    cylinder(gate, 0.14, 0.55, [0.65, 0.74, 0.4], red);
    cylinder(gate, 0.035, 0.65, [0.65, 0.22, 0.4], light);
    const stemLink = box(gate, [0.69, 0.08, 0.09], [0.32, 0.45, 0.4], dark);
    gates.push({ key: gateKey, mesh: gate, slide, stemLink, closedY: 0.18, travel: 0.6, index });
    gate.userData.positionStatus = 'SEM_SINAL';
    label('D' + (index + 1), [x, 5.2, 2.15], 1.5, key);
    label('GUILHOTINA D' + (index + 1), [x, 6.2, 1.1], 2.3, gateKey);
    // Descarga frontal: uma SEGUNDA guilhotina virtual, sem GPIO nem sensor.
    // Produto cai na percoladora, sem criar prensas fictícias.
    pipe(digestor, [[0, -0.81, 2.02], [0, -1.15, 2.4], [0, -1.85, 3.2]], 0.23, steel);
    const dischargeKey = 'dischargeGate' + (index + 1);
    const dischargeGate = group(dischargeKey, [x, 2.99, 2.53]);
    box(dischargeGate, [0.75, 0.2, 0.55], [0, 0, 0], dark);
    const dischargeSlide = box(dischargeGate, [0.58, 0.39, 0.1], [0, 0.12, 0.34], steel);
    cylinder(dischargeGate, 0.1, 0.33, [0.47, 0.47, 0.15], red);
    dischargeGates.push({ key: dischargeKey, mesh: dischargeGate, slide: dischargeSlide, index });
    dischargeGate.userData.positionStatus = 'SEM_SINAL';
    label('DESCARGA D' + (index + 1), [x, 2.72, 3.55], 2, dischargeKey);
    flow(key, [[x, 3.27, 1.92], [x, 2.93, 2.3], [x, 2.23, 3.1]], s => on(unit(s, index).discharging), product, 0.13);
    flow(gateKey, [[x, 6.6, -0.35], [x, 5.95, -0.35], [x, 5.1, -0.35]],
      s => on(s.feedAuger) && on(s.gates?.[index]) && on(unit(s, index).loading));
  });

  const gasHeader = group('gasHeader');
  pipe(gasHeader, [[-9.5, 5.65, -2.5], [9.5, 5.65, -2.5]], 0.095);
  for (const x of [-7.5, -2.5, 2.5, 7.5]) pipe(gasHeader, [[x, 5.65, -2.5], [x, 5.65, -1.25], [x, 5.12, -1.25]], 0.065);
  gasHeader.userData.telemetry = 'SEM_SINAL';
  label('COLETOR COMUM DE GASES', [0, 6.2, -2.9], 4, 'gasHeader');

  const tacho = group('tacho', [-7.5, 0, 4.7]);
  tacho.userData.capacityIllustrative = true;
  mesh(tacho, new THREE.CylinderGeometry(1.2, 1.07, 1.3, 36, 1, true),
    material(0xbfc7d0, { side: THREE.DoubleSide, transparent: true, opacity: 0.47 }), [0, 0.97, 0]);
  cylinder(tacho, 1.07, 0.1, [0, 0.31, 0], dark);
  const tachoRim = mesh(tacho, new THREE.TorusGeometry(1.2, 0.05, 8, 40), steel, [0, 1.62, 0]);
  tachoRim.rotation.x = Math.PI / 2;
  for (const x of [-0.75, 0.75]) for (const z of [-0.65, 0.65]) box(tacho, [0.13, 0.3, 0.13], [x, 0.15, z], dark);
  const tachoLiquid = cylinder(tacho, 1.04, 1, [0, 0.4, 0], oil);
  tachoLiquid.visible = false;
  tachoLiquid.userData.illustrative = true;
  liquid.push({ mesh: tachoLiquid, bottom: 0.37, height: 1.13 });
  const tachoMixer = group('tachoMixer', [0, 0, 0], tacho);
  cylinder(tachoMixer, 0.065, 1.7, [0, 1.1, 0], dark);
  box(tachoMixer, [2.35, 0.13, 0.3], [0, 1.72, 0], dark);
  cylinder(tachoMixer, 0.27, 0.55, [0, 2.02, 0], red);
  const mixer = rotor(tachoMixer, 'tachoMixer', [0, 0.7, 0], 'y', s => on(s.tachoMixer), 2.1);
  for (const angle of [0, Math.PI / 2]) {
    const paddle = box(mixer, [1.7, 0.12, 0.26], [0, 0, 0], steel);
    paddle.rotation.y = angle;
    paddle.rotation.z = 0.13;
  }
  label('TACHO COLETOR · VOLUME ILUSTRATIVO', [-7.5, 0.2, 6.25], 5, 'tacho');
  label('MEXEDOR DO TACHO', [-7.5, 2.7, 5.1], 3, 'tachoMixer');
  pipe(tacho, [[0, 1.5, -1.05], [0, 1.5, -1.6], [0, 1.38, -1.6]], 0.11);
  flow('tacho', [[-7.5, 1.7, 3.1], [-7.5, 1.5, 3.1], [-7.5, 1.5, 4.1]],
    s => on(s.percolator) && s.digestors?.some(item => on(item?.discharging)), oil, 0.09);

  const pump = group('pump', [-10.5, 0.7, 4.7]);
  box(pump, [2.1, 0.15, 0.9], [0, -0.4, 0], dark);
  cylinder(pump, 0.33, 0.85, [0.42, 0, 0], red, 'x');
  cylinder(pump, 0.25, 0.75, [-0.45, 0, 0], steel, 'x');
  const impeller = rotor(pump, 'pump', [-0.45, 0, 0], 'x', s => on(s.pump), 3);
  for (let i = 0; i < 3; i++) {
    const blade = box(impeller, [0.08, 0.6, 0.08], [0, 0, 0], dark);
    blade.rotation.x = i * Math.PI / 3;
  }
  pipe(pump, [[1.0, 0, 0], [1.7, 0, 0], [1.7, -0.2, 0], [1.92, -0.2, 0]], 0.095);
  label('BOMBA DE SEBO', [-10.5, 1.6, 5.1], 2.8, 'pump');
  const serviceTankBoundary = group('serviceTankBoundary');
  pipe(serviceTankBoundary, [[-11.35, 0.7, 4.7], [-12.2, 0.7, 4.7], [-12.2, 1.7, 4.7]], 0.095);
  arrow(serviceTankBoundary, [-12.2, 1.7, 4.7], -1, 0.9, pipeMaterial);
  label('TANQUE DE SERVIÇO · DECANTERS', [-11.2, 2.5, 5.5], 4.6, 'serviceTankBoundary');
  flow('serviceTankBoundary', [[-8.6, 0.5, 4.7], [-9.5, 0.5, 4.7], [-10.5, 0.7, 4.7], [-12.2, 0.7, 4.7], [-12.2, 1.7, 4.7], [-13.1, 1.7, 4.7]],
    s => on(s.pump) && Number.isFinite(s.tachoLiters) && s.tachoLiters > 0, oil, 0.1);

  let lastPhase = 0;
  let flowPhase = 0;
  function update(snapshot = {}, phase = 0, { motion = true, thermal = [], blinkOn = true } = {}) {
    const colors = Array.isArray(thermal) ? thermal : [];
    for (const tower of towers) {
      const state = ['VERDE', 'AMARELO', 'VERMELHO', 'VERMELHO_PISCANDO'].includes(colors[tower.index])
        ? colors[tower.index] : 'DESLIGADO';
      tower.state = state;
      tower.group.userData.thermalState = state;
      const activeColor = state === 'VERDE' ? 'green' : state === 'AMARELO' ? 'yellow'
        : state === 'VERMELHO' || state === 'VERMELHO_PISCANDO' && blinkOn ? 'red' : null;
      for (const [color, lens] of Object.entries(tower.lenses)) {
        const lit = color === activeColor;
        lens.bulb.material.color.setHex(lit ? lens.bright : 0x33404a);
        lens.bulb.material.emissive.setHex(lit ? lens.bright : 0x000000);
        lens.bulb.material.emissiveIntensity = lit ? 1.6 : 0;
      }
    }
    const sim = snapshot.mode === 'SIMULACAO';
    const clock = Number.isFinite(phase) ? phase : lastPhase;
    // Limita saltos de quadros e conserva a posição ao pausar ou reduzir movimento.
    const delta = Math.min(0.15, Math.max(0, clock - lastPhase));
    lastPhase = clock;
    const animate = sim && on(snapshot.running) && motion;
    for (const rotor of rotors) {
      if (!sim) rotor.mesh.rotation[rotor.axis] = 0;
      else if (animate && rotor.active(snapshot)) rotor.mesh.rotation[rotor.axis] += delta * rotor.speed;
    }
    for (const gate of gates) {
      const known = sim && typeof snapshot.gates?.[gate.index] === 'boolean';
      const opening = known && snapshot.gates[gate.index] ? gate.travel : 0;
      gate.slide.position.y = gate.closedY + opening;
      gate.stemLink.position.y = 0.45 + opening;
      gate.mesh.userData.positionStatus = known ? snapshot.gates[gate.index] ? 'ABERTA_SIMULADA' : 'FECHADA_SIMULADA' : 'SEM_SINAL';
    }
    for (const gate of dischargeGates) {
      const known = sim && typeof snapshot.dischargeGates?.[gate.index] === 'boolean';
      const open = known && snapshot.dischargeGates[gate.index];
      gate.slide.position.y = open ? 0.55 : 0.12;
      gate.mesh.userData.positionStatus = !known ? 'SEM_SINAL' : open ? 'ABERTA_SIMULADA' : 'FECHADA_SIMULADA';
    }
    const capacity = Number.isFinite(snapshot.tachoCapacityLiters) && snapshot.tachoCapacityLiters > 0 ? snapshot.tachoCapacityLiters : null;
    const liters = Number.isFinite(snapshot.tachoLiters) ? snapshot.tachoLiters : null;
    const fill = liquid[0];
    fill.mesh.visible = sim && capacity !== null && liters !== null && liters > 0;
    const fraction = fill.mesh.visible ? Math.min(1, Math.max(0, liters / capacity)) : 0;
    const height = Math.max(0.001, fraction * fill.height);
    fill.mesh.scale.y = height;
    fill.mesh.position.y = fill.bottom + height / 2;
    if (animate) flowPhase += delta * 0.19;
    for (const { curve, particles, active } of flows) {
      const visible = sim && on(snapshot.running) && Boolean(active(snapshot));
      particles.forEach((particle, index) => {
        const wasVisible = particle.visible;
        particle.visible = visible;
        if (visible && (animate || !wasVisible)) particle.position.copy(curve.getPoint((flowPhase + index / particles.length) % 1));
      });
    }
  }
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
    });
    materials.forEach(mat => { if (mat.map) textures.add(mat.map); });
    geometries.forEach(geometry => geometry.dispose());
    textures.forEach(texture => texture.dispose());
    materials.forEach(mat => mat.dispose());
  }
  return { root, equipment, update, dispose, rotors, flows, liquid, gates, dischargeGates, towers };
}

export function selectionKey(object) {
  for (let current = object; current; current = current.parent) {
    if (current.userData.selectKey) return current.userData.selectKey;
  }
  return null;
}
