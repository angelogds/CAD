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
const OS_NOTE = "Registro em OS: ocorrências relacionadas ao período devem ser registradas via OS no site oficial: manutencao.campodogado.app.br.";

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
  const options = [
    path.resolve(process.cwd(), "public/IMG/login_campo_do_gado.png.png.png"),
    path.resolve(process.cwd(), "public/IMG/logo_menu.png.png"),
  ];

  return options.find((target) => fs.existsSync(target)) || null;
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
    const logoX = x + 10;
    const logoY = y + 7;
    const logoW = 94;
    const logoH = 62;
    doc.image(lPath, logoX, logoY, {
      fit: [logoW, logoH],
      align: "center",
      valign: "center",
    });
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
  out.push(group.mecanico?.length ? `Mecânicos: ${group.mecanico.join(", ")}` : "Mecânicos: -");
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
      observacoes: item.observacoes || "Todos como Mecânico Industrial",
    }));

    drawTable(doc, {
      meta,
      columns: [
        { key: "semana", label: "Semana", width: 52, align: "center" },
        { key: "periodo", label: "Período (serviço)", width: 114, align: "center" },
        { key: "noturno", label: "Mecânico Plantonista (Noturno)", width: 150 },
        { key: "diurno", label: "Mecânicos Escalados (Diurno)", width: 180 },
        { key: "observacoes", label: "Observações", width: 53 },
      ],
      rows: tableRows,
      emptyRow: {
        semana: "-",
        periodo: "-",
        noturno: "-",
        diurno: "Sem dados de escala semanal cadastrados.",
        observacoes: "-",
      },
    });

    doc.end();
  });

  return doc;
}


function formatGeoStatus(status) {
  const labels = {
    DENTRO_DA_UNIDADE: 'Dentro da unidade',
    PROXIMO_DA_UNIDADE: 'Próximo da unidade',
    FORA_DA_AREA: 'Fora da área da unidade',
    NAO_AUTORIZADA: 'Localização não autorizada',
    GPS_INDISPONIVEL: 'GPS indisponível',
    NAO_CAPTURADA: 'Localização não capturada',
  };
  return labels[String(status || '').toUpperCase()] || 'Localização não capturada';
}

function geoLine(label, status, precisao) {
  const precision = precisao !== null && precisao !== undefined && precisao !== '' ? ` — precisão ${Math.round(Number(precisao))} m` : '';
  return `${label}: ${formatGeoStatus(status)}${precision}.`;
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
  const geoDescricao = [
    geoLine('Localização inicial', registro.statusLocalizacaoInicio, registro.precisaoInicio),
    geoLine('Localização final', registro.statusLocalizacaoFim, registro.precisaoFim),
    registro.justificativaSemLocalizacao ? `Localização não capturada. Justificativa: ${registro.justificativaSemLocalizacao}` : '',
    registro.alertaLocalizacao ? 'ALERTA: localização fora da área da unidade; registro pendente de análise do encarregado.' : '',
  ].filter(Boolean).join(' ');
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
  const geoH = Math.max(34, doc.heightOfString(geoDescricao, { width: width - 24 }) + 14);
  const cardHeight = 16 + topInfoH + 10 + motivoH + 10 + serviceHeaderHeight + serviceRowHeight + 10 + geoH + 10 + equipeH + 16;

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

  const geoY = rowY + serviceRowHeight + 10;
  doc.roundedRect(x + 10, geoY, width - 20, geoH, 8).lineWidth(0.7).strokeColor(registro.alertaLocalizacao ? '#f59e0b' : COLORS.border).stroke();
  doc.font('Helvetica-Bold').fontSize(8.4).fillColor(registro.alertaLocalizacao ? '#92400e' : COLORS.muted)
    .text('Geolocalização de apoio interno da manutenção', x + 16, geoY + 7, { width: width - 30 });
  doc.font('Helvetica').fontSize(8.6).fillColor(COLORS.text)
    .text(geoDescricao, x + 16, geoY + 18, { width: width - 30 });

  const equipeY = geoY + geoH + 10;
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

function fmtMin(min) { const m = Math.abs(Number(min) || 0); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; }

function gerarPdfBancoHorasGeral(dados = {}) {
  const doc = createDoc();
  const meta = { title: "Campo do Gado\nBanco de Horas da Manutenção", subtitle: "Controle Interno de Horas Extras e Folgas Compensatórias", logoPath: logoPath() };
  process.nextTick(() => {
    setupPage(doc, meta, false);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.greenDark).text("Relatório Geral do Banco de Horas", PAGE.margins.left, doc.y);
    doc.moveDown(.4).font("Helvetica").fontSize(9).fillColor(COLORS.muted).text(`Emissão: ${formatDateBr(String(dados.emitidoEm || '').slice(0,10))}`);
    drawTable(doc, { meta, columns: [
      {key:'funcionario', label:'Funcionário', width:150}, {key:'creditos', label:'Créditos', width:75, align:'center'}, {key:'debitos', label:'Débitos', width:75, align:'center'}, {key:'saldo', label:'Saldo', width:75, align:'center'}, {key:'dias', label:'Dias', width:55, align:'center'}, {key:'obs', label:'Observações', width:119}
    ], rows: (dados.banco || []).map(b => ({ funcionario:b.nome, creditos:fmtMin(b.saldo?.creditos), debitos:fmtMin(b.saldo?.debitos), saldo:b.saldo?.horas, dias:String(b.saldo?.diasFolgaDecimal ?? 0), obs:'Controle interno da manutenção' })), emptyRow:{funcionario:'Sem dados',creditos:'-',debitos:'-',saldo:'-',dias:'-',obs:'-'} });
    doc.moveDown().font("Helvetica").fontSize(8.5).fillColor(COLORS.muted).text("Este relatório é um controle interno da manutenção, utilizado para organização das horas extras, banco de horas e programação de folgas compensatórias da equipe.", PAGE.margins.left, doc.y, { width: 520 });
    doc.moveDown(2).font("Helvetica").fontSize(9).fillColor(COLORS.text).text("Assinaturas: Encarregado de manutenção __________________  Funcionário __________________  Direção/RH __________________");
    doc.end();
  });
  return doc;
}

