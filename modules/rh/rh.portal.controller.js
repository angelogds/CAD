const fs = require('node:fs');
const path = require('node:path');
const service = require('./rh.service');
const rhDocuments = require('./rh.documents');
const atestados = require('./rh.atestados');
const rhNotifications = require('./rh.notifications');
const rhPdf = require('./rh.pdf');
const dateBr = require('../../utils/data-hora-br');

function formatMinutes(value) {
  const raw = Number(value || 0);
  const sign = raw < 0 ? '-' : '';
  const total = Math.abs(Math.round(raw));
  return `${sign}${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
}

function flash(req, type, message) { req.flash?.(type, message); }

exports.index = (req, res) => {
  res.locals.activeMenu = 'meu-portal';
  try {
    let rh = service.getOwnPortalData(req.session.user.id);
    if (rh?.colaborador?.id) {
      rh = {
        ...rh,
        documentos: rhDocuments.listForCollaborator(rh.colaborador.id, { self: true }),
        atestados: atestados.listForCollaborator(rh.colaborador.id, { limit: 30 }),
      };
    }
    return res.render('meu-portal/rh', {
      title: 'Meu RH',
      rh,
      dateBr,
      formatMinutes,
    });
  } catch (error) {
    req.flash?.('error', error.message || 'Não foi possível carregar suas informações de RH.');
    return res.redirect('/meu-portal');
  }
};

exports.enviarAtestado = (req, res) => {
  try {
    const item = atestados.createFromPortal({
      userId: req.session.user.id,
      payload: req.body,
      file: req.file,
    });
    rhNotifications.notifyNewAtestado(item.id);
    flash(req, 'success', 'Atestado enviado ao RH e ausência registrada na Escala.');
  } catch (error) {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_unlinkError) {}
    }
    flash(req, 'error', error.message || 'Não foi possível enviar o atestado.');
  }
  return res.redirect('/meu-portal/rh#atestados');
};

exports.documentoArquivo = (req, res) => {
  try {
    const rh = service.getOwnPortalData(req.session.user.id);
    if (!rh?.vinculado || !rh?.colaborador?.id) return res.status(404).send('Documento não encontrado.');
    const documento = rhDocuments.getPrivateDocumentForDownload(Number(req.params.documentoId), Number(rh.colaborador.id));
    if (!documento || !fs.existsSync(documento.filePath)) return res.status(404).send('Documento não encontrado.');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.download(documento.filePath, path.basename(documento.filePath));
  } catch (_error) {
    return res.status(404).send('Documento não encontrado.');
  }
};

exports.atestadoArquivo = (req, res) => {
  try {
    const rh = service.getOwnPortalData(req.session.user.id);
    if (!rh?.vinculado || !rh?.colaborador?.id) return res.status(404).send('Atestado não encontrado.');
    const item = atestados.getOwnPrivateFile(Number(req.params.atestadoId), Number(rh.colaborador.id));
    if (!item) return res.status(404).send('Atestado não encontrado.');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.download(item.filePath, item.arquivo_nome_original || path.basename(item.filePath));
  } catch (_error) {
    return res.status(404).send('Atestado não encontrado.');
  }
};

exports.folgaPdf = (req, res) => {
  try {
    const rh = service.getOwnPortalData(req.session.user.id);
    if (!rh?.vinculado || !rh?.colaborador?.id) return res.status(404).send('Solicitação não encontrada.');
    const data = rhPdf.getLeaveData(Number(req.params.solicitacaoId));
    if (Number(data.request.colaborador_id) !== Number(rh.colaborador.id)) {
      return res.status(404).send('Solicitação não encontrada.');
    }
    const doc = rhPdf.generateLeavePdf({ requestId: Number(req.params.solicitacaoId) });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=folga_${Number(req.params.solicitacaoId)}.pdf`);
    res.setHeader('Cache-Control', 'private, no-store');
    doc.pipe(res);
    return undefined;
  } catch (error) {
    flash(req, 'error', error.message || 'Não foi possível gerar o PDF da folga.');
    return res.redirect('/meu-portal/rh#folgas');
  }
};
