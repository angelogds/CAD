const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const storagePaths = require('../../config/storage');

const PDF_DIR = path.join(storagePaths.PDF_DIR, 'desenho-tecnico');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

/**
 * Gera PDF técnico profissional para desenho CAD
 */
function generateTechnicalPdf(desenho, svgMarkup, options = {}) {
  const filename = `${String(desenho.codigo || 'desenho').replace(/[^a-zA-Z0-9_-]+/g, '-')}-rev${desenho.revisao || 0}-${Date.now()}.pdf`;
  const fullPath = path.join(PDF_DIR, filename);
  const relPath = `/pdfs/desenho-tecnico/${filename}`;

  // Usar formato landscape para desenhos técnicos
  const doc = new PDFDocument({ 
    size: 'A4', 
    layout: 'landscape',
    margin: 20
  });
  const stream = fs.createWriteStream(fullPath);
  doc.pipe(stream);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 20;

  // Desenhar moldura técnica
  drawTechnicalFrame(doc, pageWidth, pageHeight, margin);

  // Cabeçalho
  drawHeader(doc, desenho, margin);

  // Área de desenho
  const drawArea = {
    x: margin + 10,
    y: 70,
    width: pageWidth - margin * 2 - 20,
    height: pageHeight - 180
  };

  drawDrawingArea(doc, drawArea, desenho, svgMarkup, options);

  // Legenda/Carimbo
  drawLegend(doc, desenho, pageWidth, pageHeight, margin, options);

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ fullPath, relPath, filename }));
    stream.on('error', reject);
  });
}

function drawTechnicalFrame(doc, pageWidth, pageHeight, margin) {
  // Moldura externa
  doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2)
    .lineWidth(2)
    .stroke('#1a202c');

  // Moldura interna
  doc.rect(margin + 5, margin + 5, pageWidth - margin * 2 - 10, pageHeight - margin * 2 - 10)
    .lineWidth(0.5)
    .stroke('#64748b');
}

function drawHeader(doc, desenho, margin) {
  // Logo/Título
  doc.fontSize(16)
    .fillColor('#166534')
    .font('Helvetica-Bold')
    .text('CAMPO DO GADO', margin + 15, margin + 12);
  
  doc.fontSize(9)
    .fillColor('#64748b')
    .font('Helvetica')
    .text('Manutenção Industrial', margin + 15, margin + 30);

  // Código do desenho (grande, no centro)
  doc.fontSize(14)
    .fillColor('#0f172a')
    .font('Helvetica-Bold')
    .text(desenho.codigo || 'S/C', margin + 200, margin + 15, { 
      width: 400,
      align: 'center'
    });

  // Título do desenho
  doc.fontSize(10)
    .fillColor('#334155')
    .font('Helvetica')
    .text(desenho.titulo || 'Sem título', margin + 200, margin + 35, {
      width: 400,
      align: 'center'
    });

  // Linha separadora
  doc.moveTo(margin + 10, 60)
    .lineTo(doc.page.width - margin - 10, 60)
    .lineWidth(1)
    .stroke('#cbd5e1');
}

function drawDrawingArea(doc, area, desenho, svgMarkup, options) {
  // Fundo da área de desenho (simulando área de trabalho CAD)
  doc.rect(area.x, area.y, area.width, area.height)
    .fillAndStroke('#f8fafc', '#e2e8f0');

  // Grid pontilhado na área de desenho
  doc.save();
  doc.strokeColor('#e2e8f0').lineWidth(0.3);
  
  const gridStep = 20;
  for (let x = area.x + gridStep; x < area.x + area.width; x += gridStep) {
    doc.moveTo(x, area.y).lineTo(x, area.y + area.height).stroke();
  }
  for (let y = area.y + gridStep; y < area.y + area.height; y += gridStep) {
    doc.moveTo(area.x, y).lineTo(area.x + area.width, y).stroke();
  }
  doc.restore();

  // Processar objetos do CAD e renderizar no PDF
  const cadData = options.cadData || desenho.cad_data;
  if (cadData && Array.isArray(cadData.objects)) {
    const content = collectCadContent(cadData);
    renderCadObjectsToPdf(doc, content.objects, content.dimensions, area, cadData.layers || {});
  } else {
    // Fallback: mostrar informação textual
    doc.fontSize(11)
      .fillColor('#64748b')
      .text('Área de desenho técnico', area.x + 20, area.y + 20);
    
    if (svgMarkup) {
      // Extrair texto do SVG para exibição básica
      const textContent = svgMarkup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (textContent) {
        doc.fontSize(8)
          .fillColor('#334155')
          .text(textContent.slice(0, 1500), area.x + 20, area.y + 40, {
            width: area.width - 40,
            height: area.height - 60,
            ellipsis: true
          });
      }
    }
  }
}

