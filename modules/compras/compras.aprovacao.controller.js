const approvalService = require('./compras.aprovacao.service');

function enviar(req, res) {
  const id = Number(req.params.id);
  try {
    const context = approvalService.requestApproval(id, Number(req.body.diretor_user_id), req.session?.user?.id || null);
    req.flash('success', `Cotação enviada para aprovação de ${context.diretor_aprovador_nome || 'Diretoria'}. A compra ficará bloqueada até a liberação.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível enviar a cotação para aprovação.');
  }
  return res.redirect(`/compras/solicitacoes/${id}`);
}

function registrarManual(req, res) {
  const id = Number(req.params.id);
  try {
    const context = approvalService.registerManual(id, {
      directorId: Number(req.body.diretor_user_id),
      evidenceAttachmentId: Number(req.body.evidencia_anexo_id),
      observation: req.body.observacao,
      recordedByUserId: req.session?.user?.id || null,
    });
    req.flash('success', `Visto manual da Diretoria registrado para ${context.diretor_aprovador_nome || 'diretor responsável'}. A compra está liberada dentro do valor aprovado.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a aprovação manual.');
  }
  return res.redirect(`/compras/solicitacoes/${id}`);
}

module.exports = { enviar, registrarManual };
