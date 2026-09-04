const escala = require('./escala.service');
const solicitacoes = require('./escala.folga-solicitacao.service');
const { normalizeRole, canAccessModule } = require('../../config/rbac');
const dateBr = require('../../utils/data-hora-br');

function currentUser(req) { return req.user || req.session?.user || {}; }
function canManage(req) { return canAccessModule(normalizeRole(currentUser(req).role), 'escala_manage'); }
function flash(req, type, message) { req.flash?.(type, message); }

exports.index = (req, res, next) => {
  try {
    return res.render('escala/folgas-programadas', {
      title: 'Folgas e Afastamentos',
      colaboradores: escala.listarBancoHoras(),
      folgas: escala.listarFolgas(),
      solicitacoes: solicitacoes.listarSolicitacoes(),
      canManageEscala: canManage(req),
      dateBr,
    });
  } catch (error) { return next(error); }
};

exports.programar = (req, res) => {
  try {
    solicitacoes.validarProgramacaoManual(req.body);
    escala.programarFolgaCompensatoria({
      ...req.body,
      anexo_path: escala.filePath(req.file),
      minutos_descontados: Math.round(Number(req.body.horas || 0) * 60) || Number(req.body.minutos_descontados),
      usuario: currentUser(req),
      user_id: currentUser(req).id,
    });
    flash(req, 'success', 'Afastamento programado com sucesso.');
  } catch (error) { flash(req, 'error', error.message); }
  return res.redirect('/escala/folgas');
};

exports.cancelar = (req, res) => {
  try {
    escala.cancelarFolgaCompensatoria(Number(req.params.id), currentUser(req), req.body.motivo);
    flash(req, 'success', 'Folga cancelada e saldo estornado.');
  } catch (error) { flash(req, 'error', error.message); }
  return res.redirect('/escala/folgas');
};

exports.realizar = (req, res) => {
  try {
    escala.realizarFolgaCompensatoria(Number(req.params.id), currentUser(req));
    flash(req, 'success', 'Folga marcada como realizada.');
  } catch (error) { flash(req, 'error', error.message); }
  return res.redirect('/escala/folgas');
};

exports.solicitar = (req, res) => {
  try {
    solicitacoes.solicitarFolga({ user: currentUser(req), data_folga: req.body.data_folga, motivo: req.body.motivo });
    flash(req, 'success', 'Solicitação enviada. A data ficou reservada enquanto aguarda aprovação.');
  } catch (error) { flash(req, 'error', error.message); }
  return res.redirect('/escala/meu-painel#solicitar-folga');
};

exports.cancelarSolicitacao = (req, res) => {
  try {
    solicitacoes.cancelarSolicitacao(Number(req.params.id), currentUser(req));
    flash(req, 'success', 'Solicitação cancelada. A data foi liberada para a equipe.');
  } catch (error) { flash(req, 'error', error.message); }
  return res.redirect('/escala/meu-painel#solicitar-folga');
};

exports.aprovarSolicitacao = (req, res) => {
  try {
    solicitacoes.aprovarSolicitacao(Number(req.params.id), currentUser(req), req.body.observacao);
    flash(req, 'success', 'Folga aprovada, lançada na Escala e debitada do Banco de Horas.');
  } catch (error) { flash(req, 'error', error.message); }
  return res.redirect('/escala/folgas');
};

exports.reprovarSolicitacao = (req, res) => {
  try {
    solicitacoes.reprovarSolicitacao(Number(req.params.id), currentUser(req), req.body.motivo);
    flash(req, 'success', 'Solicitação reprovada e data liberada.');
  } catch (error) { flash(req, 'error', error.message); }
  return res.redirect('/escala/folgas');
};
