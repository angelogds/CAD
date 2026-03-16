function generateDrawingFrame(w = 900, h = 560) {
  return `<rect x="20" y="20" width="${w - 40}" height="${h - 40}" fill="#fff" stroke="#1f2937" stroke-width="2" />`;
}

function generateGrid(w = 900, h = 560, step = 25) {
  const lines = [];
  for (let x = 20; x <= w - 20; x += step) lines.push(`<line x1="${x}" y1="20" x2="${x}" y2="${h - 20}" stroke="#eef2f7"/>`);
  for (let y = 20; y <= h - 20; y += step) lines.push(`<line x1="20" y1="${y}" x2="${w - 20}" y2="${y}" stroke="#eef2f7"/>`);
  return lines.join('');
}

function generateTitleBlock(meta, w = 900, h = 560) {
  return `<rect x="${w - 300}" y="${h - 120}" width="260" height="80" fill="#f8fafc" stroke="#334155"/>
  <text x="${w - 290}" y="${h - 95}" font-size="12" fill="#0f172a">${meta.codigo || '-'} | Rev ${meta.revisao || 0}</text>
  <text x="${w - 290}" y="${h - 75}" font-size="12" fill="#0f172a">${meta.titulo || '-'}</text>
  <text x="${w - 290}" y="${h - 55}" font-size="11" fill="#334155">${meta.categoria || ''} / ${meta.subtipo || ''}</text>`;
}

function generateLinearDimension(x1, y1, x2, y2, text) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#166534" stroke-dasharray="4 3"/>
  <text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle" font-size="12" fill="#14532d">${text}</text>`;
}

function generateChainDimension(x1, y1, x2, y2, x3, y3, text) {
  return `${generateLinearDimension(x1, y1, x2, y2, text)}${generateLinearDimension(x2, y2, x3, y3, '')}`;
}
function generateBaselineDimension(x1, y1, x2, y2, text) { return generateLinearDimension(x1, y1, x2, y2, `${text} (BL)`); }
function generateAngularDimension(x1, y1, x2, y2, angle, text) {
  return `<path d="M ${x1} ${y1} A 35 35 0 0 1 ${x2} ${y2}" fill="none" stroke="#166534"/><text x="${x2 + 8}" y="${y2 - 8}" fill="#166534" font-size="12">${text || `${angle || 0}°`}</text>`;
}
function generateRadiusDimension(cx, cy, r, text) { return `<line x1="${cx}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="#166534"/><text x="${cx + r + 8}" y="${cy - 4}" fill="#166534" font-size="12">${text || `R${r}`}</text>`; }
function generateDiameterDimension(cx, cy, d, text) { return `<line x1="${cx - d / 2}" y1="${cy}" x2="${cx + d / 2}" y2="${cy}" stroke="#166534"/><text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="#166534" font-size="12">${text || `Ø${d}`}</text>`; }
function generateCenterToCenterDimension(x1, y1, x2, y2, text) { return `<circle cx="${x1}" cy="${y1}" r="3" fill="#166534"/><circle cx="${x2}" cy="${y2}" r="3" fill="#166534"/>${generateLinearDimension(x1, y1, x2, y2, text)}`; }
function generatePatternDimension(x1, y1, x2, y2, count, text) { return `${generateLinearDimension(x1, y1, x2, y2, text || `${count}x`)}<text x="${x2 + 8}" y="${y2 + 10}" fill="#166534" font-size="11">Padrão ${count}x</text>`; }

function generateCenterLine(x1, y1, x2, y2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0284c7" stroke-dasharray="10 5 2 5"/>`;
}

function generateTextLabel(x, y, text) {
  return `<text x="${x}" y="${y}" font-size="12" fill="#0f172a">${text}</text>`;
}

