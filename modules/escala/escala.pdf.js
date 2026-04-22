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

function drawPeriodCard(doc, { meta, registro, index }) {
  const x = PAGE.margins.left;
  const width = doc.page.width - PAGE.margins.left - PAGE.margins.right;

  const col1 = 188;
  const col2 = 170;
  const col3 = width - col1 - col2;

  const colaborador = truncateText(registro.colaborador || "-", 44);
  const funcao = truncateText(registro.funcao || "-", 32);
  const folga = `${formatDateBr(registro.inicio)} até ${formatDateBr(registro.fim)}`;
  const tipoConcessao = `${truncateText(registro.tipo || "-", 16)}${registro.concessao ? ` (${registro.concessao})` : ''}`;
  const motivo = truncateText(registro.motivo || "-", 200);
  const equipeDescricao = `Colaborador: ${colaborador} • Função: ${funcao} • Tipo: ${tipoConcessao}`;
  const dataHora = registro.dataServico
    ? `${formatDateBr(registro.dataServico)} • ${registro.horaInicio || '-'} às ${registro.horaFim || '-'}`
    : "-";
  const equipamento = truncateText(registro.equipamentoSetor || "-", 70);
  const descricaoServico = truncateText(registro.descricaoServico || "-", 250);

  const pad = 8;
  const serviceHeaderHeight = 20;
  const serviceRowHeight = Math.max(
    22,
    doc.heightOfString(dataHora, { width: col1 - (pad * 2) }) + (pad * 2),
    doc.heightOfString(equipamento, { width: col2 - (pad * 2) }) + (pad * 2),
    doc.heightOfString(descricaoServico, { width: col3 - (pad * 2) }) + (pad * 2),
  );

  const topInfoH = 54;
  const motivoH = Math.max(30, doc.heightOfString(motivo, { width: width - 24 }) + 12);
  const equipeH = Math.max(30, doc.heightOfString(equipeDescricao, { width: width - 24 }) + 12);
  const cardHeight = 16 + topInfoH + 10 + motivoH + 10 + serviceHeaderHeight + serviceRowHeight + 10 + equipeH + 16;

  ensureSpace(doc, cardHeight + 10, meta);
  const top = doc.y;

  doc.save();
  doc.roundedRect(x, top, width, cardHeight, 12).lineWidth(1).strokeColor(COLORS.border).stroke();

  doc.fillColor("#eefbf2").roundedRect(x + 1, top + 1, width - 2, 28, 11).fill();
  doc.fillColor(COLORS.greenDark).font("Helvetica-Bold").fontSize(10)
    .text(`COLABORADOR ${String(index + 1).padStart(2, '0')}`, x + 12, top + 9);

  const infoY = top + 36;
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.8)
    .text("Nome do colaborador", x + 10, infoY)
    .text("Função", x + 10 + col1, infoY)
    .text("Data da folga", x + 10 + col1 + col2, infoY);

  doc.font("Helvetica").fontSize(9.1).fillColor(COLORS.text)
    .text(colaborador, x + 10, infoY + 13, { width: col1 - 10 })
    .text(funcao, x + 10 + col1, infoY + 13, { width: col2 - 10 })
    .text(folga, x + 10 + col1 + col2, infoY + 13, { width: col3 - 10 });

  const motivoY = infoY + topInfoH + 2;
  doc.roundedRect(x + 10, motivoY, width - 20, motivoH, 8).lineWidth(0.7).strokeColor(COLORS.border).stroke();
  doc.font("Helvetica-Bold").fontSize(8.4).fillColor(COLORS.muted)
    .text(`Motivo / concessão: ${tipoConcessao}`, x + 16, motivoY + 7, { width: width - 30 });
  doc.font("Helvetica").fontSize(8.8).fillColor(COLORS.text)
    .text(motivo, x + 16, motivoY + 18, { width: width - 30 });

  const tableY = motivoY + motivoH + 10;
  doc.roundedRect(x + 10, tableY, width - 20, serviceHeaderHeight, 7).fill(COLORS.greenDark);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8.2);
  doc.text("Serviço executado – Data e horário", x + 16, tableY + 6, { width: col1 - 12, align: "center" });
  doc.text("Equipamento / setor", x + 10 + col1 + 6, tableY + 6, { width: col2 - 12, align: "center" });
  doc.text("Descrição da execução", x + 10 + col1 + col2 + 6, tableY + 6, { width: col3 - 12, align: "center" });

  const rowY = tableY + serviceHeaderHeight;
  doc.rect(x + 10, rowY, width - 20, serviceRowHeight).lineWidth(0.7).strokeColor(COLORS.border).stroke();
  doc.moveTo(x + 10 + col1, rowY).lineTo(x + 10 + col1, rowY + serviceRowHeight).strokeColor(COLORS.border).stroke();
  doc.moveTo(x + 10 + col1 + col2, rowY).lineTo(x + 10 + col1 + col2, rowY + serviceRowHeight).strokeColor(COLORS.border).stroke();
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(8.8)
    .text(dataHora, x + 10 + pad, rowY + pad, { width: col1 - (pad * 2) })
    .text(equipamento, x + 10 + col1 + pad, rowY + pad, { width: col2 - (pad * 2) })
    .text(descricaoServico, x + 10 + col1 + col2 + pad, rowY + pad, { width: col3 - (pad * 2) });

  const equipeY = rowY + serviceRowHeight + 10;
  doc.roundedRect(x + 10, equipeY, width - 20, equipeH, 8).lineWidth(0.7).strokeColor(COLORS.border).stroke();
  doc.font("Helvetica-Bold").fontSize(8.4).fillColor(COLORS.muted)
    .text("Descrição da equipe", x + 16, equipeY + 7, { width: width - 30 });
  doc.font("Helvetica").fontSize(8.8).fillColor(COLORS.text)
    .text(equipeDescricao, x + 16, equipeY + 18, { width: width - 30 });
  doc.restore();

  doc.y = top + cardHeight + 10;
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
      .text("1. Cards de compensação por colaborador", PAGE.margins.left, doc.y);
    doc.y += 12;

    if (!registros.length) {
      ensureSpace(doc, 28, meta);
      doc.font("Helvetica").fontSize(9.3).fillColor(COLORS.muted)
        .text("Sem concessões de folga/atestado/férias no período selecionado.", PAGE.margins.left, doc.y);
      doc.y += 16;
    } else {
      registros.forEach((registro, index) => drawPeriodCard(doc, { meta, registro, index }));
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
