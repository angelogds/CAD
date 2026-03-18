const service = require('./academia.service');

function baseView(activeAcademiaSection = 'index') {
  return {
    title: 'Academia da Manutenção',
    activeMenu: 'academia',
    activeAcademiaSection,
  };
}

function index(req, res) {
  const dados = service.getDashboardData(req.session?.user?.id);
  return res.render('academia/index', {
    ...baseView('index'),
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
    ...baseView('cursos'),
    cursos: service.listCursos(filtros, req.session?.user?.id),
    trilhas: service.listTrilhas(req.session?.user?.id),
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
    ...baseView('cursos'),
    curso,
  });
}

function trilhaDetalhe(req, res) {
  const trilha = service.getTrilhaDetalhe(Number(req.params.id), req.session?.user?.id);
  if (!trilha) {
    req.flash('error', 'Trilha não encontrada.');
    return res.redirect('/academia/trilhas');
  }

  return res.render('academia/trilha-detalhe', {
    ...baseView('trilhas'),
    trilha,
  });
}

function minhasAulas(req, res) {
  return res.render('academia/minhas-aulas', {
    ...baseView('minhas-aulas'),
    minhasAulas: service.getMinhasAulas(req.session?.user?.id),
  });
}

function avaliacoes(req, res) {
  return res.render('academia/avaliacoes', {
    ...baseView('avaliacoes'),
    avaliacoes: service.listAvaliacoes(req.session?.user?.id),
  });
}

function certificados(req, res) {
  return res.render('academia/certificados', {
    ...baseView('certificados'),
    certificados: service.listCertificados(req.session?.user?.id),
  });
}

function ranking(req, res) {
  return res.render('academia/ranking', {
    ...baseView('ranking'),
    ranking: service.getRanking(),
    minhaPosicao: service.getMinhaPosicaoRanking(req.session?.user?.id),
  });
}

function trilhas(req, res) {
  return res.render('academia/trilhas', {
    ...baseView('trilhas'),
    trilhas: service.listTrilhas(req.session?.user?.id),
  });
}

function biblioteca(req, res) {
  const filtros = {
    categoria: String(req.query.categoria || '').trim(),
    busca: String(req.query.busca || '').trim(),
  };

  return res.render('academia/biblioteca', {
    ...baseView('biblioteca'),
    itens: service.listBiblioteca(filtros),
    categorias: service.listBibliotecaCategorias(),
    filtros,
  });
}

function professorIA(req, res) {
  return res.render('academia/professor-ia', {
    ...baseView('professor-ia'),
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
  trilhaDetalhe,
  minhasAulas,
  avaliacoes,
  certificados,
  ranking,
  trilhas,
  biblioteca,
  professorIA,
  iniciarCurso,
  concluirCurso,
  certificado,
  criarCurso,
  criarAula,
};
