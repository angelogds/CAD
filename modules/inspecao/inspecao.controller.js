const service = require("./inspecao.service");
const { buildCSV, renderPDF } = require("../../utils/exporters/inspecao.exporter");

function parseMesAno(req) {
  const ano = Number(req.params.ano || new Date().getFullYear());
  const mes = Number(req.params.mes || new Date().getMonth() + 1);
  return { ano, mes };
}

function withInspecaoErrorHandling(req, res, action) {
  try {
    return action();
  } catch (err) {
    console.error("❌ [inspecao] Erro na requisição:", err && err.stack ? err.stack : err);
    req.flash("error", "Erro ao carregar inspeção.");
    return res.redirect("/dashboard");
  }
}

function loadPageData(req) {
  const { ano, mes } = parseMesAno(req);
  const getOrCreate = service.getOrCreateInspection || service.getOrCreateInspecao;
  const inspecao = getOrCreate(mes, ano, req.session?.user?.id || req.session?.user);
  service.recalculate(inspecao.id, mes, ano);

  const equipamentos = service.listEquipamentosAtivos();
  const matrix = service.buildMatrix(inspecao.id, ano, mes, equipamentos);
  const ncList = service.listNC(inspecao.id);
  const osDetailsByCell = service.listOSDetailsByInspecao(inspecao.id, mes, ano);

  return {
    ano,
    mes,
    inspecao,
    equipamentos,
    matrix,
    ncList,
    osDetailsByCell,
    diasMes: service.daysInMonth(ano, mes),
    backUrl: req.get("Referrer") || "/dashboard",
  };
}

function index(_req, res) {
  const now = new Date();
  return res.redirect(`/inspecao/${now.getFullYear()}/${now.getMonth() + 1}`);
}

function viewMonth(req, res) {
  return withInspecaoErrorHandling(req, res, () => {
    const data = loadPageData(req);
    return res.render("inspecao/index", {
      layout: "layout",
      title: "PAC 01 – Manutenção (Inspeção)",
      activeMenu: "inspecao",
      ...data,
    });
  });
}

function recalculate(req, res) {
  return withInspecaoErrorHandling(req, res, () => {
    const { ano, mes } = parseMesAno(req);
    const getOrCreate = service.getOrCreateInspection || service.getOrCreateInspecao;
    const inspecao = getOrCreate(mes, ano, req.session?.user?.id || req.session?.user);
    service.updateHeader(inspecao.id, req.body || {});
    const result = service.recalculate(inspecao.id, mes, ano);
    req.flash("success", `Inspeção recalculada com ${result.osCount} OS processadas.`);
    return res.redirect(`/inspecao/${ano}/${mes}`);
  });
}

function recalculateCurrent(req, res) {
  const now = new Date();
  req.params.ano = String(now.getFullYear());
  req.params.mes = String(now.getMonth() + 1);
  return recalculate(req, res);
}

function saveNC(req, res) {
  return withInspecaoErrorHandling(req, res, () => {
    const { ano, mes } = parseMesAno(req);
    const getOrCreate = service.getOrCreateInspection || service.getOrCreateInspecao;
    const inspecao = getOrCreate(mes, ano, req.session?.user?.id || req.session?.user);
    service.saveNC(inspecao.id, req.body || {});
    req.flash("success", "Não conformidade atualizada.");
    return res.redirect(`/inspecao/${ano}/${mes}`);
  });
}

function saveObservation(req, res) {
  return withInspecaoErrorHandling(req, res, () => {
    const { ano, mes } = parseMesAno(req);
    const getOrCreate = service.getOrCreateInspection || service.getOrCreateInspecao;
    const inspecao = getOrCreate(mes, ano, req.session?.user?.id || req.session?.user);
    service.updateObservation(inspecao.id, req.body || {});
    req.flash("success", "Observação salva.");
    return res.redirect(`/inspecao/${ano}/${mes}`);
  });
}

function exportPDF(req, res) {
  return withInspecaoErrorHandling(req, res, () => {
    const data = loadPageData(req);
    return renderPDF({ res, ...data });
  });
}

function exportCSV(req, res) {
  return withInspecaoErrorHandling(req, res, () => {
    const data = loadPageData(req);
    const csv = buildCSV(data);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=inspecao-pac01-${data.ano}-${String(data.mes).padStart(2, "0")}.csv`
    );
    return res.send(`\uFEFF${csv}`);
  });
}


function editStatus(req, res) {
  return saveObservation(req, res);
}

function exportXLS(req, res) {
  return exportCSV(req, res);
}
module.exports = {
  index,
  viewMonth,
  recalculate,
  recalculateCurrent,
  editStatus,
  saveNC,
  saveObservation,
  exportPDF,
  exportCSV,
  exportXLS,
};
