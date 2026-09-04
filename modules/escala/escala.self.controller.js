const service = require('./escala.service');
const folgaSolicitacao = require('./escala.folga-solicitacao.service');
const dateBr = require('../../utils/data-hora-br');
const { normalizeRole } = require('../../config/rbac');

function currentUser(req) {
  return req.user || req.session?.user || {};
}

function roleOf(req) {
  return normalizeRole(currentUser(req).role || '');
}

exports.index = (req, res, next) => {
  try {
    res.locals.activeMenu = 'escala';
    const user = currentUser(req);
    const colaborador = service.buscarColaboradorDoUsuario(user.id);

    if (!colaborador) {
      return res.render('escala/meu-painel', {
        title: 'Minha Escala',
        vinculado: false,
        colaborador: null,
        card: null,
        banco: null,
        movimentos: [],
        horasExtras: [],
        folgas: [],
        solicitacoesFolga: [],
        minutosFolga: folgaSolicitacao.MINUTOS_DIA_FOLGA,
        todayISO: dateBr.todayISO(),
        canOpenProfile: false,
      });
    }

    const painel = service.listarPainelEscala({ user, canViewAll: false, colaboradorId: colaborador.id });
    const card = (painel.colaboradores || []).find((item) => Number(item.id) === Number(colaborador.id)) || (painel.colaboradores || [])[0] || null;
    const bancoLista = service.listarBancoHoras({ colaborador_id: colaborador.id });
    const banco = bancoLista.find((item) => Number(item.id) === Number(colaborador.id)) || bancoLista[0] || null;

    return res.render('escala/meu-painel', {
      title: 'Minha Escala',
      vinculado: true,
      colaborador,
      card,
      banco,
      movimentos: service.listarMovimentosBancoHoras(colaborador.id).slice(0, 20),
      horasExtras: service.listarHorasExtras({ colaborador_id: colaborador.id }).slice(0, 20),
      folgas: service.listarFolgas({ colaborador_id: colaborador.id }).slice(0, 20),
      solicitacoesFolga: folgaSolicitacao.listarSolicitacoes({ colaborador_id: colaborador.id, limit: 20 }),
      minutosFolga: folgaSolicitacao.MINUTOS_DIA_FOLGA,
      todayISO: dateBr.todayISO(),
      canOpenProfile: ['ADMIN', 'RH', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'COLABORADOR'].includes(roleOf(req)),
    });
  } catch (error) {
    return next(error);
  }
};
