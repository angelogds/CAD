const DEFAULT_COLORS = {
  headerBg: '#f3f4f6',
  alternateBg: '#fafafa',
  border: '#d1d5db',
  text: '#111827',
  muted: '#6b7280',
  title: '#111827',
};

function pageInfo(doc, options = {}) {
  const left = options.x ?? doc.page.margins.left;
  const right = doc.page.width - (options.rightMargin ?? doc.page.margins.right);
  const top = options.top ?? doc.page.margins.top;
  const bottom = options.bottom ?? (doc.page.height - doc.page.margins.bottom);
  return { left, right, top, bottom, width: options.width ?? (right - left) };
}

function sanitizePdfText(value, fallback = '-') {
  if (value === null || value === undefined) return fallback;
  let text = String(value)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[\uFFFD\u00D0]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || fallback;
}

function ensureSpace(doc, neededHeight, options = {}) {
  const info = pageInfo(doc, options);
  if ((doc.y || info.top) + neededHeight <= info.bottom) return false;
  doc.addPage(options.pageOptions || undefined);
  if (typeof options.onPageAdded === 'function') options.onPageAdded(doc);
  doc.y = options.startY ?? doc.y ?? doc.page.margins.top;
  return true;
}

function renderSectionTitle(doc, title, options = {}) {
  const colors = { ...DEFAULT_COLORS, ...(options.colors || {}) };
  const info = pageInfo(doc, options);
  const y = options.y ?? doc.y;
  doc.y = y;
  ensureSpace(doc, options.neededHeight || 42, options);
  const titleY = doc.y;
  doc.font(options.font || 'Helvetica-Bold').fontSize(options.fontSize || 12).fillColor(options.color || colors.title)
    .text(sanitizePdfText(title), info.left, titleY, {
      width: info.width,
      lineBreak: true,
      paragraphGap: 0,
    });
  doc.y = Math.max(doc.y, titleY + (options.height || 16)) + (options.gapAfter ?? 6);
  return doc.y;
}

function normalizeColumns(columns, tableWidth) {
  const raw = columns.map((column) => {
    if (typeof column === 'string') return { label: column, width: null };
    return { ...column, label: column.label || column.header || column.key || '', width: column.width ?? null };
  });
  const fixedTotal = raw.reduce((sum, col) => sum + (typeof col.width === 'number' && col.width > 1 ? col.width : 0), 0);
  const percentTotal = raw.reduce((sum, col) => sum + (typeof col.width === 'number' && col.width > 0 && col.width <= 1 ? col.width : 0), 0);
  const missing = raw.filter((col) => col.width === null || col.width === undefined).length;
  let remaining = Math.max(0, tableWidth - fixedTotal - (percentTotal * tableWidth));
  return raw.map((col) => {
    let width;
    if (typeof col.width === 'number' && col.width > 1) width = col.width;
    else if (typeof col.width === 'number' && col.width > 0) width = col.width * tableWidth;
    else width = missing ? remaining / missing : remaining / raw.length;
    return { ...col, width };
  });
}

function cellHeight(doc, text, width, options) {
  const padding = options.padding;
  doc.font(options.bodyFont).fontSize(options.bodyFontSize);
  const height = doc.heightOfString(sanitizePdfText(text), {
    width: Math.max(4, width - padding * 2),
    lineGap: options.lineGap,
  });
  return Math.ceil(height + padding * 2);
}

function drawHeader(doc, normalized, x, y, options) {
  const colors = { ...DEFAULT_COLORS, ...(options.colors || {}) };
  let cursorX = x;
  doc.font(options.headerFont).fontSize(options.headerFontSize).fillColor(colors.text);
  normalized.forEach((column) => {
    doc.rect(cursorX, y, column.width, options.headerHeight).fillAndStroke(colors.headerBg, colors.border);
    doc.fillColor(colors.text).font(options.headerFont).fontSize(options.headerFontSize)
      .text(sanitizePdfText(column.label), cursorX + options.padding, y + options.padding, {
        width: Math.max(4, column.width - options.padding * 2),
        height: options.headerHeight - options.padding * 2,
        ellipsis: false,
      });
    cursorX += column.width;
  });
  return y + options.headerHeight;
}

function rowValues(row, columns) {
  if (Array.isArray(row)) return row;
  return columns.map((column) => row?.[column.key] ?? row?.[column.label] ?? '-');
}

