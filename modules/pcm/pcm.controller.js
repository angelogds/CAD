const service = require("./pcm.service");

function baseView(req) {
  return {
    title: "PCM – Planejamento e Controle da Manutenção",
    activeMenu: "pcm",
    opcoes: service.listFiltros(),
  };
}

function index(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    setor: req.query.setor || "",
    tipo_manutencao: req.query.tipo_manutencao || "",
  };

  return res.render("pcm/index", {
    ...baseView(req),
    activePcmSection: "visao-geral",
    indicadores: service.getIndicadores(),
    ranking: service.getRankingEquipamentos(5, Number(req.query.meses || 6)),
    planos: service.listPlanos(filtros),
    filtros,
  });
}

function planejamento(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    setor: req.query.setor || "",
    tipo_manutencao: req.query.tipo_manutencao || "",
  };
  return res.render("pcm/planejamento", {
    ...baseView(req),
    activePcmSection: "planejamento",
    planos: service.listPlanos(filtros),
    filtros,
  });
}

function falhas(req, res) {
  const filtros = {
    periodo: req.query.periodo || "",
    equipamento: req.query.equipamento || "",
    tipo_falha: req.query.tipo_falha || "",
  };
  return res.render("pcm/falhas", {
    ...baseView(req),
    activePcmSection: "falhas",
    filtros,
    falhas: service.listOSFalhasPreview(),
  });
}

function engenharia(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    categoria: req.query.categoria || "",
    busca: req.query.busca || "",
  };
  return res.render("pcm/engenharia", {
    ...baseView(req),
    activePcmSection: "engenharia",
    filtros,
    equipamentos: service.getEquipamentos(),
    equipamentoSelecionado: service.getEquipamentoById(filtros.equipamento_id),
    bom: service.listBom(filtros),
  });
}

function criticidade(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
  };
  return res.render("pcm/criticidade", {
    ...baseView(req),
    activePcmSection: "criticidade",
    filtros,
    equipamentos: service.getEquipamentos(),
  });
}

function salvarCriticidade(req, res) {
  // TODO: plugar persistência real em pcm_equipamento_criticidade
  req.flash("success", "Configuração de criticidade recebida (integração pendente do endpoint de persistência).");
  return res.redirect(`/pcm/criticidade?equipamento_id=${encodeURIComponent(req.body.equipamento_id || "")}`);
}

function lubrificacao(req, res) {
  const filtros = {
    equipamento_id: req.query.equipamento_id || "",
    setor: req.query.setor || "",
  };
  return res.render("pcm/lubrificacao", {
    ...baseView(req),
    activePcmSection: "lubrificacao",
    filtros,
    equipamentos: service.getEquipamentos(),
    lubrificacoes: service.listLubrificacao(filtros),
  });
}

function pecasCriticas(req, res) {
  const filtros = {
    tipo: req.query.tipo || "",
    busca: req.query.busca || "",
    abaixo_minimo: req.query.abaixo_minimo || "",
  };
  return res.render("pcm/pecas-criticas", {
    ...baseView(req),
    activePcmSection: "pecas-criticas",
    filtros,
    pecas: service.listPecasCriticas(filtros),
  });
}

function programacaoSemanal(req, res) {
  const filtros = {
    semana: req.query.semana || "",
    responsavel: req.query.responsavel || "",
    tipo: req.query.tipo || "",
    setor: req.query.setor || "",
    criticidade: req.query.criticidade || "",
  };

  const atividadesSemProgramacao = service.listBacklogSimples().slice(0, 12).map((b) => ({
    id: b.id,
    equipamento: b.equipamento,
    tipo: b.tipo,
    horas: 2,
    criticidade: b.criticidade || "N/D",
  }));

  const semanaGrid = ["Mecânico 1", "Mecânico 2", "Eletricista", "Equipe A"].map((responsavel, idx) => ({
    responsavel,
    dias: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      itens: atividadesSemProgramacao.filter((_, i) => (i + idx + d) % 11 === 0).slice(0, 2),
    })),
  }));

  return res.render("pcm/programacao-semanal", {
    ...baseView(req),
    activePcmSection: "programacao-semanal",
    filtros,
    semanaGrid,
    atividadesSemProgramacao,
  });
}

function backlog(req, res) {
  const filtros = {
    tipo: req.query.tipo || "",
    setor: req.query.setor || "",
    criticidade: req.query.criticidade || "",
    prioridade: req.query.prioridade || "",
    dias_atraso: req.query.dias_atraso || "",
  };

  let items = service.listBacklogSimples().map((b) => ({
    tipo: b.tipo,
    numero: b.numero,
    equipamento: b.equipamento,
    criticidade: b.criticidade,
    prioridade: b.prioridade,
    data_ref: b.data_ref,
    atraso: b.atraso,
    status: b.status,
    setor: b.setor || "",
  }));

  if (filtros.tipo) items = items.filter((i) => String(i.tipo).includes(filtros.tipo.toUpperCase()));
  if (filtros.criticidade) items = items.filter((i) => String(i.criticidade).includes(filtros.criticidade.toUpperCase()));
  if (filtros.prioridade) items = items.filter((i) => String(i.prioridade).includes(filtros.prioridade.toUpperCase()));
  if (filtros.dias_atraso) items = items.filter((i) => Number(i.atraso || 0) >= Number(filtros.dias_atraso));

  return res.render("pcm/backlog", {
    ...baseView(req),
    activePcmSection: "backlog",
    filtros,
    backlog: items,
  });
}

