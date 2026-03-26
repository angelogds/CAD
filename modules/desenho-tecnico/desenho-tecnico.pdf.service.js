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
    renderCadObjectsToPdf(doc, cadData.objects, cadData.dimensions || [], area);
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

function renderCadObjectsToPdf(doc, objects, dimensions, area) {
  // Calcular bounds dos objetos para escala
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const obj of objects) {
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
    shaft: '#0f172a',
    text: '#334155'
  };

  // Renderizar objetos
  for (const obj of objects) {
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
        doc.circle(
          obj.x * scale + offsetX,
          obj.y * scale + offsetY,
          obj.radius * scale
        )
          .lineWidth(1)
          .stroke(color);
        break;
      
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
  for (const dim of dimensions) {
    renderDimensionToPdf(doc, dim, scale, offsetX, offsetY);
  }
}

function renderShaftToPdf(doc, shaft, scale, offsetX, offsetY) {
  let currentX = shaft.startX;
  const axisY = shaft.axisY;

  // Desenhar contorno do eixo
  for (let i = 0; i < shaft.segments.length; i++) {
    const seg = shaft.segments[i];
    const halfDiam = seg.diameter / 2;

    // Contorno superior
    doc.moveTo(currentX * scale + offsetX, (axisY - halfDiam) * scale + offsetY)
      .lineTo((currentX + seg.length) * scale + offsetX, (axisY - halfDiam) * scale + offsetY)
      .lineWidth(1.2)
      .stroke('#0f172a');

    // Contorno inferior
    doc.moveTo(currentX * scale + offsetX, (axisY + halfDiam) * scale + offsetY)
      .lineTo((currentX + seg.length) * scale + offsetX, (axisY + halfDiam) * scale + offsetY)
      .lineWidth(1.2)
      .stroke('#0f172a');

    // Ombro inicial
    if (i === 0) {
      doc.moveTo(currentX * scale + offsetX, (axisY - halfDiam) * scale + offsetY)
        .lineTo(currentX * scale + offsetX, (axisY + halfDiam) * scale + offsetY)
        .stroke('#0f172a');
    }

    currentX += seg.length;

    // Ombros entre segmentos
    if (i < shaft.segments.length - 1) {
      const nextHalfDiam = shaft.segments[i + 1].diameter / 2;
      if (halfDiam !== nextHalfDiam) {
        // Conexão vertical superior
        doc.moveTo(currentX * scale + offsetX, (axisY - halfDiam) * scale + offsetY)
          .lineTo(currentX * scale + offsetX, (axisY - nextHalfDiam) * scale + offsetY)
          .stroke('#0f172a');
        // Conexão vertical inferior
        doc.moveTo(currentX * scale + offsetX, (axisY + halfDiam) * scale + offsetY)
          .lineTo(currentX * scale + offsetX, (axisY + nextHalfDiam) * scale + offsetY)
          .stroke('#0f172a');
      }
    } else {
      // Ombro final
      doc.moveTo(currentX * scale + offsetX, (axisY - halfDiam) * scale + offsetY)
        .lineTo(currentX * scale + offsetX, (axisY + halfDiam) * scale + offsetY)
        .stroke('#0f172a');
    }
  }

  // Linha de centro
  if (shaft.showCenterline !== false) {
    const totalLength = shaft.segments.reduce((sum, s) => sum + s.length, 0);
    doc.moveTo((shaft.startX - 15) * scale + offsetX, axisY * scale + offsetY)
      .lineTo((shaft.startX + totalLength + 15) * scale + offsetX, axisY * scale + offsetY)
      .lineWidth(0.5)
      .dash(10, { space: 3 })
      .stroke('#0284c7')
      .undash();
  }

  // Cotas do eixo
  if (shaft.showDimensions !== false) {
    let segX = shaft.startX;
    for (const seg of shaft.segments) {
      // Cota de diâmetro
      const dimX = (segX + seg.length / 2) * scale + offsetX;
      doc.fontSize(7)
        .fillColor('#166534')
        .text(`Ø${seg.diameter}`, dimX + 8, (axisY - 4) * scale + offsetY);

      // Cota de comprimento
      doc.fontSize(7)
        .fillColor('#166534')
        .text(`${seg.length}`, dimX - 10, (axisY + seg.diameter / 2 + 15) * scale + offsetY);

      segX += seg.length;
    }
  }
}

function renderDimensionToPdf(doc, dim, scale, offsetX, offsetY) {
  const x1 = dim.x1 * scale + offsetX;
  const y1 = dim.y1 * scale + offsetY;
  const x2 = dim.x2 * scale + offsetX;
  const y2 = dim.y2 * scale + offsetY;

  // Linhas de extensão e cota
  doc.moveTo(x1, y1).lineTo(x2, y2)
    .lineWidth(0.5)
    .stroke('#059669');

  // Texto da cota
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  
  doc.fontSize(8)
    .fillColor('#059669')
    .text(dim.text || `${dim.value}`, midX - 15, midY - 12);
}

function getObjectBounds(obj) {
  let minX, minY, maxX, maxY;

  switch (obj.type) {
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
    case 'shaft':
      const totalLen = (obj.segments || []).reduce((sum, s) => sum + (s.length || 0), 0);
      const maxDiam = Math.max(...(obj.segments || []).map(s => s.diameter || 0), 0);
      minX = obj.startX || 0;
      maxX = (obj.startX || 0) + totalLen;
      minY = (obj.axisY || 0) - maxDiam / 2;
      maxY = (obj.axisY || 0) + maxDiam / 2;
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
  
  const objCount = options.cadData?.objects?.length || 0;
  const dimCount = options.cadData?.dimensions?.length || 0;
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
