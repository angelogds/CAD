const colaboradoresService = require('../colaboradores/colaboradores.service');
const escala = require('../escala/escala.service');

function enrichDashboard(dashboard = {}, user = {}) {
  const master = colaboradoresService.listColaboradores({ status: 'ATIVO' }) || [];
  let escalaRows = [];
  try { escalaRows = escala.listarPainelEscala({ user, canViewAll: true })?.colaboradores || []; } catch (_error) {}
  const byId = new Map(escalaRows.map((row) => [Number(row.id), row]));
  const zeroSaldo = { minutos: 0, horas: '0h00', creditos: 0, debitos: 0 };
  const colaboradores = master.map((base) => {
    const jornada = byId.get(Number(base.id)) || {};
    return {
      ...jornada,
      ...base,
      nome: base.nome,
      funcao: base.funcao,
      setor: base.setor,
      status: base.status,
      saldo: jornada.saldo || zeroSaldo,
      horasExtrasMesMinutos: Number(jornada.horasExtrasMesMinutos || 0),
      horasExtrasMes: jornada.horasExtrasMes || '0h00',
      turnoAtual: jornada.turnoAtual || '-',
      statusAtual: jornada.statusAtual || base.status || 'ATIVO',
    };
  });

  const indicadores = {
    ...(dashboard.indicadores || {}),
    colaboradoresAtivos: colaboradores.length,
    bancoHorasMinutos: colaboradores.reduce((total, row) => total + Number(row.saldo?.minutos || 0), 0),
    horasExtrasMesMinutos: colaboradores.reduce((total, row) => total + Number(row.horasExtrasMesMinutos || 0), 0),
  };
  return { ...dashboard, colaboradores, indicadores };
}

module.exports = { enrichDashboard };
