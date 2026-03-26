const db = require("../../database/db");

function tableExists(name) {
  try {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
      .get(String(name || ""));
    return !!row;
  } catch (_e) {
    return false;
  }
}

function listPlanos() {
  return db.prepare(`
    SELECT p.*,
           e.nome AS equipamento_nome,
           e.codigo AS equipamento_codigo
    FROM preventiva_planos p
    LEFT JOIN equipamentos e ON e.id = p.equipamento_id
    ORDER BY p.ativo DESC, p.id DESC
  `).all();
}

function listEquipamentosAtivos() {
  return db.prepare(`
    SELECT id, codigo, nome, tipo, criticidade
    FROM equipamentos
    WHERE ativo = 1
    ORDER BY nome
  `).all();
}

function createPlano(data) {
  const cols = getPlanoColumns();
  const fields = ["equipamento_id", "titulo", "frequencia_tipo", "frequencia_valor", "ativo", "observacao"];
  const values = [
    data.equipamento_id ? Number(data.equipamento_id) : null,
    String(data.titulo || "").trim(),
    String(data.frequencia_tipo || "mensal").trim(),
    Number(data.frequencia_valor || 1),
    data.ativo ? 1 : 0,
    String(data.observacao || "").trim(),
  ];

  const optional = {
    prioridade: data.prioridade || null,
    tipo_plano: data.tipo_plano || null,
    checklist_json: data.checklist_json ? JSON.stringify(data.checklist_json) : null,
    gerado_ia: typeof data.gerado_ia === "number" ? data.gerado_ia : null,
  };

  for (const [col, value] of Object.entries(optional)) {
    if (!cols.includes(col)) continue;
    fields.push(col);
    values.push(value);
  }

  const stmt = db.prepare(`
    INSERT INTO preventiva_planos (${fields.join(", ")})
    VALUES (${fields.map(() => "?").join(", ")})
  `);

  const r = stmt.run(...values);
  return Number(r.lastInsertRowid);
}

function getPlanoById(id) {
  return db.prepare(`
    SELECT p.*,
           e.nome AS equipamento_nome,
           e.codigo AS equipamento_codigo,
           e.setor AS equipamento_setor,
           e.tipo AS equipamento_tipo
    FROM preventiva_planos p
    LEFT JOIN equipamentos e ON e.id = p.equipamento_id
    WHERE p.id = ?
    LIMIT 1
  `).get(Number(id));
}

function listExecucoes(planoId) {
  return db.prepare(`
    SELECT *
    FROM preventiva_execucoes
    WHERE plano_id = ?
    ORDER BY
      CASE status
        WHEN 'atrasada' THEN 1
        WHEN 'pendente' THEN 2
        WHEN 'executada' THEN 3
        WHEN 'cancelada' THEN 4
        ELSE 9
      END,
      COALESCE(data_prevista,'9999-12-31') ASC,
      id DESC
  `).all(Number(planoId));
}

function createExecucao(planoId, data) {
  const cols = getPreventivaExecColumns();
  const fields = ["plano_id", "data_prevista", "status", "responsavel", "observacao"];
  const values = [
    Number(planoId),
    (data.data_prevista || "").trim() || null,
    normalizePreventivaStatus(data.status || "PENDENTE"),
    String(data.responsavel || "").trim(),
    String(data.observacao || "").trim(),
  ];

  const extras = {
    criticidade: data.criticidade || null,
    responsavel_1_id: data.responsavel_1_id || null,
    responsavel_2_id: data.responsavel_2_id || null,
    iniciada_em: data.iniciada_em || null,
    finalizada_em: data.finalizada_em || null,
    iniciada_por_user_id: data.iniciada_por_user_id || null,
    finalizada_por_user_id: data.finalizada_por_user_id || null,
    duracao_minutos: data.duracao_minutos || null,
  };

  for (const [field, value] of Object.entries(extras)) {
    if (!cols.includes(field)) continue;
    fields.push(field);
    values.push(value);
  }

  const stmt = db.prepare(`
    INSERT INTO preventiva_execucoes (${fields.join(", ")})
    VALUES (${fields.map(() => "?").join(", ")})
  `);
  const r = stmt.run(...values);

  return Number(r.lastInsertRowid);
}

