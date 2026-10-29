// Geometria de prévia: medidas explícitas do documento, sem inferir espessura,
// chanfro ou furação. Não produz BREP/STEP nem modifica o desenho de origem.
const EPS = 1e-7;
const MAX_OBJECTS = 2000;
const MAX_POINTS = 512;
const MAX_MEASURE = 1e7;

function finite(value, label) {
  if (value == null || value === '' || typeof value === 'boolean') throw new Error(`${label} não informado.`);
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > MAX_MEASURE) throw new Error(`${label} inválido.`);
  return result;
}

function positive(value, label) {
  const result = finite(value, label);
  if (result <= 0) throw new Error(`${label} deve ser maior que zero.`);
  return result;
}

function point(value, label = 'Ponto') {
  return { x: finite(value?.x, `${label} X`), y: finite(value?.y, `${label} Y`) };
}

function geometry(object) { return object.geometry || object; }
function near(a, b, tolerance = EPS) { return Math.abs(a - b) <= tolerance; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function shaftDimensions(model) {
  if (!Array.isArray(model.segments) || !model.segments.length || model.segments.length > 20) {
    throw new Error('Informe de 1 a 20 trechos para o eixo.');
  }
  const segments = model.segments.map((segment) => ({
    length: positive(segment.length, 'Comprimento do trecho'),
    diameter: positive(segment.diameter, 'Diâmetro do trecho'),
  }));
  const length = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (length > MAX_MEASURE) throw new Error('Comprimento total do eixo excede o limite da prévia.');
  if (model.crossHoles != null && (!Array.isArray(model.crossHoles) || model.crossHoles.length)) {
    throw new Error('Furos transversais exigem subtração volumétrica ainda não disponível nesta prévia.');
  }
  if (model.chamfers?.length || model.keyways?.length || model.holes?.length) {
    throw new Error('Usinagens adicionais exigem um provedor volumétrico compatível.');
  }
  let bore = null;
  if (model.bore) {
    const diameter = positive(model.bore.diameter, 'Diâmetro do alojamento');
    const depth = positive(model.bore.depth, 'Profundidade do alojamento');
    if (model.bore.from && model.bore.from !== 'start') throw new Error('Origem do alojamento ainda não suportada.');
    if (depth > length) throw new Error('Profundidade do alojamento ultrapassa o eixo.');
    let offset = 0;
    for (const segment of segments) {
      if (offset < depth && diameter >= segment.diameter) throw new Error('Alojamento invade o contorno externo do eixo.');
      offset += segment.length;
    }
    bore = { diameter, depth, from: 'start' };
  }
  return { segments, bore, length, maxDiameter: Math.max(...segments.map((segment) => segment.diameter)) };
}

export function shaftProfilePoints(model) {
  const { segments, bore, length } = shaftDimensions(model);
  const profile = [];
  const add = (radius, distanceValue) => {
    const previous = profile.at(-1);
    if (!previous || previous.radius !== radius || previous.distance !== distanceValue) {
      profile.push({ radius, distance: distanceValue });
    }
  };
  add(bore ? bore.diameter / 2 : 0, 0);
  let offset = 0;
  for (const segment of segments) {
    add(segment.diameter / 2, offset);
    offset += segment.length;
    add(segment.diameter / 2, offset);
  }
  if (bore && near(bore.depth, length)) {
    add(bore.diameter / 2, length);
  } else {
    add(0, length);
    if (bore) {
      add(0, bore.depth);
      add(bore.diameter / 2, bore.depth);
    }
  }
  add(bore ? bore.diameter / 2 : 0, 0);
  return profile;
}

function shaftDescriptor(object, id) {
  const model = geometry(object);
  const normalized = shaftDimensions(model);
  const origin = point(model.origin, 'Origem do eixo');
  const orientation = model.orientation || 'horizontal';
  if (!['horizontal', 'vertical'].includes(orientation)) throw new Error('Orientação do eixo inválida.');
  return {
    id, kind: 'shaft', ...normalized, profile: shaftProfilePoints(model),
    orientation, position: { ...origin, z: 0 },
  };
}

function extrusionDepth(object, id, options) {
  // object.thickness e style.lineWidth são espessuras de traço no formato legado.
  const explicit = options.thicknessById?.[id]
    ?? object.metadata?.extrusionDepth
    ?? object.metadata?.flangeParameters?.thickness;
  if (explicit == null || explicit === '') throw new Error('Informe a espessura 3D nas propriedades do contorno.');
  return positive(explicit, 'Espessura 3D');
}

function circle(object) {
  const shape = geometry(object);
  return {
    x: finite(shape.cx ?? shape.x, 'Centro X'),
    y: finite(shape.cy ?? shape.y, 'Centro Y'),
    radius: positive(shape.radius, 'Raio'),
  };
}

function cross(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) <= EPS && p.x >= Math.min(a.x, b.x) - EPS
    && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}
