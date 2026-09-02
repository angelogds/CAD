const QRCode = require('qrcode');
const qrService = require('./colaboradores.qr.service');

async function cartao(req, res, next) {
  try {
    const colaborador = qrService.getById(Number(req.params.id));
    if (!colaborador) return res.status(404).send('Colaborador não encontrado.');
    const payload = qrService.encodePayload(colaborador);
    const qrDataUrl = payload ? await QRCode.toDataURL(payload, { width: 420, margin: 1, errorCorrectionLevel: 'H' }) : null;
    return res.render('colaboradores/cartao', {
      title: `Cartão • ${colaborador.nome}`,
      activeMenu: 'colaboradores',
      colaborador,
      payload,
      qrDataUrl,
    });
  } catch (error) { return next(error); }
}

function emitir(req, res) {
  try {
    qrService.emitToken(Number(req.params.id), { rotate: String(req.body.rotate || '') === '1' });
    req.flash('success', String(req.body.rotate || '') === '1' ? 'Novo QR emitido. O cartão anterior foi invalidado.' : 'Cartão QR emitido.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível emitir o cartão.');
  }
  return res.redirect(`/colaboradores/${req.params.id}/cartao`);
}

function revogar(req, res) {
  try {
    qrService.revoke(Number(req.params.id));
    req.flash('success', 'Cartão QR revogado.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível revogar o cartão.');
  }
  return res.redirect(`/colaboradores/${req.params.id}/cartao`);
}

module.exports = { cartao, emitir, revogar };