function generateCircle(cx, cy, r) { return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#0f172a" stroke-width="2" />`; }
function generateRect(x, y, w, h) { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#0f172a" stroke-width="2" />`; }

function generateSteppedShaft(params = {}) {
  const a = params.assento1 || 60;
  const b = params.assento2 || 45;
  const c = params.encosto || 80;
  return `<path d="M140 220 h${a} v-30 h${b} v30 h${c} v50 h-${c} v30 h-${b} v-30 h-${a} z" fill="none" stroke="#111827" stroke-width="2"/>`;
}

function generateFlange(params = {}) {
  const de = Math.max(50, params.diametroExterno || 180);
  const di = Math.max(20, params.diametroInterno || 90);
  const cx = 290; const cy = 240;
  return `${generateCircle(cx, cy, de / 2)}${generateCircle(cx, cy, di / 2)}${generateCenterLine(cx - de / 2 - 20, cy, cx + de / 2 + 20, cy)}${generateCenterLine(cx, cy - de / 2 - 20, cx, cy + de / 2 + 20)}`;
}

function generatePlate(params = {}) {
  return generateRect(160, 180, params.largura || 230, params.altura || 130);
}

function generateBracket(params = {}) {
  const b = params.base || 220;
  const h = params.altura || 140;
  return `<polygon points="180,300 ${180 + b},300 180,${300 - h}" fill="none" stroke="#0f172a" stroke-width="2"/>`;
}

function generateTransitionShape(params = {}) {
  const q = params.ladoQuadrado || 160;
  const d = params.diametro || 120;
  return `<rect x="150" y="130" width="${q}" height="${q}" fill="none" stroke="#0f172a" stroke-width="2"/>
  <path d="M150 ${130 + q} C 210 340, 260 340, 320 ${130 + q}" fill="none" stroke="#0f172a" stroke-width="2"/>
  ${generateCircle(235, 360, d / 2)}`;
}

function baseShapeBySubtype(subtipo, params) {
  if (subtipo.includes('EIXO')) return generateSteppedShaft(params);
  if (subtipo.includes('FLANGE')) return generateFlange(params);
  if (subtipo.includes('MAO_FRANCESA') || subtipo.includes('SUPORTE')) return generateBracket(params);
  if (subtipo.includes('TRANSICAO') || subtipo.includes('QUADRADO_REDONDO') || subtipo.includes('REDUCAO')) return generateTransitionShape(params);
  return generatePlate(params);
}

function renderCota(cota = {}) {
  const label = cota.texto || `${cota.valor || ''}${cota.unidade || 'mm'}`;
  if (cota.tipo_cota === 'cadeia') return generateChainDimension(cota.x1, cota.y1, cota.x2, cota.y2, cota.x3 || cota.x2 + 40, cota.y3 || cota.y2, label);
  if (cota.tipo_cota === 'baseline') return generateBaselineDimension(cota.x1, cota.y1, cota.x2, cota.y2, label);
  if (cota.tipo_cota === 'angular') return generateAngularDimension(cota.x1, cota.y1, cota.x2, cota.y2, cota.angulo_ref, label);
  if (cota.tipo_cota === 'raio') return generateRadiusDimension(cota.x1, cota.y1, cota.valor || 30, label);
  if (cota.tipo_cota === 'diametro') return generateDiameterDimension(cota.x1, cota.y1, cota.valor || 40, label);
  if (cota.tipo_cota === 'entre_centros') return generateCenterToCenterDimension(cota.x1, cota.y1, cota.x2, cota.y2, label);
  if (cota.tipo_cota === 'padrao_furacao') return generatePatternDimension(cota.x1, cota.y1, cota.x2, cota.y2, cota.valor || 1, label);
  return generateLinearDimension(cota.x1, cota.y1, cota.x2, cota.y2, label);
}

function renderBlockInstance(instancia = {}) {
  const def = JSON.parse(instancia.definicao_json || '{}');
  const params = { ...(def.params || {}), ...(JSON.parse(instancia.props_override_json || '{}')) };
  const shape = baseShapeBySubtype(String(instancia.subtipo || ''), params);
  return `<g transform="translate(${instancia.x || 0} ${instancia.y || 0}) scale(${instancia.escala || 1}) rotate(${instancia.rotacao || 0})" opacity="0.88">${shape}</g>`;
}

function renderTechnicalDrawing(data = {}) {
  const params = data.params || {};
  const subtipo = String(data.subtipo || '').toUpperCase();
  const layers = (data.camadas || []).filter((l) => Number(l.visivel) !== 0);
  const order = [...layers].sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
  const byLayer = new Map(order.map((l) => [l.slug, []]));
  byLayer.set('geometria_principal', [baseShapeBySubtype(subtipo, params)]);
  byLayer.set('linhas_de_centro', [generateCenterLine(60, 280, 740, 280), generateCenterLine(400, 110, 400, 420)]);
  byLayer.set('textos', [generateTextLabel(60, 60, 'VISTA FRONTAL')]);

  (data.blocos || []).forEach((inst) => {
    if (!byLayer.has(inst.camada)) byLayer.set(inst.camada, []);
    byLayer.get(inst.camada).push(renderBlockInstance(inst));
  });

  (data.cotas || []).forEach((cota) => {
    if (!byLayer.has(cota.camada || 'cotas')) byLayer.set(cota.camada || 'cotas', []);
    byLayer.get(cota.camada || 'cotas').push(renderCota(cota));
  });

  if (!byLayer.get('cotas')?.length) {
    byLayer.set('cotas', [generateLinearDimension(140, 340, 420, 340, `L=${params.comprimentoTotal || params.comprimento || params.base || 0}mm`)]);
  }

  const content = [];
  order.forEach((layer) => {
    if (!byLayer.has(layer.slug)) return;
    content.push(`<g data-layer="${layer.slug}">${(byLayer.get(layer.slug) || []).join('')}</g>`);
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560" width="100%" height="100%">
    ${generateGrid()}
    ${generateDrawingFrame()}
    ${content.join('')}
    ${generateTitleBlock(data)}
  </svg>`;
}


function renderCadDrawing(cad = {}) {
  const objects = Array.isArray(cad.objects) ? cad.objects : [];
  const layers = cad.layers || {};
  const byLayer = {};
  for (const obj of objects) {
    const layer = obj.layer || 'geometria_principal';
    byLayer[layer] = byLayer[layer] || [];
    byLayer[layer].push(obj);
  }

  const objectSvg = Object.entries(byLayer).map(([layer, layerObjects]) => {
    const layerCfg = layers[layer] || {};
    if (layerCfg.visible === false) return '';
    const color = layerCfg.color || '#0f172a';
    return `<g data-layer="${layer}" stroke="${color}" fill="none">${layerObjects.map((obj) => {
      if (obj.type === 'line') return `<line x1="${obj.x}" y1="${obj.y}" x2="${obj.x2}" y2="${obj.y2}" stroke-width="${obj.strokeWidth || 2}" />`;
      if (obj.type === 'rect') return `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" transform="rotate(${obj.rotation || 0} ${obj.x || 0} ${obj.y || 0})" stroke-width="${obj.strokeWidth || 2}" />`;
      if (obj.type === 'circle' || obj.type === 'hole') return `<circle cx="${obj.x}" cy="${obj.y}" r="${obj.radius}" stroke-width="${obj.strokeWidth || 2}" />`;
      if (obj.type === 'centerline') return `<line x1="${obj.x}" y1="${obj.y}" x2="${obj.x2}" y2="${obj.y2}" stroke-dasharray="8 4" stroke-width="1.5" />`;
      if (obj.type === 'text' || obj.type === 'note') return `<text x="${obj.x}" y="${obj.y}" fill="${color}" font-size="${obj.fontSize || 12}">${obj.text || ''}</text>`;
      if (obj.type === 'polyline' && Array.isArray(obj.points)) return `<polyline points="${obj.points.map((pt) => `${pt.x},${pt.y}`).join(' ')}" stroke-width="${obj.strokeWidth || 2}" />`;
      if (obj.type === 'arc') return `<path d="M ${obj.x} ${obj.y} A ${obj.radius || 20} ${obj.radius || 20} 0 0 1 ${obj.x2 || obj.x} ${obj.y2 || obj.y}" stroke-width="${obj.strokeWidth || 2}" />`;
      return '';
    }).join('')}</g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760" width="100%" height="100%">
    ${generateGrid(1200, 760, cad.gridStep || 25)}
    ${generateDrawingFrame(1200, 760)}
    ${objectSvg}
    ${generateTitleBlock({ codigo: cad.codigo || 'CAD', titulo: cad.titulo || 'Desenho CAD', revisao: cad.revisao || 0 }, 1200, 760)}
  </svg>`;
}

module.exports = {
  generateDrawingFrame,
  generateGrid,
  generateTitleBlock,
  generateLinearDimension,
  generateChainDimension,
  generateBaselineDimension,
  generateAngularDimension,
  generateRadiusDimension,
  generateDiameterDimension,
  generateCenterToCenterDimension,
  generatePatternDimension,
  generateCenterLine,
  generateTextLabel,
  generateCircle,
  generateRect,
  generateSteppedShaft,
  generateFlange,
  generatePlate,
  generateBracket,
  generateTransitionShape,
  renderTechnicalDrawing,
  renderCadDrawing,
};
