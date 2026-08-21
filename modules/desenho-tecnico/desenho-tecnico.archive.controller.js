'use strict';

const service = require('./desenho-tecnico.service');

function archiveCad(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho || desenho.tipo_origem !== 'cad') {
    req.flash('error', 'Desenho CAD não encontrado.');
    return res.redirect('/desenho-tecnico?status=ATIVO');
  }

  service.inactivate(desenho.id);
  req.flash('success', `${desenho.codigo || 'Desenho'} removido da lista principal. Os dados foram preservados no arquivo técnico.`);
  return res.redirect('/desenho-tecnico?status=ATIVO');
}

module.exports = { archiveCad };