function intersects(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return ((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS))
      && ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))
    || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

function polygon(object) {
  const shape = geometry(object);
  let points;
  if (object.type === 'rect') {
    const origin = point(shape);
    const width = finite(shape.width, 'Largura'), height = finite(shape.height, 'Altura');
    if (!width || !height) throw new Error('Contorno sem área para extrusão.');
    if (Number(shape.rotation || 0)) throw new Error('Converta o retângulo rotacionado em polilinha antes de gerar 3D.');
    points = [origin, { x: origin.x + width, y: origin.y },
      { x: origin.x + width, y: origin.y + height }, { x: origin.x, y: origin.y + height }];
  } else {
    if (shape.closed !== true) throw new Error('Feche a polilinha antes de gerar volume 3D.');
    if (!Array.isArray(shape.points) || shape.points.length > MAX_POINTS) throw new Error('Quantidade de vértices inválida.');
    if (shape.points.some((p) => Number(p.bulge || 0)) || shape.bulges?.some((v) => Number(v))) {
      throw new Error('Polilinhas com arcos exigem um provedor volumétrico compatível.');
    }
    points = shape.points.map((p) => point(p));
    if (points.length > 1 && distance(points[0], points.at(-1)) <= EPS) points.pop();
  }
  if (points.length < 3) throw new Error('Contorno precisa de pelo menos três vértices.');
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index], b = points[(index + 1) % points.length];
    if (distance(a, b) <= EPS) throw new Error('Contorno contém segmento de comprimento zero.');
    area += a.x * b.y - b.x * a.y;
    for (let other = index + 1; other < points.length; other += 1) {
      if (other === index + 1 || index === 0 && other === points.length - 1) continue;
      if (intersects(a, b, points[other], points[(other + 1) % points.length])) {
        throw new Error('Contorno se cruza; corrija a polilinha antes de gerar 3D.');
      }
    }
  }
  if (Math.abs(area) <= EPS) throw new Error('Contorno sem área para extrusão.');
  return points;
}

function plateDescriptor(object, id, options) {
  const source = geometry(object);
  if (source.holes?.length || source.cutouts?.length || source.bore) {
    throw new Error('Recortes de chapa exigem um provedor volumétrico compatível.');
  }
  const thickness = extrusionDepth(object, id, options);
  if (object.type === 'circle') {
    const c = circle(object);
    return { id, kind: 'plate', profile: { type: 'circle', radius: c.radius }, holes: [], thickness, position: { x: c.x, y: c.y, z: 0 } };
  }
  const points = polygon(object);
  const origin = points[0];
  return {
    id, kind: 'plate', profile: { type: 'polygon', points: points.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })) },
    holes: [], thickness, position: { ...origin, z: 0 },
  };
}

function flangeDescriptor(members, id, options) {
  const outers = members.filter((object) => object.metadata?.role === 'contorno_externo');
  if (outers.length !== 1 || outers[0].type !== 'circle') throw new Error('Contorno externo do flange ausente ou ambíguo.');
  const outer = outers[0];
  const shape = circle(outer);
  const thickness = extrusionDepth(outer, id, options);
  const holes = [];
  for (const member of members) {
    const role = member.metadata?.role || '';
    if (role === 'furo_central' || /^furo_\d+$/.test(role)) {
      if (member.type !== 'circle') throw new Error('Furação alterada exige contornos circulares válidos.');
      const hole = circle(member);
      holes.push({ x: hole.x - shape.x, y: hole.y - shape.y, radius: hole.radius });
    } else if (member !== outer && !['circulo_furacao', 'linha_centro_horizontal', 'linha_centro_vertical'].includes(role)) {
      throw new Error('Flange contém geometria adicional ainda não suportada em 3D.');
    }
  }
  const parameters = outer.metadata?.flangeParameters;
  if (parameters) {
    const expected = Number(parameters.holeCount) + (Number(parameters.boreDiameter) > 0 ? 1 : 0);
    if (!Number.isFinite(expected) || holes.length !== expected) throw new Error('Furação do flange incompleta; confira os contornos do grupo.');
  }
  holes.forEach((hole, index) => {
    if (Math.hypot(hole.x, hole.y) + hole.radius >= shape.radius - EPS) throw new Error('Furação ultrapassa o contorno externo do flange.');
    for (const previous of holes.slice(0, index)) {
      if (distance(hole, previous) <= hole.radius + previous.radius + EPS) throw new Error('Furos do flange se sobrepõem.');
    }
  });
  return { id, kind: 'flange', profile: { type: 'circle', radius: shape.radius }, holes, thickness, position: { x: shape.x, y: shape.y, z: 0 } };
}

