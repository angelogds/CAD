const numberValue = (value, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function normalizeFlangeParameters(input = {}) {
  const parameters = {
    outerDiameter: numberValue(input.outerDiameter, 200),
    boreDiameter: numberValue(input.boreDiameter, 60),
    pitchDiameter: numberValue(input.pitchDiameter, 150),
    holeDiameter: numberValue(input.holeDiameter, 18),
    holeCount: Math.trunc(numberValue(input.holeCount, 8)),
    rotation: numberValue(input.rotation, 0),
  };

  if (parameters.outerDiameter <= 0) throw new Error('O diâmetro externo deve ser maior que zero.');
  if (parameters.boreDiameter < 0 || parameters.boreDiameter >= parameters.outerDiameter) throw new Error('O furo central deve ser menor que o diâmetro externo.');
  if (parameters.pitchDiameter <= 0 || parameters.pitchDiameter >= parameters.outerDiameter) throw new Error('O círculo de furação deve ficar dentro do flange.');
  if (parameters.holeDiameter <= 0) throw new Error('O diâmetro dos furos deve ser maior que zero.');
  if (parameters.holeCount < 2 || parameters.holeCount > 72) throw new Error('Informe de 2 a 72 furos.');

  const outerRadius = parameters.outerDiameter / 2;
  const boreRadius = parameters.boreDiameter / 2;
  const pitchRadius = parameters.pitchDiameter / 2;
  const holeRadius = parameters.holeDiameter / 2;
  if (pitchRadius + holeRadius >= outerRadius) throw new Error('Os furos ultrapassam o contorno externo.');
  if (pitchRadius - holeRadius <= boreRadius) throw new Error('Os furos invadem o furo central.');

  return parameters;
}

export function createFlangeGeometry(input = {}, center = { x: 0, y: 0 }, options = {}) {
  const parameters = normalizeFlangeParameters(input);
  const cx = numberValue(center.x);
  const cy = numberValue(center.y);
  const groupId = options.groupId || `flange-${Date.now()}`;
  const metadata = (role, layer) => ({
    layer,
    groupId,
    componentType: 'flange',
    role,
    flangeParameters: { ...parameters },
  });
  const objects = [];

  objects.push({
    type: 'circle',
    geometry: { cx, cy, radius: parameters.outerDiameter / 2 },
    metadata: metadata('contorno_externo', 'contorno'),
  });

  if (parameters.boreDiameter > 0) {
    objects.push({
      type: 'circle',
      geometry: { cx, cy, radius: parameters.boreDiameter / 2 },
      metadata: metadata('furo_central', 'furacao'),
    });
  }

  objects.push({
    type: 'circle',
    geometry: { cx, cy, radius: parameters.pitchDiameter / 2 },
    style: { dasharray: '8 5', opacity: 0.62 },
    metadata: metadata('circulo_furacao', 'construcao'),
  });

  const rotation = parameters.rotation * Math.PI / 180;
  for (let index = 0; index < parameters.holeCount; index += 1) {
    const angle = rotation + (index * Math.PI * 2 / parameters.holeCount);
    objects.push({
      type: 'circle',
      geometry: {
        cx: cx + Math.cos(angle) * parameters.pitchDiameter / 2,
        cy: cy + Math.sin(angle) * parameters.pitchDiameter / 2,
        radius: parameters.holeDiameter / 2,
      },
      metadata: metadata(`furo_${index + 1}`, 'furos'),
    });
  }

  const centerlineRadius = parameters.outerDiameter * 0.58;
  objects.push({
    type: 'centerline',
    geometry: { x1: cx - centerlineRadius, y1: cy, x2: cx + centerlineRadius, y2: cy },
    metadata: metadata('linha_centro_horizontal', 'linhas_de_centro'),
  });
  objects.push({
    type: 'centerline',
    geometry: { x1: cx, y1: cy - centerlineRadius, x2: cx, y2: cy + centerlineRadius },
    metadata: metadata('linha_centro_vertical', 'linhas_de_centro'),
  });

  return { parameters, center: { x: cx, y: cy }, groupId, objects };
}
