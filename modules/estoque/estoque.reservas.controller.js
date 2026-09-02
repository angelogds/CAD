const reservaService = require('./estoque.reservas.service');

function index(req, res) {
  const q = String(req.query.q || '').trim();
  const grupos = reservaService.listSolicitacoes({ q });
  return res.render('estoque/reservas', {
    title: 'Materiais separados por solicitação',
    activeMenu: 'estoque',
    q,
    grupos,
    resumo: reservaService.dashboard(),
  });
}

module.exports = { index };
