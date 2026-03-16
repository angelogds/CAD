const service = require('./academia.service');

function baseView() {
  return {
    title: 'Academia da Manutenção',
    activeMenu: 'academia',
  };
}

function index(req, res) {
  const dados = service.getDashboardData(req.session?.user?.id);
  return res.render('academia/index', {
    ...baseView(),
    ...dados,
  });
}

function cursos(req, res) {
  const filtros = {
    trilha_id: req.query.trilha_id || '',
    nivel: req.query.nivel || '',
    busca: req.query.busca || '',
  };

  return res.render('academia/cursos', {
    ...baseView(),
    cursos: service.listCursos(filtros, req.session?.user?.id),
    trilhas: service.listTrilhas(),
    filtros,
  });
}

function cursoDetalhe(req, res) {
  const curso = service.getCursoDetalhe(Number(req.params.id), req.session?.user?.id);
  if (!curso) {
    req.flash('error', 'Curso não encontrado.');
    return res.redirect('/academia/cursos');
  }

  return res.render('academia/curso-detalhe', {
    ...baseView(),
    curso,
  });
}

function minhasAulas(req, res) {
  return res.render('academia/minhas-aulas', {
    ...baseView(),
    minhasAulas: service.getMinhasAulas(req.session?.user?.id),
  });
}

function ranking(req, res) {
  return res.render('academia/ranking', {
    ...baseView(),
    ranking: service.getRanking(),
  });
}

function trilhas(req, res) {
  return res.render('academia/trilhas', {
    ...baseView(),
    trilhas: service.listTrilhas(),
  });
}

function biblioteca(req, res) {
  return res.render('academia/biblioteca', {
    ...baseView(),
    itens: service.listBiblioteca(),
  });
}

function iniciarCurso(req, res) {
  try {
    service.iniciarCurso({
      cursoId: Number(req.params.curso_id),
      userId: req.session?.user?.id,
    });
    req.flash('success', 'Curso iniciado com sucesso.');
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível iniciar o curso.');
  }
  return res.redirect(req.get('referer') || '/academia/cursos');
}

function concluirCurso(req, res) {
  try {
    service.concluirCurso({
      cursoId: Number(req.params.curso_id),
      userId: req.session?.user?.id,
    });
    req.flash('success', 'Parabéns! Curso concluído e pontos computados.');
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível concluir o curso.');
  }
  return res.redirect(req.get('referer') || '/academia/minhas-aulas');
}

function certificado(req, res) {
  try {
    service.salvarCertificado({
      cursoId: Number(req.body.curso_id),
      userId: req.session?.user?.id,
      certificadoUrl: String(req.body.certificado_url || '').trim(),
    });
    req.flash('success', 'Certificado vinculado ao curso com sucesso.');
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível salvar o certificado.');
  }
  return res.redirect(req.get('referer') || '/academia/minhas-aulas');
}

function criarCurso(req, res) {
  try {
    const id = service.criarCurso(req.body);
    req.flash('success', `Curso #${id} criado com sucesso.`);
  } catch (e) {
    req.flash('error', e.message || 'Erro ao criar curso.');
  }
  return res.redirect('/academia/cursos');
}

function criarAula(req, res) {
  try {
    const id = service.criarAula(req.body);
    req.flash('success', `Aula #${id} cadastrada com sucesso.`);
  } catch (e) {
    req.flash('error', e.message || 'Erro ao criar aula.');
  }
  return res.redirect(`/academia/curso/${req.body.curso_id || ''}`);
}

module.exports = {
  index,
  cursos,
  cursoDetalhe,
  minhasAulas,
  ranking,
  trilhas,
  biblioteca,
  iniciarCurso,
  concluirCurso,
  certificado,
  criarCurso,
  criarAula,
};
