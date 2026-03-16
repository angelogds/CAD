const service = require('./fornecedores.service');

function list(req, res) {
  const filters = {
    q: (req.query.q || '').trim(),
    ativo: req.query.ativo || '',
  };

  const fornecedores = service.list(filters);
  return res.render('fornecedores/index', {
    title: 'Fornecedores',
    activeMenu: 'fornecedores',
    fornecedores,
    filters,
  });
}

function newForm(_req, res) {
  return res.render('fornecedores/form', {
    title: 'Novo fornecedor',
    activeMenu: 'fornecedores',
    fornecedor: null,
    formAction: '/fornecedores',
  });
}

function create(req, res) {
  try {
    if (!String(req.body.nome || '').trim()) throw new Error('Nome é obrigatório.');
    const id = service.create(req.body);
    req.flash('success', 'Fornecedor cadastrado com sucesso.');
    return res.redirect(`/fornecedores/${id}/editar`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível cadastrar o fornecedor.');
    return res.redirect('/fornecedores/novo');
  }
}

function editForm(req, res) {
  const fornecedor = service.getById(Number(req.params.id));
  if (!fornecedor) return res.status(404).send('Fornecedor não encontrado');

  return res.render('fornecedores/form', {
    title: `Editar fornecedor #${fornecedor.id}`,
    activeMenu: 'fornecedores',
    fornecedor,
    formAction: `/fornecedores/${fornecedor.id}`,
  });
}

function update(req, res) {
  try {
    if (!String(req.body.nome || '').trim()) throw new Error('Nome é obrigatório.');
    service.update(Number(req.params.id), req.body);
    req.flash('success', 'Fornecedor atualizado com sucesso.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível atualizar o fornecedor.');
  }

  return res.redirect(`/fornecedores/${req.params.id}/editar`);
}

module.exports = { list, newForm, create, editForm, update };
