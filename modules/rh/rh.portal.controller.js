const fs = require('node:fs');
const path = require('node:path');
const service = require('./rh.service');
const rhDocuments = require('./rh.documents');
const dateBr = require('../../utils/data-hora-br');

function formatMinutes(value) {
  const raw = Number(value || 0);
  const sign = raw < 0 ? '-' : '';
  const total = Math.abs(Math.round(raw));
  return `${sign}${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
}

exports.index = (req, res) => {
  res.locals.activeMenu = 'meu-portal';
  try {
    let rh = service.getOwnPortalData(req.session.user.id);
    if (rh?.colaborador?.id) {
      rh = {
        ...rh,
        documentos: rhDocuments.listForCollaborator(rh.colaborador.id, { self: true }),
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