function gerarPdfBancoHorasFuncionario(dados = {}) {
  const doc = createDoc();
  const meta = { title: "Banco de Horas da Manutenção", subtitle: "Relatório Individual do Funcionário", logoPath: logoPath() };
  process.nextTick(() => {
    setupPage(doc, meta, false);
    const nome = dados.horasExtras?.[0]?.colaborador_nome || dados.banco?.find(b => String(b.id) === String(dados.filtros?.colaborador_id))?.nome || "Funcionário";
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.greenDark).text(nome);
    drawTable(doc, { meta, columns: [
      {key:'data',label:'Data',width:62},{key:'hora',label:'Horário',width:110},{key:'total',label:'Total',width:55},{key:'os',label:'OS',width:45},{key:'servico',label:'Serviço executado',width:210},{key:'status',label:'Status',width:67}
    ], rows: (dados.horasExtras || []).map(h=>({data:formatDateBr(h.data_servico),hora:`${h.inicio_extra || '-'} até ${h.fim_extra || '-'}`,total:fmtMin(h.total_minutos),os:h.os_id || '-',servico:h.descricao_servico,status:h.status})), emptyRow:{data:'-',hora:'-',total:'-',os:'-',servico:'Sem horas extras no período.',status:'-'} });
    doc.end();
  });
  return doc;
}

function gerarPdfBancoHorasPorOs(dados = {}) {
  const doc = createDoc();
  const meta = { title: "Banco de Horas da Manutenção", subtitle: "Relatório por OS", logoPath: logoPath() };
  process.nextTick(() => {
    setupPage(doc, meta, false);
    drawTable(doc, { meta, columns: [
      {key:'os',label:'OS',width:45},{key:'funcionario',label:'Funcionário',width:125},{key:'data',label:'Data',width:62},{key:'horario',label:'Horário',width:112},{key:'total',label:'Total',width:55},{key:'servico',label:'Serviço',width:150}
    ], rows: (dados.horasExtras || []).map(h=>({os:h.os_id || '-', funcionario:h.colaborador_nome, data:formatDateBr(h.data_servico), horario:`${h.inicio_extra || '-'} até ${h.fim_extra || '-'}`, total:fmtMin(h.total_minutos), servico:h.descricao_servico})), emptyRow:{os:'-',funcionario:'-',data:'-',horario:'-',total:'-',servico:'Sem horas extras vinculadas.'} });
    const total = (dados.horasExtras || []).reduce((s,h)=>s+Number(h.total_minutos||0),0);
    doc.moveDown().font("Helvetica-Bold").fontSize(10).fillColor(COLORS.greenDark).text(`Total geral da OS: ${fmtMin(total)}`);
    doc.end();
  });
  return doc;
}

function gerarPdfFolgasProgramadas(dados = {}) { return gerarPdfBancoHorasGeral(dados); }


module.exports = {
  drawHeader,
  drawFooter,
  ensureSpace,
  drawTable,
  formatDateBr,
  generateWeeklyPDF,
  generatePeriodPDF,
  gerarPdfBancoHorasGeral,
  gerarPdfBancoHorasFuncionario,
  gerarPdfBancoHorasPorOs,
  gerarPdfFolgasProgramadas,
};
