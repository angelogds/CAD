const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const service = require("./equipamentos.service");
let tracagemService = null;
let desenhoTecnicoService = null;
let pcmIntelligenceService = null;
try { tracagemService = require('../tracagem/tracagem.service'); } catch (_e) {}
try { desenhoTecnicoService = require('../desenho-tecnico/desenho-tecnico.service'); } catch (_e) {}
try { pcmIntelligenceService = require('../pcm/pcm.intelligence.service'); } catch (_e) {}

function resolveFoto(file) {
  if (!file) return null;
  return `/imagens/equipamentos/fotos/${file.filename}`;
}

function calcIdade(anoInstalacao) {
  if (!anoInstalacao) return null;
  return Math.max(new Date().getFullYear() - Number(anoInstalacao), 0);
}

function equipIndex(req, res) {
  const lista = service.list();
  return res.render("equipamentos/index", { title: "Equipamentos", lista });
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("pt-BR");
}

function drawSimpleTable(doc, headers, rows, widths) {
  const startX = doc.page.margins.left;
  const startY = doc.y;
  const rowHeight = 22;
  const tableWidth = widths.reduce((acc, n) => acc + n, 0);
  const bottomLimit = doc.page.height - doc.page.margins.bottom - rowHeight;

  doc.rect(startX, startY, tableWidth, rowHeight).fill("#f3f4f6");
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9);
  let cursorX = startX + 6;
  headers.forEach((header, idx) => {
    doc.text(header, cursorX, startY + 7, { width: widths[idx] - 10, ellipsis: true });
    cursorX += widths[idx];
  });

  doc.font("Helvetica").fontSize(8.5);
  let currentY = startY + rowHeight;
  rows.forEach((row, rowIndex) => {
    if (currentY > bottomLimit) {
      doc.addPage();
      currentY = doc.page.margins.top;
    }
    if (rowIndex % 2 === 1) {
      doc.rect(startX, currentY, tableWidth, rowHeight).fill("#fafafa");
    }
    doc.fillColor("#111827");
    let colX = startX + 6;
    row.forEach((value, idx) => {
      doc.text(String(value ?? "-"), colX, currentY + 7, { width: widths[idx] - 10, ellipsis: true });
      colX += widths[idx];
    });
    currentY += rowHeight;
  });
  doc.moveDown(1);
}

function equipNewForm(req, res) {
  return res.render("equipamentos/novo", { title: "Novo Equipamento" });
}

function equipCreate(req, res) {
  const { nome } = req.body;
  if (!nome || !String(nome).trim()) {
    req.flash("error", "Informe o nome do equipamento.");
    return res.redirect("/equipamentos/novo");
  }

  const id = service.create({
    ...req.body,
    foto_url: resolveFoto(req.file),
    ativo: req.body.ativo === "1" || req.body.ativo === "on" || req.body.ativo === 1,
  });

  req.flash("success", "Equipamento cadastrado com sucesso.");
  return res.redirect(`/equipamentos/${id}`);
}

async function equipShow(req, res) {
  const id = Number(req.params.id);
  const equip = service.getById(id);
  if (!equip) return res.status(404).render("errors/404", { title: "Não encontrado" });

  const tab = String(req.query.tab || "dados");
  const filtros = {
    data_inicio: req.query.data_inicio || "",
    data_fim: req.query.data_fim || "",
    tipo: String(req.query.tipo || "").trim().toUpperCase(),
    grau: String(req.query.grau || "").trim().toUpperCase(),
  };

  const historicoOS = service.listHistoricoOS(id, filtros);
  const historicoPreventivas = service.listHistoricoPreventivas(id, filtros);
  const pecas = service.listPecasByEquipamento(id);
  const catalogoPecas = service.listPecasCatalogo();
  const documentos = service.listDocumentos(id);
  const editItemId = Number(req.query.editar_item) || null;
  const qr = service.getQrByEquipamento(id);
  const qrUrl = qr ? `${req.protocol}://${req.get("host")}/equipamentos/qrcode/${qr.token}` : "";
  const qrImage = qrUrl ? await QRCode.toDataURL(qrUrl) : "";
  const tracagens = tracagemService ? tracagemService.listByEquipamento(id) : [];
  const desenhosTecnicos = desenhoTecnicoService ? desenhoTecnicoService.listByEquipamento(id) : [];
  const riscoFalha = pcmIntelligenceService ? pcmIntelligenceService.calcularScoreRiscoEquipamento(id) : null;

  return res.render("equipamentos/show", {
    title: equip.nome,
    equip,
    idadeEquipamento: calcIdade(equip.ano_instalacao),
    tab,
    filtros,
    historicoOS,
    historicoPreventivas,
    pecas,
    catalogoPecas,
    documentos,
    editItemId,
    qr,
    qrUrl,
    qrImage,
    tracagens,
    desenhosTecnicos,
    riscoFalha,
  });
}

