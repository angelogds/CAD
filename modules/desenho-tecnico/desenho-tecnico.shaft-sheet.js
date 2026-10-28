'use strict';

/**
 * Prancha padrao Campo do Gado para um unico eixo parametrico.
 * As vistas usam exclusivamente as medidas persistidas no CAD; nao inferem furações.
 * 2D e secao sao geometricamente geradas. A isometrica e uma representacao esquematica.
 */
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');

const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const MM = 72 / 25.4;

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickShaft(cadData = {}) {
  const objects = Array.isArray(cadData.objects) ? cadData.objects : [];
  const shafts = objects.filter((obj) => obj && obj.type === 'shaft' && obj.visible !== false);
  // Nao interceptar desenhos compostos: manter o exportador CAD legado.
  const otherGeometry = objects.filter((obj) =>
    obj && obj.visible !== false && !['shaft', 'dimension', 'centerline', 'text'].includes(obj.type));
  if (shafts.length !== 1 || otherGeometry.length) return null;
  const geo = shafts[0].geometry || shafts[0];
  const segments = (Array.isArray(geo.segments) ? geo.segments : [])
    .map((s) => ({ length: positive(s.length), diameter: positive(s.diameter) }));
  if (!segments.length || segments.some((s) => !s.length || !s.diameter)) return null;
  return shafts[0];
}

function buildModel(shaft) {
  const geo = shaft.geometry || shaft;
  const segments = geo.segments.map((s) => ({
    length: positive(s.length), diameter: positive(s.diameter),
  }));
  if (!segments.length || segments.some((s) => !s.length || !s.diameter)) {
    throw new Error('Eixo sem trechos validos.');
  }
  const total = segments.reduce((sum, s) => sum + s.length, 0);
  const boreInput = geo.bore && typeof geo.bore === 'object' ? geo.bore : {};
  const boreDia = positive(boreInput.diameter);
  const boreDepth = positive(boreInput.depth);
  if (Boolean(boreDia) !== Boolean(boreDepth)) {
    throw new Error('Informe o diametro e a profundidade do alojamento juntos.');
  }
  if (boreDia && (boreDia >= segments[0].diameter || boreDepth > segments[0].length)) {
    throw new Error('Alojamento deve caber inteiramente no primeiro trecho do eixo.');
  }
  const bore = boreDia ? { diameter: boreDia, depth: boreDepth, from: 'start' } : null;
  const holesInput = Array.isArray(geo.crossHoles) ? geo.crossHoles : [];
  const crossHoles = holesInput.map((hole, index) => {
    const position = positive(hole.distance);
    const diameter = positive(hole.diameter);
    if (!position || !diameter || position >= segments[0].length ||
        position - diameter / 2 <= 0 ||
        position + diameter / 2 >= segments[0].length ||
        (bore && position + diameter / 2 > bore.depth)) {
      throw new Error(`Furo transversal ${index + 1}: reveja posicao, diametro e alojamento.`);
    }
    return { distance: position, diameter };
  });
  return { segments, total, bore, crossHoles, maxDiameter: Math.max(...segments.map(s => s.diameter)) };
}

function line(doc, x1, y1, x2, y2, width = .8, color = '#1f2937') {
  doc.lineWidth(width).strokeColor(color).moveTo(x1, y1).lineTo(x2, y2).stroke();
}

function text(doc, value, x, y, size = 9, opts = {}) {
  doc.fillColor('#111827').font(opts.bold ? BOLD : FONT).fontSize(size);
  doc.text(String(value), x, y, { lineBreak: false, ...opts });
}

