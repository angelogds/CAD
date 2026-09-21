const service = require('./lubrificacao.service');

function index(req, res) {
  res.locals.activeMenu = 'lubrificacao';
  const status = String(req.query.status || 'TODOS').toUpperCase();
  try {
    return res.render('lubrificacao/index', {
      title: 'Roteiro de Lubrificação',
      status,
      roteiro: service.listRoteiro(req.session.user.id, status),
      resumo: service.resumoRoteiro(req.session.user.id),
      historico: service.listHistorico(req.session.user.id, 12),
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar seu roteiro de lubrificação.');
    return res.render('lubrificacao/index', {
      title: 'Roteiro de Lubrificação',
      status,
      roteiro: [],
      resumo: { total: 0, atrasados: 0, hoje: 0, proximos: 0, executados_hoje: 0 },
      historico: [],
    });
  }
}

function executar(req, res) {
  try {
    const result = service.registrarExecucao(req.params.id, req.session.user.id, req.body || {});
    req.flash(
      'success',
      result.anomalia
        ? 'Lubrificação registrada. A anomalia ficou destacada no histórico para acompanhamento do PCM.'
        : 'Lubrificação concluída e próxima execução atualizada.'
    );
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a execução.');
  }
  return res.redirect('/lubrificacao');
}

module.exports = { index, executar };
