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

function buildCSV({ equipamentos, matrix, ncList, preventivasExecutadas = [] }) {
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
  lines.push("Item;Data;Nao Conformidade;Acao Preventiva;Acao Corretiva;Data Correcao;OS ID");

  for (const nc of ncList) {
    lines.push([
      csvEscape(nc.item),
      csvEscape(nc.data_ocorrencia),
      csvEscape(nc.nao_conformidade),
      csvEscape(nc.acao_preventiva_canonica || nc.acao_corretiva),
      csvEscape(nc.acao_corretiva_canonica || nc.acao_preventiva),
      csvEscape(nc.data_correcao),
      csvEscape(nc.os_id),
    ].join(";"));
  }

  lines.push("");
  lines.push("PREVENTIVAS_EXECUTADAS_NO_PERIODO");
  lines.push("Codigo;Equipamento;Setor;Data programada;Data executada;Responsavel;Descricao;Itens verificados;Nao conformidade;Acao corretiva;Acao preventiva;Situacao final;OS corretiva");
  for (const p of preventivasExecutadas) lines.push([`PREV-${p.id}`, p.equipamento_nome, p.setor, p.data_prevista, p.data_executada, p.responsavel_exibicao, p.descricao_preventiva, p.itens_verificados, p.nao_conformidade, p.acao_corretiva, p.acao_preventiva, p.situacao_final, p.os_corretiva_id].map(csvEscape).join(";"));
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
  const headers = ["Item", "Data", "Não Conformidade", "Ação preventiva", "Ação corretiva", "Data da correção"];

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
      nc.acao_preventiva_canonica || nc.acao_corretiva || "-",
      nc.acao_corretiva_canonica || nc.acao_preventiva || "-",
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


function normalizePDFStatus(status, motivo) {
  const rawStatus = String(status || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  const rawMotivo = String(motivo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (rawMotivo.includes("material") || rawMotivo.includes("compra") || rawMotivo.includes("peca") || rawMotivo.includes("tornearia")) return "AGUARDANDO_MATERIAL";
  if (rawStatus.includes("FINALIZ") || rawStatus.includes("CONCLUID") || rawStatus.includes("FECHAD")) return "FINALIZADA";
  if (rawStatus.includes("PAUS") || rawStatus.includes("PARAD")) return "PAUSADA";
  if (rawStatus.includes("ANDAMENTO") || rawStatus === "ANDAMENTO") return "EM_ANDAMENTO";
  return "ABERTA";
}

function pdfStatusMeta(status) {
  const map = {
    ABERTA: { label: "ABERTA", color: "#2563eb", text: "#ffffff" },
    EM_ANDAMENTO: { label: "EM ANDAMENTO", color: "#f97316", text: "#ffffff" },
    PAUSADA: { label: "PAUSADA", color: "#facc15", text: "#713f12" },
    AGUARDANDO_MATERIAL: { label: "AGUARDANDO MATERIAL", color: "#dc2626", text: "#ffffff" },
    FINALIZADA: { label: "FINALIZADA", color: "#16a34a", text: "#ffffff" },
  };
  return map[status] || map.ABERTA;
}

function formatPDFDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function textHeight(doc, text, width, fontSize = 7.5, font = "Helvetica") {
  doc.font(font).fontSize(fontSize);
  return Math.max(13, doc.heightOfString(String(text || "-"), { width, lineGap: 1 }));
}

function drawCardSection(doc, title, text, x, y, width, options = {}) {
  const titleH = 10;
  const bodyH = textHeight(doc, text, width - 18, options.fontSize || 7.5);
  doc.font("Helvetica-Bold").fontSize(7.8).fillColor(COLOR.greenPrimary).text(title, x + 9, y, { width: width - 18 });
  doc.font("Helvetica").fontSize(options.fontSize || 7.5).fillColor(COLOR.text).text(String(text || "-"), x + 9, y + titleH, { width: width - 18, lineGap: 1 });
  return titleH + bodyH + 8;
}

function drawOSEmAndamentoBlock(doc, osEmAndamento = [], meta = {}) {
  const left = doc.page.margins.left;
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = 118;

  const drawHeader = () => {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR.greenPrimary).text("Ordens de Serviço em Andamento — Justificativas e Rastreabilidade", left, y);
    y += 15;
    doc.font("Helvetica").fontSize(7.5).fillColor(COLOR.muted).text(
      `Campo do Gado • Data de emissão: ${formatPDFDate(new Date())} • Responsável pela emissão: ${meta.monitorNome || meta.inspecao?.monitor_nome || "Administrador"}`,
      left,
      y,
      { width: usableW }
    );
    y += 17;
  };

  const ensureSpace = (height) => {
    if (y + height <= doc.page.height - doc.page.margins.bottom - 8) return;
    doc.addPage({ size: "A4", layout: "landscape", margin: 24 });
    drawOfficialHeader(doc);
    y = 118;
    drawHeader();
  };

  drawHeader();
  if (!osEmAndamento.length) {
    doc.rect(left, y, usableW, 24).stroke(COLOR.line);
    doc.font("Helvetica").fontSize(8).fillColor(COLOR.muted).text("Nenhuma OS aberta ou em andamento no período.", left + 7, y + 8);
    return;
  }

  for (const os of osEmAndamento) {
    const status = normalizePDFStatus(os.status, os.motivo_atual);
    const statusMeta = pdfStatusMeta(status);
    const sectionW = (usableW - 18) / 2;
    const historico = Array.isArray(os.historico_resumido) && os.historico_resumido.length
      ? os.historico_resumido.map((item) => `${formatPDFDate(item.registrado_em)} — ${item.motivo_nome || "Atualização"}${item.texto_ia || item.texto_padrao ? `: ${item.texto_ia || item.texto_padrao}` : ""}`).join("\n")
      : "Nenhum histórico registrado.";
    const materialText = os.solicitacao_vinculada ? `Material solicitado: sim • Solicitação ${os.solicitacao_vinculada.numero || ('#' + os.solicitacao_vinculada.id)} • Status ${os.solicitacao_vinculada.status || '-'}` : (os.material_chegou_em ? `Material disponível desde ${formatPDFDate(os.material_chegou_em)}` : status === "AGUARDANDO_MATERIAL" ? "Material pendente" : "Material disponível");
    const chatTratativas = Array.isArray(os.chat_historico) && os.chat_historico.length
      ? os.chat_historico.map((item) => `${formatPDFDate(item.created_at)} — ${item.tipo || 'CHAT'} ${item.autor_nome ? '(' + item.autor_nome + ')' : ''}: ${item.mensagem || '-'}`).join("\n")
      : "Nenhuma tratativa registrada no Chat de OS.";
    const leftSections = [
      ["NÃO CONFORMIDADE", os.nao_conformidade || "-"],
      ["MOTIVO DA PARALISAÇÃO", os.motivo_atual || "Justificativa pendente"],
      ["JUSTIFICATIVA TÉCNICA", os.ultima_justificativa || "-"],
    ];
    const rightSections = [
      ["AÇÃO NECESSÁRIA", os.acao_necessaria || "Registrar e acompanhar ação necessária"],
      ["MATERIAL", materialText],
      ["HISTÓRICO", historico],
      ["HISTÓRICO DE TRATATIVAS DA OS", chatTratativas],
    ];
    const leftH = leftSections.reduce((sum, [, text]) => sum + 8 + textHeight(doc, text, sectionW - 18, 7.2), 0);
    const rightH = rightSections.reduce((sum, [, text]) => sum + 8 + textHeight(doc, text, sectionW - 18, 7.2), 0);
    const cardH = Math.max(118, 70 + Math.max(leftH, rightH));

    ensureSpace(cardH + 10);

    doc.roundedRect(left, y, usableW, cardH, 10).fillAndStroke("#ffffff", COLOR.line);
    doc.roundedRect(left, y, usableW, 42, 10).fill(statusMeta.color);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11).text(`OS #${os.id} • ${os.equipamento || "-"}`, left + 12, y + 10, { width: usableW - 170 });
    doc.fillColor(statusMeta.text).font("Helvetica-Bold").fontSize(8).text(statusMeta.label, left + usableW - 145, y + 11, { width: 128, align: "center" });
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9).text(`${os.dias_aberta ?? "-"} dias em aberto`, left + usableW - 145, y + 24, { width: 128, align: "center" });

    const metaY = y + 50;
    const metaW = (usableW - 24) / 3;
    const metaFields = [
      ["Responsável", os.responsavel || "-"],
      ["Data de abertura", formatPDFDate(os.opened_at)],
      ["Última atualização", formatPDFDate(os.ultima_atualizacao)],
    ];
    metaFields.forEach(([label, value], index) => {
      const x = left + 8 + index * (metaW + 4);
      doc.roundedRect(x, metaY, metaW, 25, 6).fillAndStroke(COLOR.light, "#d9e4dc");
      doc.font("Helvetica-Bold").fontSize(6.7).fillColor(COLOR.muted).text(label, x + 6, metaY + 5, { width: metaW - 12 });
      doc.font("Helvetica-Bold").fontSize(7.2).fillColor(COLOR.text).text(String(value), x + 6, metaY + 15, { width: metaW - 12 });
    });

    let ly = y + 84;
    let ry = y + 84;
    leftSections.forEach(([title, text]) => {
      ly += drawCardSection(doc, title, text, left + 6, ly, sectionW, { fontSize: 7.2 });
    });
    rightSections.forEach(([title, text]) => {
      ry += drawCardSection(doc, title, text, left + 12 + sectionW, ry, sectionW, { fontSize: 7.2 });
    });
    y += cardH + 10;
  }
}