function getEntityLayer(entity = {}, fallback = 'geometria_principal') {
  return entity.layer || entity.metadata?.layer || fallback;
}

function isEntityVisible(entity, layers = {}, fallbackLayer) {
  if (!entity || entity.visible === false) return false;
  const layer = getEntityLayer(entity, fallbackLayer);
  return layers[layer]?.visible !== false;
}

function collectCadContent(cadData = {}) {
  const rawObjects = Array.isArray(cadData.objects) ? cadData.objects : [];
  const dimensionMap = new Map();
  const addDimension = (dimension, index) => {
    if (!dimension || typeof dimension !== 'object') return;
    const geometry = dimension.geometry || dimension;
    const fallbackKey = `${index}:${geometry.mode || 'linear'}:${JSON.stringify(geometry)}`;
    dimensionMap.set(String(dimension.id || fallbackKey), dimension);
  };

  rawObjects.filter((object) => object?.type === 'dimension').forEach(addDimension);
  (Array.isArray(cadData.dimensions) ? cadData.dimensions : []).forEach(addDimension);

  return {
    objects: rawObjects.filter((object) => object?.type !== 'dimension'),
    dimensions: Array.from(dimensionMap.values()),
  };
}

function renderCadObjectsToPdf(doc, objects, dimensions, area, layers = {}) {
  const visibleObjects = objects.filter((object) => isEntityVisible(object, layers));
  const visibleDimensions = dimensions.filter((dimension) => isEntityVisible(dimension, layers, 'cotas'));

  // Calcular bounds dos objetos para escala
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const obj of [...visibleObjects, ...visibleDimensions]) {
    const bounds = getObjectBounds(obj);
    if (bounds) {
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }

  if (!isFinite(minX)) {
    // Sem objetos, usar valores padrão
    return;
  }

  const contentWidth = maxX - minX || 1;
  const contentHeight = maxY - minY || 1;
  
  const scaleX = (area.width - 60) / contentWidth;
  const scaleY = (area.height - 60) / contentHeight;
  const scale = Math.min(scaleX, scaleY, 1.5);

  const offsetX = area.x + 30 - minX * scale;
  const offsetY = area.y + 30 - minY * scale;

  // Cores para diferentes tipos
  const colors = {
    line: '#0f172a',
    centerline: '#0284c7',
    rect: '#0f172a',
    circle: '#0f172a',
    arc: '#0f172a',
    polyline: '#0f172a',
    shaft: '#0f172a',
    text: '#334155'
  };

  // Renderizar objetos
  for (const obj of visibleObjects) {
    const color = colors[obj.type] || '#0f172a';
    
    switch (obj.type) {
      case 'line':
        doc.moveTo(obj.x * scale + offsetX, obj.y * scale + offsetY)
          .lineTo(obj.x2 * scale + offsetX, obj.y2 * scale + offsetY)
          .lineWidth(1.2)
          .stroke(color);
        break;
      
      case 'centerline':
        doc.moveTo(obj.x * scale + offsetX, obj.y * scale + offsetY)
          .lineTo(obj.x2 * scale + offsetX, obj.y2 * scale + offsetY)
          .lineWidth(0.6)
          .dash(8, { space: 3 })
          .stroke('#0284c7')
          .undash();
        break;
      
      case 'rect':
        doc.rect(
          obj.x * scale + offsetX,
          obj.y * scale + offsetY,
          obj.width * scale,
          obj.height * scale
        )
          .lineWidth(1)
          .stroke(color);
        break;
      
      case 'circle':
        if (obj.style?.dasharray || obj.layer === 'construcao') doc.dash(6, { space: 4 });
        doc.circle(
          obj.x * scale + offsetX,
          obj.y * scale + offsetY,
          obj.radius * scale
        )
          .lineWidth(1)
          .stroke(color);
        doc.undash();
        break;

      case 'polyline': {
        const points = Array.isArray(obj.points) ? obj.points : [];
        if (points.length < 2) break;
        doc.moveTo(points[0].x * scale + offsetX, points[0].y * scale + offsetY);
        points.slice(1).forEach((point) => doc.lineTo(point.x * scale + offsetX, point.y * scale + offsetY));
        if (obj.closed) doc.closePath();
        doc.lineWidth(1).stroke(color);
        break;
      }

      case 'arc': {
        const geometry = obj.geometry || obj;
        const startAngle = Number(geometry.startAngle || 0);
        const endAngle = Number(geometry.endAngle || 0);
        const ccw = geometry.ccw !== false;
        let sweep = ccw ? endAngle - startAngle : startAngle - endAngle;
        while (sweep < 0) sweep += Math.PI * 2;
        while (sweep > Math.PI * 2) sweep -= Math.PI * 2;
        const steps = Math.max(12, Math.ceil(sweep * 24));
        for (let index = 0; index <= steps; index += 1) {
          const angle = startAngle + (ccw ? 1 : -1) * (sweep * index / steps);
          const x = (geometry.cx + Math.cos(angle) * geometry.radius) * scale + offsetX;
          const y = (geometry.cy + Math.sin(angle) * geometry.radius) * scale + offsetY;
          if (index === 0) doc.moveTo(x, y); else doc.lineTo(x, y);
        }
        doc.lineWidth(1).stroke(color);
        break;
      }
      
      case 'shaft':
        renderShaftToPdf(doc, obj, scale, offsetX, offsetY);
        break;
      
      case 'text':
        doc.fontSize(Math.max(8, (obj.fontSize || 12) * scale * 0.7))
          .fillColor(color)
          .text(obj.text || '', obj.x * scale + offsetX, obj.y * scale + offsetY);
        break;
    }
  }

  // Renderizar cotas
  for (const dim of visibleDimensions) {
    renderDimensionToPdf(doc, dim, scale, offsetX, offsetY);
  }
}

