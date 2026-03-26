const QRCode = require("qrcode");
const service = require("./equipamentos.service");
let tracagemService = null;
let desenhoTecnicoService = null;
try { tracagemService = require('../tracagem/tracagem.service'); } catch (_e) {}
try { desenhoTecnicoService = require('../desenho-tecnico/desenho-tecnico.service'); } catch (_e) {}

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
  });
}

function equipEditForm(req, res) {
  const id = Number(req.params.id);
  const equip = service.getById(id);
  if (!equip) return res.status(404).render("errors/404", { title: "Não encontrado" });
  return res.render("equipamentos/editar", { title: `Editar ${equip.nome}`, equip });
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
    tracagens,
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
  addPeca,
  updatePeca,
  removePeca,
  addDocumento,
  removeDocumento,
  gerarQr,
  qrPublicPage,
  qrPrint,
};