function renderTable(doc, columns, rows, options = {}) {
  const info = pageInfo(doc, options);
  const tableWidth = options.width ?? info.width;
  const normalized = normalizeColumns(columns, tableWidth);
  const tableRows = rows && rows.length ? rows : [normalized.map(() => '-')];
  const opts = {
    padding: 5,
    headerHeight: 20,
    minRowHeight: 22,
    bodyFont: 'Helvetica',
    headerFont: 'Helvetica-Bold',
    bodyFontSize: 8,
    headerFontSize: 8,
    lineGap: 1,
    gapAfter: 12,
    ...options,
  };
  const colors = { ...DEFAULT_COLORS, ...(opts.colors || {}) };
  let x = info.left;
  let y = options.y ?? doc.y;
  doc.y = y;
  ensureSpace(doc, opts.headerHeight + opts.minRowHeight + 4, opts);
  y = doc.y;
  y = drawHeader(doc, normalized, x, y, opts);

  tableRows.forEach((row, rowIndex) => {
    const values = rowValues(row, normalized);
    const rowH = Math.max(
      opts.minRowHeight,
      ...normalized.map((column, index) => cellHeight(doc, values[index], column.width, opts))
    );
    if (y + rowH > info.bottom) {
      doc.addPage(opts.pageOptions || undefined);
      if (typeof opts.onPageAdded === 'function') opts.onPageAdded(doc);
      x = (opts.x ?? doc.page.margins.left);
      y = opts.startY ?? doc.y ?? doc.page.margins.top;
      y = drawHeader(doc, normalized, x, y, opts);
    }

    const maxRowH = Math.max(opts.minRowHeight, Math.min(rowH, (doc.page.height - doc.page.margins.bottom) - y));
    let cursorX = x;
    normalized.forEach((column, index) => {
      if (opts.striped && rowIndex % 2 === 1) doc.rect(cursorX, y, column.width, maxRowH).fill(colors.alternateBg);
      doc.rect(cursorX, y, column.width, maxRowH).stroke(colors.border);
      doc.fillColor(colors.text).font(opts.bodyFont).fontSize(opts.bodyFontSize)
        .text(sanitizePdfText(values[index]), cursorX + opts.padding, y + opts.padding, {
          width: Math.max(4, column.width - opts.padding * 2),
          height: Math.max(4, maxRowH - opts.padding * 2),
          lineGap: opts.lineGap,
          ellipsis: rowH > maxRowH,
        });
      cursorX += column.width;
    });
    y += maxRowH;
  });

  doc.y = y + opts.gapAfter;
  return doc.y;
}

function renderTextBlock(doc, text, options = {}) {
  const info = pageInfo(doc, options);
  const padding = options.padding ?? 8;
  const fontSize = options.fontSize ?? 9;
  const colors = { ...DEFAULT_COLORS, ...(options.colors || {}) };
  const clean = sanitizePdfText(text);
  doc.font(options.font || 'Helvetica').fontSize(fontSize);
  const bodyH = doc.heightOfString(clean, { width: info.width - padding * 2, lineGap: options.lineGap ?? 1 });
  const blockH = Math.max(options.minHeight || 26, bodyH + padding * 2);
  ensureSpace(doc, blockH + 4, options);
  const y = doc.y;
  if (options.border !== false) doc.roundedRect(info.left, y, info.width, blockH, options.radius ?? 5).fillAndStroke(options.fill || '#ffffff', colors.border);
  doc.fillColor(options.color || colors.text).font(options.font || 'Helvetica').fontSize(fontSize)
    .text(clean, info.left + padding, y + padding, { width: info.width - padding * 2, lineGap: options.lineGap ?? 1 });
  doc.y = y + blockH + (options.gapAfter ?? 10);
  return doc.y;
}

function wrapTextInCell(doc, text, width, options = {}) {
  const clean = sanitizePdfText(text);
  doc.font(options.font || 'Helvetica').fontSize(options.fontSize || 8);
  const words = clean.split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (doc.widthOfString(candidate) <= width || !line) line = candidate;
    else { lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  return lines;
}

module.exports = { ensureSpace, renderSectionTitle, renderTable, renderTextBlock, sanitizePdfText, wrapTextInCell };