function updateExecucaoStatus(planoId, execId, status, dataExecutada, userId = null) {
  const exec = db.prepare(`
    SELECT id FROM preventiva_execucoes
    WHERE id = ? AND plano_id = ?
  `).get(Number(execId), Number(planoId));

  if (!exec) return false;

  const cols = getPreventivaExecColumns();
  const statusNorm = normalizePreventivaStatus(status);
  const updates = ["status = ?", "data_executada = ?"];
  const args = [
    statusNorm,
    (dataExecutada || "").trim() || null,
  ];

  if (cols.includes("iniciada_em") && statusNorm === "EM_ANDAMENTO") {
    updates.push("iniciada_em = COALESCE(iniciada_em, datetime('now'))");
  }
  if (cols.includes("iniciada_por_user_id") && statusNorm === "EM_ANDAMENTO" && Number(userId)) {
    updates.push("iniciada_por_user_id = COALESCE(iniciada_por_user_id, ?)");
    args.push(Number(userId));
  }
  if (cols.includes("finalizada_em") && ["CONCLUIDA", "EXECUTADA", "FINALIZADA"].includes(statusNorm)) {
    updates.push("finalizada_em = COALESCE(finalizada_em, datetime('now'))");
  }
  if (cols.includes("finalizada_por_user_id") && ["CONCLUIDA", "EXECUTADA", "FINALIZADA"].includes(statusNorm) && Number(userId)) {
    updates.push("finalizada_por_user_id = ?");
    args.push(Number(userId));
  }
  if (cols.includes("duracao_minutos") && ["CONCLUIDA", "EXECUTADA", "FINALIZADA"].includes(statusNorm)) {
    updates.push("duracao_minutos = CASE WHEN iniciada_em IS NULL THEN duracao_minutos ELSE CAST((julianday(COALESCE(finalizada_em, datetime('now'))) - julianday(iniciada_em)) * 24 * 60 AS INTEGER) END");
  }

  db.prepare(`
    UPDATE preventiva_execucoes
    SET ${updates.join(", ")}
    WHERE id = ? AND plano_id = ?
  `).run(
    ...args,
    Number(execId),
    Number(planoId)
  );

  return true;
}

function getPlanoColumns() {
  try {
    return db.prepare(`PRAGMA table_info(preventiva_planos)`).all().map((c) => c.name);
  } catch (_e) {
    return [];
  }
}

function getHistoricoEquipamento(equipamentoId) {
  if (!equipamentoId) return [];
  return db.prepare(`
    SELECT id, descricao, status, grau, opened_at, closed_at, causa_diagnostico, resumo_tecnico
    FROM os
    WHERE equipamento_id = ?
    ORDER BY id DESC
    LIMIT 20
  `).all(Number(equipamentoId));
}

function getPreventivaExecColumns() {
  try {
    return db.prepare(`PRAGMA table_info(preventiva_execucoes)`).all().map((c) => c.name);
  } catch (_e) {
    return [];
  }
}

