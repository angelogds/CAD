const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const PDF_LOGO_PATH = path.resolve(__dirname, "../../public/IMG/logopdf_campo_do_gado.png.png");

const COLOR = {
  greenPrimary: "#0b6b3a",
  greenSecondary: "#16A34A",
  line: "#444444",
  light: "#f8f9fa",
  text: "#111827",
  muted: "#6b7280",
  nc: "#dc2626",
  ea: "#f59e0b",
  sp: "#9ca3af",
};

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes(";") || s.includes("\n") || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCSV({ equipamentos, matrix, ncList }) {
  const lines = [];
  lines.push("GRADE");
  lines.push(["Equipamento", ...Array.from({ length: 31 }, (_, i) => i + 1)].join(";"));

  for (const eq of equipamentos) {
    const row = matrix.get(eq.id) || [];
    const statuses = row.map((c) => c.status || "-");
    lines.push([csvEscape(eq.nome), ...statuses].join(";"));
  }

  lines.push("");
  lines.push("NAO_CONFORMIDADES");
  lines.push("Item;Data;Nao Conformidade;Acao Corretiva;Acao Preventiva;Data Correcao;OS ID");

  for (const nc of ncList) {
    lines.push([
      csvEscape(nc.item),
      csvEscape(nc.data_ocorrencia),
      csvEscape(nc.nao_conformidade),
      csvEscape(nc.acao_corretiva),
      csvEscape(nc.acao_preventiva),
      csvEscape(nc.data_correcao),
      csvEscape(nc.os_id),
    ].join(";"));
  }

  return `${lines.join("\n")}\n`;
}

function drawStatusCell(doc, x, y, w, h, status) {
  const s = String(status || "").toUpperCase();
  const fill = s === "C" ? COLOR.greenSecondary : s === "NC" ? COLOR.nc : s === "EA" ? COLOR.ea : COLOR.sp;
  doc.rect(x, y, w, h).fillAndStroke(fill, COLOR.line);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7).text(s || "SP", x, y + 4, { width: w, align: "center" });
}

function drawOfficialHeader(doc) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const fullWidth = right - left;

  doc.rect(left, 28, fullWidth, 74).stroke(COLOR.line);

  doc.rect(left + 1, 29, 120, 72).fill("#ffffff");
  doc.rect(left + 1, 29, 120, 72).stroke(COLOR.line);
  if (fs.existsSync(PDF_LOGO_PATH)) {
    doc.image(PDF_LOGO_PATH, left + 8, 34, { fit: [104, 58], align: "center", valign: "center" });
  }

  doc.fillColor(COLOR.text).font("Helvetica-Bold").fontSize(12).text("PROGRAMA DE AUTO CONTROLE", left + 130, 41, {
    width: fullWidth - 220,
    align: "center",
  });
  doc.font("Helvetica").fontSize(8).text(
    "PAC 01 – MANUTENÇÃO (INSTALAÇÕES, EQUIPAMENTOS INDUSTRIAIS, CALIBRAÇÃO E AFERIÇÃO)",
    left + 130,
    60,
    { width: fullWidth - 220, align: "center" }
  );

  doc.rect(right - 89, 29, 88, 72).stroke(COLOR.line);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR.text).text("PAC.01", right - 70, 49);
  doc.text("CQ.02", right - 67, 68);

  doc.moveTo(left, 108).lineTo(right, 108).lineWidth(1).stroke(COLOR.line);
}

function drawIdentificationBlock(doc, { inspecao, mes, ano, monitorNome, dataVerificacao }) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const top = 116;
  const labelW = 105;
  const valueW = width - labelW;
  const rowH = 18;

  const fields = [
    ["Monitor", monitorNome || inspecao.monitor_nome || "Administrador"],
    ["Verificador", inspecao.verificador_nome || "-"],
    ["Data da verificação", dataVerificacao],
    ["Frequência", inspecao.frequencia || "Diária"],
    ["Mês / Ano", `${String(mes).padStart(2, "0")}/${ano}`],
  ];

  doc.font("Helvetica").fontSize(8);
  fields.forEach(([k, v], idx) => {
    const y = top + idx * rowH;
    doc.rect(left, y, labelW, rowH).fillAndStroke(COLOR.light, COLOR.line);
    doc.fillColor(COLOR.text).font("Helvetica-Bold").text(`${k}:`, left + 4, y + 5, { width: labelW - 8 });

    doc.rect(left + labelW, y, valueW, rowH).fillAndStroke("#ffffff", COLOR.line);
    doc.fillColor(COLOR.text).font("Helvetica").text(String(v || "-"), left + labelW + 4, y + 5, { width: valueW - 8 });
  });

  return top + fields.length * rowH + 14;
}

