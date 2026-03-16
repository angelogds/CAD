// modules/motores/motores.controller.js

const service = require("./motores.service");
const db = require("../../database/db");

/**
 * Tratamento padrão caso a tabela não exista
 */
function handleMissingTable(err, req, res, next) {
  if (err && String(err.message || "").includes("no such table: motores")) {
    req.flash(
      "error",
      "Tabela 'motores' não existe. Aplique a migration 083_motores.sql e faça deploy."
    );
    return res.redirect("/dashboard");
  }
  return next(err);
}

/**
 * LISTAGEM
 */
function index(req, res, next) {
  try {
    const filtros = {
      status: req.query.status || "",
      origem: req.query.origem || "",
      q: req.query.q || "",
    };

    const lista = service.list(filtros);

    // 🔔 Contador inteligente (somente ENVIADO_REBOB)
    const rebobCount = db
      .prepare(
        `
        SELECT COUNT(*) as total
        FROM motores
        WHERE status = 'ENVIADO_REBOB'
      `
      )
      .get().total;

    return res.render("motores/index", {
      title: "Motores",
      activeMenu: "motores",
      filtros,
      lista,
      rebobCount,
    });
  } catch (err) {
    return handleMissingTable(err, req, res, next);
  }
}

/**
 * FORMULÁRIO NOVO
 */
function newForm(req, res) {
  return res.render("motores/new", {
    title: "Cadastrar Motor",
    activeMenu: "motores",
  });
}

/**
 * CRIAR
 */
function create(req, res, next) {
  try {
    const id = service.create(req.body);
    req.flash("success", `Motor #${id} cadastrado.`);
    return res.redirect(`/motores/${id}`);
  } catch (err) {
    return handleMissingTable(err, req, res, next);
  }
}

/**
 * VISUALIZAR
 */
function show(req, res, next) {
  try {
    const id = Number(req.params.id);

    const motor = service.getById(id);
    if (!motor) {
      return res.status(404).send("Motor não encontrado");
    }

    const eventos = service.listEventos(id);

    // ✅ CORREÇÃO AQUI: renderiza motores/show
    return res.render("motores/show", {
      title: `Motor #${id}`,
      activeMenu: "motores",
      motor,
      eventos,
    });
  } catch (err) {
    return handleMissingTable(err, req, res, next);
  }
}

/**
 * REGISTRAR ENVIO
 */
function enviar(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { empresa_rebob, motorista_saida, observacao } = req.body;

    service.registrarEnvio(id, {
      empresa_rebob,
      motorista_saida,
      observacao,
    });

    req.flash("success", "Envio registrado com sucesso.");
    return res.redirect(`/motores/${id}`);
  } catch (err) {
    return handleMissingTable(err, req, res, next);
  }
}

/**
 * REGISTRAR RETORNO
 */
function retorno(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { motorista_retorno, observacao } = req.body;

    service.registrarRetorno(id, {
      motorista_retorno,
      observacao,
    });

    req.flash("success", "Retorno registrado com sucesso.");
    return res.redirect(`/motores/${id}`);
  } catch (err) {
    return handleMissingTable(err, req, res, next);
  }
}

module.exports = {
  index,
  newForm,
  create,
  show,
  enviar,
  retorno,
};
