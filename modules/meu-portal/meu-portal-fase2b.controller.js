const service = require('./meu-portal-fase2b.service');
const dateBr = require('../../utils/data-hora-br');

function formatMinutes(value) {
  const total = Math.max(0, Number(value || 0));
  const hours = Math.floor(total / 60);
  const minutes = Math.round(total % 60);
  if (!hours) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
}

function treinamentos(req, res) {
  res.locals.activeMenu = 'meu-portal';
  try {
    return res.render('meu-portal/treinamentos', {
      title: 'Meus Treinamentos',
      treinamentos: service.getOwnTrainings(req.session.user.id),
      dateBr,
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar seus treinamentos.');
    return res.redirect('/meu-portal');
  }
}

function dadosProfissionais(req, res) {
  res.locals.activeMenu = 'meu-portal';
  try {
    return res.render('meu-portal/dados-profissionais', {
      title: 'Meus Dados Profissionais',
      profissional: service.getOwnProfessionalData(req.session.user.id),
      dateBr,
    });
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível carregar seus dados profissionais.');
    return res.redirect('/meu-portal');
  }
}

function servicos(req, res) {
  res.locals.activeMenu = 'meu-portal';
  try {
    return res.render('meu-portal/servicos', {
      title: 'Meus Serviços',
      historico: service.getOwnServiceHistory(req.session.user.id, {
        q: req.query.q,
        inicio: req.query.inicio,
        fim: req.query.fim,
        tipo: req.query.tipo,
      }),
      dateBr,
      formatMinutes,
    });
  } catch (error) {
    const message = error.message || 'Não foi possível carregar seu histórico técnico.';
    req.flash('error', message);
    return res.redirect(/^Período inválido:/i.test(message) ? '/meu-portal/servicos' : '/meu-portal');
  }
}

module.exports = { treinamentos, dadosProfissionais, servicos };