function renderShaftToPdf(doc, shaft, scale, offsetX, offsetY) {
  const geometry = shaft.geometry || shaft;
  const origin = geometry.origin || { x: shaft.startX || 0, y: shaft.axisY || 0 };
  const orientation = geometry.orientation === 'vertical' ? 'vertical' : 'horizontal';
  const segments = Array.isArray(geometry.segments) ? geometry.segments : [];
  let currentX = origin.x;
  let currentY = origin.y;

  // Desenhar contorno do eixo
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const halfDiam = seg.diameter / 2;
    const x = orientation === 'horizontal' ? currentX : currentX - halfDiam;
    const y = orientation === 'horizontal' ? currentY - halfDiam : currentY;
    const width = orientation === 'horizontal' ? seg.length : seg.diameter;
    const height = orientation === 'horizontal' ? seg.diameter : seg.length;
    doc.rect(x * scale + offsetX, y * scale + offsetY, width * scale, height * scale).lineWidth(1.2).stroke('#0f172a');
    if (orientation === 'horizontal') currentX += seg.length; else currentY += seg.length;
  }

  // Linha de centro
  if (shaft.showCenterline !== false && segments.length) {
    const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
    const start = orientation === 'horizontal' ? { x: origin.x - 15, y: origin.y } : { x: origin.x, y: origin.y - 15 };
    const end = orientation === 'horizontal' ? { x: origin.x + totalLength + 15, y: origin.y } : { x: origin.x, y: origin.y + totalLength + 15 };
    doc.moveTo(start.x * scale + offsetX, start.y * scale + offsetY)
      .lineTo(end.x * scale + offsetX, end.y * scale + offsetY)
      .lineWidth(0.5)
      .dash(10, { space: 3 })
      .stroke('#0284c7')
      .undash();
  }

  // Cotas do eixo
  if (shaft.showDimensions !== false && orientation === 'horizontal') {
    let segX = origin.x;
    for (const seg of segments) {
      // Cota de diâmetro
      const dimX = (segX + seg.length / 2) * scale + offsetX;
      doc.fontSize(7)
        .fillColor('#166534')
        .text(`Ø${seg.diameter}`, dimX + 8, (origin.y - 4) * scale + offsetY);

      // Cota de comprimento
      doc.fontSize(7)
        .fillColor('#166534')
        .text(`${seg.length}`, dimX - 10, (origin.y + seg.diameter / 2 + 15) * scale + offsetY);

      segX += seg.length;
    }
  }
}