function normalizePreventivaStatus(status) {
  const raw = String(status || "").trim().toUpperCase();
  if (["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "EXECUTADA", "FINALIZADA", "CANCELADA", "ATRASADA"].includes(raw)) return raw;
  if (raw === "ANDAMENTO") return "EM_ANDAMENTO";
  if (raw === "PENDENTE") return "PENDENTE";
  if (raw === "EXECUTADA") return "EXECUTADA";
  if (raw === "FINALIZADA") return "FINALIZADA";
  return "PENDENTE";
}

function inferirPadraoPreventivo(equipamento = {}, historico = []) {
  const tipo = String(equipamento.tipo || equipamento.nome || "").toLowerCase();
  const tituloBase = String(equipamento.nome || "equipamento").trim();
  const falhas = historico.length;
  const criticidadeEq = String(equipamento.criticidade || "").toUpperCase();
  const recorrencias = historico.filter((h) => {
    const txt = `${h.descricao || ''} ${h.causa_diagnostico || ''}`.toLowerCase();
    return /(vaz|trav|ru[ií]do|vibra|desgaste|folga)/.test(txt);
  }).length;

  const map = [
    {
      match: /(caldeira|boiler)/,
      checklist: ["Limpeza geral semanal", "Verificar válvulas", "Inspecionar visor de nível", "Verificar bomba", "Checar vedação e purga"],
      frequencia_tipo: "semanal",
      frequencia_valor: 1,
    },
    {
      match: /(digestor)/,
      checklist: ["Inspecionar rosca", "Checar vedação", "Inspecionar pontos de vazamento", "Revisar mancais e redutor"],
      frequencia_tipo: "semanal",
      frequencia_valor: 1,
    },
    {
      match: /(triturador)/,
      checklist: ["Inspecionar dentes", "Medir desgaste", "Verificar alinhamento", "Avaliar vibração em carga"],
      frequencia_tipo: "semanal",
      frequencia_valor: 1,
    },
    {
      match: /(valvula rotativa|válvula rotativa|redutor|transportador|bomba)/,
      checklist: ["Inspeção de folgas e vedação", "Conferir lubrificação", "Verificar acoplamentos/alinhamento", "Testar vibração e ruído"],
      frequencia_tipo: "quinzenal",
      frequencia_valor: 1,
    },
  ];

  const padrao = map.find((m) => m.match.test(tipo)) || {
    checklist: ["Inspeção visual", "Reaperto de fixações", "Lubrificação conforme plano", "Teste operacional"],
    frequencia_tipo: "mensal",
    frequencia_valor: 1,
  };

  const impacto = criticidadeEq === 'CRITICA' ? 3 : criticidadeEq === 'ALTA' ? 2 : 1;
  const score = impacto + (falhas >= 8 ? 3 : falhas >= 5 ? 2 : falhas >= 3 ? 1 : 0) + (recorrencias >= 4 ? 2 : recorrencias >= 2 ? 1 : 0);

  const classificacao = score >= 7
    ? 'reforma_total'
    : score >= 5
      ? 'reforma_parcial'
      : score >= 3
        ? 'preventiva_reforcada'
        : 'preventiva_simples';

  const prioridade = score >= 5 ? 'ALTA' : score >= 3 ? 'MEDIA' : 'BAIXA';
  const tipoPlano = classificacao.startsWith('reforma') ? 'reforma' : 'preventiva';

  const label = {
    preventiva_simples: 'Preventiva Simples',
    preventiva_reforcada: 'Preventiva Reforçada',
    reforma_parcial: 'Reforma Parcial',
    reforma_total: 'Reforma Total',
  }[classificacao];

  const observacao = `Plano IA com histórico da planta (${falhas} OS, ${recorrencias} recorrências). Classificação: ${label}.`;

  return {
    titulo: `${label} - ${tituloBase}`,
    checklist: padrao.checklist,
    frequencia_tipo: padrao.frequencia_tipo,
    frequencia_valor: padrao.frequencia_valor,
    prioridade,
    tipo_plano: tipoPlano,
    classificacao,
    observacao,
  };
}

function gerarPreventivasAutomaticas() {
  const equipamentos = listEquipamentosAtivos();
  let criados = 0;

  for (const eq of equipamentos) {
    const existe = db.prepare(`SELECT id FROM preventiva_planos WHERE equipamento_id = ? LIMIT 1`).get(Number(eq.id));
    if (existe) continue;

    const historico = getHistoricoEquipamento(eq.id);
    const plano = inferirPadraoPreventivo(eq, historico);

    createPlano({
      equipamento_id: Number(eq.id),
      titulo: plano.titulo,
      frequencia_tipo: plano.frequencia_tipo,
      frequencia_valor: plano.frequencia_valor,
      ativo: true,
      observacao: plano.observacao,
      prioridade: plano.prioridade,
      tipo_plano: plano.tipo_plano,
      checklist_json: plano.checklist,
      gerado_ia: 1,
    });
    criados += 1;
  }

  return { criados, totalEquipamentos: equipamentos.length };
}

function formatDateISO(date) {
  return date.toISOString().slice(0, 10);
}

function gerarObservacaoPreventiva(equipamento = {}, historico = []) {
  const nome = String(equipamento.nome || "equipamento").trim();
  const tipo = String(equipamento.tipo || "").toLowerCase();
  const setor = String(equipamento.setor || "").toLowerCase();
  const recorrenciaVibracao = historico.some((h) => /vibra|ru[ií]do|folga/i.test(`${h?.descricao || ""} ${h?.causa_diagnostico || ""}`));
  const recorrenciaVazamento = historico.some((h) => /vaza|veda|selagem/i.test(`${h?.descricao || ""} ${h?.causa_diagnostico || ""}`));

  if (/(bomba|pressuriza)/.test(tipo) || /(bomba)/.test(nome.toLowerCase())) {
    return "Inspecionar vibração, vazamentos e condições gerais da bomba. Verificar fixações, acoplamento e sinais de aquecimento.";
  }
  if (/(redutor|mancal|eixo|rolamento)/.test(tipo)) {
    return "Inspecionar lubrificação, integridade do eixo, rolamentos e possíveis folgas operacionais.";
  }
  if (/(triturador|prensa|digestor|transportador|rosca)/.test(tipo) || /(graxaria|reciclagem)/.test(setor)) {
    return "Executar limpeza técnica, conferência de ruído anormal, reaperto e verificação de funcionamento do conjunto.";
  }

  if (recorrenciaVibracao || recorrenciaVazamento) {
    return `Executar inspeção técnica em ${nome}: conferir ${recorrenciaVibracao ? "vibração e ruído" : "fixações e alinhamento"}, ${recorrenciaVazamento ? "pontos de vazamento e vedação" : "condições gerais e lubrificação"} e registrar anomalias.`;
  }
  return `Inspecionar ${nome}: limpeza técnica, reaperto de fixações, verificação de lubrificação e teste funcional em condição operacional.`;
}

function getEscalaSemanaAtual() {
  if (!tableExists("escala_semanas") || !tableExists("escala_alocacoes") || !tableExists("colaboradores")) return [];
  const semana = db.prepare(`
    SELECT id, data_inicio, data_fim
    FROM escala_semanas
    WHERE date('now', 'localtime') BETWEEN data_inicio AND data_fim
    ORDER BY id DESC
    LIMIT 1
  `).get();
  if (!semana) return [];

  return db.prepare(`
    SELECT c.id AS colaborador_id, c.nome, c.funcao, c.user_id, a.tipo_turno
    FROM escala_alocacoes a
    JOIN colaboradores c ON c.id = a.colaborador_id
    WHERE a.semana_id = ? AND IFNULL(c.ativo,1)=1
    ORDER BY
      CASE a.tipo_turno WHEN 'diurno' THEN 0 WHEN 'apoio' THEN 1 WHEN 'noturno' THEN 2 ELSE 3 END,
      c.nome ASC
  `).all(Number(semana.id));
}

function normalizeTxt(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isMecanico(funcao) {
  return normalizeTxt(funcao).includes("mecan");
}

function getTurnoAtual() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const data = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hora = Number(data.hour || 0);
  const minuto = Number(data.minute || 0);
  const mins = (hora * 60) + minuto;
  return mins >= (18 * 60) || mins < (6 * 60) ? "NOITE" : "DIA";
}


function obterNomeBaseEquipamento(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:\s*[-_/]?\s*\d+)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function calcularCriticidadePorQuantidade(equipamentoBase) {
  const base = obterNomeBaseEquipamento(equipamentoBase);
  if (!base) return "MEDIA";

  const rows = db.prepare(`
    SELECT nome
    FROM equipamentos
    WHERE IFNULL(ativo,1)=1
  `).all();

  const quantidadeMesmoTipo = rows.filter((row) => obterNomeBaseEquipamento(row?.nome) === base).length;

  if (quantidadeMesmoTipo <= 1) return "CRITICA";
  if (quantidadeMesmoTipo === 2) return "BAIXA";
  return "MEDIA";
}

function calcularQuantidadeEquipamentosSemelhantes(baseNome) {
  if (!baseNome) return 0;
  const rows = db.prepare(`
    SELECT nome
    FROM equipamentos
    WHERE IFNULL(ativo,1)=1
  `).all();
  return rows.filter((row) => obterNomeBaseEquipamento(row?.nome) === baseNome).length;
}

function contarFalhasRecorrentes(equipamentoId) {
  if (!equipamentoId || !tableExists("os")) return 0;
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM os
    WHERE equipamento_id = ?
      AND date(COALESCE(opened_at, created_at, datetime('now'))) >= date('now','-180 day')
  `).get(Number(equipamentoId));
  return Number(row?.total || 0);
}

function normalizeCriticidade(value) {
  const n = normalizeTxt(value).toUpperCase();
  if (["BAIXA", "MEDIA", "ALTA", "CRITICA"].includes(n)) return n;
  return "MEDIA";
}

function toPontuacaoImpacto(value) {
  const raw = normalizeTxt(value);
  if (!raw) return 0;
  if (["baixo", "leve", "secundario", "secundaria"].includes(raw)) return -1;
  if (["alto", "principal"].includes(raw)) return 1;
  if (["vital", "critico", "critica"].includes(raw)) return 2;
  return 0;
}

function calcularCriticidadePreventiva(equipamento = {}, contextoOperacional = {}) {
  const baseNome = obterNomeBaseEquipamento(equipamento.nome || equipamento.tipo);
  const quantidadeEquivalentes = Number(contextoOperacional.quantidade_equivalentes || calcularQuantidadeEquipamentosSemelhantes(baseNome) || 0);
  const redundancia = contextoOperacional.redundancia != null ? Boolean(contextoOperacional.redundancia) : quantidadeEquivalentes > 1;
  const paraProducaoTotal = Boolean(contextoOperacional.para_producao_total);
  const afetaSetorPrincipal = contextoOperacional.afeta_setor_principal != null
    ? Boolean(contextoOperacional.afeta_setor_principal)
    : /(producao|produção|reciclagem|prensa|digestor|perculadora|tacho)/i.test(`${equipamento.setor || ""} ${equipamento.nome || ""}`);
  const falhasRecorrentes = Number(contextoOperacional.falhas_recorrentes || contarFalhasRecorrentes(Number(equipamento.id || 0)));
  const equipamentoVital = contextoOperacional.equipamento_vital != null
    ? Boolean(contextoOperacional.equipamento_vital)
    : /(seguranca|segurança|nr12|incendio|incêndio|caldeira)/i.test(`${equipamento.nome || ""} ${equipamento.tipo || ""}`);
  const base = normalizeCriticidade(equipamento.criticidade_base || equipamento.criticidade);

  let score = 0;
  score += base === "CRITICA" ? 4 : base === "ALTA" ? 2 : base === "BAIXA" ? -1 : 0;
  score += toPontuacaoImpacto(equipamento.impacto_operacional);
  score += paraProducaoTotal ? 3 : 0;
  score += afetaSetorPrincipal ? 1 : 0;
  score += redundancia ? -2 : 1;
  score += quantidadeEquivalentes >= 3 ? -2 : quantidadeEquivalentes === 2 ? -1 : quantidadeEquivalentes <= 1 ? 1 : 0;
  score += falhasRecorrentes >= 8 ? 2 : falhasRecorrentes >= 4 ? 1 : 0;
  score += equipamentoVital ? 2 : 0;

  if (score >= 6) return "CRITICA";
  if (score >= 3) return "ALTA";
  if (score >= 0) return "MEDIA";
  return "BAIXA";
}

function calcularCriticidade(equipamento = {}, contextoOperacional = {}) {
  return calcularCriticidadePreventiva(equipamento, contextoOperacional);
}

function montarEquipePreventiva(preventiva, escalaSemana = [], disponibilidade = {}) {
  const indisponiveis = new Set(
    Object.entries(disponibilidade || {})
      .filter(([, info]) => !info?.disponivel || info?.noite_pesada)
      .map(([id]) => String(id))
  );

  const elegiveis = (escalaSemana || []).filter((p) => {
    const userKey = String(p?.user_id || "");
    if (!userKey) return true;
    return !indisponiveis.has(userKey);
  });
  const turno = String(preventiva?.turno || getTurnoAtual()).toUpperCase();
  const hojeKey = formatDateISO(new Date());
  const cacheKey = `preventiva_equipe_${hojeKey}_${turno}`;
  const cached = getConfig(cacheKey);
  const cachedIds = String(cached || "").split(",").map((id) => Number(id)).filter(Boolean);

  const noturnos = elegiveis.filter((p) => ["noturno", "plantao"].includes(String(p.tipo_turno || "").toLowerCase()) && isMecanico(p.funcao));
  const diurnosMecanicos = elegiveis.filter((p) => String(p.tipo_turno || "").toLowerCase() === "diurno" && isMecanico(p.funcao));
  const apoios = elegiveis.filter((p) => String(p.tipo_turno || "").toLowerCase() === "apoio");

  let escolhidos = [];
  if (cachedIds.length) {
    escolhidos = cachedIds
      .map((id) => elegiveis.find((p) => Number(p.user_id || 0) === id))
      .filter(Boolean)
      .slice(0, turno === "NOITE" ? 1 : 2);
  }

  if (!escolhidos.length) {
    if (turno === "NOITE") {
      const plantonista = noturnos[0] || null;
      escolhidos = [plantonista].filter(Boolean);
    } else {
      const mecanico = diurnosMecanicos[0] || null;
      const apoio = apoios.find((p) => Number(p.user_id || 0) !== Number(mecanico?.user_id || 0)) || null;
      escolhidos = [mecanico, apoio].filter(Boolean).slice(0, 2);
    }
  }

  const ids = [];
  const nomes = [];
  escolhidos.forEach((p) => {
    if (!p) return;
    const nome = String(p.nome || "").trim();
    if (nome && !nomes.includes(nome)) nomes.push(nome);
    const userId = Number(p.user_id || 0);
    if (userId && !ids.includes(userId)) ids.push(userId);
  });

  if (ids.length) {
    setConfig(cacheKey, ids.join(","));
  }

  return {
    responsavel_1_id: ids[0] || null,
    responsavel_2_id: ids[1] || null,
    responsavelTexto: nomes.join(", ") || "-",
    responsavelIds: ids,
    responsavelNomes: nomes,
  };
}

function escalarResponsaveisPreventiva(preventiva, escalaSemana = []) {
  return montarEquipePreventiva(preventiva, escalaSemana);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function gerarCronogramaSemanalInteligente(refDate = new Date()) {
  const start = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate()));
  const day = start.getUTCDay();
  const monday = addDays(start, day === 0 ? -6 : 1 - day);
  const sunday = addDays(monday, 6);

  const planos = db.prepare(`
    SELECT p.*, e.nome AS equipamento_nome, e.tipo AS equipamento_tipo, e.setor AS equipamento_setor, e.criticidade AS equipamento_criticidade
    FROM preventiva_planos p
    LEFT JOIN equipamentos e ON e.id = p.equipamento_id
    WHERE p.ativo = 1
    ORDER BY CASE UPPER(COALESCE(e.criticidade,''))
      WHEN 'CRITICA' THEN 0
      WHEN 'ALTA' THEN 1
      WHEN 'MEDIA' THEN 2
      ELSE 3 END,
      p.id ASC
  `).all();

  let criadas = 0;
  const weekNumber = Math.floor((monday.getTime() - Date.UTC(monday.getUTCFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));
  const alternanciaPorTipo = new Map();

  const escalaSemana = getEscalaSemanaAtual();
  const disponibilidade = getDisponibilidadeEscala();
  planos.forEach((plano, idx) => {
    const tipoKey = String(plano.equipamento_nome || plano.equipamento_criticidade || "geral").toLowerCase();
    const offsetTipo = alternanciaPorTipo.get(tipoKey) || 0;
    alternanciaPorTipo.set(tipoKey, offsetTipo + 1);
    const prevista = formatDateISO(addDays(monday, (idx + weekNumber + offsetTipo) % 7));
    const jaExiste = db.prepare(`
      SELECT id FROM preventiva_execucoes
      WHERE plano_id = ? AND data_prevista BETWEEN ? AND ?
      LIMIT 1
    `).get(Number(plano.id), formatDateISO(monday), formatDateISO(sunday));

    if (jaExiste) return;

    const historico = getHistoricoEquipamento(plano.equipamento_id);
    const observacao = gerarObservacaoPreventiva(
      { nome: plano.equipamento_nome, tipo: plano.equipamento_tipo, setor: plano.equipamento_setor },
      historico
    );
    const criticidadeCalculada = calcularCriticidade({
      tipo: plano.equipamento_tipo,
      nome: plano.equipamento_nome,
      criticidade: plano.equipamento_criticidade,
    });
    const responsaveis = montarEquipePreventiva({ criticidade: criticidadeCalculada }, escalaSemana, disponibilidade);
    createExecucao(plano.id, {
      data_prevista: prevista,
      status: "PENDENTE",
      criticidade: criticidadeCalculada,
      responsavel: responsaveis.responsavelTexto,
      responsavel_1_id: responsaveis.responsavel_1_id,
      responsavel_2_id: responsaveis.responsavel_2_id,
      observacao,
    });
    criadas += 1;
  });

  return { criadas, semanaInicio: formatDateISO(monday), semanaFim: formatDateISO(sunday) };
}

function getConfig(chave) {
  if (!tableExists("config_sistema")) return null;
  const row = db.prepare(`SELECT valor FROM config_sistema WHERE chave = ?`).get(String(chave || ""));
  return row?.valor || null;
}

function setConfig(chave, valor) {
  if (!tableExists("config_sistema")) return;
  db.prepare(`
    INSERT INTO config_sistema (chave, valor)
    VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(String(chave || ""), valor == null ? null : String(valor));
}

function executarCicloAutonomo(refDate = new Date()) {
  const hoje = formatDateISO(refDate);
  const ultimaExecucao = getConfig("preventiva_ia_ciclo_data");
  if (ultimaExecucao === hoje) {
    return { skipped: true, reason: "already_ran_today", data: hoje };
  }

  const autoPlanos = gerarPreventivasAutomaticas();
  const autoCronograma = gerarCronogramaSemanalInteligente(refDate);
  const revisaoCriticidade = revisarCriticidadePreventivasFuturas();
  setConfig("preventiva_ia_ciclo_data", hoje);
  return { skipped: false, data: hoje, autoPlanos, autoCronograma, revisaoCriticidade };
}


function getDisponibilidadeEscala() {
  const disponibilidade = {};
  if (!tableExists("escala_ausencias") || !tableExists("colaboradores")) return disponibilidade;

  const hoje = formatDateISO(new Date());
  const ausencias = db.prepare(`
    SELECT c.user_id, UPPER(COALESCE(a.tipo,'')) AS tipo
    FROM escala_ausencias a
    JOIN colaboradores c ON c.id = a.colaborador_id
    WHERE ? BETWEEN a.data_inicio AND a.data_fim
  `).all(hoje);

  for (const item of ausencias) {
    const key = String(item.user_id || "");
    if (!key) continue;
    disponibilidade[key] = { disponivel: false, noite_pesada: false, motivo: item.tipo || "AUSENTE" };
  }
  return disponibilidade;
}

function reorganizarPreventivasPendentesPorEscala() {
  if (!tableExists("preventiva_execucoes") || !tableExists("preventiva_planos")) {
    return { atualizadas: 0, totalAtivas: 0 };
  }

  const escalaSemana = getEscalaSemanaAtual();
  const cols = getPreventivaExecColumns();
  const hasCriticidade = cols.includes("criticidade");
  const hasResp1 = cols.includes("responsavel_1_id");
  const hasResp2 = cols.includes("responsavel_2_id");
  const rows = db.prepare(`
    SELECT pe.id,
           pe.status,
           COALESCE(e.nome, pp.titulo, '-') AS equipamento_nome,
           COALESCE(e.tipo, pp.titulo, '-') AS equipamento_tipo,
           COALESCE(pe.criticidade, e.criticidade, 'MEDIA') AS criticidade
    FROM preventiva_execucoes pe
    JOIN preventiva_planos pp ON pp.id = pe.plano_id
    LEFT JOIN equipamentos e ON e.id = pp.equipamento_id
    WHERE UPPER(COALESCE(pe.status,'')) IN ('PENDENTE')
  `).all();
  const disponibilidade = getDisponibilidadeEscala();

  let atualizadas = 0;
  for (const item of rows) {
    const criticidade = calcularCriticidade({ nome: item.equipamento_nome, tipo: item.equipamento_tipo, criticidade: item.criticidade });
    const aloc = montarEquipePreventiva({ criticidade }, escalaSemana, disponibilidade);
    const updates = ["responsavel = ?"];
    const args = [aloc.responsavelTexto];
    if (hasCriticidade) {
      updates.push("criticidade = ?");
      args.push(criticidade);
    }
    if (hasResp1) {
      updates.push("responsavel_1_id = ?");
      args.push(aloc.responsavel_1_id);
    }
    if (hasResp2) {
      updates.push("responsavel_2_id = ?");
      args.push(aloc.responsavel_2_id);
    }
    args.push(Number(item.id));
    db.prepare(`UPDATE preventiva_execucoes SET ${updates.join(", ")} WHERE id = ?`).run(...args);
    atualizadas += 1;
  }

  return { atualizadas, totalAtivas: rows.length };
}

function reprocessarPreventivasComNovaEscala() {
  return reorganizarPreventivasPendentesPorEscala();
}

function revisarCriticidadePreventivasFuturas() {
  if (!tableExists("preventiva_execucoes") || !tableExists("preventiva_planos")) return { revisadas: 0 };
  const cols = getPreventivaExecColumns();
  if (!cols.includes("criticidade")) return { revisadas: 0 };

  const rows = db.prepare(`
    SELECT pe.id,
           pp.equipamento_id,
           e.nome AS equipamento_nome,
           e.tipo AS equipamento_tipo,
           e.setor AS equipamento_setor,
           e.criticidade AS equipamento_criticidade
    FROM preventiva_execucoes pe
    JOIN preventiva_planos pp ON pp.id = pe.plano_id
    LEFT JOIN equipamentos e ON e.id = pp.equipamento_id
    WHERE UPPER(COALESCE(pe.status,'')) IN ('PENDENTE')
  `).all();

  let revisadas = 0;
  for (const row of rows) {
    const novaCriticidade = calcularCriticidadePreventiva({
      id: row.equipamento_id,
      nome: row.equipamento_nome,
      tipo: row.equipamento_tipo,
      setor: row.equipamento_setor,
      criticidade: row.equipamento_criticidade,
    });
    db.prepare(`UPDATE preventiva_execucoes SET criticidade = ? WHERE id = ?`).run(novaCriticidade, Number(row.id));
    revisadas += 1;
  }
  return { revisadas };
}

function contarPreventivasPorCriticidade(lista = []) {
  const total = { baixa: 0, media: 0, alta: 0, critica: 0 };
  (lista || []).forEach((item) => {
    const status = String(item?.status || "").toUpperCase();
    if (!["PENDENTE", "ANDAMENTO", "EM_ANDAMENTO"].includes(status)) return;
    const criticidade = String(item?.criticidade || "MEDIA")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    if (total[criticidade] != null) total[criticidade] += 1;
  });
  return total;
}

module.exports = {
  listPlanos,
  listEquipamentosAtivos,
  createPlano,
  getPlanoById,
  listExecucoes,
  createExecucao,
  updateExecucaoStatus,
  getHistoricoEquipamento,
  inferirPadraoPreventivo,
  normalizePreventivaStatus,
  gerarObservacaoPreventiva,
  getEscalaSemanaAtual,
  escalarResponsaveisPreventiva,
  distribuirEquipePreventiva: montarEquipePreventiva,
  montarEquipePreventiva,
  obterNomeBaseEquipamento,
  calcularCriticidadePorQuantidade,
  calcularCriticidadePreventiva,
  calcularCriticidade,
  reorganizarPreventivasPendentesPorEscala,
  reprocessarPreventivasComNovaEscala,
  revisarCriticidadePreventivasFuturas,
  contarPreventivasPorCriticidade,
  gerarPreventivasAutomaticas,
  gerarCronogramaSemanalInteligente,
  executarCicloAutonomo,
};