function equipEditForm(req, res) {
  const id = Number(req.params.id);
  const equip = service.getById(id);
  if (!equip) return res.status(404).render("errors/404", { title: "Não encontrado" });
  return res.render("equipamentos/editar", { title: `Editar ${equip.nome}`, equip });
}

function exportListaPdf(req, res) {
  const lista = service.list();
  const fileName = `lista-equipamentos-${new Date().toISOString().slice(0, 10)}.pdf`;

  const doc = new PDFDocument({ margin: 36, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  doc.pipe(res);

  doc.fontSize(16).font("Helvetica-Bold").text("Lista Geral de Equipamentos");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").text(`Gerado em ${new Date().toLocaleString("pt-BR")}`);
  doc.moveDown(0.8);

  drawSimpleTable(
    doc,
    ["Código", "Equipamento", "Setor", "Tempo (anos)", "Criticidade", "Status"],
    lista.map((eq) => [
      eq.codigo || "-",
      eq.nome || "-",
      eq.setor || "-",
      calcIdade(eq.ano_instalacao) ?? "-",
      (eq.criticidade || "media").toUpperCase(),
      Number(eq.ativo) === 1 ? "ATIVO" : "INATIVO",
    ]),
    [75, 160, 95, 70, 80, 75]
  );

  doc.end();
}

function exportEquipamentoPdf(req, res) {
  const id = Number(req.params.id);
  const equip = service.getById(id);
  if (!equip) return res.status(404).send("Equipamento não encontrado.");

  const historicoOS = service.listHistoricoOS(id, {});
  const historicoPreventivas = service.listHistoricoPreventivas(id, {});
  const pecas = service.listPecasByEquipamento(id);
  const documentos = service.listDocumentos(id);
  const qr = service.getQrByEquipamento(id);
  const tracagens = tracagemService ? tracagemService.listByEquipamento(id) : [];
  const desenhosTecnicos = desenhoTecnicoService ? desenhoTecnicoService.listByEquipamento(id) : [];
  const riscoFalha = pcmIntelligenceService ? pcmIntelligenceService.calcularScoreRiscoEquipamento(id) : null;
  const fileName = `equipamento-${id}-${(equip.nome || "detalhes").replace(/\s+/g, "-").toLowerCase()}.pdf`;

  const doc = new PDFDocument({ margin: 36, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  doc.pipe(res);

  doc.fontSize(17).font("Helvetica-Bold").text(`Relatório Técnico - ${equip.nome}`);
  doc.fontSize(10).font("Helvetica").text(`Gerado em ${new Date().toLocaleString("pt-BR")}`);
  doc.moveDown(0.8);

  doc.fontSize(12).font("Helvetica-Bold").text("Dados gerais");
  doc.moveDown(0.3);
  const gerais = [
    ["Código", equip.codigo || "-"],
    ["Setor", equip.setor || "-"],
    ["Tipo", equip.tipo || "-"],
    ["Criticidade", (equip.criticidade || "media").toUpperCase()],
    ["Status operacional", equip.status_operacional || "ATIVO"],
    ["Tempo de uso (anos)", calcIdade(equip.ano_instalacao) ?? "-"],
    ["Fabricante", equip.fabricante || "-"],
    ["Ano fabricação / instalação", `${equip.ano_fabricacao || "-"} / ${equip.ano_instalacao || "-"}`],
    ["Capacidade", equip.capacidade || "-"],
    ["Pressão de trabalho", equip.pressao_trabalho || "-"],
    ["Score de risco PCM", riscoFalha ? `${riscoFalha.score_risco}/100 (${riscoFalha.classificacao_risco})` : "-"],
    ["QR Code ativo", qr ? "Sim" : "Não"],
    ["Observação", equip.observacao || "-"],
  ];
  gerais.forEach(([k, v]) => doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(String(v)));
  doc.moveDown(0.8);

  doc.fontSize(12).font("Helvetica-Bold").text("Peças associadas");
  drawSimpleTable(doc, ["Descrição", "Medida", "Unidade", "Qtde"], (pecas.length ? pecas : [{ descricao_item: "-", modelo_descricao: "-", unidade_medida: "-", quantidade: "-" }]).map((p) => [
    p.descricao_item || "-",
    p.modelo_descricao || "-",
    p.unidade_medida || "-",
    p.quantidade || "-",
  ]), [250, 120, 100, 60]);

  doc.fontSize(12).font("Helvetica-Bold").text("Documentos");
  drawSimpleTable(doc, ["Tipo", "Descrição", "Emissão", "Validade"], (documentos.length ? documentos : [{ tipo_documento: "-", descricao: "-", data_emissao: "-", validade: "-" }]).map((d) => [
    d.tipo_documento || "-",
    d.descricao || "-",
    d.data_emissao || "-",
    d.validade || "-",
  ]), [90, 220, 90, 90]);

  doc.addPage();
  doc.fontSize(12).font("Helvetica-Bold").text("Histórico de Ordens de Serviço");
  drawSimpleTable(doc, ["OS", "Abertura", "Fechamento", "Tipo", "Parada(h)"], (historicoOS.length ? historicoOS : [{ id: "-", opened_at: "-", closed_at: "-", tipo: "-", tempo_parada_horas: "-" }]).map((o) => [
    o.id,
    formatDateTime(o.opened_at),
    formatDateTime(o.closed_at),
    o.tipo || "-",
    o.tempo_parada_horas || "-",
  ]), [60, 130, 130, 100, 90]);

  doc.fontSize(12).font("Helvetica-Bold").text("Preventivas executadas");
  drawSimpleTable(doc, ["Atividade", "Prevista", "Status", "Duração"], (historicoPreventivas.length ? historicoPreventivas : [{ atividade: "-", data_prevista: "-", status: "-", duracao_minutos: "-" }]).map((p) => [
    p.atividade || "-",
    p.data_prevista || "-",
    p.status || "-",
    p.duracao_minutos ? `${p.duracao_minutos} min` : "-",
  ]), [250, 100, 100, 60]);

  doc.fontSize(12).font("Helvetica-Bold").text("Traçagens e desenhos técnicos");
  doc.font("Helvetica").fontSize(10).text(`Traçagens vinculadas: ${tracagens.length}`);
  doc.text(`Desenhos técnicos vinculados: ${desenhosTecnicos.length}`);
  doc.text("Este PDF consolida a vida do equipamento para consulta técnica e PCM.");

  doc.end();
}

function equipUpdate(req, res) {
  const id = Number(req.params.id);
  const equip = service.getById(id);
  if (!equip) return res.status(404).render("errors/404", { title: "Não encontrado" });

  const { nome } = req.body;
  if (!nome || !String(nome).trim()) {
    req.flash("error", "Informe o nome do equipamento.");
    return res.redirect(`/equipamentos/${id}/editar`);
  }

  let fotoAtual = equip.foto_url;
  if (req.body.remover_foto === "1") {
    fotoAtual = null;
  }
  if (req.file) {
    fotoAtual = resolveFoto(req.file);
  }

  service.update(id, {
    ...req.body,
    foto_url: fotoAtual,
    ativo: req.body.ativo === "1" || req.body.ativo === "on" || req.body.ativo === 1,
  });

  req.flash("success", "Equipamento atualizado com sucesso.");
  return res.redirect(`/equipamentos/${id}`);
}

function equipDelete(req, res) {
  const id = Number(req.params.id);
  const equip = service.getById(id);
  if (!equip) return res.status(404).render("errors/404", { title: "Não encontrado" });

  const removido = service.remove(id);
  if (!removido) {
    req.flash("error", "Não foi possível excluir o equipamento porque ele possui vínculos no sistema.");
    return res.redirect(`/equipamentos/${id}`);
  }

  req.flash("success", "Equipamento excluído com sucesso.");
  return res.redirect("/equipamentos");
}

function addPeca(req, res) {
  const id = Number(req.params.id);
  service.addPecaToEquipamento(id, req.body);
  req.flash("success", "Peça associada ao equipamento.");
  return res.redirect(`/equipamentos/${id}?tab=pecas`);
}

function updatePeca(req, res) {
  service.updatePecaAssociacao(Number(req.params.associacaoId), req.body);
  req.flash("success", "Aplicação da peça atualizada.");
  return res.redirect(`/equipamentos/${Number(req.params.id)}?tab=pecas`);
}

function removePeca(req, res) {
  service.removePecaAssociacao(Number(req.params.associacaoId));
  req.flash("success", "Associação removida.");
  return res.redirect(`/equipamentos/${Number(req.params.id)}?tab=pecas`);
}

function addDocumento(req, res) {
  const id = Number(req.params.id);
  if (!req.file) {
    req.flash("error", "Selecione um arquivo para anexar.");
    return res.redirect(`/equipamentos/${id}?tab=documentos`);
  }

  const tipoDocumento = String(req.body.tipo_documento || "").trim().toLowerCase();
  if (!["manual", "laudo"].includes(tipoDocumento)) {
    req.flash("error", "Selecione um tipo de documento válido: manual ou laudo.");
    return res.redirect(`/equipamentos/${id}?tab=documentos`);
  }

  if (tipoDocumento === "laudo" && (!req.body.data_emissao || !req.body.validade)) {
    req.flash("error", "Para laudo, informe a data de emissão e a validade.");
    return res.redirect(`/equipamentos/${id}?tab=documentos`);
  }

  const payload = {
    ...req.body,
    tipo_documento: tipoDocumento,
    data_emissao: tipoDocumento === "laudo" ? req.body.data_emissao : null,
    validade: tipoDocumento === "laudo" ? req.body.validade : null,
    caminho_arquivo: `/uploads/equipamentos/documentos/${req.file.filename}`,
  };

  service.createDocumento(id, payload);

  req.flash("success", "Documento anexado.");
  return res.redirect(`/equipamentos/${id}?tab=documentos`);
}

function removeDocumento(req, res) {
  const id = Number(req.params.id);
  service.removeDocumento(Number(req.params.documentoId));
  req.flash("success", "Documento removido.");
  return res.redirect(`/equipamentos/${id}?tab=documentos`);
}

function gerarQr(req, res) {
  const id = Number(req.params.id);
  service.upsertQrCode(id, { forceRegen: req.body.regerar === "1" });
  req.flash("success", "QR Code atualizado para o equipamento.");
  return res.redirect(`/equipamentos/${id}?tab=qrcode`);
}

async function qrPublicPage(req, res) {
  const token = req.params.token;
  const equip = service.getEquipamentoByQrToken(token);
  if (!equip) return res.status(404).send("QR Code inválido ou inativo.");

  const qrUrl = `${req.protocol}://${req.get("host")}/equipamentos/qrcode/${token}`;
  const qrImage = await QRCode.toDataURL(qrUrl);

  return res.render("equipamentos/qrcode_public", {
    title: `QR ${equip.nome}`,
    equip,
    qrImage,
    detalhesUrl: req.session?.user ? `/equipamentos/${equip.id}` : `/auth/login?next=${encodeURIComponent(`/equipamentos/${equip.id}`)}`,
    abrirOsUrl: req.session?.user ? `/os/nova?equipamento_id=${equip.id}` : `/auth/login?next=${encodeURIComponent(`/os/nova?equipamento_id=${equip.id}`)}`,
  });
}

async function qrPrint(req, res) {
  const id = Number(req.params.id);
  const equip = service.getById(id);
  const qr = service.getQrByEquipamento(id);
  if (!equip || !qr) return res.status(404).send("QR Code não encontrado");
  const qrUrl = `${req.protocol}://${req.get("host")}/equipamentos/qrcode/${qr.token}`;
  const qrImage = await QRCode.toDataURL(qrUrl);
  return res.render("equipamentos/qrcode_print", { title: `Imprimir QR - ${equip.nome}`, equip, qrUrl, qrImage });
}

module.exports = {
  equipIndex,
  equipNewForm,
  equipCreate,
  equipShow,
  equipEditForm,
  equipUpdate,
  equipDelete,
  exportListaPdf,
  exportEquipamentoPdf,
  addPeca,
  updatePeca,
  removePeca,
  addDocumento,
  removeDocumento,
  gerarQr,
  qrPublicPage,
  qrPrint,
};