function rectangleBounds(object) {
  let points;
  try {
    if (!['rect', 'polyline'].includes(object.type)) return null;
    points = polygon(object);
  } catch { return null; }
  if (points.length !== 4) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const corners = new Set(points.map((p) => `${near(p.x, minX, .02) ? 0 : near(p.x, maxX, .02) ? 1 : 'x'}-${near(p.y, minY, .02) ? 0 : near(p.y, maxY, .02) ? 1 : 'x'}`));
  return corners.size === 4 && ![...corners].some((p) => p.includes('x')) ? { minX, maxX, minY, maxY } : null;
}

function matchShaftSheet(objects, spec) {
  const origin = point(spec.origin, 'Origem do eixo');
  const { segments } = shaftDimensions(spec);
  if (spec.orientation && spec.orientation !== 'horizontal') throw new Error('Metadados do eixo e orientação do perfil 2D divergentes.');
  const matches = new Set();
  let offset = origin.x;
  for (const segment of segments) {
    const index = objects.findIndex((object, i) => {
      if (matches.has(i)) return false;
      const box = rectangleBounds(object);
      return box && near(box.minX, offset, .02) && near(box.maxX, offset + segment.length, .02)
        && near(box.minY, origin.y - segment.diameter / 2, .02) && near(box.maxY, origin.y + segment.diameter / 2, .02);
    });
    if (index < 0) throw new Error('Perfil 2D diverge das medidas do eixo; atualize o cadastro paramétrico.');
    matches.add(index);
    offset += segment.length;
  }
  return matches;
}

function boundsFor(items) {
  if (!items.length) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const include = (p) => { for (const axis of ['x', 'y', 'z']) { min[axis] = Math.min(min[axis], p[axis]); max[axis] = Math.max(max[axis], p[axis]); } };
  for (const item of items) {
    const p = item.position;
    if (item.kind === 'shaft') {
      const r = item.maxDiameter / 2;
      include({ x: p.x - (item.orientation === 'vertical' ? r : 0), y: p.y - (item.orientation === 'horizontal' ? r : 0), z: -r });
      include({ x: p.x + (item.orientation === 'horizontal' ? item.length : r), y: p.y + (item.orientation === 'vertical' ? item.length : r), z: r });
    } else if (item.profile.type === 'circle') {
      const r = item.profile.radius;
      include({ x: p.x - r, y: p.y - r, z: p.z });
      include({ x: p.x + r, y: p.y + r, z: p.z + item.thickness });
    } else {
      item.profile.points.forEach((v) => { include({ x: p.x + v.x, y: p.y + v.y, z: p.z }); include({ x: p.x + v.x, y: p.y + v.y, z: p.z + item.thickness }); });
    }
  }
  return { min, max };
}

export function buildModel3D(cadData = {}, options = {}) {
  const input = Array.isArray(cadData.objects) ? cadData.objects : [];
  if (input.length > MAX_OBJECTS) throw new Error(`A prévia aceita até ${MAX_OBJECTS} objetos por desenho.`);
  if (cadData.unidade && String(cadData.unidade).toLowerCase() !== 'mm') throw new Error('A prévia 3D exige medidas em milímetros.');
  const objects = input.filter((object) => object && object.visible !== false);
  const items = [], warnings = [], unsupported = [], consumed = new Set();
  const reject = (id, kind, error) => unsupported.push({ id, kind, reason: error.message || String(error) });
  const flangeGroups = new Map();
  objects.forEach((object, index) => {
    if (object.metadata?.componentType !== 'flange') return;
    const id = String(object.metadata.groupId || `flange-ungrouped-${index}`);
    if (!flangeGroups.has(id)) flangeGroups.set(id, []);
    flangeGroups.get(id).push(object);
    consumed.add(index);
  });
  for (const [id, members] of flangeGroups) {
    try { items.push(flangeDescriptor(members, id, options)); } catch (error) { reject(id, 'flange', error); }
  }
  if (cadData.shaftSheet && !objects.some((object) => object.type === 'shaft')) {
    try {
      const matched = matchShaftSheet(objects, cadData.shaftSheet);
      matched.forEach((index) => consumed.add(index));
      items.push(shaftDescriptor({ geometry: cadData.shaftSheet }, 'shaftSheet'));
    } catch (error) { reject('shaftSheet', 'shaft', error); }
  }
  objects.forEach((object, index) => {
    if (consumed.has(index)) return;
    const id = String(object.id || `object-${index}`);
    try {
      if (object.type === 'shaft') items.push(shaftDescriptor(object, id));
      else if (['rect', 'circle', 'polyline'].includes(object.type)) items.push(plateDescriptor(object, id, options));
      else if (!['line', 'centerline', 'dimension', 'text', 'image', 'arc'].includes(object.type)) reject(id, object.type, new Error('Tipo de entidade ainda não possui provedor 3D.'));
    } catch (error) { reject(id, object.type, error); }
  });
  if (unsupported.length && items.length) warnings.push(`${unsupported.length} entidade(s) sem volume 3D disponível; consulte os motivos abaixo.`);
  return { items, warnings, unsupported, bounds: boundsFor(items), units: 'mm' };
}
