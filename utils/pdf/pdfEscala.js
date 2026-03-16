const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

const COLORS = {
  primary: "#14532d",
  primaryDark: "#0f3f23",
  text: "#0f172a",
  muted: "#334155",
  border: "#cbd5e1",
  light: "#f8fafc",
  stripe: "#eef6f0",
};

const LOGO_PATH = path.resolve(process.cwd(), "public/IMG/login_campo_do_gado.png.png.png");

function formatDateBr(dateISO) {
  if (!dateISO) return "-";
  const [year, month, day] = String(dateISO).slice(0, 10).split("-");
  if (!year || !month || !day) return String(dateISO);
  return `${day}/${month}/${year}`;
}

function formatDiaSemana(dateISO) {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const d = new Date(`${String(dateISO).slice(0, 10)}T00:00:00Z`);
  return dias[d.getUTCDay()] || "-";
}

function withPdf(res, fileName) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=${fileName}`);
  doc.pipe(res);
  return doc;
}

function drawHeader(doc, title, subtitle) {
  const year = new Date().getFullYear();

  doc.rect(0, 0, doc.page.width, 74).fill(COLORS.primary);

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 48, 10, { fit: [55, 55] });
  }

  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(16).text(title, 110, 24, {
    align: "center",
    width: doc.page.width - 150,
  });

  doc.fillColor("#e2f4e7").font("Helvetica").fontSize(10).text(subtitle, 110, 48, {
    align: "center",
    width: doc.page.width - 150,
  });

  doc.y = 92;

  const footer = `Campo do Gado – Manutenção Industrial – ${year}`;
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text(footer, 40, doc.page.height - 30, {
    align: "center",
    width: doc.page.width - 80,
  });

  return { topY: 92 };
}

function drawTableHeader(doc, columns, startX, y, rowHeight) {
  doc.save();
  doc.rect(startX, y, columns.reduce((acc, c) => acc + c.width, 0), rowHeight).fill(COLORS.primary);

  let x = startX;
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9);
  for (const col of columns) {
    doc.text(col.label, x + 4, y + 6, { width: col.width - 8, align: "center" });
    x += col.width;
  }

  doc.restore();
}

function drawTableRow(doc, columns, startX, y, rowHeight, row, striped = false) {
  const totalWidth = columns.reduce((acc, c) => acc + c.width, 0);
  doc.save();
  if (striped) {
    doc.rect(startX, y, totalWidth, rowHeight).fill(COLORS.stripe);
  }
  doc.rect(startX, y, totalWidth, rowHeight).lineWidth(0.5).strokeColor(COLORS.border).stroke();

  let x = startX;
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
  for (const col of columns) {
    const value = String(row[col.key] || "-");
    doc.text(value, x + 4, y + 4, { width: col.width - 8, align: col.align || "left" });
    doc.moveTo(x, y).lineTo(x, y + rowHeight).lineWidth(0.5).strokeColor(COLORS.border).stroke();
    x += col.width;
  }
  doc.moveTo(x, y).lineTo(x, y + rowHeight).lineWidth(0.5).strokeColor(COLORS.border).stroke();

  doc.restore();
}

function funcaoAgrupada(nomesPorFuncao = {}) {
  const partes = [];
  if (nomesPorFuncao.mecanico?.length) partes.push(`Mecânico: ${nomesPorFuncao.mecanico.join(", ")}`);
  if (nomesPorFuncao.auxiliar?.length) partes.push(`Auxiliar: ${nomesPorFuncao.auxiliar.join(", ")}`);
  if (nomesPorFuncao.operacional?.length) partes.push(`Operacional: ${nomesPorFuncao.operacional.join(", ")}`);
  return partes.length ? partes.join(" | ") : "-";
}

function renderEscalaSemanalPdf(res, { rows = [] }) {
  const doc = withPdf(res, "escala-semanal-manutencao-industrial.pdf");
  drawHeader(
    doc,
    "ESCALA SEMANAL – MANUTENÇÃO INDUSTRIAL",
    "Campo do Gado – Setor de Manutenção Industrial"
  );

  const columns = [
    { key: "semana", label: "Semana", width: 55, align: "center" },
    { key: "periodo", label: "Período (serviço)", width: 120, align: "center" },
    { key: "noturno", label: "Turno noturno (19h–05h)", width: 122, align: "left" },
    { key: "diurno", label: "Turno diurno (07h–17h)", width: 122, align: "left" },
    { key: "apoio", label: "Apoio operacional (diurno)", width: 122, align: "left" },
  ];

  const rowHeight = 48;
  const startX = 40;
  let y = 110;

  drawTableHeader(doc, columns, startX, y, 26);
  y += 26;

  if (!rows.length) {
    drawTableRow(
      doc,
      columns,
      startX,
      y,
      30,
      {
        semana: "-",
        periodo: "-",
        noturno: "Não há dados de escala semanal cadastrados.",
        diurno: "-",
        apoio: "-",
      },
      false
    );
    doc.end();
    return;
  }

  rows.forEach((row, index) => {
    if (y + rowHeight > doc.page.height - 46) {
      doc.addPage();
      drawHeader(
        doc,
        "ESCALA SEMANAL – MANUTENÇÃO INDUSTRIAL",
        "Campo do Gado – Setor de Manutenção Industrial"
      );
      y = 110;
      drawTableHeader(doc, columns, startX, y, 26);
      y += 26;
    }

    drawTableRow(
      doc,
      columns,
      startX,
      y,
      rowHeight,
      {
        semana: row.semana,
        periodo: row.periodo,
        noturno: funcaoAgrupada(row.noturno),
        diurno: funcaoAgrupada(row.diurno),
        apoio: funcaoAgrupada(row.apoio),
      },
      index % 2 !== 0
    );

    y += rowHeight;
  });

  doc.end();
}

function renderEscalaPeriodoPdf(res, { start, end, baseServicos = [], compensacoes = [], folgas = [], descricoes = [] }) {
  const doc = withPdf(res, `escala-folgas-${start}-a-${end}.pdf`);
  drawHeader(
    doc,
    "ESCALA DE FOLGAS – COMPENSAÇÃO DE SERVIÇOS",
    "Campo do Gado – Manutenção Industrial"
  );

  let y = 112;

  function ensurePage(space = 20) {
    if (y + space <= doc.page.height - 48) return;
    doc.addPage();
    drawHeader(
      doc,
      "ESCALA DE FOLGAS – COMPENSAÇÃO DE SERVIÇOS",
      "Campo do Gado – Manutenção Industrial"
    );
    y = 112;
  }

  doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted).text(`Período: ${formatDateBr(start)} até ${formatDateBr(end)}`, 40, y);
  y += 24;

  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.primaryDark).text("1. Base do serviço (registro de horas)", 40, y);
  y += 18;

  if (!baseServicos.length) {
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.text).text("Não há registros de serviço no período informado.", 40, y);
    y += 20;
  } else {
    for (const item of baseServicos) {
      ensurePage(18);
      const linha = `• ${formatDateBr(item.data)} (${item.dia}) — ${item.descricao}`;
      doc.font("Helvetica").fontSize(10).fillColor(COLORS.text).text(linha, 40, y, { width: 520 });
      y = doc.y + 4;
    }
  }

  ensurePage(38);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.primaryDark).text("2. Apuração de compensação (direito de folga)", 40, y);
  y += 18;

  if (!compensacoes.length) {
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.text).text("Não há apuração de compensação para o período.", 40, y);
    y += 20;
  } else {
    compensacoes.forEach((c) => {
      ensurePage(18);
      doc.font("Helvetica").fontSize(10).fillColor(COLORS.text).text(`• ${c.colaborador} — ${c.direito}.`, 40, y, { width: 520 });
      y = doc.y + 4;
    });
  }

  ensurePage(70);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.primaryDark).text("3. Concessão das folgas", 40, y);
  y += 16;

  const columns = [
    { key: "data", label: "Data", width: 90, align: "center" },
    { key: "dia", label: "Dia", width: 60, align: "center" },
    { key: "colaborador", label: "Colaborador", width: 160, align: "left" },
    { key: "direito", label: "Direito/Concessão", width: 250, align: "left" },
  ];

  drawTableHeader(doc, columns, 40, y, 24);
  y += 24;

  if (!folgas.length) {
    drawTableRow(doc, columns, 40, y, 28, {
      data: "-",
      dia: "-",
      colaborador: "Sem registros de folga/compensação no período.",
      direito: "-",
    });
    y += 34;
  } else {
    folgas.forEach((f, index) => {
      ensurePage(34);
      drawTableRow(doc, columns, 40, y, 28, {
        data: formatDateBr(f.data),
        dia: formatDiaSemana(f.data),
        colaborador: f.colaborador,
        direito: f.direito,
      }, index % 2 !== 0);
      y += 28;
    });
    y += 6;
  }

  ensurePage(40);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.primaryDark).text("4. Descrição dos serviços executados", 40, y);
  y += 18;

  if (!descricoes.length) {
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.text).text("Sem descrição de serviços para o período selecionado.", 40, y, { width: 520 });
    y += 20;
  } else {
    descricoes.forEach((d) => {
      ensurePage(20);
      doc.font("Helvetica").fontSize(10).fillColor(COLORS.text).text(`• ${d}`, 40, y, { width: 520 });
      y = doc.y + 4;
    });
  }

  ensurePage(30);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.primaryDark).text("5. Registro em OS", 40, y);
  y += 18;
  doc.font("Helvetica").fontSize(10).fillColor(COLORS.text).text(
    "Todas as atividades e ocorrências relacionadas ao período devem ser registradas via OS no sistema oficial.",
    40,
    y,
    { width: 520 }
  );

  doc.end();
}

module.exports = {
  renderEscalaSemanalPdf,
  renderEscalaPeriodoPdf,
  formatDateBr,
};