function normalizeDimensionLabel(dim, geometry) {
  const label = geometry.label || dim.text || `${dim.value || ''}`;
  return String(label || '').replace(/[⌀⌾]/g, 'Ø');
}

function drawArrowHead(doc, x, y, directionX, directionY, color, size = 4.5) {
  const length = Math.hypot(directionX, directionY);
  if (length < 0.001) return;
  const ux = directionX / length;
  const uy = directionY / length;
  const nx = -uy;
  const ny = ux;
  const wing = size * 0.42;
  doc.save()
    .fillColor(color)
    .moveTo(x, y)
    .lineTo(x - ux * size + nx * wing, y - uy * size + ny * wing)
    .lineTo(x - ux * size - nx * wing, y - uy * size - ny * wing)
    .closePath()
    .fill()
    .restore();
}

function drawDimensionLabel(doc, label, x, y, color) {
  if (!label) return;
  doc.save().font('Helvetica').fontSize(8);
  const width = Math.max(18, doc.widthOfString(label) + 6);
  doc.rect(x - width / 2, y - 5, width, 11).fill('#f8fafc');
  doc.fillColor(color).text(label, x - width / 2, y - 3.5, {
    width,
    align: 'center',
    lineBreak: false,
  });
  doc.restore();
}

function renderDimensionToPdf(doc, dim, scale, offsetX, offsetY) {
  const geometry = dim.geometry || dim;
  const color = '#1d4ed8';
  const label = normalizeDimensionLabel(dim, geometry);
  if (geometry.mode === 'angular' && geometry.vertex) {
    const steps = 24;
    const radius = Math.max(1, Number(geometry.radius || 1));
    const startAngle = Number(geometry.startAngle || 0);
    const endAngle = Number(geometry.endAngle || 0);
    const vertexX = geometry.vertex.x * scale + offsetX;
    const vertexY = geometry.vertex.y * scale + offsetY;
    const startX = (geometry.vertex.x + Math.cos(startAngle) * radius) * scale + offsetX;
    const startY = (geometry.vertex.y + Math.sin(startAngle) * radius) * scale + offsetY;
    const endX = (geometry.vertex.x + Math.cos(endAngle) * radius) * scale + offsetX;
    const endY = (geometry.vertex.y + Math.sin(endAngle) * radius) * scale + offsetY;

    doc.moveTo(vertexX, vertexY).lineTo(startX, startY)
      .moveTo(vertexX, vertexY).lineTo(endX, endY)
      .lineWidth(0.45).stroke(color);
    doc.moveTo(
      startX,
      startY,
    );
    for (let index = 1; index <= steps; index += 1) {
      const angle = startAngle + (endAngle - startAngle) * index / steps;
      doc.lineTo((geometry.vertex.x + Math.cos(angle) * radius) * scale + offsetX, (geometry.vertex.y + Math.sin(angle) * radius) * scale + offsetY);
    }
    doc.lineWidth(0.65).stroke(color);
    const middleAngle = startAngle + (endAngle - startAngle) / 2;
    const textPoint = geometry.textPoint || {
      x: geometry.vertex.x + Math.cos(middleAngle) * (radius + 10 / Math.max(scale, 0.001)),
      y: geometry.vertex.y + Math.sin(middleAngle) * (radius + 10 / Math.max(scale, 0.001)),
    };
    drawDimensionLabel(doc, label, textPoint.x * scale + offsetX, textPoint.y * scale + offsetY, color);
    return;
  }
  if (!geometry.p1 || !geometry.p2) return;
  const x1 = geometry.p1.x * scale + offsetX;
  const y1 = geometry.p1.y * scale + offsetY;
  const x2 = geometry.p2.x * scale + offsetX;
  const y2 = geometry.p2.y * scale + offsetY;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const textPoint = geometry.textPoint || {
    x: (geometry.p1.x + geometry.p2.x) / 2,
    y: (geometry.p1.y + geometry.p2.y) / 2,
  };
  const textX = textPoint.x * scale + offsetX;
  const textY = textPoint.y * scale + offsetY;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const dimensionOffset = (textX - midX) * nx + (textY - midY) * ny;
  const dimensionStart = { x: x1 + nx * dimensionOffset, y: y1 + ny * dimensionOffset };
  const dimensionEnd = { x: x2 + nx * dimensionOffset, y: y2 + ny * dimensionOffset };

  const drawExtension = (origin, end) => {
    const ex = end.x - origin.x;
    const ey = end.y - origin.y;
    const extensionLength = Math.hypot(ex, ey);
    if (extensionLength < 0.001) return;
    const vx = ex / extensionLength;
    const vy = ey / extensionLength;
    doc.moveTo(origin.x + vx * 1.5, origin.y + vy * 1.5)
      .lineTo(end.x + vx * 3, end.y + vy * 3);
  };

  drawExtension({ x: x1, y: y1 }, dimensionStart);
  drawExtension({ x: x2, y: y2 }, dimensionEnd);
  doc.moveTo(dimensionStart.x, dimensionStart.y)
    .lineTo(dimensionEnd.x, dimensionEnd.y)
    .lineWidth(0.65)
    .stroke(color);
  drawArrowHead(doc, dimensionStart.x, dimensionStart.y, ux, uy, color);
  drawArrowHead(doc, dimensionEnd.x, dimensionEnd.y, -ux, -uy, color);
  drawDimensionLabel(doc, label, textX, textY, color);
}