function drawChecklistTable(doc, { equipamentos, matrix, diasMes, startY, inspecao }) {
  const left = doc.page.margins.left;
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const equipW = 155;
  const dayW = (usableW - equipW) / 31;
  const rowH = 13;

  let y = startY;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR.greenPrimary).text("Checklist Manutenção de Equipamentos", left, y);
  y += 16;

  const drawHeaderRow = () => {
    doc.rect(left, y, equipW, rowH).fillAndStroke(COLOR.light, COLOR.line);
    doc.fillColor(COLOR.text).font("Helvetica-Bold").fontSize(7).text("EQUIPAMENTO", left + 4, y + 3, { width: equipW - 8 });

    for (let d = 1; d <= 31; d += 1) {
      const x = left + equipW + (d - 1) * dayW;
      doc.rect(x, y, dayW, rowH).fillAndStroke(COLOR.light, COLOR.line);
      doc.fillColor(COLOR.text).font("Helvetica-Bold").fontSize(6).text(String(d), x, y + 3, { width: dayW, align: "center" });
    }
    y += rowH;
  };

  drawHeaderRow();

  for (const eq of equipamentos) {
    if (y + rowH > doc.page.height - doc.page.margins.bottom - 80) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 24 });
      drawOfficialHeader(doc);
      y = drawIdentificationBlock(doc, {
        inspecao,
        mes: inspecao.mes,
        ano: inspecao.ano,
        monitorNome: inspecao.monitor_nome,
        dataVerificacao: new Date().toISOString().slice(0, 10).split("-").reverse().join("/"),
      });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR.greenPrimary).text("Checklist Manutenção de Equipamentos", left, y);
      y += 16;
      drawHeaderRow();
    }

    const row = matrix.get(eq.id) || [];
    doc.rect(left, y, equipW, rowH).fillAndStroke("#ffffff", COLOR.line);
    doc.fillColor(COLOR.text).font("Helvetica").fontSize(6.5).text(eq.nome || `Eq #${eq.id}`, left + 3, y + 3, {
      width: equipW - 6,
      ellipsis: true,
    });

    for (let d = 1; d <= 31; d += 1) {
      const x = left + equipW + (d - 1) * dayW;
      const status = d > diasMes ? "SP" : row[d - 1]?.status || "SP";
      drawStatusCell(doc, x, y, dayW, rowH, status);
    }

    y += rowH;
  }

  y += 6;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR.text).text("LEGENDA:", left, y);
  doc.font("Helvetica").text("C: Conforme    NC: Não Conforme    EA: Em Andamento    SP: Sem Produção", left + 50, y);
}

function drawNCBlock(doc, ncList) {
  const left = doc.page.margins.left;
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const baseCols = [80, 55, 160, 120, 120, 70];
  const baseTotal = baseCols.reduce((a, b) => a + b, 0);
  const cols = baseCols.map((c) => (c / baseTotal) * usableW);
  const headers = ["Item", "Data", "Não Conformidade", "Ação corretiva", "Ação preventiva", "Data da correção"];

  let y = 118;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR.greenPrimary).text("Não Conformidades", left, y);
  y += 14;

  let x = left;
  headers.forEach((h, i) => {
    doc.rect(x, y, cols[i], 18).fillAndStroke(COLOR.light, COLOR.line);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOR.text).text(h, x + 3, y + 5, { width: cols[i] - 6 });
    x += cols[i];
  });
  y += 18;

  if (!ncList.length) {
    const w = cols.reduce((a, b) => a + b, 0);
    doc.rect(left, y, w, 20).stroke(COLOR.line);
    doc.font("Helvetica").fontSize(8).fillColor(COLOR.muted).text("Nenhuma não conformidade registrada no período.", left + 5, y + 6);
    return;
  }

  for (const nc of ncList) {
    const rowH = 34;
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 24 });
      drawOfficialHeader(doc);
      y = 118;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR.greenPrimary).text("Não Conformidades", left, y);
      y += 14;
      let hx = left;
      headers.forEach((h, i) => {
        doc.rect(hx, y, cols[i], 18).fillAndStroke(COLOR.light, COLOR.line);
        doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOR.text).text(h, hx + 3, y + 5, { width: cols[i] - 6 });
        hx += cols[i];
      });
      y += 18;
    }

    const values = [
      nc.item || "-",
      nc.data_ocorrencia || "-",
      nc.nao_conformidade || "-",
      nc.acao_corretiva || "-",
      nc.acao_preventiva || "-",
      nc.data_correcao || "-",
    ];

    let cx = left;
    values.forEach((v, i) => {
      doc.rect(cx, y, cols[i], rowH).stroke(COLOR.line);
      doc.font("Helvetica").fontSize(7).fillColor(COLOR.text).text(String(v), cx + 3, y + 4, {
        width: cols[i] - 6,
        height: rowH - 6,
        ellipsis: true,
      });
      cx += cols[i];
    });

    y += rowH;
  }
}

function drawFooter(doc, page, total) {
  const y = doc.page.height - 18;
  doc.font("Helvetica").fontSize(7).fillColor(COLOR.muted).text("PAC 01", 24, y);
  doc.text(`Página ${page}/${total}`, doc.page.width - 80, y, { width: 56, align: "right" });
}

function generatePAC01PDF(inspecaoId, { res, inspecao, equipamentos, matrix, ncList, diasMes, monitorNome, dataVerificacao } = {}) {
  if (!res) throw new Error("Resposta HTTP (res) é obrigatória para gerar o PDF.");
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 24, bufferPages: true });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename=inspecao-pac01-${inspecao?.ano || ""}-${String(inspecao?.mes || "").padStart(2, "0")}.pdf`
  );
  doc.pipe(res);

  drawOfficialHeader(doc);
  const yStart = drawIdentificationBlock(doc, {
    inspecao,
    mes: inspecao?.mes,
    ano: inspecao?.ano,
    monitorNome,
    dataVerificacao: dataVerificacao || new Date().toLocaleDateString("pt-BR"),
  });

  drawChecklistTable(doc, { equipamentos, matrix, diasMes, startY: yStart, inspecao });

  doc.addPage({ size: "A4", layout: "landscape", margin: 24 });
  drawOfficialHeader(doc);
  drawNCBlock(doc, ncList || []);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    drawFooter(doc, i + 1, range.count);
  }

  doc.end();
  return inspecaoId;
}

function renderPDF(payload) {
  return generatePAC01PDF(payload?.inspecao?.id, payload);
}

module.exports = { buildCSV, renderPDF, generatePAC01PDF };
