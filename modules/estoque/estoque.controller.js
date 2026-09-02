const service = require("./estoque.service");
const reservaService = require("./estoque.reservas.service");
const { normalizeRole } = require("../../config/rbac");

function withReserva(itens) {
  const reservasPorItem = reservaService.resumoPorItem();
  return itens.map((item) => {
    const reservado = Number(reservasPorItem.get(Number(item.id)) || 0);
    const saldoFisico = Number(item.saldo_atual || 0);
    return { ...item, saldo_reservado: reservado, saldo_disponivel: Math.max(saldoFisico - reservado, 0) };
  });
}

function filtrarSituacaoLivre(itens, situacao) {
  if (!situacao) return itens;
  return itens.filter((item) => {
    const saldo = Number(item.saldo_disponivel || 0);
    const minimo = Number(item.saldo_minimo || 0);
    if (situacao === 'zerado') return saldo <= 0;
    if (situacao === 'baixo') return saldo > 0 && saldo < minimo;
    if (situacao === 'ok') return saldo > 0 && saldo >= minimo;
    return true;
  });
}

function index(req, res) {
  const filtros = {
    q: String(req.query.q || "").trim(),
    categoria_id: req.query.categoria_id || "",
    local_id: req.query.local_id || "",
    situacao: ["", "ok", "baixo", "zerado"].includes(req.query.situacao || "") ? (req.query.situacao || "") : "",
  };
  const baseFilters = { ...filtros, situacao: "" };
  const itens = filtrarSituacaoLivre(withReserva(service.listItens(baseFilters)), filtros.situacao);
  res.render("estoque/index", {
    title: "Estoque",
    activeMenu: "estoque",
    cards: { ...service.dashboard(), ...reservaService.dashboard() },
    itens,
    categorias: service.listCategorias(),
    locais: service.listLocais(),
    filtros,
  });
}
function itens(req, res) { res.render("estoque/itens", { title: "Itens", activeMenu: "estoque", itens: withReserva(service.listItens()) }); }
function novoItem(req, res) { res.render("estoque/novo_item", { title: "Novo Item", activeMenu: "estoque", categorias: service.listCategorias(), locais: service.listLocais() }); }
function criarItem(req, res) { try { const id = service.createItem(req.body); req.flash("success", "Item criado."); return res.redirect(`/estoque/itens/${id}`);} catch (e) { req.flash("error", e.message); return res.redirect("/estoque/itens/novo"); } }
function detalheItem(req, res) {
  const itemBase = service.getItem(Number(req.params.id));
  if (!itemBase) return res.status(404).send("Item não encontrado");
  const item = withReserva([itemBase])[0];
  const movimentos = service.listMovimentos().filter((mov) => Number(mov.item_id) === Number(item.id));
  res.render("estoque/show", { title: item.nome, activeMenu: "estoque", item, movimentos });
}
function categorias(req, res) { res.render("estoque/categorias", { title: "Categorias", activeMenu: "estoque", categorias: service.listCategorias() }); }
function criarCategoria(req, res) { service.createCategoria(req.body); req.flash("success", "Categoria criada."); res.redirect("/estoque/categorias"); }
function locais(req, res) { res.render("estoque/locais", { title: "Locais", activeMenu: "estoque", locais: service.listLocais() }); }
function criarLocal(req, res) { service.createLocal(req.body); req.flash("success", "Local criado."); res.redirect("/estoque/locais"); }
function movimentos(req, res) {
  const filtros = { tipo: req.query.tipo || "", item_id: req.query.item_id || "" };
  const movimentos = service.listMovimentos().filter((mov) => (!filtros.tipo || mov.tipo === filtros.tipo) && (!filtros.item_id || String(mov.item_id) === String(filtros.item_id)));
  res.render("estoque/movimentos", { title: "Movimentos", activeMenu: "estoque", movimentos, filtros, itens: withReserva(service.listItens()) });
}
function saidaNova(req, res) {
  const contextoAlmox = String(req.query.contexto || "").toLowerCase() === "almoxarifado";
  const role = normalizeRole(req.session?.user?.role);
  const canAlmoxRead = ["ADMIN", "ALMOXARIFADO", "DIRETORIA"].includes(role);
  res.render("estoque/saida_nova", {
    title: contextoAlmox ? "Retirada de materiais" : "Registrar saída",
    activeMenu: contextoAlmox ? "almoxarifado" : "estoque",
    itens: withReserva(service.listItens()),
    ordens: service.listOrdensAtivas(),
    itemSelecionado: Number(req.query.item) || null,
    origem: req.query.origem === "QR_CODE" ? "QR_CODE" : "MANUAL",
    contextoAlmox,
    canAlmoxRead,
  });
}
async function qrItem(req, res, next) {
  try {
    const item = service.getItem(Number(req.params.id)); if (!item) return res.status(404).send('Item não encontrado');
    const QRCode = require('qrcode');
    const url = `${req.protocol}://${req.get('host')}/estoque/saidas/nova?item=${item.id}&origem=QR_CODE`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 360, margin: 1, errorCorrectionLevel: 'H' });
    return res.render('estoque/qr_item', { title: `QR - ${item.nome}`, activeMenu: 'estoque', item, url, qrDataUrl });
  } catch (error) { return next(error); }
}

module.exports = { index, itens, novoItem, criarItem, detalheItem, categorias, criarCategoria, locais, movimentos, saidaNova, qrItem };
