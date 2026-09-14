const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');

const COLORS = Object.freeze({
  green: '#16A34A',
  greenDark: '#166534',
  greenHeader: '#159947',
  greenBand: '#16A34A',
  greenSoft: '#E7F4EC',
  text: '#0F172A',
  muted: '#475569',
  border: '#D1D5DB',
  white: '#FFFFFF',
  yellow: '#FFF7D6',
  yellowBorder: '#EAB308',
  red: '#B91C1C',
});

const PAGE = Object.freeze({
  size: 'A4',
  margins: { left: 36, right: 36, top: 26, bottom: 36 },
  headerHeight: 88,
  footerHeight: 28,
});

function logoPath() {
  return [
    'public/IMG/logopdf_campo_do_gado.png.png',
    'public/IMG/logo_menu.png.png',
    'public/IMG/login_campo_do_gado.png.png.png',
    'public/img/logo_menu_256.png',
    'public/img/logo.png',
  ].map((p) => path.join(process.cwd(), p)).find((p) => fs.existsSync(p)) || null;
}

function createDoc(options = {}) {
  return new PDFDocument({
    size: options.size || PAGE.size,
    margins: options.margins || PAGE.margins,
    autoFirstPage: true,
    info: {
      Title: options.title || 'Campo do Gado - Manutenção Industrial',
      Author: 'Campo do Gado - Manutenção Industrial',
      Subject: options.subject || options.title || 'Documento interno',
    },
  });
}

function bodyTop() { return PAGE.headerHeight + 28; }
function bodyBottom(doc) { return doc.page.height - PAGE.footerHeight - PAGE.margins.bottom; }

function drawHeader(doc, { title, subtitle = 'Campo do Gado • Manutenção Industrial' } = {}) {
  const pageW = doc.page.width;
  const left = PAGE.margins.left;
  const width = pageW - PAGE.margins.left - PAGE.margins.right;
  const logo = logoPath();

  doc.save();
  doc.rect(0, 0, pageW, 78).fill(COLORS.greenHeader);
  doc.rect(0, 78, pageW, 10).fill(COLORS.greenDark);

  if (logo) {
    try {
      doc.image(logo, left + 8, 9, { fit: [70, 58], align: 'center', valign: 'center' });
    } catch (_error) {
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7)
        .text('CAMPO\nDO GADO', left + 10, 27, { width: 62, align: 'center' });
    }
  }

  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(15)
    .text(String(title || 'DOCUMENTO INTERNO').toUpperCase(), left + 94, 22, { width: width - 102, align: 'center' });
  doc.fillColor('#DCFCE7').font('Helvetica').fontSize(8.8)
    .text(subtitle, left + 94, 47, { width: width - 102, align: 'center' });
  doc.restore();
}

function drawFooter(doc, { text = 'Campo do Gado • Manutenção Industrial • Documento interno' } = {}) {
  const y = doc.page.height - PAGE.margins.bottom - PAGE.footerHeight;
  const width = doc.page.width - PAGE.margins.left - PAGE.margins.right;
  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(0.6)
    .moveTo(PAGE.margins.left, y).lineTo(doc.page.width - PAGE.margins.right, y).stroke();
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.8)
    .text(text, PAGE.margins.left, y + 9, { width, align: 'center' });
  doc.restore();
}

function setupPage(doc, meta, add = false) {
  if (add) doc.addPage();
  drawHeader(doc, meta);
  drawFooter(doc, meta);
  doc.y = bodyTop();
}

function ensureSpace(doc, height, meta) {
  if (doc.y + Number(height || 0) <= bodyBottom(doc)) return;
  setupPage(doc, meta, true);
}

function sectionBand(doc, label, meta) {
  ensureSpace(doc, 30, meta);
  const x = PAGE.margins.left;
  const w = doc.page.width - PAGE.margins.left - PAGE.margins.right;
  const y = doc.y;
  doc.save();
  doc.roundedRect(x, y, w, 22, 4).fill(COLORS.greenBand);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9)
    .text(String(label || '').toUpperCase(), x + 8, y + 6, { width: w - 16 });
  doc.restore();
  doc.y = y + 30;
}

function infoBox(doc, items = [], meta, { columns = 2 } = {}) {
  const x = PAGE.margins.left;
  const w = doc.page.width - PAGE.margins.left - PAGE.margins.right;
  const cols = Math.max(1, Number(columns) || 1);
  const cellW = w / cols;
  const rows = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  const rowH = 42;
  ensureSpace(doc, Math.max(1, rows.length) * rowH + 8, meta);
  let y = doc.y;

  rows.forEach((row) => {
    row.forEach((item, idx) => {
      const cx = x + (idx * cellW);
      doc.save();
      doc.rect(cx, y, cellW, rowH).fillAndStroke(COLORS.white, COLORS.border);
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7.3)
        .text(String(item?.label || '').toUpperCase(), cx + 7, y + 7, { width: cellW - 14 });
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(9)
        .text(String(item?.value ?? '-'), cx + 7, y + 21, { width: cellW - 14, ellipsis: true });
      doc.restore();
    });
    y += rowH;
  });
  doc.y = y + 8;
}

function textBox(doc, text, meta, options = {}) {
  const x = PAGE.margins.left;
  const w = doc.page.width - PAGE.margins.left - PAGE.margins.right;
  const pad = 9;
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.fontSize || 9);
  const h = Math.max(34, doc.heightOfString(String(text || '-'), { width: w - pad * 2 }) + pad * 2);
  ensureSpace(doc, h + 8, meta);
  const y = doc.y;
  doc.save();
  doc.roundedRect(x, y, w, h, 5).fillAndStroke(options.fill || COLORS.greenSoft, options.stroke || COLORS.border);
  doc.fillColor(options.color || COLORS.text).font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.fontSize || 9)
    .text(String(text || '-'), x + pad, y + pad, { width: w - pad * 2, align: options.align || 'left' });
  doc.restore();
  doc.y = y + h + 8;
}

function formatDate(value) {
  const raw = String(value || '').slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (raw || '-');
}

function formatMinutes(value) {
  const total = Math.round(Number(value || 0));
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}`;
}

module.exports = {
  COLORS,
  PAGE,
  logoPath,
  createDoc,
  setupPage,
  ensureSpace,
  sectionBand,
  infoBox,
  textBox,
  formatDate,
  formatMinutes,
};