function drawPreventivasBlock(doc, preventivas) {
  const left = doc.page.margins.left;
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = 118;
  const title = () => { doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR.greenPrimary).text("Preventivas Executadas no Período", left, y); y += 18; };
  title();
  if (!preventivas.length) { doc.rect(left, y, usableW, 22).stroke(COLOR.line); doc.font("Helvetica").fontSize(8).fillColor(COLOR.muted).text("Nenhuma preventiva executada no período filtrado.", left + 5, y + 7); return; }
  for (const p of preventivas) {
    const rowH = 82;
    if (y + rowH > doc.page.height - doc.page.margins.bottom) { doc.addPage({ size: "A4", layout: "landscape", margin: 24 }); drawOfficialHeader(doc); y = 118; title(); }
    doc.rect(left, y, usableW, rowH).stroke(COLOR.line);
    doc.rect(left, y, usableW, 17).fillAndStroke(p.tem_nao_conformidade ? "#fee2e2" : "#dcfce7", COLOR.line);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR.text).text(`PREV-${p.id} • ${p.equipamento_nome || "-"} • ${p.setor || "-"} • Executada: ${p.data_executada || "-"} • Responsável: ${p.responsavel_exibicao || "-"}${p.os_corretiva_id ? ` • OS corretiva #${p.os_corretiva_id}` : ""}`, left + 5, y + 5, { width: usableW - 10 });
    doc.font("Helvetica").fontSize(7).fillColor(COLOR.text);
    const body = [
      `Dados da preventiva: programada ${p.data_prevista || "-"}; tipo ${p.tipo_preventiva || "preventiva"}; situação final ${String(p.situacao_final || "-").replaceAll("_", " ")}.`,
      `Descrição / itens verificados: ${p.descricao_preventiva || p.titulo || "-"} | ${p.itens_verificados || "-"}`,
      `Não conformidades: ${p.nao_conformidade || "-"}`,
      `Ações corretivas: ${p.acao_corretiva || "-"} | Ações preventivas: ${p.acao_preventiva || "-"}`,
      `Observações técnicas / evidências: ${p.observacoes_tecnicas || "-"} | ${p.evidencias || "-"}`,
    ].join("\n");
    doc.text(body, left + 5, y + 22, { width: usableW - 10, height: rowH - 26, ellipsis: true });
    y += rowH + 7;
  }
}

function drawFooter(doc, page, total) {
  const y = doc.page.height - 18;
  doc.font("Helvetica").fontSize(7).fillColor(COLOR.muted).text("PAC 01", 24, y);
  doc.text(`Página ${page}/${total}`, doc.page.width - 80, y, { width: 56, align: "right" });
}

function generatePAC01PDF(inspecaoId, { res, inspecao, equipamentos, matrix, ncList, osEmAndamento, preventivasExecutadas, diasMes, monitorNome, dataVerificacao } = {}) {
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

  doc.addPage({ size: "A4", layout: "landscape", margin: 24 });
  drawOfficialHeader(doc);
  drawOSEmAndamentoBlock(doc, osEmAndamento || [], { inspecao, monitorNome });

  doc.addPage({ size: "A4", layout: "landscape", margin: 24 });
  drawOfficialHeader(doc);
  drawPreventivasBlock(doc, preventivasExecutadas || []);

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