function number(v) {
  return Number(v.toFixed(2)).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function arrow(doc, x, y, direction) {
  const d = direction > 0 ? 1 : -1;
  doc.fillColor('#111827').moveTo(x, y).lineTo(x + d * 6, y - 2.4).lineTo(x + d * 6, y + 2.4).closePath().fill();
}

function dimHorizontal(doc, x1, x2, lineY, witnessY, label) {
  line(doc, x1, witnessY, x1, lineY - 5, .5);
  line(doc, x2, witnessY, x2, lineY - 5, .5);
  line(doc, x1, lineY, x2, lineY, .65);
  arrow(doc, x1, lineY, 1);
  arrow(doc, x2, lineY, -1);
  text(doc, label, (x1 + x2) / 2 - 33, lineY - 21, 11, { width: 66, align: 'center' });
}

function dimVertical(doc, y1, y2, xLine, xWitness, label) {
  line(doc, xWitness, y1, xLine - 6, y1, .5);
  line(doc, xWitness, y2, xLine - 6, y2, .5);
  line(doc, xLine, y1, xLine, y2, .65);
  doc.save().translate(xLine - 15, (y1 + y2) / 2).rotate(-90);
  text(doc, label, -35, 0, 10, { width: 70, align: 'center' });
  doc.restore();
}

function dashed(doc, x1, y1, x2, y2, pattern = [7, 4]) {
  doc.save().strokeColor('#475569').lineWidth(.65).dash(pattern[0], { space: pattern[1] })
    .moveTo(x1, y1).lineTo(x2, y2).stroke().restore();
}

function drawLateral(doc, model, x, y, scale) {
  const { segments, bore, crossHoles } = model;
  let acc = 0;
  segments.forEach((seg) => {
    const sx = x + acc * scale;
    const right = sx + seg.length * scale;
    const top = y - seg.diameter * scale / 2;
    const bottom = y + seg.diameter * scale / 2;
    line(doc, sx, top, right, top, 1.15);
    line(doc, sx, bottom, right, bottom, 1.15);
    line(doc, sx, top, sx, bottom, .65);
    line(doc, right, top, right, bottom, 1.0);
    acc += seg.length;
  });
  const first = segments[0];
  const last = segments[segments.length - 1];
  line(doc, x, y - first.diameter * scale / 2, x, y + first.diameter * scale / 2, 1.15);
  line(doc, x + model.total * scale, y - last.diameter * scale / 2,
    x + model.total * scale, y + last.diameter * scale / 2, 1.1);
  dashed(doc, x - 10, y, x + model.total * scale + 12, y, [12, 4]);
  if (bore) {
    const end = x + bore.depth * scale;
    dashed(doc, x, y - bore.diameter * scale / 2, end, y - bore.diameter * scale / 2);
    dashed(doc, x, y + bore.diameter * scale / 2, end, y + bore.diameter * scale / 2);
    dashed(doc, end, y - bore.diameter * scale / 2, end, y + bore.diameter * scale / 2);
  }
  crossHoles.forEach((hole) => {
    const cx = x + hole.distance * scale;
    doc.circle(cx, y, hole.diameter * scale / 2).lineWidth(1).strokeColor('#111827').stroke();
    dashed(doc, cx, y - 18, cx, y + 18, [3, 3]);
  });

  const dimY = y - model.maxDiameter * scale / 2 - 35;
  dimHorizontal(doc, x, x + model.total * scale, dimY - 33, dimY + 32, number(model.total));
  let position = x;
  for (const seg of segments) {
    dimHorizontal(doc, position, position + seg.length * scale, dimY, dimY + 32, number(seg.length));
    position += seg.length * scale;
  }
  dimVertical(doc, y - first.diameter * scale / 2, y + first.diameter * scale / 2,
    x - 34, x - 3, 'Ø' + number(first.diameter));
  position = x;
  segments.slice(1).forEach((seg) => {
    const mid = position + (seg.length * scale) / 2 + 3;
    text(doc, 'Ø' + number(seg.diameter), mid, y - seg.diameter * scale / 2 - 23, 10);
    position += seg.length * scale;
  });
}

function hatchRect(doc, x, y, w, h) {
  if (w <= 0 || h <= 0) return;
  doc.save().rect(x, y, w, h).clip();
  for (let xx = x - h; xx < x + w + h; xx += 10) {
    line(doc, xx, y + h, xx + h, y, .4, '#6b7280');
  }
  doc.restore();
}

function drawSection(doc, model, x, y, scale) {
  const { segments, bore, crossHoles } = model;
  let start = x;
  segments.forEach((seg, idx) => {
    const width = seg.length * scale;
    const top = y - seg.diameter * scale / 2;
    const bottom = y + seg.diameter * scale / 2;
    if (idx === 0 && bore) {
      const bt = y - bore.diameter * scale / 2;
      const bb = y + bore.diameter * scale / 2;
      hatchRect(doc, start, top, width, bt - top);
      hatchRect(doc, start, bb, width, bottom - bb);
      // Seção longitudinal corta paredes: cada perfuracao transversal interrompe o metal.
      crossHoles.forEach((hole) => {
        const hx = x + (hole.distance - hole.diameter / 2) * scale;
        const hw = hole.diameter * scale;
        doc.fillColor('white').rect(hx, top, hw, bt - top).fill();
        doc.fillColor('white').rect(hx, bb, hw, bottom - bb).fill();
        line(doc, hx, top, hx, bt, .8); line(doc, hx + hw, top, hx + hw, bt, .8);
        line(doc, hx, bb, hx, bottom, .8); line(doc, hx + hw, bb, hx + hw, bottom, .8);
      });
      line(doc, start, bt, start + width, bt, 1);
      line(doc, start, bb, start + width, bb, 1);
      line(doc, start + bore.depth * scale, bt, start + bore.depth * scale, bb, .9);
    } else {
      hatchRect(doc, start, top, width, seg.diameter * scale);
    }
    line(doc, start, top, start + width, top, 1.1);
    line(doc, start, bottom, start + width, bottom, 1.1);
    line(doc, start, top, start, bottom, .8);
    line(doc, start + width, top, start + width, bottom, 1.05);
    start += width;
  });
  dashed(doc, x - 9, y, x + model.total * scale + 14, y, [12, 4]);
  if (bore) {
    text(doc, 'ALOJAMENTO: Ø' + number(bore.diameter) + ' × ' + number(bore.depth), x + 8, y + model.maxDiameter * scale / 2 + 8, 9, { bold: true });
  }
}

function drawIsometric(doc, model, ox, oy) {
  const unit = .58;
  const vx = .89, vy = -.45, px = .45, py = .89;
  let at = 0;
  model.segments.forEach((seg, idx) => {
    const x1 = ox + at * unit * vx, y1 = oy + at * unit * vy;
    const x2 = x1 + seg.length * unit * vx, y2 = y1 + seg.length * unit * vy;
    const radius = seg.diameter * .31;
    const a = { x: x1 + radius * px, y: y1 + radius * py };
    const b = { x: x1 - radius * px, y: y1 - radius * py };
    const c = { x: x2 + radius * px, y: y2 + radius * py };
    const d = { x: x2 - radius * px, y: y2 - radius * py };
    doc.fillColor(idx % 2 ? '#cbd5e1' : '#d7dee7').strokeColor('#334155').lineWidth(1)
      .moveTo(a.x, a.y).lineTo(c.x, c.y).lineTo(d.x, d.y).lineTo(b.x, b.y).closePath().fillAndStroke();
    if (idx === 0) {
      doc.save().translate(x1, y1).rotate(-26).ellipse(0, 0, radius * .34, radius).fillColor('#edf2f7').fillAndStroke('#edf2f7', '#334155');
      if (model.bore) {
        const inner = model.bore.diameter / seg.diameter;
        doc.ellipse(0, 0, radius * .34 * inner, radius * inner).fillColor('#7b8794').fillAndStroke('#7b8794', '#334155');
      }
      doc.restore();
    }
    doc.save().translate(x2, y2).rotate(-26).ellipse(0, 0, radius * .34, radius)
      .strokeColor('#334155').lineWidth(.8).stroke().restore();
    at += seg.length;
  });
  model.crossHoles.forEach((h) => {
    const cx = ox + h.distance * unit * vx + 8;
    const cy = oy + h.distance * unit * vy + model.segments[0].diameter * .11;
    doc.ellipse(cx, cy, h.diameter * .45, h.diameter * .25).fillColor('#6b7280').strokeColor('#1f2937').fillAndStroke();
  });
}

function frame(doc, desenho, model, cadData) {
  const W = doc.page.width, H = doc.page.height;
  const logo = path.join(__dirname, '..', '..', 'public', 'IMG', 'logopdf_campo_do_gado.png.png');
  doc.rect(22, 22, W - 44, H - 44).lineWidth(1.3).stroke('#111827');
  line(doc, 22, 70, W - 22, 70, 1);
  text(doc, 'MANUTENÇÃO INDUSTRIAL — CAMPO DO GADO', 40, 36, 15, { bold: true });
  text(doc, 'PADRÃO DE FABRICAÇÃO | EIXO PARAMÉTRICO', W - 395, 40, 10);
  text(doc, 'VISTA A — LATERAL', 380, 362, 12, { bold: true, width: 250, align: 'center' });
  text(doc, 'SEÇÃO A-A — LONGITUDINAL', 270, 658, 12, { bold: true, width: 320, align: 'center' });
  text(doc, 'VISTA ISOMÉTRICA (ESQUEMÁTICA)', 835, 654, 10, { bold: true, width: 305, align: 'center' });
  line(doc, 22, 691, W - 22, 691, 1);
  line(doc, 22, H - 22, W - 22, H - 22, 1);
  line(doc, 600, 691, 600, H - 22, .8);
  line(doc, 810, 691, 810, H - 22, .8);
  try {
    if (fs.existsSync(logo)) doc.image(logo, 625, 706, { fit: [155, 92], align: 'center', valign: 'center' });
    else text(doc, 'CAMPO DO GADO', 625, 730, 15, { bold: true });
  } catch (_error) {
    text(doc, 'CAMPO DO GADO', 625, 730, 15, { bold: true });
  }
  const machine = String(desenho.equipamento_nome || cadData.equipamento_nome || desenho.titulo || 'NÃO INFORMADO');
  const drafter = String(cadData.desenhista || desenho.criado_por_nome || 'NÃO INFORMADO');
  text(doc, 'PEÇA: ' + String(desenho.titulo || 'Eixo escalonado').slice(0, 35), 824, 705, 11, { bold: true, width: 338 });
  text(doc, 'EQUIPAMENTO: ' + machine.slice(0, 42), 824, 728, 9, { width: 340 });
  text(doc, 'CÓDIGO: ' + String(desenho.codigo || '-'), 824, 747, 9);
  text(doc, 'DESENHISTA: ' + drafter.slice(0, 45), 824, 764, 9);
  text(doc, 'REVISÃO: ' + String(desenho.revisao ?? 0) + ' | DATA: ' + new Date().toLocaleDateString('pt-BR'), 824, 784, 8);
  text(doc, 'UNIDADE: mm | VISTAS: SEM ESCALA DE FABRICAÇÃO', 824, 800, 7);
  text(doc, 'COMPRIMENTO TOTAL: ' + number(model.total) + ' mm', 40, 705, 11, { bold: true });
  text(doc, 'TRECHOS: ' + model.segments.map(s => 'Ø' + number(s.diameter) + ' × ' + number(s.length)).join(' / ').slice(0, 81), 40, 730, 9, { width: 545 });
  text(doc, model.bore
    ? 'ALOJAMENTO: Ø' + number(model.bore.diameter) + ' × ' + number(model.bore.depth) + ' (a partir da primeira face)'
    : 'ALOJAMENTO: NÃO INFORMADO / SEM USINAGEM INTERNA', 40, 749, 9, { width: 545 });
  const holes = model.crossHoles.length;
  text(doc, holes
    ? holes + ' FURO(S) PASSANTE(S) TRANSVERSAL(IS): ' + model.crossHoles.map(h => 'Ø' + number(h.diameter) + ' @ ' + number(h.distance)).join('; ').slice(0, 61)
    : 'FUROS TRANSVERSAIS: NENHUM INFORMADO', 40, 766, 8, { width: 540 });
  text(doc, 'POSIÇÕES MEDIDAS A PARTIR DA PRIMEIRA FACE. CONFERIR TOLERÂNCIAS ANTES DE USINAR.', 40, 791, 8, { width: 545 });
}

function generateShaftPdf(desenho, cadData, shaft, { pdfDir }) {
  const model = buildModel(shaft);
  const filename = `${String(desenho.codigo || 'eixo').replace(/[^a-zA-Z0-9_-]+/g, '-')}-eixo-rev${desenho.revisao || 0}-${Date.now()}.pdf`;
  const fullPath = path.join(pdfDir, filename);
  const relPath = `/pdfs/desenho-tecnico/${filename}`;
  const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 0, autoFirstPage: true });
  const out = fs.createWriteStream(fullPath);
  doc.pipe(out);
  // Faixas separadas evitam que as vistas compartilhem furos ou linhas de corte.
  drawLateral(doc, model, 116, 238, 1.55);
  drawSection(doc, model, 103, 535, 1.38);
  drawIsometric(doc, model, 855, 570);
  frame(doc, desenho, model, cadData);
  doc.end();
  return new Promise((resolve, reject) => {
    out.on('finish', () => resolve({ fullPath, relPath, filename }));
    out.on('error', reject);
  });
}

module.exports = { pickShaft, buildModel, generateShaftPdf };
