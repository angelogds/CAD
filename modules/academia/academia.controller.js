const path = require('path');
const service = require('./academia.service');
const iaService = require('./academia-ia.service');

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
  const userId = req.session?.user?.id;
  const curso = service.getCursoDetalhe(Number(req.params.id), userId);
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

function documentosInternos(req, res) {
  return res.render('academia/documentos-internos', {
    ...baseView('documentos-internos'),
    documentos: service.listDocumentosInternos(req.session?.user?.id),
  });
}

function certificadosExternos(req, res) {
  return res.render('academia/certificados-externos', {
    ...baseView('certificados-externos'),
    etapasExternas: service.listEtapasExternas(req.session?.user?.id),
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
  const cursos = service.listCursos({}, req.session?.user?.id);
  return res.render('academia/professor-ia', {
    ...baseView('professor-ia'),
    cursos,
    iaConfigured: !!process.env.OPENAI_API_KEY && String(process.env.AI_ENABLED || 'true').toLowerCase() === 'true',
  });
}

function iniciarCurso(req, res) {
  const cursoId = Number(req.params.curso_id);
  try {
    service.iniciarCurso({
      cursoId,
      userId: req.session?.user?.id,
    });
    const primeiroBloco = service.getPrimeiroBloco(cursoId);
    req.flash('success', 'Curso iniciado com sucesso.');
    if (primeiroBloco) return res.redirect(`/academia/curso/${cursoId}?bloco=${primeiroBloco.id}#bloco-${primeiroBloco.id}`);
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível iniciar o curso.');
  }
  return res.redirect(req.get('referer') || '/academia/cursos');
}

function continuarCurso(req, res) {
  const cursoId = Number(req.params.curso_id);
  const userId = req.session?.user?.id;
  try {
    service.iniciarCurso({ cursoId, userId });
    const pendente = service.getProximoBlocoPendente({ cursoId, userId }) || service.getPrimeiroBloco(cursoId);
    if (pendente) return res.redirect(`/academia/curso/${cursoId}?bloco=${pendente.id}#bloco-${pendente.id}`);
    req.flash('success', 'Todos os blocos já foram concluídos. Você pode seguir para avaliação.');
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível continuar o curso.');
  }
  return res.redirect(`/academia/curso/${cursoId}`);
}

function concluirBloco(req, res) {
  const cursoId = Number(req.params.curso_id);
  const blocoId = Number(req.params.bloco_id);
  const userId = req.session?.user?.id;
  try {
    const resultado = service.concluirBloco({ cursoId, blocoId, userId });
    req.flash('success', `Leitura do bloco registrada. Progresso atual: ${resultado.percentual}%. Responda a avaliação do bloco para liberar o próximo.`);
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível concluir o bloco.');
  }
  return res.redirect(`/academia/curso/${cursoId}?bloco=${blocoId}#bloco-${blocoId}`);
}

function enviarAvaliacaoBloco(req, res) {
  const cursoId = Number(req.params.curso_id);
  const blocoId = Number(req.params.bloco_id);
  const respostas = Object.keys(req.body || {})
    .filter((k) => k.startsWith('resposta_'))
    .map((k) => ({ pergunta_id: Number(k.replace('resposta_', '')), resposta: req.body[k] }));

  try {
    const result = service.avaliarBloco({
      cursoId,
      blocoId,
      userId: req.session?.user?.id,
      respostas,
    });
    req.flash(result.aprovado
      ? `Bloco aprovado com ${result.percentual}% de acerto.`
      : `Bloco em revisão: ${result.percentual}% de acerto (mínimo 50%).`);
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível registrar a avaliação do bloco.');
  }
  return res.redirect(`/academia/curso/${cursoId}`);
}

function concluirCurso(req, res) {
  try {
    service.concluirCurso({
      cursoId: Number(req.params.curso_id),
      userId: req.session?.user?.id,
    });
    service.podeLiberarEtapaExterna({ cursoId: Number(req.params.curso_id), userId: req.session?.user?.id });
    req.flash('success', 'Etapa interna concluída. Faça a avaliação para liberar a etapa complementar externa.');
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível concluir o curso.');
  }
  return res.redirect(req.get('referer') || '/academia/minhas-aulas');
}

function enviarAvaliacao(req, res) {
  try {
    const result = service.registrarAvaliacaoInterna({
      cursoId: Number(req.params.curso_id),
      userId: req.session?.user?.id,
      tipoAvaliacao: req.body.tipo_avaliacao,
      nota: req.body.nota,
      percentual: req.body.percentual,
      feedback: req.body.feedback,
      recomendacaoIA: req.body.recomendacao_ia,
      respostas: req.body.respostas || null,
    });

    service.podeLiberarEtapaExterna({ cursoId: Number(req.params.curso_id), userId: req.session?.user?.id });

    req.flash('success', result.status === 'APROVADO'
      ? `Avaliação aprovada (nota mínima ${result.notaMinima}).`
      : `Avaliação registrada. Nota mínima necessária: ${result.notaMinima}.`);
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível registrar a avaliação.');
  }
  return res.redirect(req.get('referer') || '/academia/avaliacoes');
}

function enviarAvaliacaoFinal(req, res) {
  try {
    const result = service.registrarAvaliacaoFinal({
      cursoId: Number(req.params.curso_id),
      userId: req.session?.user?.id,
      nota: req.body.nota,
      percentual: req.body.percentual,
      respostas: req.body.respostas || null,
    });
    req.flash(result.status === 'APROVADO'
      ? `Avaliação final aprovada com ${result.percentual}%. Etapa interna concluída.`
      : `Avaliação final em revisão (${result.percentual}%). Nota mínima final: 70%.`);
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível registrar a avaliação final.');
  }
  return res.redirect(req.get('referer') || '/academia/avaliacoes');
}

function certificado(req, res) {
  try {
    service.salvarCertificado({
      cursoId: Number(req.body.curso_id),
      userId: req.session?.user?.id,
      certificadoUrl: String(req.body.certificado_url || '').trim(),
    });
    req.flash('success', 'Comprovante externo enviado com sucesso. Aguarde validação da supervisão.');
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível salvar o certificado externo.');
  }
  return res.redirect(req.get('referer') || '/academia/certificados-externos');
}

function certificadoUpload(req, res) {
  try {
    const file = req.file;
    if (!file) throw new Error('Arquivo do comprovante não enviado.');

    service.registrarEtapaExterna({
      cursoId: Number(req.body.curso_id),
      userId: req.session?.user?.id,
      certificadoUrl: `/uploads/academia/certificados-externos/${file.filename}`,
      dataConclusao: req.body.data_conclusao_externa || null,
      plataforma: req.body.plataforma_externa || 'CURSA',
      linkExterno: req.body.link_externo || null,
      certificadoNomeArquivo: path.basename(file.originalname || file.filename),
    });

    req.flash('success', 'Arquivo de comprovante enviado para validação externa.');
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível fazer upload do comprovante externo.');
  }

  return res.redirect(req.get('referer') || '/academia/certificados-externos');
}

function liberarEtapaExterna(req, res) {
  try {
    service.liberarEtapaExternaManual({
      cursoId: Number(req.params.curso_id),
      userId: Number(req.body.usuario_id || req.session?.user?.id),
      adminId: req.session?.user?.id,
    });
    req.flash('success', 'Etapa complementar externa liberada manualmente.');
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível liberar a etapa externa.');
  }
  return res.redirect(req.get('referer') || '/academia/cursos');
}

function validarEtapaExterna(req, res) {
  try {
    service.validarEtapaExterna({
      etapaId: Number(req.params.id),
      statusValidacao: req.body.status_validacao,
      adminId: req.session?.user?.id,
    });
    req.flash('success', 'Validação da etapa externa atualizada.');
  } catch (e) {
    req.flash('error', e.message || 'Não foi possível validar etapa externa.');
  }
  return res.redirect(req.get('referer') || '/academia/certificados-externos');
}

async function professorIAPerguntar(req, res) {
  try {
    const action = String(req.body.action || 'perguntar').trim();
    const pergunta = String(req.body.pergunta || '').trim();
    const cursoId = req.body.curso_id ? Number(req.body.curso_id) : null;

    const result = await iaService.responderProfessorIA({
      usuarioId: req.session?.user?.id,
      cursoId,
      action,
      pergunta,
    });

    return res.json(result);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Falha no Professor IA.' });
  }
}

async function professorIAResumirBloco(req, res) {
  req.body.action = 'resumir';
  return professorIAPerguntar(req, res);
}

async function professorIAGerarPerguntasBloco(req, res) {
  req.body.action = 'gerar_perguntas';
  return professorIAPerguntar(req, res);
}

async function professorIARecomendarProximo(req, res) {
  req.body.action = 'recomendar_proximo';
  return professorIAPerguntar(req, res);
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

function criarBloco(req, res) {
  try {
    const id = service.criarBloco(req.body);
    req.flash('success', `Bloco #${id} cadastrado com sucesso.`);
  } catch (e) {
    req.flash('error', e.message || 'Erro ao criar bloco.');
  }
  return res.redirect(`/academia/curso/${req.body.curso_id || ''}`);
}

function criarEbook(req, res) {
  try {
    const id = service.criarEbook(req.body);
    req.flash('success', `E-book #${id} cadastrado com sucesso.`);
  } catch (e) {
    req.flash('error', e.message || 'Erro ao criar e-book.');
  }
  return res.redirect(`/academia/curso/${req.body.curso_id || ''}`);
}

function executarSeedConteudoCursos(req, res) {
  try {
    const resultado = service.seedConteudoCursos();
    req.flash(
      'success',
      `Gerador executado: ${resultado.cursosAnalisados} cursos analisados, ${resultado.blocosCriados} blocos criados, ${resultado.ebooksCriados} e-books criados, ${resultado.ebooksImportados || 0} e-books importados da pasta e ${resultado.avaliacoesCriadas} avaliações criadas.`
    );
  } catch (e) {
    req.flash('error', e.message || 'Erro ao executar gerador automático de conteúdo.');
  }
  return res.redirect(req.get('referer') || '/academia/cursos');
}

module.exports = {
  index,
  cursos,
  cursoDetalhe,
  trilhaDetalhe,
  minhasAulas,
  avaliacoes,
  certificados,
  documentosInternos,
  certificadosExternos,
  ranking,
  trilhas,
  biblioteca,
  professorIA,
  professorIAPerguntar,
  professorIAResumirBloco,
  professorIAGerarPerguntasBloco,
  professorIARecomendarProximo,
  iniciarCurso,
  continuarCurso,
  concluirBloco,
  enviarAvaliacaoBloco,
  concluirCurso,
  enviarAvaliacao,
  enviarAvaliacaoFinal,
  certificado,
  certificadoUpload,
  liberarEtapaExterna,
  validarEtapaExterna,
  criarCurso,
  criarAula,
  criarBloco,
  criarEbook,
  executarSeedConteudoCursos,
};
