const escala = require('./escala.service');
const solicitacoes = require('./escala.folga-solicitacao.service');
const rhNotifications = require('../rh/rh.notifications');
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
      solicitacoes: solicitacoes.listarSolicitacoes().map((s) => ({
        ...s,
        conflito_dia: s.status === solicitacoes.STATUS_PENDENTE
          ? solicitacoes.consultarDisponibilidadeFolga(s.data_folga, { ignoreSolicitacaoId: s.id })
          : null,
      })),
      canManageEscala: canManage(req),
      dateBr,
    });
  } catch (error) { return next(error); }
};

exports.programar = (req, res) => {
  try {
    solicitacoes.validarProgramacaoManual(req.body, currentUser(req));
    const justificativa = String(req.body.justificativa_excecao || '').trim();
    const excepcional = String(req.body.autorizar_excecao || '') === '1' && justificativa;
    const motivoOriginal = String(req.body.motivo || '').trim();
    escala.programarFolgaCompensatoria({
      ...req.body,
      motivo: excepcional ? motivoOriginal + ' | Exceção autorizada por usuário ' + currentUser(req).id + ': ' + justificativa : motivoOriginal,
      anexo_path: escala.filePath(req.file),
      minutos_descontados: Math.round(Number(req.body.horas || 0) * 60) || Number(req.body.minutos_descontados),
      usuario: currentUser(req),
      user_id: currentUser(req).id,
    });
    flash(req, 'success', 'Afastamento programado com sucesso.');
  } catch (error) { flash(req, 'error', error.message); }
  return res.redirect('/escala/folgas');
};

exports.horasExtrasServico = (req, res) => {
  try {
    return res.json(escala.listarHorasExtrasParaCompensacao({
      colaborador_id: req.query.colaborador_id,
      data_servico: req.query.data_servico,
    }));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
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

exports.disponibilidade = (req, res) => {
  try {
    const dataISO = String(req.query.data_folga || '').slice(0, 10);
    const status = solicitacoes.assertDataFolgaDisponivel(dataISO, { permitirConflitos: true });
    return res.json({
      ocupada: status.ocupada,
      aviso: status.ocupada
        ? 'Já existe folga ou solicitação nesse dia. O pedido poderá ser enviado, mas uma segunda folga depende de justificativa e autorização excepcional da gestão.'
        : 'Data sem folgas ou solicitações registradas no momento. Limite normal: 1 folga por dia.',
    });
  } catch (error) { return res.status(400).json({ error: error.message }); }
};

exports.solicitar = (req, res) => {
  try {
    const solicitacaoId = solicitacoes.solicitarFolga({
      user: currentUser(req),
      data_folga: req.body.data_folga,
      periodo_folga: req.body.periodo_folga,
      motivo: req.body.motivo,
    });
    rhNotifications.notifyNewLeaveRequest(solicitacaoId);
    const registro = solicitacoes.getSolicitacao(solicitacaoId);
    flash(req, 'success', registro?.exige_excecao
      ? 'Solicitação enviada para avaliação excepcional. Já existe folga ou pedido nessa data; sua liberação depende da gestão.'
      : 'Solicitação enviada para aprovação. Somente uma folga por dia é liberada normalmente.');
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
    const id = Number(req.params.id);
    solicitacoes.aprovarSolicitacao(id, currentUser(req), req.body.observacao, {
      autorizar_excecao: String(req.body.autorizar_excecao || '') === '1',
      justificativa_excecao: req.body.justificativa_excecao,
    });
    rhNotifications.notifyLeaveDecision(id, 'APROVADA');
    flash(req, 'success', 'Folga aprovada, lançada na Escala e debitada do Banco de Horas.');
  } catch (error) { flash(req, 'error', error.message); }
  return res.redirect('/escala/folgas');
};

exports.reprovarSolicitacao = (req, res) => {
  try {
    const id = Number(req.params.id);
    solicitacoes.reprovarSolicitacao(id, currentUser(req), req.body.motivo);
    rhNotifications.notifyLeaveDecision(id, 'REPROVADA');
    flash(req, 'success', 'Solicitação reprovada e data liberada.');
  } catch (error) { flash(req, 'error', error.message); }
  return res.redirect('/escala/folgas');
};