function getDimensionBounds(dim) {
  const geometry = dim.geometry || dim;
  if (geometry.mode === 'angular' && geometry.vertex) {
    const radius = Math.max(0, Number(geometry.radius || 0));
    const points = [
      { x: geometry.vertex.x - radius, y: geometry.vertex.y - radius },
      { x: geometry.vertex.x + radius, y: geometry.vertex.y + radius },
      geometry.textPoint,
    ].filter(Boolean);
    const minX = Math.min(...points.map((point) => Number(point.x)));
    const maxX = Math.max(...points.map((point) => Number(point.x)));
    const minY = Math.min(...points.map((point) => Number(point.y)));
    const maxY = Math.max(...points.map((point) => Number(point.y)));
    return { minX: minX - 8, minY: minY - 8, maxX: maxX + 8, maxY: maxY + 8 };
  }

  const points = [geometry.p1, geometry.p2, geometry.textPoint].filter(Boolean);
  if (!points.length) return null;
  const minX = Math.min(...points.map((point) => Number(point.x)));
  const maxX = Math.max(...points.map((point) => Number(point.x)));
  const minY = Math.min(...points.map((point) => Number(point.y)));
  const maxY = Math.max(...points.map((point) => Number(point.y)));
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX: minX - 8, minY: minY - 8, maxX: maxX + 8, maxY: maxY + 8 };
}

function getObjectBounds(obj) {
  let minX, minY, maxX, maxY;

  switch (obj.type) {
    case 'dimension':
      return getDimensionBounds(obj);
    case 'line':
    case 'centerline':
      minX = Math.min(obj.x, obj.x2);
      maxX = Math.max(obj.x, obj.x2);
      minY = Math.min(obj.y, obj.y2);
      maxY = Math.max(obj.y, obj.y2);
      break;
    case 'rect':
      minX = obj.x;
      maxX = obj.x + obj.width;
      minY = obj.y;
      maxY = obj.y + obj.height;
      break;
    case 'circle':
      minX = obj.x - obj.radius;
      maxX = obj.x + obj.radius;
      minY = obj.y - obj.radius;
      maxY = obj.y + obj.radius;
      break;
    case 'polyline': {
      const points = Array.isArray(obj.points) ? obj.points : [];
      if (!points.length) return null;
      minX = Math.min(...points.map((point) => point.x));
      maxX = Math.max(...points.map((point) => point.x));
      minY = Math.min(...points.map((point) => point.y));
      maxY = Math.max(...points.map((point) => point.y));
      break;
    }
    case 'arc': {
      const geometry = obj.geometry || obj;
      minX = geometry.cx - geometry.radius;
      maxX = geometry.cx + geometry.radius;
      minY = geometry.cy - geometry.radius;
      maxY = geometry.cy + geometry.radius;
      break;
    }
    case 'shaft':
      {
        const geometry = obj.geometry || obj;
        const segments = geometry.segments || [];
        const origin = geometry.origin || { x: obj.startX || 0, y: obj.axisY || 0 };
        const totalLen = segments.reduce((sum, s) => sum + (s.length || 0), 0);
        const maxDiam = Math.max(...segments.map(s => s.diameter || 0), 0);
        if (geometry.orientation === 'vertical') {
          minX = origin.x - maxDiam / 2; maxX = origin.x + maxDiam / 2; minY = origin.y; maxY = origin.y + totalLen;
        } else {
          minX = origin.x; maxX = origin.x + totalLen; minY = origin.y - maxDiam / 2; maxY = origin.y + maxDiam / 2;
        }
      }
      break;
    case 'text':
      minX = obj.x;
      maxX = obj.x + 100;
      minY = obj.y - 20;
      maxY = obj.y;
      break;
    default:
      return null;
  }

  return { minX, minY, maxX, maxY };
}

