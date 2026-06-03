const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const COLORS = {
  primary: '#16A34A',
  primaryDark: '#15803D',
  primaryClosed: '#166534',
  soft: '#E7F5EE',
  white: '#FFFFFF',
  border: '#E5E7EB',
  text: '#1F2937',
  muted: '#6B7280',
};

const LOGO_CANDIDATES = [
  path.join(process.cwd(), 'public', 'IMG', 'logopdf_campo_do_gado.png.png'),
  path.join(process.cwd(), 'public', 'img', 'login', 'slideshow', 'publicimglogopdf_campo_do_gado.png.png'),
  path.join(process.cwd(), 'public', 'IMG', 'logo_menu.png.png'),
];

function resolveLogoPath() {
  return LOGO_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

function safe(value, fallback = 'Não informado') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatIssuedAt(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('pt-BR');
  return d.toLocaleDateString('pt-BR');
}

function pageInfo(doc) {
  return {
    left: doc.page.margins.left,
    right: doc.page.width - doc.page.margins.right,
    top: doc.page.margins.top,
    bottom: doc.page.height - doc.page.margins.bottom,
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
  };
}

function drawHeader(doc, content, issuedAt) {
  const info = pageInfo(doc);
  const headerH = 64;
  doc.save();
  doc.rect(0, 0, doc.page.width, headerH).fill(COLORS.primary);
  const logoPath = resolveLogoPath();
  if (logoPath) {
    try { doc.image(logoPath, info.left, 12, { fit: [42, 42] }); } catch (_e) {}
  }
  const titleX = logoPath ? info.left + 52 : info.left;
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(13).text('RECICLAGEM CAMPO DO GADO', titleX, 14, { width: 310 });
  doc.font('Helvetica').fontSize(9.5).text('Ordem de Serviço | Manutenção Campo do Gado', titleX, 34, { width: 310 });

  const ident = content.identificacao || {};
  doc.font('Helvetica-Bold').fontSize(8.5).text(safe(ident.setor_destinatario, 'Manutenção'), info.right - 170, 12, { width: 170, align: 'right' });
  doc.font('Helvetica').fontSize(8).text(`Emissão: ${formatIssuedAt(issuedAt)}`, info.right - 170, 28, { width: 170, align: 'right' });
  doc.text(safe(ident.numero_os, ''), info.right - 170, 42, { width: 170, align: 'right' });
  doc.restore();
}

function drawFooter(doc, issuedAt) {
  const info = pageInfo(doc);
  const y = doc.page.height - 46;
  doc.save();
  doc.moveTo(info.left, y).lineTo(info.right, y).strokeColor(COLORS.border).lineWidth(0.8).stroke();
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
    .text('Documento gerado para controle interno da Manutenção Campo do Gado.', info.left, y + 8, { width: info.width * 0.58 });
  doc.text(`Data de emissão: ${formatIssuedAt(issuedAt)}`, info.left, y + 20, { width: info.width * 0.45 });
  doc.text(`Página ${doc.pageNumber}`, info.right - 90, y + 8, { width: 90, align: 'right' });
  doc.restore();
}

function addManagedPage(doc, content, issuedAt) {
  doc.addPage();
  drawHeader(doc, content, issuedAt);
  drawFooter(doc, issuedAt);
  doc.y = 88;
}

function ensureSpace(doc, content, issuedAt, needed) {
  const info = pageInfo(doc);
  if (doc.y + needed > info.bottom - 12) addManagedPage(doc, content, issuedAt);
}

function drawSection(doc, content, issuedAt, title, body) {
  ensureSpace(doc, content, issuedAt, 56);
  const info = pageInfo(doc);
  doc.fillColor(COLORS.primaryClosed).font('Helvetica-Bold').fontSize(10.5).text(title, info.left, doc.y, { width: info.width });
  doc.moveDown(0.25);
  const text = Array.isArray(body)
    ? (body.length ? body.map((item) => `• ${safe(item)}`).join('\n') : 'Não informado')
    : safe(body);
  doc.fillColor(COLORS.text).font('Helvetica').fontSize(9.5).text(text, { width: info.width, lineGap: 2 });
  doc.moveDown(0.65);
}

function drawIdentification(doc, content, issuedAt) {
  const info = pageInfo(doc);
  const ident = content.identificacao || {};
  const rows = [
    ['Nº da OS', ident.numero_os, 'Empresa / Unidade', ident.empresa_unidade],
    ['Setor solicitante', ident.setor_solicitante, 'Setor destinatário', ident.setor_destinatario],
    ['Solicitante', ident.solicitante, 'Responsável manutenção', ident.responsavel_manutencao],
    ['Equipamento / Local', ident.equipamento_local, 'Tipo manutenção', ident.tipo_manutencao],
    ['Abertura', `${safe(ident.data_abertura)} ${safe(ident.hora_abertura, '')}`.trim(), 'Status', ident.status],
    ['Prioridade', ident.prioridade, '', ''],
  ];
  const colW = info.width / 4;
  const rowH = 24;
  ensureSpace(doc, content, issuedAt, rows.length * rowH + 24);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.primaryClosed).text('IDENTIFICAÇÃO', info.left, doc.y);
  doc.moveDown(0.35);
  let y = doc.y;
  rows.forEach((row) => {
    doc.rect(info.left, y, info.width, rowH).fillAndStroke(COLORS.white, COLORS.border);
    for (let i = 0; i < 4; i += 2) {
      const labelX = info.left + i * colW;
      doc.rect(labelX, y, colW, rowH).fillAndStroke(COLORS.soft, COLORS.border);
      doc.fillColor(COLORS.primaryClosed).font('Helvetica-Bold').fontSize(7.5).text(row[i], labelX + 5, y + 4, { width: colW - 10 });
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(8.2).text(safe(row[i + 1], ''), labelX + colW + 5, y + 4, { width: colW - 10 });
    }
    y += rowH;
  });
  doc.y = y + 14;
}

