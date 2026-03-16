const service = require("./estoque.service");

function index(req, res) { res.render("estoque/index", { title: "Estoque", activeMenu: "estoque", cards: service.dashboard(), itens: service.listItens() }); }
function itens(req, res) { res.render("estoque/itens", { title: "Itens", activeMenu: "estoque", itens: service.listItens() }); }
function novoItem(req, res) { res.render("estoque/novo_item", { title: "Novo Item", activeMenu: "estoque", categorias: service.listCategorias(), locais: service.listLocais() }); }
function criarItem(req, res) { try { const id = service.createItem(req.body); req.flash("success", "Item criado."); return res.redirect(`/estoque/itens/${id}`);} catch (e) { req.flash("error", e.message); return res.redirect("/estoque/itens/novo"); } }
function detalheItem(req, res) {
  const item = service.getItem(Number(req.params.id));
  if (!item) return res.status(404).send("Item não encontrado");
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
  res.render("estoque/movimentos", { title: "Movimentos", activeMenu: "estoque", movimentos, filtros, itens: service.listItens() });
}
function saidaNova(req, res) { res.render("estoque/saida_nova", { title: "Registrar saída", activeMenu: "estoque", itens: service.listItens() }); }

module.exports = { index, itens, novoItem, criarItem, detalheItem, categorias, criarCategoria, locais, criarLocal, movimentos, saidaNova };