function drawLegend(doc, desenho, pageWidth, pageHeight, margin, options) {
  const legendHeight = 80;
  const legendY = pageHeight - margin - legendHeight - 5;
  const legendWidth = pageWidth - margin * 2 - 10;

  // Fundo da legenda
  doc.rect(margin + 5, legendY, legendWidth, legendHeight)
    .fillAndStroke('#ffffff', '#1a202c');

  // Divisões verticais da legenda
  const col1 = margin + 10;
  const col2 = margin + 200;
  const col3 = margin + 400;
  const col4 = pageWidth - margin - 180;

  // Linhas verticais
  doc.moveTo(col2 - 5, legendY).lineTo(col2 - 5, legendY + legendHeight).stroke('#e2e8f0');
  doc.moveTo(col3 - 5, legendY).lineTo(col3 - 5, legendY + legendHeight).stroke('#e2e8f0');
  doc.moveTo(col4 - 5, legendY).lineTo(col4 - 5, legendY + legendHeight).stroke('#e2e8f0');

  // Coluna 1: Empresa
  doc.fontSize(10)
    .fillColor('#166534')
    .font('Helvetica-Bold')
    .text('CAMPO DO GADO', col1, legendY + 10);
  doc.fontSize(7)
    .fillColor('#64748b')
    .font('Helvetica')
    .text('Manutenção Industrial', col1, legendY + 25);
  doc.text('Sistema CAD 2D', col1, legendY + 35);
  doc.text('Desenho Técnico', col1, legendY + 45);

  // Coluna 2: Informações do desenho
  doc.fontSize(7)
    .fillColor('#334155')
    .text(`Código: ${desenho.codigo || '-'}`, col2, legendY + 10);
  doc.text(`Título: ${desenho.titulo || '-'}`, col2, legendY + 22);
  doc.text(`Revisão: ${desenho.revisao || 0}`, col2, legendY + 34);
  doc.text(`Categoria: ${desenho.categoria || '-'}`, col2, legendY + 46);
  doc.text(`Material: ${desenho.material || '-'}`, col2, legendY + 58);

  // Coluna 3: Equipamento e responsável
  doc.text(`Equipamento: ${desenho.equipamento_nome || '-'}`, col3, legendY + 10);
  doc.text(`Criado por: ${desenho.criado_por_nome || '-'}`, col3, legendY + 22);
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, col3, legendY + 34);
  doc.text(`Hora: ${new Date().toLocaleTimeString('pt-BR')}`, col3, legendY + 46);
  
  const content = collectCadContent(options.cadData || {});
  const objCount = content.objects.length;
  const dimCount = content.dimensions.length;
  doc.text(`Objetos: ${objCount} | Cotas: ${dimCount}`, col3, legendY + 58);

  // Coluna 4: Escala e observações
  doc.fontSize(9)
    .fillColor('#0f172a')
    .font('Helvetica-Bold')
    .text('ESCALA', col4, legendY + 10);
  doc.fontSize(14)
    .text('1:1', col4, legendY + 25);
  doc.fontSize(7)
    .fillColor('#64748b')
    .font('Helvetica')
    .text('Unidade: mm', col4, legendY + 45);
  doc.text('Formato: A4 Paisagem', col4, legendY + 57);
}

module.exports = { generateTechnicalPdf };
