// modules/motores/motores.controller.js

const service = require("./motores.service");
const dateBr = require("../../utils/data-hora-br");

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

function actionError(err, req, res, next, redirectTo) {
  if (err && String(err.message || "").includes("no such table: motores")) {
    return handleMissingTable(err, req, res, next);
  }
  req.flash?.("error", err?.message || "Não foi possível concluir a operação.");
  return res.redirect(redirectTo);
}

function index(req, res, next) {
  try {
    const filtros = {
      status: req.query.status || "",
      origem: req.query.origem || "",
      q: req.query.q || "",
    };

    const lista = service.list(filtros);
    const indicadores = service.getSummary();

    return res.render("motores/index", {
      title: "Motores",
      activeMenu: "motores",
      filtros,
      lista,
      indicadores,
      rebobCount: indicadores.emRebob,
      dateBr,
    });
  } catch (err) {
    return handleMissingTable(err, req, res, next);
  }
}

function newForm(req, res) {
  return res.render("motores/new", {
    title: "Cadastrar Motor",
    activeMenu: "motores",
  });
}

function create(req, res, next) {
  try {
    const id = service.create(req.body);
    req.flash("success", `Motor #${id} cadastrado.`);
    return res.redirect(`/motores/${id}`);
  } catch (err) {
    return actionError(err, req, res, next, "/motores/new");
  }
}

function show(req, res, next) {
  try {
    const id = Number(req.params.id);

    const motor = service.getById(id);
    if (!motor) {
      return res.status(404).send("Motor não encontrado");
    }

    const eventos = service.listEventos(id);

    return res.render("motores/show", {
      title: `Motor #${id}`,
      activeMenu: "motores",
      motor,
      eventos,
      dateBr,
    });
  } catch (err) {
    return handleMissingTable(err, req, res, next);
  }
}

function enviar(req, res, next) {
  const id = Number(req.params.id);
  try {
    const { empresa_rebob, motorista_saida, previsao_retorno, observacao } = req.body;

    service.registrarEnvio(id, {
      empresa_rebob,
      motorista_saida,
      previsao_retorno,
      observacao,
    });

    req.flash("success", "Envio para rebobinamento registrado com sucesso.");
    return res.redirect(`/motores/${id}`);
  } catch (err) {
    return actionError(err, req, res, next, `/motores/${id}`);
  }
}

function retorno(req, res, next) {
  const id = Number(req.params.id);
  try {
    const { motorista_retorno, observacao } = req.body;

    service.registrarRetorno(id, {
      motorista_retorno,
      observacao,
    });

    req.flash("success", "Retorno do rebobinamento registrado com sucesso.");
    return res.redirect(`/motores/${id}`);
  } catch (err) {
    return actionError(err, req, res, next, `/motores/${id}`);
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
