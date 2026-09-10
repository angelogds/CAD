const QRCode = require('qrcode');
const service = require('./meu-portal.service');
const qrService = require('../colaboradores/colaboradores.qr.service');
const dateBr = require('../../utils/data-hora-br');

async function qrDataUrl(colaborador) {
  const payload = qrService.encodePayload(colaborador);
  if (!payload) return null;
  return QRCode.toDataURL(payload, { width: 420, margin: 1, errorCorrectionLevel: 'H' });
}

async function index(req, res) {
  res.locals.activeMenu = 'meu-portal';
  try {
    const portal = service.getPortalData(req.session.user.id);
    const cardQr = portal.colaborador ? await qrDataUrl(portal.colaborador) : null;
    const canManageLink = service.canManageLink(req.session.user.role);
    const availableColaboradores = !portal.colaborador && canManageLink
      ? service.listAvailableColaboradores()
      : [];

    return res.render('meu-portal/index', {
      title: 'Meu Portal',
      portal,
      cardQr,
      canManageLink,
      availableColaboradores,
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar o Meu Portal.');
    return res.redirect('/dashboard');
  }
}

function materiais(req, res) {
  res.locals.activeMenu = 'meu-portal';
  try {
    const materiais = service.listOwnMaterialWithdrawals(req.session.user.id, {
      q: req.query.q,
      inicio: req.query.inicio,
      fim: req.query.fim,
    });

    return res.render('meu-portal/materiais', {
      title: 'Meus Materiais',
      materiais,
      dateBr,
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar seu histórico de materiais.');
    return res.redirect('/meu-portal/materiais');
  }
}

function linkColaborador(req, res) {
  const colaboradorId = Number(req.body.colaborador_id);

  try {
    const portal = service.linkOwnUserToColaborador(
      req.session.user.id,
      colaboradorId,
      req.session.user.role
    );

    if (portal?.user?.photo_path) req.session.user.photo_path = portal.user.photo_path;
    req.flash('success', 'Vínculo realizado com sucesso. Sua ficha profissional já está conectada ao Meu Portal.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível vincular a ficha de colaborador.');
  }

  return res.redirect('/meu-portal');
}

function updatePhoto(req, res) {
  if (!req.file) {
    req.flash('error', 'Selecione uma imagem JPG, PNG ou WEBP.');
    return res.redirect('/meu-portal');
  }

  const photoPath = `/imagens/users/${req.file.filename}`;
  try {
    service.updateOwnPhoto(req.session.user.id, photoPath);
    req.session.user.photo_path = photoPath;
    req.flash('success', 'Foto atualizada com sucesso.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível atualizar sua foto.');
  }
  return res.redirect('/meu-portal');
}

function changePassword(req, res) {
  const currentPassword = String(req.body.current_password || '');
  const newPassword = String(req.body.new_password || '');
  const confirmPassword = String(req.body.confirm_password || '');

  if (!currentPassword || !newPassword || !confirmPassword) {
    req.flash('error', 'Preencha a senha atual, a nova senha e a confirmação.');
    return res.redirect('/meu-portal#seguranca');
  }
  if (newPassword.length < 8) {
    req.flash('error', 'A nova senha deve ter pelo menos 8 caracteres.');
    return res.redirect('/meu-portal#seguranca');
  }
  if (newPassword !== confirmPassword) {
    req.flash('error', 'A confirmação da nova senha não confere.');
    return res.redirect('/meu-portal#seguranca');
  }
  if (currentPassword === newPassword) {
    req.flash('error', 'A nova senha deve ser diferente da senha atual.');
    return res.redirect('/meu-portal#seguranca');
  }

  try {
    service.changeOwnPassword(req.session.user.id, currentPassword, newPassword);
    req.flash('success', 'Senha alterada com sucesso.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível alterar sua senha.');
  }
  return res.redirect('/meu-portal#seguranca');
}

function emitCard(req, res) {
  try {
    service.ensureOwnCard(req.session.user.id);
    req.flash('success', 'Seu cartão foi emitido e já pode ser utilizado no Almoxarifado.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível emitir seu cartão.');
  }
  return res.redirect('/meu-portal#cartao');
}

async function card(req, res) {
  res.locals.activeMenu = 'meu-portal';
  try {
    const { user, colaborador } = service.getOwnCard(req.session.user.id);
    const cardQr = await qrDataUrl(colaborador);
    if (!cardQr) {
      req.flash('error', colaborador.qr_token ? 'Seu cartão está revogado.' : 'Emita seu cartão antes de abrir a versão para impressão.');
      return res.redirect('/meu-portal#cartao');
    }
    return res.render('meu-portal/cartao', {
      title: 'Meu Cartão',
      user,
      colaborador,
      cardQr,
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível abrir seu cartão.');
    return res.redirect('/meu-portal');
  }
}

module.exports = { index, materiais, linkColaborador, updatePhoto, changePassword, emitCard, card };