function drawPriorityBadge(doc, content, issuedAt) {
  const info = pageInfo(doc);
  const prioridade = safe(content.identificacao?.prioridade, 'Normal');
  ensureSpace(doc, content, issuedAt, 34);
  doc.roundedRect(info.left, doc.y, info.width, 28, 6).fill(COLORS.soft);
  doc.fillColor(COLORS.primaryClosed).font('Helvetica-Bold').fontSize(9.5)
    .text(`PRIORIDADE: ${prioridade}`, info.left + 10, doc.y + 9, { width: info.width - 20 });
  doc.y += 40;
}

function drawSignatures(doc, content, issuedAt) {
  ensureSpace(doc, content, issuedAt, 90);
  const info = pageInfo(doc);
  const sig = content.assinaturas || {};
  const y = doc.y + 24;
  const w = (info.width - 34) / 2;
  doc.strokeColor(COLORS.border).lineWidth(1);
  doc.moveTo(info.left, y).lineTo(info.left + w, y).stroke();
  doc.moveTo(info.left + w + 34, y).lineTo(info.right, y).stroke();
  doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(9).text(safe(sig.responsavel_manutencao, 'Ângelo Gomes da Silva'), info.left, y + 6, { width: w, align: 'center' });
  doc.font('Helvetica').fontSize(8).text(safe(sig.cargo, 'Encarregado de Manutenção'), info.left, y + 20, { width: w, align: 'center' });
  doc.text(safe(sig.empresa, 'Reciclagem Campo do Gado'), info.left, y + 32, { width: w, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(9).text(safe(sig.campo_solicitante, 'Assinatura do solicitante / setor'), info.left + w + 34, y + 6, { width: w, align: 'center' });
  doc.y = y + 58;
}

function drawPhotoGrid(doc, content, fotos, issuedAt) {
  if (!fotos.length) return;
  addManagedPage(doc, content, issuedAt);
  const info = pageInfo(doc);
  doc.fillColor(COLORS.primaryClosed).font('Helvetica-Bold').fontSize(14).text('ANEXOS FOTOGRÁFICOS', info.left, doc.y, { width: info.width, align: 'center' });
  doc.moveDown(0.2);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9.5).text('Registros visuais relacionados à Ordem de Serviço.', { width: info.width, align: 'center' });
  doc.moveDown(1);

  const gap = 14;
  const itemW = fotos.length === 1 ? Math.min(info.width, 390) : (info.width - gap) / 2;
  const itemH = fotos.length === 1 ? 250 : 180;
  let x = fotos.length === 1 ? info.left + (info.width - itemW) / 2 : info.left;
  let y = doc.y;
  fotos.forEach((foto, index) => {
    if (y + itemH + 46 > info.bottom - 18) {
      addManagedPage(doc, content, issuedAt);
      y = doc.y;
      x = info.left;
    }
    doc.rect(x, y, itemW, itemH).strokeColor(COLORS.border).lineWidth(1).stroke();
    if (foto.absolutePath && fs.existsSync(foto.absolutePath)) {
      try { doc.image(foto.absolutePath, x + 4, y + 4, { fit: [itemW - 8, itemH - 8], align: 'center', valign: 'center' }); }
      catch (_e) { doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Imagem indisponível para renderização.', x + 8, y + 12, { width: itemW - 16 }); }
    } else {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Imagem indisponível para renderização.', x + 8, y + 12, { width: itemW - 16 });
    }
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(8.2).text(safe(foto.legenda, `Foto ${index + 1}`), x, y + itemH + 6, { width: itemW, align: 'center' });

    if (fotos.length === 1 || x > info.left) {
      x = info.left;
      y += itemH + 48;
    } else {
      x += itemW + gap;
    }
  });
  doc.y = y + 4;
  drawSection(doc, content, issuedAt, 'NOTA TÉCNICA SOBRE AS IMAGENS', content.nota_tecnica_fotos);
}

function generateOrdemServicoPdf({ content, fotos = [], outputPath, issuedAt = new Date() }) {
  return new Promise((resolve, reject) => {
    if (!outputPath) return reject(new Error('Caminho de saída do PDF não informado.'));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const doc = new PDFDocument({ size: 'A4', margins: { top: 86, bottom: 62, left: 42, right: 42 }, autoFirstPage: true, bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    drawHeader(doc, content, issuedAt);
    drawFooter(doc, issuedAt);
    doc.y = 88;
    const info = pageInfo(doc);
    doc.fillColor(COLORS.primaryClosed).font('Helvetica-Bold').fontSize(16).text(safe(content.titulo, 'ORDEM DE SERVIÇO DE MANUTENÇÃO'), info.left, doc.y, { width: info.width, align: 'center' });
    doc.moveDown(0.25);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10).text(safe(content.subtitulo, ''), { width: info.width, align: 'center' });
    doc.moveDown(1);

    drawIdentification(doc, content, issuedAt);
    drawPriorityBadge(doc, content, issuedAt);
    drawSection(doc, content, issuedAt, '1. DESCRIÇÃO DA SOLICITAÇÃO', content.descricao_solicitacao);
    drawSection(doc, content, issuedAt, '2. SITUAÇÃO ATUAL', content.situacao_atual);
    drawSection(doc, content, issuedAt, '3. SERVIÇO SOLICITADO', content.servico_solicitado);
    drawSection(doc, content, issuedAt, '4. ANÁLISE TÉCNICA', content.analise_tecnica);
    drawSection(doc, content, issuedAt, '5. IMPACTO OPERACIONAL', content.impacto_operacional);
    drawSection(doc, content, issuedAt, '6. MATERIAIS UTILIZADOS', content.materiais_utilizados);
    drawSection(doc, content, issuedAt, '7. MATERIAIS NECESSÁRIOS', content.materiais_necessarios);
    drawSection(doc, content, issuedAt, '8. RECOMENDAÇÕES', content.recomendacoes);
    drawSection(doc, content, issuedAt, '9. PENDÊNCIAS', content.pendencias);
    drawSection(doc, content, issuedAt, '10. OBSERVAÇÃO FINAL', content.observacao_final);
    drawSignatures(doc, content, issuedAt);
    drawPhotoGrid(doc, content, fotos, issuedAt);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 38;
      const pInfo = pageInfo(doc);
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(`Página ${i + 1} de ${range.count}`, pInfo.right - 105, footerY, { width: 105, align: 'right' });
    }

    doc.end();
  });
}

module.exports = { COLORS, generateOrdemServicoPdf };
