const service = require('./rh.service');
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
    return res.render('meu-portal/rh', {
      title: 'Meu RH',
      rh: service.getOwnPortalData(req.session.user.id),
      dateBr,
      formatMinutes,
    });
  } catch (error) {
    req.flash?.('error', error.message || 'Não foi possível carregar suas informações de RH.');
    return res.redirect('/meu-portal');
  }
};
