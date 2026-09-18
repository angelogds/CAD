const colaboradoresService = require('../colaboradores/colaboradores.service');
const escala = require('../escala/escala.service');

function enrichDashboard(dashboard = {}, user = {}) {
  const master = colaboradoresService.listColaboradores({ status: 'ATIVO' }) || [];
  let escalaRows = [];
  try { escalaRows = escala.listarPainelEscala({ user, canViewAll: true })?.colaboradores || []; } catch (_error) {}

  // A Escala é a fonte oficial da equipe operacional atual.
  // O cadastro mestre apenas complementa os dados das pessoas que continuam
  // presentes na escala. Assim, ex-colaboradores preservam o histórico no banco,
  // mas não reaparecem nas listas/seletoras ativas do RH.
  const masterById = new Map(master.map((row) => [Number(row.id), row]));
  const zeroSaldo = { minutos: 0, horas: '0h00', creditos: 0, debitos: 0 };
  const colaboradores = escalaRows.map((jornada) => {
    const base = masterById.get(Number(jornada.id));
    if (!base) return null;
    return {
      ...base,
      ...jornada,
      nome: base.nome || jornada.nome,
      funcao: base.funcao || jornada.funcao,
      setor: base.setor || jornada.setor,
      status: base.status || jornada.status || 'ATIVO',
      saldo: jornada.saldo || zeroSaldo,
      horasExtrasMesMinutos: Number(jornada.horasExtrasMesMinutos || 0),
      horasExtrasMes: jornada.horasExtrasMes || '0h00',
      turnoAtual: jornada.turnoAtual || '-',
      statusAtual: jornada.statusAtual || base.status || 'ATIVO',
    };
  }).filter(Boolean);

  const indicadores = {
    ...(dashboard.indicadores || {}),
    colaboradoresAtivos: colaboradores.length,
    bancoHorasMinutos: colaboradores.reduce((total, row) => total + Number(row.saldo?.minutos || 0), 0),
    horasExtrasMesMinutos: colaboradores.reduce((total, row) => total + Number(row.horasExtrasMesMinutos || 0), 0),
  };
  return { ...dashboard, colaboradores, indicadores };
}

module.exports = { enrichDashboard };
