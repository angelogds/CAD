const service = require('./acompanhamento-compras.service');

function index(req, res) {
  res.locals.activeMenu = 'solicitacoes';
  try {
    const painel = service.getDashboard(req.session?.user || {}, req.query || {});
    return res.render('acompanhamento-compras/index', {
      title: 'Acompanhamento de Compras',
      painel,
    });
  } catch (error) {
    console.error('[acompanhamento-compras.index]', error);
    if (error.status === 403) return res.status(403).send('403 - Acesso não autorizado');
    req.flash('error', error.message || 'Não foi possível carregar o acompanhamento de compras.');
    return res.redirect('/dashboard');
  }
}

function detalhe(req, res) {
  res.locals.activeMenu = 'solicitacoes';
  try {
    const detalheCompra = service.getDetail(req.session?.user || {}, Number(req.params.id));
    if (!detalheCompra) return res.status(404).send('Solicitação não encontrada.');

    return res.render('acompanhamento-compras/detalhe', {
      title: `Acompanhamento ${detalheCompra.numero || '#' + detalheCompra.id}`,
      detalheCompra,
    });
  } catch (error) {
    console.error('[acompanhamento-compras.detalhe]', error);
    if (error.status === 403) return res.status(403).send('403 - Acesso não autorizado');
    req.flash('error', error.message || 'Não foi possível abrir esta solicitação.');
    return res.redirect('/acompanhamento-compras');
  }
}

module.exports = { index, detalhe };
