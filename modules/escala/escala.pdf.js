const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

const PAGE = {
  size: "A4",
  margins: { left: 36, right: 36, top: 28, bottom: 32 },
};

const COLORS = {
  green: "#2E8B57",
  greenDark: "#1F6F43",
  text: "#0f172a",
  muted: "#475569",
  border: "#d1d5db",
  stripe: "#f6fbf8",
};

const HEADER_HEIGHT = 76;
const FOOTER_HEIGHT = 30;
const BODY_START_GAP = 14;
const FOOTER_TEXT = "Campo do Gado – Manutenção Industrial – 2026";
const SIGNATURE = "Responsável técnico: Ângelo Gomes da Silva — Encarregado de Manutenção — Reciclagem Campo do Gado";
const OS_NOTE = "Registro em OS: todas as atividades e ocorrências relacionadas ao período devem ser registradas via OS no sistema oficial: manutencao-campoLgado.app.br";

function formatDateBr(dateISO) {
  if (!dateISO) return "-";
  const [y, m, d] = String(dateISO).slice(0, 10).split("-");
  if (!y || !m || !d) return String(dateISO);
  return `${d}/${m}/${y}`;
}

function createDoc() {
  return new PDFDocument({ size: PAGE.size, margins: PAGE.margins, autoFirstPage: true });
}

function logoPath() {
  const target = path.resolve(process.cwd(), "public/IMG/logo_menu.png.png");
  return fs.existsSync(target) ? target : null;
}

function contentTop() {
  return PAGE.margins.top + HEADER_HEIGHT + BODY_START_GAP;
}

function contentBottom(doc) {
  return doc.page.height - PAGE.margins.bottom - FOOTER_HEIGHT;
}

function drawHeader(doc, { title, subtitle, logoPath: lPath }) {
  const x = PAGE.margins.left;
  const y = PAGE.margins.top;
  const width = doc.page.width - PAGE.margins.left - PAGE.margins.right;

  doc.save();
  doc.roundedRect(x, y, width, HEADER_HEIGHT, 10).fill(COLORS.green);
  if (lPath && fs.existsSync(lPath)) {
    doc.image(lPath, x + 10, y + 9, { fit: [94, 58] });
  }
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(13)
    .text(title, x + 110, y + 22, { width: width - 124, align: "center" });
  doc.fillColor("#def7e8").font("Helvetica").fontSize(9.5)
    .text(subtitle, x + 110, y + 45, { width: width - 124, align: "center" });
  doc.restore();
}

function drawFooter(doc, { text = FOOTER_TEXT }) {
  const lineY = doc.page.height - PAGE.margins.bottom - FOOTER_HEIGHT;
  doc.save();
  doc.lineWidth(0.6).strokeColor(COLORS.border)
    .moveTo(PAGE.margins.left, lineY)
    .lineTo(doc.page.width - PAGE.margins.right, lineY)
    .stroke();
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5).text(
    text,
    PAGE.margins.left,
    lineY + 9,
    { width: doc.page.width - PAGE.margins.left - PAGE.margins.right, align: "center" },
  );
  doc.restore();
}

function setupPage(doc, meta, isNewPage = false) {
  if (isNewPage) doc.addPage();
  drawHeader(doc, meta);
  drawFooter(doc, { text: FOOTER_TEXT });
  doc.y = contentTop();
}

function ensureSpace(doc, neededHeight, meta) {
  if (doc.y + neededHeight <= contentBottom(doc)) return;
  setupPage(doc, meta, true);
}

function tableRowHeight(doc, row, columns) {
  const pad = 5;
  return Math.max(...columns.map((col) => {
    const text = String(row[col.key] || "-");
    return doc.heightOfString(text, { width: col.width - (pad * 2), align: col.align || "left" }) + (pad * 2);
  }));
}

