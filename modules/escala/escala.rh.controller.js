const service = require('./escala.service');

function currentUser(req) {
  return req.user || req.session?.user || {};
}

function isUnavailable(status) {
  return /(folga|férias|ferias|atestado|ausente|falta)/i.test(String(status || ''));
}

function isWorking(status) {
  return /(trabalhando|hora extra)/i.test(String(status || ''));
}

exports.index = (req, res, next) => {
  try {
    res.locals.activeMenu = 'escala';
    const painel = service.listarPainelEscala({ user: currentUser(req), canViewAll: true });
    const colaboradores = painel.colaboradores || [];

    const indicadores = {
      total: colaboradores.length,
      trabalhando: colaboradores.filter((item) => isWorking(item.statusAtual)).length,
      indisponiveis: colaboradores.filter((item) => isUnavailable(item.statusAtual)).length,
      horasExtrasMesMinutos: colaboradores.reduce((total, item) => total + Number(item.horasExtrasMesMinutos || 0), 0),
      bancoHorasMinutos: colaboradores.reduce((total, item) => total + Number(item.saldo?.minutos || 0), 0),
      saldosPositivos: colaboradores.filter((item) => Number(item.saldo?.minutos || 0) > 0).length,
      saldosNegativos: colaboradores.filter((item) => Number(item.saldo?.minutos || 0) < 0).length,
      pendentes: Number(painel.pendentes || 0),
    };

    return res.render('escala/rh', {
      title: 'Escala • RH',
      painel,
      colaboradores,
      indicadores,
    });
  } catch (error) {
    return next(error);
  }
};