function rotasInspecao(req, res) {
  return res.render("pcm/rotas-inspecao", {
    ...baseView(req),
    activePcmSection: "rotas-inspecao",
    rotas: [],
  });
}

function relatoriosAvancados(req, res) {
  const indicadores = service.getIndicadores();
  const filtros = {
    periodo_inicio: req.query.periodo_inicio || "",
    periodo_fim: req.query.periodo_fim || "",
    setor: req.query.setor || "",
  };
  return res.render("pcm/relatorios-avancados", {
    ...baseView(req),
    activePcmSection: "relatorios-avancados",
    filtros,
    ranking: service.getRankingEquipamentos(10, Number(req.query.meses || 6)),
    resumo: {
      custo_total: Number(indicadores.custo_manutencao_mes || 0).toFixed(2),
      falhas: indicadores.corretiva_qtd_mes || 0,
      pct_preventiva: indicadores.preventiva_pct_mes || 0,
      pct_corretiva: indicadores.corretiva_pct_mes || 0,
    },
  });
}

function createPlano(req, res) {
  try {
    const id = service.createPlano({
      equipamento_id: req.body.equipamento_id,
      atividade_descricao: req.body.atividade_descricao,
      tipo_manutencao: req.body.tipo_manutencao,
      frequencia_dias: req.body.frequencia_dias,
      frequencia_horas: req.body.frequencia_horas,
      proxima_data_prevista: req.body.proxima_data_prevista,
      observacao: req.body.observacao,
      created_by: req.session?.user?.id || null,
    });
    req.flash("success", `Plano mestre #${id} criado com sucesso.`);
  } catch (e) {
    req.flash("error", e.message || "Erro ao criar plano mestre.");
  }
  return res.redirect("/pcm/planejamento");
}

function gerarOS(req, res) {
  try {
    const osId = service.gerarOS(req.params.id, req.session?.user?.id || null);
    req.flash("success", `OS preventiva #${osId} gerada automaticamente.`);
  } catch (e) {
    req.flash("error", e.message || "Erro ao gerar OS do plano.");
  }
  return res.redirect("/pcm/planejamento");
}

function registrarExecucao(req, res) {
  try {
    const osId = service.registrarExecucao(req.params.id, req.session?.user?.id || null);
    req.flash("success", `Execução registrada com vínculo na OS #${osId}.`);
  } catch (e) {
    req.flash("error", e.message || "Erro ao registrar execução.");
  }
  return res.redirect("/pcm/planejamento");
}


function atualizarIndicadores(_req, res) {
  return res.redirect('/pcm');
}

function registrarFalha(req, res) {
  // TODO: integrar com criação de OS de falha / banco de falhas existente
  req.flash('success', 'Ação de registro de falha recebida (integração pendente).');
  return res.redirect('/pcm/falhas');
}

function adicionarComponente(req, res) {
  // TODO: integrar com CRUD da lista técnica (BOM)
  req.flash('success', 'Componente enviado para cadastro (integração pendente).');
  const eid = encodeURIComponent(req.body.equipamento_id || '');
  return res.redirect(`/pcm/engenharia?equipamento_id=${eid}`);
}

function adicionarLubrificacao(req, res) {
  // TODO: integrar com criação de pontos de lubrificação
  req.flash('success', 'Ponto de lubrificação enviado (integração pendente).');
  const eid = encodeURIComponent(req.body.equipamento_id || '');
  return res.redirect(`/pcm/lubrificacao?equipamento_id=${eid}`);
}

function salvarProgramacao(req, res) {
  // TODO: persistir programação semanal em pcm_programacao_semana/itens
  req.flash('success', 'Programação da semana salva (integração pendente).');
  return res.redirect('/pcm/programacao-semanal');
}

function programarBacklog(req, res) {
  // TODO: mover item backlog para programação semanal
  req.flash('success', `Item ${req.params.id} enviado para programação (integração pendente).`);
  return res.redirect('/pcm/programacao-semanal');
}

function novaRota(req, res) {
  // TODO: integrar cadastro de rota de inspeção
  req.flash('success', 'Cadastro de nova rota recebido (integração pendente).');
  return res.redirect('/pcm/rotas-inspecao');
}

function salvarExecucaoRota(req, res) {
  // TODO: integrar execução de checklist / geração de OS ou demanda
  req.flash('success', 'Execução da rota salva (integração pendente).');
  return res.redirect('/pcm/rotas-inspecao');
}


module.exports = {
  index,
  planejamento,
  falhas,
  engenharia,
  criticidade,
  salvarCriticidade,
  lubrificacao,
  pecasCriticas,
  programacaoSemanal,
  backlog,
  rotasInspecao,
  relatoriosAvancados,
  atualizarIndicadores,
  registrarFalha,
  adicionarComponente,
  adicionarLubrificacao,
  salvarProgramacao,
  programarBacklog,
  novaRota,
  salvarExecucaoRota,
  createPlano,
  gerarOS,
  registrarExecucao,
};
