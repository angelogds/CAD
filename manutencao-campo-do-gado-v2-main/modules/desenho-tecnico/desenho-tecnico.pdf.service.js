const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const PDF_DIR = path.join(process.env.UPLOADS_DIR || (fs.existsSync('/data') ? '/data/uploads' : path.join(process.cwd(), 'uploads')), 'desenho-tecnico-pdf');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

function generateTechnicalPdf(desenho, svgMarkup, options = {}) {
  const filename = `${String(desenho.codigo || 'desenho').replace(/[^a-zA-Z0-9_-]+/g, '-')}-rev${desenho.revisao || 0}.pdf`;
  const fullPath = path.join(PDF_DIR, filename);
  const relPath = `/uploads/desenho-tecnico-pdf/${filename}`;

  const doc = new PDFDocument({ size: 'A4', margin: 28 });
  const stream = fs.createWriteStream(fullPath);
  doc.pipe(stream);

  doc.fontSize(18).fillColor('#166534').text('Campo do Gado - Desenho Técnico', { align: 'left' });
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor('#111827');
  doc.text(`Código: ${desenho.codigo}`);
  doc.text(`Título: ${desenho.titulo}`);
  doc.text(`Revisão: ${desenho.revisao}`);
  doc.text(`Categoria/Subtipo: ${desenho.categoria} / ${desenho.subtipo}`);
  doc.text(`Modo: ${options.tipoOrigem === 'cad' ? 'CAD' : 'Paramétrico'}`);
  doc.text(`Material: ${desenho.material || '-'}`);
  doc.text(`Equipamento vinculado: ${desenho.equipamento_nome || '-'}`);
  doc.text(`Responsável: ${desenho.criado_por_nome || '-'}`);
  doc.text(`Data: ${new Date().toLocaleString('pt-BR')}`);
  doc.moveDown(0.4);

  const drawWidth = 540;
  const drawHeight = 240;
  const drawX = doc.page.margins.left;
  const drawY = doc.y;

  doc.save();
  doc.rect(drawX, drawY, drawWidth, drawHeight).lineWidth(1).stroke('#cbd5e1');
  doc.translate(drawX + 12, drawY + 12);
  doc.scale(0.62, { origin: [0, 0] });
  doc.text((svgMarkup || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1400) || 'Sem SVG', 0, 0, {
    width: (drawWidth - 24) / 0.62,
    height: (drawHeight - 24) / 0.62,
    ellipsis: true,
  });
  doc.restore();

  doc.y = drawY + drawHeight + 12;
  doc.fontSize(10).fillColor('#111827').text(`Observações: ${desenho.observacoes || '-'}`);
  if (options.preview3d && Array.isArray(options.preview3d.items)) {
    doc.moveDown(0.3);
    doc.text(`Prévia 3D: ${options.preview3d.items.length} sólido(s) por extrusão simples.`);
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ fullPath, relPath, filename }));
    stream.on('error', reject);
  });
}

module.exports = { generateTechnicalPdf };