function drawTable(doc, { columns, rows, meta, emptyRow }) {
  const x = PAGE.margins.left;
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const headerH = 24;

  const drawHeaderRow = () => {
    ensureSpace(doc, headerH, meta);
    const top = doc.y;
    doc.save();
    doc.rect(x, top, tableWidth, headerH).fill(COLORS.greenDark);
    doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8.2);
    let cursor = x;
    for (const col of columns) {
      doc.text(col.label, cursor + 3, top + 7, { width: col.width - 6, align: "center" });
      cursor += col.width;
    }
    doc.restore();
    doc.y = top + headerH;
  };

  const drawRow = (row, index) => {
    const h = tableRowHeight(doc, row, columns);
    ensureSpace(doc, h, meta);
    const top = doc.y;
    const pad = 5;

    doc.save();
    if (index % 2 === 1) {
      doc.rect(x, top, tableWidth, h).fill(COLORS.stripe);
    }
    doc.rect(x, top, tableWidth, h).lineWidth(0.6).strokeColor(COLORS.border).stroke();

    let cursor = x;
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(8.6);
    for (const col of columns) {
      doc.moveTo(cursor, top).lineTo(cursor, top + h).strokeColor(COLORS.border).stroke();
      doc.text(String(row[col.key] || "-"), cursor + pad, top + pad, {
        width: col.width - (pad * 2),
        align: col.align || "left",
      });
      cursor += col.width;
    }
    doc.moveTo(cursor, top).lineTo(cursor, top + h).strokeColor(COLORS.border).stroke();
    doc.restore();
    doc.y = top + h;
  };

  drawHeaderRow();

  if (!rows.length) {
    drawRow(emptyRow, 0);
    return;
  }

  rows.forEach((row, i) => {
    if (i > 0 && doc.y + 14 > contentBottom(doc)) {
      setupPage(doc, meta, true);
      drawHeaderRow();
    }
    drawRow(row, i);
  });
}

function roleText(group) {
  if (!group) return "-";
  const out = [];
  out.push(group.mecanico?.length ? `Mecânico: ${group.mecanico.join(", ")}` : "Mecânico: -");
  if (group.auxiliar?.length) out.push(`Auxiliar: ${group.auxiliar.join(", ")}`);
  if (group.operacional?.length) out.push(`Operacional: ${group.operacional.join(", ")}`);
  return out.join("\n");
}

function generateWeeklyPDF({ rows = [] } = {}) {
  const doc = createDoc();
  const meta = {
    title: "ESCALA SEMANAL – MANUTENÇÃO INDUSTRIAL",
    subtitle: "Campo do Gado – Manutenção Industrial",
    logoPath: logoPath(),
  };

  process.nextTick(() => {
    setupPage(doc, meta, false);

    const tableRows = rows.map((item) => ({
      semana: String(item.semanaNumero || item.semana || "-"),
      periodo: item.periodoTexto || item.periodo || "-",
      noturno: roleText(item.noturno),
      diurno: roleText(item.diurno),
      apoio: roleText(item.apoioOperacionalDiurno || item.apoio || { operacional: item.diurno?.operacional || [] }),
    }));

    drawTable(doc, {
      meta,
      columns: [
        { key: "semana", label: "Semana", width: 52, align: "center" },
        { key: "periodo", label: "Período (serviço)", width: 114, align: "center" },
        { key: "noturno", label: "Turno noturno (19h–05h)", width: 128 },
        { key: "diurno", label: "Turno diurno (07h–17h)", width: 128 },
        { key: "apoio", label: "Apoio operacional (diurno)", width: 127 },
      ],
      rows: tableRows,
      emptyRow: {
        semana: "-",
        periodo: "-",
        noturno: "-",
        diurno: "Sem dados de escala semanal cadastrados.",
        apoio: "-",
      },
    });

    doc.end();
  });

  return doc;
}

