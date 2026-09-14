const PDFDocument = require('pdfkit');

// Geometria do documento de Solicitações (compras.service.js#gerarPdf).
// O cursor é explícito: textos, tabelas e rodapés nunca abrem páginas implicitamente.
function createInstitutionalReport({ title, subtitle, issuedAt, logoPath, colors, sector = 'MANUTENÇÃO / RH' }) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, bufferPages: true,
    info: { Title: title, Author: 'Manutenção Campo do Gado', Subject: 'Controle interno de banco de horas' } });
  const left = 40;
  const width = doc.page.width - left * 2;
  const bottom = doc.page.height - 70;
  const top = 116;
  let y = top;
  let ended = false;
  const clean = value => String(value ?? '-').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim() || '-';

  function lines(value, w, font = 'Helvetica', size = 7.8) {
    doc.font(font).fontSize(size);
    const out = [];
    for (const paragraph of clean(value).split('\n')) {
      if (!paragraph.trim()) { out.push(''); continue; }
      let line = '';
      for (let word of paragraph.trim().split(/\s+/)) {
        if (line && doc.widthOfString(`${line} ${word}`) > w) { out.push(line); line = ''; }
        while (doc.widthOfString(word) > w) {
          const chars = Array.from(word);
          let low = 1; let high = chars.length;
          while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (doc.widthOfString(chars.slice(0, mid).join('')) <= w) low = mid;
            else high = mid - 1;
          }
          out.push(chars.slice(0, low).join(''));
          word = chars.slice(low).join('');
        }
        line = line ? `${line} ${word}` : word;
      }
      if (line) out.push(line);
    }
    return out.length ? out : ['-'];
  }

  function write(textLines, x, yy, w, { size = 7.8, font = 'Helvetica', color = colors.text, align = 'left', lineHeight = size * 1.3 } = {}) {
    doc.font(font).fontSize(size).fillColor(color);
    textLines.forEach((line, i) => doc.text(line, x, yy + i * lineHeight, {
      width: w, height: lineHeight, align, lineBreak: false,
    }));
  }

  function header() {
    doc.rect(0, 0, doc.page.width, 78).fill(colors.greenHeader);
    doc.rect(0, 78, doc.page.width, 10).fill(colors.greenDark);
    let hasLogo = false;
    if (logoPath) {
      try { doc.image(logoPath, left + 8, 9, { fit: [70, 58], align: 'center', valign: 'center' }); hasLogo = true; }
      catch (_error) { /* O documento continua identificável se o arquivo de marca estiver indisponível. */ }
    }
    if (!hasLogo) write(['MANUTENÇÃO', 'CAMPO DO GADO'], left + 8, 28, 70, { size: 7, font: 'Helvetica-Bold', color: colors.white, align: 'center' });
    write(['RECICLAGEM CAMPO DO GADO'], left + 100, 22, 270, { size: 14, font: 'Helvetica-Bold', color: colors.white });
    write(['Banco de horas | Manutenção Campo do Gado'], left + 100, 43, 280, { size: 8.5, color: colors.white });
    write([sector], left + width - 110, 22, 110, { size: 7.2, font: 'Helvetica-Bold', color: colors.white, align: 'right' });
    write([`Data: ${issuedAt || '-'}`], left + width - 110, 43, 110, { size: 7.8, color: colors.white, align: 'right' });
    y = top;
  }

  function newPage() { doc.addPage(); header(); }
  function ensure(h) { if (y + h > bottom) newPage(); }
  function start() {
    header();
    y = 108;
    const titleLines = lines(String(title).toUpperCase(), width, 'Helvetica-Bold', 18);
    write(titleLines, left, y, width, { size: 18, font: 'Helvetica-Bold', color: colors.greenDark, align: 'center', lineHeight: 23 });
    y += titleLines.length * 23 + 3;
    const subLines = lines(subtitle || 'Controle interno de horas extras e folgas compensatórias', width, 'Helvetica', 9);
    write(subLines, left, y, width, { size: 9, color: colors.muted, align: 'center', lineHeight: 12 });
    y += subLines.length * 12 + 18;
  }

  function bandHeight(label) { return Math.max(24, lines(label.toUpperCase(), width - 24, 'Helvetica-Bold', 9.5).length * 12 + 12); }
  function band(label) {
    const h = bandHeight(label);
    doc.rect(left, y, width, h).fill(colors.greenBand);
    write(lines(label.toUpperCase(), width - 24, 'Helvetica-Bold', 9.5), left + 12, y + 7, width - 24,
      { size: 9.5, font: 'Helvetica-Bold', color: colors.white, lineHeight: 12 });
    y += h + 8;
  }

  function table({ title: label, columns, rows = [], emptyText = 'Nenhum registro encontrado.', identification = false }) {
    const weight = columns.reduce((sum, c) => sum + c.width, 0);
    const cols = columns.map(c => ({ ...c, width: c.width * width / weight }));
    const pad = 6; const size = 7.8; const lineHeight = 10.5;
    const values = row => cols.map(c => lines(row[c.key], c.width - pad * 2, c.labelCell ? 'Helvetica-Bold' : 'Helvetica', size));
    const headerLines = cols.map(c => lines(c.label || '', c.width - pad * 2, 'Helvetica-Bold', size));
    const headerH = identification ? 0 : Math.max(20, Math.max(...headerLines.map(a => a.length)) * lineHeight + 12);
    const bandH = label ? bandHeight(label) + 8 : 0;
    const firstH = rows.length ? Math.max(24, Math.max(...values(rows[0]).map(a => a.length)) * lineHeight + pad * 2) : 28;
    ensure(bandH + headerH + Math.min(firstH, bottom - top - bandH - headerH));

    function heading(continued = false) {
      if (label) band(`${label}${continued ? ' (continuação)' : ''}`);
      if (identification) return;
      doc.rect(left, y, width, headerH).fill(colors.greenDark);
      let x = left;
      cols.forEach((c, i) => {
        write(headerLines[i], x + pad, y + 6, c.width - pad * 2, { font: 'Helvetica-Bold', color: colors.white, align: c.align || 'left', lineHeight });
        x += c.width;
      });
      y += headerH;
    }
    function next() { newPage(); heading(true); }
    heading();
    if (!rows.length) {
      const h = 28;
      doc.rect(left, y, width, h).lineWidth(0.6).fillAndStroke(colors.row, colors.border);
      write([emptyText], left + pad, y + 8, width - pad * 2, { color: colors.muted });
      y += h + 12;
      return;
    }
    rows.forEach((row, index) => {
      const cellLines = values(row);
      const count = Math.max(...cellLines.map(a => a.length));
      const fullH = Math.max(24, count * lineHeight + pad * 2);
      const capacity = bottom - top - (label ? bandHeight(`${label} (continuação)`) + 8 : 0) - headerH;
      if (fullH > bottom - y && fullH <= capacity) next();
      let offset = 0;
      while (offset < count) {
        if (bottom - y < 24) next();
        const fit = Math.max(1, Math.floor((bottom - y - pad * 2) / lineHeight));
        const take = Math.min(fit, count - offset);
        const h = Math.max(24, take * lineHeight + pad * 2);
        let x = left;
        cols.forEach((c, i) => {
          const fill = c.labelCell ? colors.greenSoft : (identification || index % 2 === 0 ? colors.white : colors.row);
          doc.rect(x, y, c.width, h).lineWidth(0.6).fillAndStroke(fill, colors.border);
          const chunk = cellLines[i].slice(offset, offset + take);
          // Repetir identificadores curtos permite reconhecer a linha em uma continuação longa.
          const visible = !chunk.length && c.repeatOnSplit ? cellLines[i].slice(0, take) : chunk;
          write(visible, x + pad, y + pad, c.width - pad * 2, { size, lineHeight, align: c.align || 'left', font: c.labelCell ? 'Helvetica-Bold' : 'Helvetica', color: c.labelCell ? colors.greenDark : colors.text });
          x += c.width;
        });
        y += h;
        offset += take;
        if (offset < count) next();
      }
    });
    y += 12;
  }

  function identification(rows) {
    table({ identification: true, columns: [
      { key: 'label1', width: 116, labelCell: true }, { key: 'value1', width: 146 },
      { key: 'label2', width: 103, labelCell: true }, { key: 'value2', width: width - 365 },
    ], rows: rows.map(r => ({ label1: r[0], value1: r[1], label2: r[2], value2: r[3] })) });
  }

  function summary(items) {
    const cellW = width / items.length;
    const headings = items.map(i => lines(i.label, cellW - 14, 'Helvetica-Bold', 7.5));
    const vals = items.map(i => lines(i.value, cellW - 14, 'Helvetica-Bold', 13));
    const headingH = Math.max(...headings.map(a => a.length)) * 10 + 12;
    const valueH = Math.max(...vals.map(a => a.length)) * 17 + 14;
    ensure(headingH + valueH + 12);
    items.forEach((item, i) => {
      const x = left + cellW * i;
      doc.rect(x, y, cellW, headingH).lineWidth(0.6).fillAndStroke(colors.greenSoft, colors.border);
      doc.rect(x, y + headingH, cellW, valueH).fillAndStroke(colors.white, colors.border);
      write(headings[i], x + 7, y + 6, cellW - 14, { size: 7.5, font: 'Helvetica-Bold', color: colors.greenDark, lineHeight: 10 });
      write(vals[i], x + 7, y + headingH + 7, cellW - 14, { size: 13, font: 'Helvetica-Bold', color: colors.greenDark, lineHeight: 17 });
    });
    y += headingH + valueH + 12;
  }

  function note(value, { keepWithNext = 0 } = {}) {
    const text = lines(value, width - 16, 'Helvetica', 8);
    const needed = text.length * 11 + 28 + keepWithNext;
    if (needed <= bottom - top) ensure(needed);
    let offset = 0;
    while (offset < text.length) {
      ensure(27);
      const take = Math.min(text.length - offset, Math.floor((bottom - y - 16) / 11));
      const h = take * 11 + 16;
      doc.rect(left, y, width, h).lineWidth(0.6).fillAndStroke(colors.white, colors.border);
      write(text.slice(offset, offset + take), left + 8, y + 8, width - 16, { size: 8, lineHeight: 11 });
      y += h + 12; offset += take;
    }
  }

  function signatures(individual = false) {
    const labels = individual ? ['Manutenção', 'Colaborador', 'Conferência / RH'] : ['Elaboração / Manutenção', 'Conferência / RH'];
    ensure(78);
    labels.forEach((label, i) => {
      const w = width / labels.length; const x = left + i * w;
      doc.rect(x, y, w, 21).lineWidth(0.6).fillAndStroke(colors.greenSoft, colors.border);
      doc.rect(x, y + 21, w, 42).fillAndStroke(colors.white, colors.border);
      write([label], x + 7, y + 7, w - 14, { size: 7.8, font: 'Helvetica-Bold', color: colors.greenDark });
      write(['Assinatura / data'], x + 7, y + 51, w - 14, { size: 7, color: colors.muted });
    });
    y += 75;
  }

  function end() {
    if (ended) return;
    ended = true;
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const fy = doc.page.height - 42;
      doc.moveTo(left, fy - 9).lineTo(left + width, fy - 9).lineWidth(0.8).stroke(colors.border);
      write(['Manutenção Campo do Gado - Documento para controle interno de banco de horas e folgas.'], left, fy, width - 78, { size: 7.2, color: colors.muted });
      write([`Página ${i + 1} de ${range.count}`], left + width - 78, fy, 78, { size: 7.2, color: colors.muted, align: 'right' });
    }
    doc.end();
  }
  return { doc, start, identification, summary, table, note, signatures, end };
}

module.exports = { createInstitutionalReport };