function truncateText(text, max = 140) {
  const raw = String(text || '-').replace(/\s+/g, ' ').trim();
  if (raw.length <= max) return raw || '-';
  return `${raw.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function generatePeriodPDF({ start, end, periodoTexto, baseServicos = [], apuracao = [], registros = [] } = {}) {
  const doc = createDoc();
  const meta = {
    title: "ESCALA DE FOLGAS – COMPENSAÇÃO DE SERVIÇOS",
    subtitle: "Campo do Gado – Manutenção Industrial",
    logoPath: logoPath(),
  };

  process.nextTick(() => {
    setupPage(doc, meta, false);

    const periodoLinha = periodoTexto || (start && end
      ? `${formatDateBr(start)} até ${formatDateBr(end)}`
      : "Todos os registros cadastrados");

    const totalHoras = apuracao.reduce((acc, item) => acc + (Number(item.totalMinutos || 0) / 60), 0);
    const totalInteiras = apuracao.reduce((acc, item) => acc + Number(item.totalInteiras || 0), 0);
    const totalMeias = apuracao.reduce((acc, item) => acc + Number(item.totalMeias || 0), 0);

    ensureSpace(doc, 24, meta);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10.5)
      .text(`Período: ${periodoLinha}`, PAGE.margins.left, doc.y);
    doc.y += 4;
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted)
      .text(
        `Resumo: ${registros.length} concessão(ões) • ${(totalHoras || 0).toFixed(1).replace('.', ',')}h apuradas • ${totalInteiras} folga(s) inteira(s) • ${totalMeias} meia(s).`,
        PAGE.margins.left,
        doc.y,
        { width: 520 },
      );
    doc.y += 16;

    ensureSpace(doc, 20, meta);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.greenDark)
      .text("1. Quadro consolidado para RH", PAGE.margins.left, doc.y);
    doc.y += 12;

    const pageUsable = contentBottom(doc) - doc.y - 42;
    const rowHeight = 48;
    const visibleRows = Math.max(1, Math.floor((pageUsable - 24) / rowHeight));
    const rowsToShow = registros.slice(0, visibleRows).map((r) => ({
      colaborador: `${truncateText(r.colaborador, 26)}
${truncateText(r.funcao, 18)}`,
      periodo: `${formatDateBr(r.inicio)}
${formatDateBr(r.fim)}`,
      motivo: truncateText(r.motivo || '-', 120),
      servico: r.dataServico
        ? `${formatDateBr(r.dataServico)} ${r.horaInicio || '-'}-${r.horaFim || '-'}
${truncateText(r.equipamentoSetor || '-', 26)}
${truncateText(r.descricaoServico || '-', 110)}`
        : '-',
    }));

    drawTable(doc, {
      meta,
      columns: [
        { key: "colaborador", label: "Colaborador/Função", width: 120 },
        { key: "periodo", label: "Folga (Início/Fim)", width: 82, align: "center" },
        { key: "motivo", label: "Motivo", width: 130 },
        { key: "servico", label: "Serviço executado (data/hora/equipamento/descrição)", width: 170 },
      ],
      rows: rowsToShow,
      emptyRow: {
        colaborador: "Sem concessões cadastradas.",
        periodo: "-",
        motivo: "-",
        servico: "-",
      },
    });

    const omitted = Math.max(0, registros.length - rowsToShow.length);
    doc.y += 8;
    ensureSpace(doc, 26, meta);

    if (omitted > 0) {
      doc.font("Helvetica-Bold").fontSize(8.8).fillColor(COLORS.muted)
        .text(
          `Observação: ${omitted} registro(s) adicional(is) não exibido(s) para manter este relatório em uma única página.`,
          PAGE.margins.left,
          doc.y,
          { width: 520 },
        );
      doc.y += 16;
    }

    doc.font("Helvetica").fontSize(8.8).fillColor(COLORS.text)
      .text(OS_NOTE, PAGE.margins.left, doc.y, { width: 520 });

    doc.end();
  });

  return doc;
}


module.exports = {
  drawHeader,
  drawFooter,
  ensureSpace,
  drawTable,
  formatDateBr,
  generateWeeklyPDF,
  generatePeriodPDF,
};
