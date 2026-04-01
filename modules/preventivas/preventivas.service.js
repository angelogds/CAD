const db = require("../../database/db");
const osService = require("../os/os.service");
const { getTurnoOperacionalAgora, getTiposTurnoEscala } = require("../../utils/turno-operacional");

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

function getEquipamentosColumns() {
  try {
    return db.prepare(`PRAGMA table_info(equipamentos)`).all().map((c) => String(c.name || ""));
  } catch (_e) {
    return [];
  }
}

function listPlanos() {
  const hasCodigo = getEquipamentosColumns().includes("codigo");
  return db.prepare(`
    SELECT p.*,
           e.nome AS equipamento_nome,
           ${hasCodigo ? "e.codigo" : "NULL"} AS equipamento_codigo
    FROM preventiva_planos p
    LEFT JOIN equipamentos e ON e.id = p.equipamento_id
    ORDER BY p.ativo DESC, p.id DESC
  `).all();
}

function listEquipamentosAtivos() {
  if (!tableExists("equipamentos")) return [];
  const hasCodigo = getEquipamentosColumns().includes("codigo");
  return db.prepare(`
    SELECT id, ${hasCodigo ? "codigo" : "NULL AS codigo"}, nome, tipo, criticidade
    FROM equipamentos
    WHERE IFNULL(ativo,1) = 1
    ORDER BY nome
  `).all();
}

function resolveUsuariosSource() {
  const candidates = ["users", "usuarios"];
  for (const table of candidates) {
    if (!tableExists(table)) continue;
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => String(c.name || ""));
      const idCol = cols.includes("id") ? "id" : null;
      const nameCol = cols.includes("name") ? "name" : (cols.includes("nome") ? "nome" : null);
      if (idCol && nameCol) return { table, idCol, nameCol };
    } catch (_e) {}
  }
  return null;
}

function normalizarNomePessoa(nome = "") {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function listarUsuariosSistema() {
  const usuariosSource = resolveUsuariosSource();
  if (!usuariosSource) return [];
  try {
    return db.prepare(`
      SELECT ${usuariosSource.idCol} AS id, ${usuariosSource.nameCol} AS nome
      FROM ${usuariosSource.table}
      ORDER BY ${usuariosSource.idCol} ASC
    `).all().map((row) => ({
      id: Number(row.id || 0) || null,
      nome: String(row.nome || "").trim(),
      nomeNormalizado: normalizarNomePessoa(row.nome),
    })).filter((row) => row.id && row.nomeNormalizado);
  } catch (_e) {
    return [];
  }
}

function encontrarUsuarioPorNomeEscala(nomeEscala, usuarios = []) {
  const alvo = normalizarNomePessoa(nomeEscala);
  if (!alvo) return null;
  const lista = Array.isArray(usuarios) ? usuarios : [];
  const exato = lista.find((u) => normalizarNomePessoa(u?.nome) === alvo);
  if (exato) return exato;
  const parcial = lista.find((u) => normalizarNomePessoa(u?.nome).includes(alvo) || alvo.includes(normalizarNomePessoa(u?.nome)));
  return parcial || null;
}

function findUserIdByName(nome = "") {
  const match = encontrarUsuarioPorNomeEscala(nome, listarUsuariosSistema());
  return Number(match?.id || 0) || null;
}

function getUsersNameColumn() {
  return resolveUsuariosSource()?.nameCol || null;
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
    origem: data.origem || null,
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
  const equipCols = getEquipamentosColumns();
  const hasCodigo = equipCols.includes("codigo");
  const hasSetor = equipCols.includes("setor");
  const hasCriticidade = equipCols.includes("criticidade");
  return db.prepare(`
    SELECT p.*,
           e.nome AS equipamento_nome,
           ${hasCodigo ? "e.codigo" : "NULL"} AS equipamento_codigo,
           ${hasSetor ? "e.setor" : "NULL"} AS equipamento_setor,
           e.tipo AS equipamento_tipo,
           ${hasCriticidade ? "e.criticidade" : "NULL"} AS equipamento_criticidade
    FROM preventiva_planos p
    LEFT JOIN equipamentos e ON e.id = p.equipamento_id
    WHERE p.id = ?
    LIMIT 1
  `).get(Number(id));
}

function listExecucoes(planoId) {
  const cols = getPreventivaExecColumns();
  const hasResp1 = cols.includes("responsavel_1_id");
  const hasResp2 = cols.includes("responsavel_2_id");
  const usuariosSource = resolveUsuariosSource();
  const colaboradoresNameCol = tableExists("colaboradores") ? "nome" : null;
  const hasUsers = !!usuariosSource;
  const rows = db.prepare(`
    SELECT pe.*,
           ${hasResp1 && hasUsers ? `u1.${usuariosSource.nameCol}` : "NULL"} AS responsavel_1_nome,
           ${hasResp2 && hasUsers ? `u2.${usuariosSource.nameCol}` : "NULL"} AS responsavel_2_nome,
           ${hasResp1 && colaboradoresNameCol ? "c1.nome" : "NULL"} AS responsavel_1_colaborador_nome,
           ${hasResp2 && colaboradoresNameCol ? "c2.nome" : "NULL"} AS responsavel_2_colaborador_nome
    FROM preventiva_execucoes pe
    ${hasResp1 && hasUsers ? `LEFT JOIN ${usuariosSource.table} u1 ON u1.${usuariosSource.idCol} = pe.responsavel_1_id` : ""}
    ${hasResp2 && hasUsers ? `LEFT JOIN ${usuariosSource.table} u2 ON u2.${usuariosSource.idCol} = pe.responsavel_2_id` : ""}
    ${hasResp1 && colaboradoresNameCol ? "LEFT JOIN colaboradores c1 ON c1.id = pe.responsavel_1_id" : ""}
    ${hasResp2 && colaboradoresNameCol ? "LEFT JOIN colaboradores c2 ON c2.id = pe.responsavel_2_id" : ""}
    WHERE pe.plano_id = ?
    ORDER BY
      CASE UPPER(COALESCE(pe.status,''))
        WHEN 'ATRASADA' THEN 1
        WHEN 'PENDENTE' THEN 2
        WHEN 'EM_ANDAMENTO' THEN 3
        WHEN 'ANDAMENTO' THEN 3
        WHEN 'EXECUTADA' THEN 4
        WHEN 'FINALIZADA' THEN 5
        WHEN 'CONCLUIDA' THEN 5
        WHEN 'CANCELADA' THEN 6
        ELSE 9
      END,
      COALESCE(pe.data_prevista,'9999-12-31') ASC,
      pe.id DESC
  `).all(Number(planoId));
  return rows.map((row) => {
    const nomes = [
      row.responsavel_1_nome || row.responsavel_1_colaborador_nome,
      row.responsavel_2_nome || row.responsavel_2_colaborador_nome,
    ].map((n) => String(n || "").trim()).filter(Boolean);
    const responsaveis = nomes.join(", ");
    return {
      ...row,
      responsaveis: responsaveis || String(row.responsavel || "").trim() || "-",
      responsavel_exibicao: responsaveis || String(row.responsavel || "").trim() || "-",
    };
  });
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
    origem: data.origem || null,
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
  if (!tableExists("preventiva_planos") || !tableExists("equipamentos")) {
    return { criados: 0, totalEquipamentos: 0 };
  }
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
      origem: "AUTOMATICA",
    });
    criados += 1;
  }

  return { criados, totalEquipamentos: equipamentos.length };
}

function formatDateISO(date) {
  return date.toISOString().slice(0, 10);
}

function parseISODate(value) {
  const txt = sanitizeDateISO(value);
  if (!txt) return null;
  return new Date(`${txt}T00:00:00.000Z`);
}

function somarDiasISO(dateISO, days = 0) {
  const base = parseISODate(dateISO);
  if (!base) return null;
  return formatDateISO(addDays(base, Number(days || 0)));
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
  try {
    const dia = typeof osService.getColaboradoresTurnoAtual === "function" ? osService.getColaboradoresTurnoAtual("DIA") : [];
    const noite = typeof osService.getColaboradoresTurnoAtual === "function" ? osService.getColaboradoresTurnoAtual("NOITE") : [];
    const merged = [...dia, ...noite];
    if (merged.length) return merged;
  } catch (_e) {}

  if (!tableExists("escala_semanas") || !tableExists("escala_alocacoes") || !tableExists("colaboradores")) return [];
  const semana = db.prepare(`
    SELECT id
    FROM escala_semanas
    WHERE date('now', 'localtime') BETWEEN data_inicio AND data_fim
    ORDER BY id DESC
    LIMIT 1
  `).get();
  if (!semana) return [];

  const usuarios = listarUsuariosSistema();
  return db.prepare(`
    SELECT c.id AS colaborador_id, c.nome, c.funcao, c.user_id, a.tipo_turno, a.id AS alocacao_id
    FROM escala_alocacoes a
    JOIN colaboradores c ON c.id = a.colaborador_id
    WHERE a.semana_id = ? AND IFNULL(c.ativo,1)=1
    ORDER BY a.id ASC
  `).all(Number(semana.id)).map((row) => ({
    ...row,
    id: Number(row.colaborador_id),
    user_id: Number(row.user_id || 0) || Number(encontrarUsuarioPorNomeEscala(row.nome, usuarios)?.id || 0) || findUserIdByName(row.nome),
  }));
}

function obterEscalaAtual() {
  const escalaSemana = getEscalaSemanaAtual();
  const elegiveis = (escalaSemana || [])
    .map((pessoa) => ({
      id: Number(pessoa?.id || pessoa?.colaborador_id || 0) || null,
      user_id: Number(pessoa?.user_id || 0) || findUserIdByName(pessoa?.nome),
      nome: String(pessoa?.nome || "").trim(),
      tipo_turno: normalizeTxt(pessoa?.tipo_turno),
      funcao: String(pessoa?.funcao || ""),
    }))
    .filter((pessoa) => !!pessoa.id);

  return {
    mecanicos_dia: elegiveis.filter((p) => p.tipo_turno === "diurno" && isMecanico(p.funcao)),
    apoio_operacional: elegiveis.filter((p) => p.tipo_turno === "apoio"),
    noite: elegiveis.filter((p) => ["plantao", "noturno"].includes(p.tipo_turno)),
  };
}

function getTiposTurnoPorPeriodo(turno = "DIA") {
  return getTiposTurnoEscala(turno);
}

function filtrarEscalaVigentePorTurno(escalaSemana = [], turno = "DIA") {
  const tiposPermitidos = new Set(getTiposTurnoPorPeriodo(turno));
  return [...(escalaSemana || [])].filter((pessoa) => tiposPermitidos.has(normalizeTxt(pessoa?.tipo_turno)));
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

function isAuxiliarOuApoio(funcao) {
  const n = normalizeTxt(funcao);
  return n.includes("auxiliar") || n.includes("apoio");
}

function getTurnoAtual() {
  return getTurnoOperacionalAgora();
}

function getHojeBrasilISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function parseResponsaveisConfig(valor) {
  const ids = String(valor || "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter(Boolean);
  return { responsavel_1_id: ids[0] || null, responsavel_2_id: ids[1] || null };
}

function escolherPorRotacao(lista = [], configKeyUltimo = "") {
  const candidatos = [...(lista || [])]
    .filter((c) => Number(c?.user_id || 0))
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  if (!candidatos.length) return null;
  const ultimoId = Number(getConfig(configKeyUltimo) || 0) || null;
  const idx = ultimoId ? candidatos.findIndex((c) => Number(c.user_id) === ultimoId) : -1;
  const escolhido = idx >= 0 ? (candidatos[idx + 1] || candidatos[0]) : candidatos[0];
  setConfig(configKeyUltimo, Number(escolhido.user_id));
  return escolhido;
}

function montarResponsaveisRetorno(escalaSemana = [], responsavel1 = null, responsavel2 = null) {
  const normalizarResponsavel = (responsavel) => {
    if (!responsavel) return null;
    if (typeof responsavel === "object") {
      const user_id = Number(responsavel.user_id || 0) || findUserIdByName(responsavel.nome);
      const colaborador_id = Number(responsavel.id || responsavel.colaborador_id || 0) || null;
      const nome = String(responsavel.nome || "").trim();
      return { user_id: user_id || null, colaborador_id, nome };
    }
    const id = Number(responsavel || 0) || null;
    if (!id) return null;
    return { user_id: id, colaborador_id: null, nome: "" };
  };
  const base1 = normalizarResponsavel(responsavel1);
  const base2 = normalizarResponsavel(responsavel2);
  const mapaNomes = new Map(
    (escalaSemana || [])
      .flatMap((p) => {
        const nome = String(p.nome || "").trim();
        const pares = [];
        if (Number(p?.user_id || 0)) pares.push([Number(p.user_id), nome]);
        if (Number(p?.id || p?.colaborador_id || 0)) pares.push([Number(p.id || p.colaborador_id), nome]);
        return pares;
      })
  );
  const ids = [base1?.user_id, base2?.user_id].map((v) => Number(v || 0)).filter(Boolean);
  const usuariosSource = resolveUsuariosSource();
  const nomesUsers = ids.length && usuariosSource
    ? db.prepare(`
      SELECT ${usuariosSource.idCol} AS id, ${usuariosSource.nameCol} AS nome
      FROM ${usuariosSource.table}
      WHERE ${usuariosSource.idCol} IN (${ids.map(() => "?").join(",")})
    `).all(...ids).map((u) => [Number(u.id), String(u.nome || "").trim()])
    : [];
  nomesUsers.forEach(([id, nome]) => mapaNomes.set(id, nome));
  const nomes = [
    base1?.nome || mapaNomes.get(base1?.user_id) || mapaNomes.get(base1?.colaborador_id),
    base2?.nome || mapaNomes.get(base2?.user_id) || mapaNomes.get(base2?.colaborador_id),
  ].filter(Boolean);
  const responsavel_1_id = base1?.user_id || null;
  const responsavel_2_id = base2?.user_id || null;
  return {
    responsavel_1_id,
    responsavel_2_id,
    responsavelTexto: nomes.join(", "),
    responsavelIds: ids,
    responsavelNomes: nomes,
  };
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

function getPessoaChave(pessoa = {}) {
  const userId = Number(pessoa?.user_id || 0);
  if (userId) return `u:${userId}`;
  const colaboradorId = Number(pessoa?.id || pessoa?.colaborador_id || 0);
  if (colaboradorId) return `c:${colaboradorId}`;
  const nome = normalizeTxt(pessoa?.nome);
  if (nome) return `n:${nome}`;
  return null;
}

function deduplicarEquipePorUsuario(lista = []) {
  const mapa = new Map();
  (lista || []).forEach((pessoa) => {
    const userId = Number(pessoa?.user_id || 0) || findUserIdByName(pessoa?.nome);
    const chave = getPessoaChave({ ...pessoa, user_id: userId || null });
    if (!chave || mapa.has(chave)) return;
    mapa.set(chave, {
      ...pessoa,
      user_id: userId || null,
      nome: String(pessoa?.nome || "").trim(),
    });
  });
  return [...mapa.values()];
}

function obterChaveAreaPreventiva(preventiva = {}) {
  const areaBruta = preventiva.equipamento_setor || preventiva.area || preventiva.setor || "";
  if (String(areaBruta || "").trim()) return normalizeTxt(areaBruta);
  return normalizeTxt(obterNomeBaseEquipamento(preventiva.equipamento_nome || preventiva.titulo || "geral"));
}

function ordenarPorCargaERotacao(candidatos = [], cargaAtual = {}, rotacao = {}) {
  const getCarga = (pessoa = {}) => {
    const chave = getPessoaChave(pessoa);
    const userId = Number(pessoa?.user_id || 0);
    if (chave && cargaAtual[chave] != null) return Number(cargaAtual[chave] || 0);
    if (userId && cargaAtual[`u:${userId}`] != null) return Number(cargaAtual[`u:${userId}`] || 0);
    if (userId && cargaAtual[userId] != null) return Number(cargaAtual[userId] || 0);
    return 0;
  };
  const getRotacao = (pessoa = {}) => {
    const chave = getPessoaChave(pessoa);
    const userId = Number(pessoa?.user_id || 0);
    if (chave && rotacao[chave] != null) return Number(rotacao[chave] || 0);
    if (userId && rotacao[`u:${userId}`] != null) return Number(rotacao[`u:${userId}`] || 0);
    if (userId && rotacao[userId] != null) return Number(rotacao[userId] || 0);
    return 0;
  };
  return [...(candidatos || [])].sort((a, b) => {
    const cargaA = getCarga(a);
    const cargaB = getCarga(b);
    if (cargaA !== cargaB) return cargaA - cargaB;
    const posA = getRotacao(a);
    const posB = getRotacao(b);
    if (posA !== posB) return posA - posB;
    return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
  });
}

function distribuirPreventivasPorAreaECarga(preventivas = [], equipeDia = {}) {
  const mecanicos = deduplicarEquipePorUsuario(equipeDia.mecanicos || []);
  const apoios = deduplicarEquipePorUsuario(equipeDia.apoios || []);
  const todos = deduplicarEquipePorUsuario([...mecanicos, ...apoios]);
  const resultado = new Map();
  if (!todos.length) return resultado;

  const cargaAtual = { ...(equipeDia.cargaAtual || {}) };
  todos.forEach((p) => {
    const chave = getPessoaChave(p);
    if (!chave) return;
    if (cargaAtual[chave] == null) cargaAtual[chave] = Number(cargaAtual[Number(p.user_id || 0)] || 0);
  });
  const rotacao = {};
  todos.forEach((p, idx) => {
    const chave = getPessoaChave(p);
    if (chave) rotacao[chave] = idx;
  });
  let sequencia = todos.length + 1;
  const responsavelPorArea = new Map();

  const separarPorPrioridade = [...(preventivas || [])].sort((a, b) => {
    const dataA = String(a?.data_prevista || "9999-12-31");
    const dataB = String(b?.data_prevista || "9999-12-31");
    if (dataA !== dataB) return dataA.localeCompare(dataB);
    return Number(a?.id || 0) - Number(b?.id || 0);
  });

  separarPorPrioridade.forEach((item) => {
    const cfg = getEquipeConfigPreventiva(item);
    const areaKey = obterChaveAreaPreventiva(item);
    const responsavelArea = responsavelPorArea.get(areaKey);
    const ordenados = ordenarPorCargaERotacao(todos, cargaAtual, rotacao);
    const primario = responsavelArea
      ? (ordenados.find((p) => getPessoaChave(p) === responsavelArea) || ordenados[0] || null)
      : (ordenados[0] || null);
    if (!primario) return;

    let secundaria = null;
    if (cfg.quantidade === 2) {
      const baseSecundaria = apoios.length
        ? ordenarPorCargaERotacao(apoios.filter((p) => Number(p.user_id) !== Number(primario.user_id)), cargaAtual, rotacao)
        : [];
      secundaria = baseSecundaria[0] || ordenarPorCargaERotacao(
        todos.filter((p) => Number(p.user_id) !== Number(primario.user_id)),
        cargaAtual,
        rotacao
      )[0] || null;
    }

    const equipeSelecionada = [primario, secundaria].filter(Boolean);
    resultado.set(Number(item.id), equipeSelecionada);
    const chavePrimario = getPessoaChave(primario);
    if (areaKey && chavePrimario) responsavelPorArea.set(areaKey, chavePrimario);
    equipeSelecionada.forEach((pessoa) => {
      const chave = getPessoaChave(pessoa);
      if (!chave) return;
      cargaAtual[chave] = Number(cargaAtual[chave] || 0) + 1;
      rotacao[chave] = sequencia;
      sequencia += 1;
    });
  });

  return resultado;
}

function montarEquipePreventiva(preventiva, escalaSemana = [], disponibilidade = {}) {
  const indisponiveis = new Set(
    Object.entries(disponibilidade || {})
      .filter(([, info]) => !info?.disponivel || info?.noite_pesada)
      .map(([id]) => String(id))
  );
  const turnoAtual = getTurnoAtual();

  const elegivel = (pessoa) => {
    const userId = Number(pessoa?.user_id || 0);
    const colabId = Number(pessoa?.id || pessoa?.colaborador_id || 0);
    if (userId && indisponiveis.has(String(userId))) return false;
    if (colabId && indisponiveis.has(`colab:${colabId}`)) return false;
    return !!(colabId || String(pessoa?.nome || "").trim());
  };

  const registrarCarga = (resp1 = null, resp2 = null) => {
    [resp1, resp2].filter(Boolean).forEach((userId) => {
      const chave = `preventiva_carga_${getHojeBrasilISO()}_${Number(userId)}`;
      const atual = Number(getConfig(chave) || 0);
      setConfig(chave, atual + 1);
    });
  };

  const baseEscala = filtrarEscalaVigentePorTurno(escalaSemana, turnoAtual);
  const elegiveis = baseEscala.filter(elegivel);

  if (!elegiveis.length) {
    return { responsavel_1_id: null, responsavel_2_id: null, responsavelTexto: "", responsavelIds: [], responsavelNomes: [] };
  }

  const mecanicosDia = deduplicarEquipePorUsuario(elegiveis
    .filter((p) => normalizeTxt(p.tipo_turno) === "diurno" && isMecanico(p.funcao)))
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  const apoioDia = deduplicarEquipePorUsuario(elegiveis
    .filter((p) => normalizeTxt(p.tipo_turno) === "apoio" && (isAuxiliarOuApoio(p.funcao) || !isMecanico(p.funcao))))
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  const equipeNoiteOrdenada = deduplicarEquipePorUsuario(elegiveis
    .filter((p) => ["plantao", "noturno"].includes(normalizeTxt(p.tipo_turno))))
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  const plantonistaNoite = equipeNoiteOrdenada.find((p) => isMecanico(p.funcao)) || equipeNoiteOrdenada[0] || null;
  const equipeCfg = getEquipeConfigPreventiva(preventiva);
  if (turnoAtual === "NOITE") {
    const retornoNoite = montarResponsaveisRetorno(elegiveis, plantonistaNoite, null);
    registrarCarga(retornoNoite.responsavel_1_id, null);
    return retornoNoite;
  }

  const todosDia = deduplicarEquipePorUsuario([...mecanicosDia, ...apoioDia]);
  const cargaAtual = {};
  const idsEquipe = todosDia.map((p) => Number(p.user_id || 0)).filter(Boolean);
  todosDia.forEach((p) => {
    const chave = getPessoaChave(p);
    if (chave) cargaAtual[chave] = Number(cargaAtual[chave] || 0);
  });
  if (idsEquipe.length && tableExists("preventiva_execucoes") && getPreventivaExecColumns().includes("responsavel_1_id")) {
    const placeholders = idsEquipe.map(() => "?").join(", ");
    const hoje = getHojeBrasilISO();
    db.prepare(`
      SELECT user_id, SUM(total) AS total
      FROM (
        SELECT responsavel_1_id AS user_id, COUNT(*) AS total
        FROM preventiva_execucoes
        WHERE UPPER(COALESCE(status,'')) IN ('PENDENTE','EM_ANDAMENTO','ANDAMENTO')
          AND responsavel_1_id IN (${placeholders})
          AND COALESCE(data_prevista, ?) >= ?
        GROUP BY responsavel_1_id
        UNION ALL
        SELECT responsavel_2_id AS user_id, COUNT(*) AS total
        FROM preventiva_execucoes
        WHERE UPPER(COALESCE(status,'')) IN ('PENDENTE','EM_ANDAMENTO','ANDAMENTO')
          AND responsavel_2_id IN (${placeholders})
          AND COALESCE(data_prevista, ?) >= ?
        GROUP BY responsavel_2_id
      ) t
      GROUP BY user_id
    `).all(...idsEquipe, hoje, hoje, ...idsEquipe, hoje, hoje).forEach((row) => {
      const userId = Number(row.user_id || 0);
      if (!userId) return;
      cargaAtual[`u:${userId}`] = Number(row.total || 0);
      cargaAtual[userId] = Number(row.total || 0);
    });
  }
  const rotacao = {};
  todosDia.forEach((p, idx) => {
    const chave = getPessoaChave(p);
    if (chave) rotacao[chave] = idx;
    if (Number(p.user_id || 0)) rotacao[`u:${Number(p.user_id)}`] = idx;
  });
  const ordenados = ordenarPorCargaERotacao(todosDia, cargaAtual, rotacao);
  const executor = ordenados[0] || null;
  let auxiliar = null;
  if (equipeCfg.quantidade === 2) {
    auxiliar = ordenarPorCargaERotacao(
      (apoioDia.length ? apoioDia : todosDia).filter((p) => Number(p.user_id) !== Number(executor?.user_id || 0)),
      cargaAtual,
      rotacao
    )[0]
      || ordenados.find((p) => Number(p.user_id) !== Number(executor?.user_id || 0))
      || null;
  }

  const retorno = montarResponsaveisRetorno(elegiveis, executor, auxiliar);
  registrarCarga(retorno.responsavel_1_id, retorno.responsavel_2_id);
  return retorno;
}

function getEquipeConfigPreventiva(preventiva = {}) {
  const criticidade = normalizeCriticidade(preventiva.criticidade || preventiva.prioridade || "MEDIA");
  const quantidade = criticidade === "BAIXA" ? 1 : 2;
  return { criticidade, quantidade };
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
  if (!tableExists("preventiva_planos") || !tableExists("preventiva_execucoes")) {
    return { criadas: 0, semanaInicio: null, semanaFim: null };
  }
  const start = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate()));
  const day = start.getUTCDay();
  const monday = addDays(start, day === 0 ? -6 : 1 - day);
  const sunday = addDays(monday, 6);

  const equipCols = getEquipamentosColumns();
  const hasSetor = equipCols.includes("setor");
  const hasCriticidadeEq = equipCols.includes("criticidade");
  const planos = db.prepare(`
    SELECT p.*, e.nome AS equipamento_nome, e.tipo AS equipamento_tipo, ${hasSetor ? "e.setor" : "NULL"} AS equipamento_setor, ${hasCriticidadeEq ? "e.criticidade" : "'MEDIA'"} AS equipamento_criticidade
    FROM preventiva_planos p
    LEFT JOIN equipamentos e ON e.id = p.equipamento_id
    WHERE p.ativo = 1
    ORDER BY CASE UPPER(COALESCE(${hasCriticidadeEq ? "e.criticidade" : "'MEDIA'"},'MEDIA'))
      WHEN 'CRITICA' THEN 0
      WHEN 'ALTA' THEN 1
      WHEN 'MEDIA' THEN 2
      ELSE 3 END,
      p.id ASC
  `).all();

  let criadas = 0;
  const hojeBrasilISO = getHojeBrasilISO();
  const weekNumber = Math.floor((monday.getTime() - Date.UTC(monday.getUTCFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));
  const alternanciaPorTipo = new Map();

  const escalaSemana = getEscalaSemanaAtual();
  const disponibilidade = getDisponibilidadeEscala();
  planos.forEach((plano, idx) => {
    const tipoKey = String(plano.equipamento_nome || plano.equipamento_criticidade || "geral").toLowerCase();
    const offsetTipo = alternanciaPorTipo.get(tipoKey) || 0;
    alternanciaPorTipo.set(tipoKey, offsetTipo + 1);
    const previstaBase = formatDateISO(addDays(monday, (idx + weekNumber + offsetTipo) % 7));
    const prevista = previstaBase < hojeBrasilISO ? somarDiasISO(hojeBrasilISO, criadas) : previstaBase;
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
    const responsaveis = montarEquipePreventiva({
      criticidade: criticidadeCalculada,
      tipo_plano: plano.tipo_plano,
      titulo: plano.titulo,
      checklist_json: plano.checklist_json,
    }, escalaSemana, disponibilidade);
    createExecucao(plano.id, {
      data_prevista: prevista,
      status: "PENDENTE",
      criticidade: criticidadeCalculada,
      responsavel: responsaveis.responsavelTexto,
      responsavel_1_id: responsaveis.responsavel_1_id,
      responsavel_2_id: responsaveis.responsavel_2_id,
      observacao,
      origem: "AUTOMATICA",
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
    SELECT c.user_id, c.id AS colaborador_id, UPPER(COALESCE(a.tipo,'')) AS tipo
    FROM escala_ausencias a
    JOIN colaboradores c ON c.id = a.colaborador_id
    WHERE ? BETWEEN a.data_inicio AND a.data_fim
  `).all(hoje);

  for (const item of ausencias) {
    const tipo = String(item.tipo || "").trim();
    if (!["FOLGA", "ATESTADO", "AUSENCIA", "AUSÊNCIA"].includes(tipo)) continue;
    const keyUser = String(item.user_id || "").trim();
    const keyColab = Number(item.colaborador_id || 0) || null;
    if (keyUser) disponibilidade[keyUser] = { disponivel: false, noite_pesada: false, motivo: tipo || "AUSENTE" };
    if (keyColab) disponibilidade[`colab:${keyColab}`] = { disponivel: false, noite_pesada: false, motivo: tipo || "AUSENTE" };
  }
  return disponibilidade;
}

function reorganizarPreventivasPendentesPorEscala() {
  if (!tableExists("preventiva_execucoes") || !tableExists("preventiva_planos")) {
    return { atualizadas: 0, totalAtivas: 0 };
  }

  const escala = obterEscalaAtual();
  const mecanicosDia = deduplicarEquipePorUsuario((escala.mecanicos_dia || []).sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")));
  const apoio = deduplicarEquipePorUsuario((escala.apoio_operacional || []).sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")));
  const noite = deduplicarEquipePorUsuario((escala.noite || []).filter((p) => isMecanico(p.funcao)));
  const turnoAtual = getTurnoAtual();
  const cols = getPreventivaExecColumns();
  const hasCriticidade = cols.includes("criticidade");
  const hasResp1 = cols.includes("responsavel_1_id");
  const hasResp2 = cols.includes("responsavel_2_id");
  const planoCols = getPlanoColumns();
  const hasTipoPlano = planoCols.includes("tipo_plano");
  const hasChecklistJson = planoCols.includes("checklist_json");
  const hasEquipCriticidade = getEquipamentosColumns().includes("criticidade");
  const hasSetor = getEquipamentosColumns().includes("setor");
  const rows = db.prepare(`
    SELECT pe.id,
           pe.data_prevista,
           COALESCE(e.nome, pp.titulo, '-') AS equipamento_nome,
           COALESCE(e.tipo, pp.titulo, '-') AS equipamento_tipo,
           ${hasSetor ? "e.setor" : "NULL"} AS equipamento_setor,
           COALESCE(pe.criticidade, ${hasEquipCriticidade ? "e.criticidade" : "'MEDIA'"}, 'MEDIA') AS criticidade,
           ${hasTipoPlano ? "pp.tipo_plano" : "NULL"} AS tipo_plano,
           pp.titulo,
           ${hasChecklistJson ? "pp.checklist_json" : "NULL"} AS checklist_json
    FROM preventiva_execucoes pe
    JOIN preventiva_planos pp ON pp.id = pe.plano_id
    LEFT JOIN equipamentos e ON e.id = pp.equipamento_id
    WHERE UPPER(COALESCE(pe.status,'')) IN ('PENDENTE','ATRASADA')
    ORDER BY COALESCE(pe.data_prevista,'9999-12-31') ASC, pe.id ASC
  `).all();

  const estadoRotacao = new Map();
  const escolherRotativo = (candidatos = [], chave = "", usados = new Set()) => {
    const validos = [...(candidatos || [])]
      .map((p) => ({
        ...p,
        user_id_resolvido: Number(p?.user_id || findUserIdByName(p?.nome) || 0) || null,
      }))
      .filter((p) => Number(p?.user_id_resolvido || 0))
      .filter((p) => !usados.has(Number(p.user_id_resolvido)));
    if (!validos.length) return null;
    const ultimoPersistido = Number(getConfig(chave) || 0) || 0;
    const ultimoId = ultimoPersistido || Number(estadoRotacao.get(chave) || 0) || 0;
    const idxAtual = ultimoId ? validos.findIndex((p) => Number(p.user_id_resolvido) === ultimoId) : -1;
    const escolhido = idxAtual >= 0 ? (validos[idxAtual + 1] || validos[0]) : validos[0];
    setConfig(chave, Number(escolhido.user_id_resolvido));
    estadoRotacao.set(chave, Number(escolhido.user_id_resolvido));
    return escolhido;
  };

  let atualizadas = 0;
  const cargaAtual = {};
  if (hasResp1) {
    db.prepare(`
      SELECT responsavel_1_id AS user_id, COUNT(*) AS total
      FROM preventiva_execucoes
      WHERE UPPER(COALESCE(status,'')) IN ('PENDENTE','EM_ANDAMENTO','ANDAMENTO')
        AND responsavel_1_id IS NOT NULL
      GROUP BY responsavel_1_id
    `).all().forEach((row) => {
      cargaAtual[Number(row.user_id || 0)] = Number(row.total || 0);
    });
  }

  const distribuicaoDia = distribuirPreventivasPorAreaECarga(rows, {
    mecanicos: mecanicosDia,
    apoios: apoio,
    cargaAtual,
  });
  const plantonista = noite[0] || null;
  const hojeBrasilISO = getHojeBrasilISO();
  let cursorData = hojeBrasilISO;
  rows.forEach((item) => {
    const criticidade = calcularCriticidade({
      nome: item.equipamento_nome,
      tipo: item.equipamento_tipo,
      criticidade: item.criticidade,
    });
    const criticidadeNormalizada = normalizeCriticidade(criticidade);
    let respIds = [];
    if (turnoAtual === "NOITE") {
      const userIdNoite = Number(plantonista?.user_id || findUserIdByName(plantonista?.nome) || 0) || null;
      respIds = [userIdNoite].filter(Boolean);
    } else {
      const definidos = distribuicaoDia.get(Number(item.id)) || [];
      respIds = criticidadeNormalizada === "BAIXA" ? definidos.slice(0, 1) : definidos.slice(0, 2);
    }

    const nomes = montarResponsaveisRetorno([...mecanicosDia, ...apoio, ...noite], respIds[0], respIds[1]);
    const responsavelTexto = nomes.responsavelTexto;
    const responsavel_1_id = nomes.responsavel_1_id;
    const responsavel_2_id = turnoAtual === "NOITE" ? null : nomes.responsavel_2_id;

    const dataOriginal = sanitizeDateISO(item.data_prevista);
    let dataPrevistaAtualizada = dataOriginal;
    if (!dataPrevistaAtualizada || dataPrevistaAtualizada < cursorData) {
      dataPrevistaAtualizada = cursorData;
    }
    cursorData = somarDiasISO(dataPrevistaAtualizada, 1) || cursorData;

    const updates = ["responsavel = ?", "data_prevista = ?"];
    const args = [responsavelTexto, dataPrevistaAtualizada];
    if (hasCriticidade) {
      updates.push("criticidade = ?");
      args.push(criticidadeNormalizada);
    }
    if (hasResp1) {
      updates.push("responsavel_1_id = ?");
      args.push(responsavel_1_id);
    }
    if (hasResp2) {
      updates.push("responsavel_2_id = ?");
      args.push(responsavel_2_id);
    }
    args.push(Number(item.id));
    db.prepare(`UPDATE preventiva_execucoes SET ${updates.join(", ")} WHERE id = ?`).run(...args);
    atualizadas += 1;
  });

  return { atualizadas, totalAtivas: rows.length };
}

function reprocessarPreventivasComNovaEscala() {
  return reorganizarPreventivasPendentesPorEscala();
}

async function reprocessarPreventivasPorTurnoAtual() {
  const turnoAtual = getTurnoAtual();
  const turnoAnterior = getConfig("preventiva_turno_reprocessado");
  const houveTrocaTurno = String(turnoAnterior || "") !== String(turnoAtual || "");
  const resultado = reorganizarPreventivasPendentesPorEscala();
  setConfig("preventiva_turno_reprocessado", turnoAtual);
  return {
    ...resultado,
    turnoAtual,
    turnoAnterior: turnoAnterior || null,
    houveTrocaTurno,
  };
}

function sincronizarPreventivasComEscala({ origem = "manual" } = {}) {
  const turnoAtual = getTurnoAtual();
  const turnoAnterior = getConfig("preventiva_turno_reprocessado");
  const houveTrocaTurno = String(turnoAnterior || "") !== String(turnoAtual || "");
  const reorganizacao = reorganizarPreventivasPendentesPorEscala();
  setConfig("preventiva_turno_reprocessado", turnoAtual);
  return {
    origem,
    turnoAtual,
    turnoAnterior: turnoAnterior || null,
    houveTrocaTurno,
    ...reorganizacao,
  };
}

function alocarEquipeExecucaoPreventiva(execucaoId) {
  if (!tableExists("preventiva_execucoes") || !tableExists("preventiva_planos")) {
    return { ok: false, reason: "tables_missing" };
  }

  const cols = getPreventivaExecColumns();
  const hasResp1 = cols.includes("responsavel_1_id");
  const hasResp2 = cols.includes("responsavel_2_id");
  const hasCriticidade = cols.includes("criticidade");
  const hasResponsavelTxt = cols.includes("responsavel");
  const planoCols = getPlanoColumns();
  const hasTipoPlano = planoCols.includes("tipo_plano");
  const hasChecklistJson = planoCols.includes("checklist_json");
  const hasEquipCriticidade = getEquipamentosColumns().includes("criticidade");
  if (!hasResponsavelTxt) return { ok: false, reason: "column_missing" };

  const row = db.prepare(`
    SELECT pe.id,
           COALESCE(pe.criticidade, ${hasEquipCriticidade ? "e.criticidade" : "'MEDIA'"}, 'MEDIA') AS criticidade,
           COALESCE(e.nome, pp.titulo, '-') AS equipamento_nome,
           COALESCE(e.tipo, pp.titulo, '-') AS equipamento_tipo,
           ${hasTipoPlano ? "pp.tipo_plano" : "NULL"} AS tipo_plano,
           pp.titulo,
           ${hasChecklistJson ? "pp.checklist_json" : "NULL"} AS checklist_json
    FROM preventiva_execucoes pe
    JOIN preventiva_planos pp ON pp.id = pe.plano_id
    LEFT JOIN equipamentos e ON e.id = pp.equipamento_id
    WHERE pe.id = ?
    LIMIT 1
  `).get(Number(execucaoId));
  if (!row) return { ok: false, reason: "not_found" };

  const escalaSemana = getEscalaSemanaAtual();
  const disponibilidade = getDisponibilidadeEscala();
  const criticidade = calcularCriticidade({
    nome: row.equipamento_nome,
    tipo: row.equipamento_tipo,
    criticidade: row.criticidade,
  });
  const aloc = montarEquipePreventiva({
    criticidade,
    tipo_plano: row.tipo_plano,
    titulo: row.titulo,
    checklist_json: row.checklist_json,
  }, escalaSemana, disponibilidade);

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
  args.push(Number(execucaoId));
  db.prepare(`UPDATE preventiva_execucoes SET ${updates.join(", ")} WHERE id = ?`).run(...args);
  return { ok: true, ...aloc };
}

function revisarCriticidadePreventivasFuturas() {
  if (!tableExists("preventiva_execucoes") || !tableExists("preventiva_planos")) return { revisadas: 0 };
  const cols = getPreventivaExecColumns();
  if (!cols.includes("criticidade")) return { revisadas: 0 };
  const equipCols = getEquipamentosColumns();
  const hasSetor = equipCols.includes("setor");
  const hasCriticidadeEq = equipCols.includes("criticidade");

  const rows = db.prepare(`
    SELECT pe.id,
           pp.equipamento_id,
           e.nome AS equipamento_nome,
           e.tipo AS equipamento_tipo,
           ${hasSetor ? "e.setor" : "NULL"} AS equipamento_setor,
           ${hasCriticidadeEq ? "e.criticidade" : "'MEDIA'"} AS equipamento_criticidade
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


function sanitizeDateISO(value) {
  const txt = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(txt) ? txt : null;
}

function registrarLogPreventiva({ acao, preventiva_execucao_id = null, preventiva_plano_id = null, user = null, detalhes = null }) {
  if (!tableExists("preventiva_logs")) return;
  try {
    db.prepare(`
      INSERT INTO preventiva_logs (preventiva_execucao_id, preventiva_plano_id, acao, usuario_id, usuario_nome, detalhes_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      preventiva_execucao_id ? Number(preventiva_execucao_id) : null,
      preventiva_plano_id ? Number(preventiva_plano_id) : null,
      String(acao || "ACAO_DESCONHECIDA").trim().toUpperCase(),
      Number(user?.id || 0) || null,
      String(user?.name || "").trim() || null,
      detalhes ? JSON.stringify(detalhes) : null
    );
  } catch (_e) {}
}

function criarPreventivaManual(data = {}) {
  const equipamentoId = Number(data.equipamento_id || 0);
  if (!equipamentoId) throw new Error("Equipamento obrigatório para preventiva manual.");

  const equipamento = db.prepare(`SELECT id, nome, tipo, criticidade FROM equipamentos WHERE id = ? AND IFNULL(ativo,1)=1 LIMIT 1`).get(equipamentoId);
  if (!equipamento) throw new Error("Equipamento inválido/inativo para preventiva manual.");

  const dataPrevista = sanitizeDateISO(data.data_prevista);
  if (!dataPrevista) throw new Error("Data prevista inválida.");

  const tipoPlano = String(data.tipo_preventiva || "preventiva").trim().toLowerCase();
  const criticidade = normalizeCriticidade(data.criticidade || equipamento.criticidade || "MEDIA");
  const planoId = createPlano({
    equipamento_id: equipamentoId,
    titulo: String(data.titulo || "").trim(),
    frequencia_tipo: String(data.frequencia_tipo || "mensal").trim().toLowerCase(),
    frequencia_valor: Number(data.frequencia_valor || 1),
    ativo: true,
    observacao: String(data.observacao || "").trim(),
    prioridade: criticidade,
    tipo_plano: tipoPlano,
    origem: "MANUAL",
    gerado_ia: 0,
  });

  const execucaoId = createExecucao(planoId, {
    data_prevista: dataPrevista,
    status: "PENDENTE",
    criticidade,
    responsavel: "",
    observacao: String(data.observacao || "").trim(),
    origem: "MANUAL",
  });

  alocarEquipeExecucaoPreventiva(execucaoId);
  registrarLogPreventiva({
    acao: "PREVENTIVA_MANUAL_CRIADA",
    preventiva_execucao_id: execucaoId,
    preventiva_plano_id: planoId,
    user: data.user || null,
    detalhes: { equipamento_id: equipamentoId, criticidade, data_prevista: dataPrevista, tipo_plano: tipoPlano },
  });

  return { planoId, execucaoId };
}

function auditarLeituraEquipamentosPreventivas() {
  const base = {
    equipamentosElegiveis: 0,
    equipamentosInativos: 0,
    equipamentosSemPlano: 0,
    planosAtivos: 0,
    planosSemEquipamento: 0,
    execucoesPendentes: 0,
  };
  if (!tableExists("equipamentos") || !tableExists("preventiva_planos") || !tableExists("preventiva_execucoes")) return base;

  const equipamentos = db.prepare(`SELECT id, IFNULL(ativo,1) AS ativo FROM equipamentos`).all();
  const ativos = equipamentos.filter((e) => Number(e.ativo || 0) === 1);
  base.equipamentosElegiveis = ativos.length;
  base.equipamentosInativos = equipamentos.length - ativos.length;

  const planos = db.prepare(`SELECT id, equipamento_id, IFNULL(ativo,1) AS ativo FROM preventiva_planos`).all();
  const planosAtivos = planos.filter((p) => Number(p.ativo || 0) === 1);
  base.planosAtivos = planosAtivos.length;
  base.planosSemEquipamento = planosAtivos.filter((p) => !Number(p.equipamento_id || 0)).length;

  const planoPorEquip = new Set(planosAtivos.map((p) => Number(p.equipamento_id || 0)).filter(Boolean));
  base.equipamentosSemPlano = ativos.filter((e) => !planoPorEquip.has(Number(e.id))).length;

  const pend = db.prepare(`
    SELECT COUNT(*) AS total
    FROM preventiva_execucoes
    WHERE UPPER(COALESCE(status,'')) IN ('PENDENTE','ATRASADA','EM_ANDAMENTO','ANDAMENTO')
  `).get();
  base.execucoesPendentes = Number(pend?.total || 0);

  return base;
}

function prevalidarReprocessamentoPreventivas() {
  const base = {
    semanaAtiva: false,
    semanaId: null,
    colaboradoresTurno: {
      diurno: 0,
      apoio: 0,
      noturnoPlantao: 0,
    },
    execucoesPendentes: {
      pendente: 0,
      atrasada: 0,
      emAndamento: 0,
      total: 0,
    },
    prontoParaReprocesso: false,
    alertas: [],
  };

  if (tableExists("escala_semanas")) {
    const semana = db.prepare(`
      SELECT id
      FROM escala_semanas
      WHERE date('now', 'localtime') BETWEEN data_inicio AND data_fim
      ORDER BY id DESC
      LIMIT 1
    `).get();
    base.semanaAtiva = !!semana;
    base.semanaId = semana ? Number(semana.id) : null;
  }

  if (base.semanaId && tableExists("escala_alocacoes") && tableExists("colaboradores")) {
    const alocacoes = db.prepare(`
      SELECT lower(COALESCE(a.tipo_turno,'')) AS tipo_turno
      FROM escala_alocacoes a
      JOIN colaboradores c ON c.id = a.colaborador_id
      WHERE a.semana_id = ?
        AND IFNULL(c.ativo,1)=1
    `).all(base.semanaId);

    alocacoes.forEach((row) => {
      const turno = String(row.tipo_turno || "").trim();
      if (turno === "diurno") base.colaboradoresTurno.diurno += 1;
      if (turno === "apoio") base.colaboradoresTurno.apoio += 1;
      if (turno === "noturno" || turno === "plantao") base.colaboradoresTurno.noturnoPlantao += 1;
    });
  }

  if (tableExists("preventiva_execucoes")) {
    const rows = db.prepare(`
      SELECT UPPER(COALESCE(status,'')) AS status, COUNT(*) AS total
      FROM preventiva_execucoes
      WHERE UPPER(COALESCE(status,'')) IN ('PENDENTE','ATRASADA','EM_ANDAMENTO','ANDAMENTO')
      GROUP BY UPPER(COALESCE(status,''))
    `).all();
    rows.forEach((row) => {
      const status = String(row.status || "");
      const total = Number(row.total || 0);
      if (status === "PENDENTE") base.execucoesPendentes.pendente += total;
      if (status === "ATRASADA") base.execucoesPendentes.atrasada += total;
      if (status === "EM_ANDAMENTO" || status === "ANDAMENTO") base.execucoesPendentes.emAndamento += total;
    });
    base.execucoesPendentes.total =
      base.execucoesPendentes.pendente +
      base.execucoesPendentes.atrasada +
      base.execucoesPendentes.emAndamento;
  }

  if (!base.semanaAtiva) base.alertas.push("Escala da semana não encontrada.");
  if (base.colaboradoresTurno.diurno + base.colaboradoresTurno.apoio <= 0) base.alertas.push("Sem colaboradores ativos no turno DIA.");
  if (base.colaboradoresTurno.noturnoPlantao <= 0) base.alertas.push("Sem colaboradores ativos no turno NOITE.");
  if (base.execucoesPendentes.total <= 0) base.alertas.push("Não há preventivas pendentes/atrasadas/em andamento para sincronizar.");

  base.prontoParaReprocesso = base.alertas.length === 0;
  return base;
}

function reprocessarModuloPreventivas({ user = null } = {}) {
  let etapaAtual = "inicializacao";
  const executar = db.transaction(() => {
    etapaAtual = "prevalidacao";
    const prevalidacao = prevalidarReprocessamentoPreventivas();
    etapaAtual = "auditoria";
    const auditoria = auditarLeituraEquipamentosPreventivas();
    etapaAtual = "geracao_planos_automaticos";
    const autoPlanos = gerarPreventivasAutomaticas();
    etapaAtual = "cronograma_semanal";
    const autoCronograma = gerarCronogramaSemanalInteligente(new Date());
    etapaAtual = "reorganizacao_pendentes";
    const reorganizacao = reorganizarPreventivasPendentesPorEscala();
    etapaAtual = "revisao_criticidade";
    const revisaoCriticidade = revisarCriticidadePreventivasFuturas();
    etapaAtual = "concluido";
    return { prevalidacao, auditoria, autoPlanos, autoCronograma, reorganizacao, revisaoCriticidade };
  });

  try {
    const result = executar();
    registrarLogPreventiva({
      acao: "PREVENTIVAS_REPROCESSADAS",
      user,
      detalhes: result,
    });
    return result;
  } catch (err) {
    const erroDetalhado = {
      etapa: etapaAtual,
      mensagem: err?.message || String(err),
      stack: err?.stack || null,
    };
    console.error("[PREVENTIVAS][REPROCESSAR][ERRO]", erroDetalhado);
    registrarLogPreventiva({
      acao: "PREVENTIVAS_REPROCESSAMENTO_ERRO",
      user,
      detalhes: erroDetalhado,
    });
    throw err;
  }
}

function apagarPreventivaExecucao({ planoId, execucaoId, user = null, forcar = false }) {
  if (!tableExists("preventiva_execucoes")) return { ok: false, message: "Tabela de preventivas não encontrada." };
  const row = db.prepare(`
    SELECT id, plano_id, status, origem
    FROM preventiva_execucoes
    WHERE id = ? AND plano_id = ?
    LIMIT 1
  `).get(Number(execucaoId), Number(planoId));
  if (!row) return { ok: false, message: "Preventiva não encontrada para este plano." };

  const status = normalizePreventivaStatus(row.status);
  const role = String(user?.role || "").toUpperCase();
  const isAdmin = role === "ADMIN";

  if (["FINALIZADA", "EXECUTADA", "CONCLUIDA"].includes(status) && !isAdmin) {
    return { ok: false, message: "Preventiva finalizada só pode ser apagada por ADMIN." };
  }
  if (["EM_ANDAMENTO", "ANDAMENTO"].includes(status) && !forcar) {
    return { ok: false, message: "Preventiva em andamento exige confirmação reforçada para exclusão." };
  }

  db.prepare(`DELETE FROM preventiva_execucoes WHERE id = ? AND plano_id = ?`).run(Number(execucaoId), Number(planoId));
  registrarLogPreventiva({
    acao: "PREVENTIVA_EXCLUIDA",
    preventiva_execucao_id: Number(execucaoId),
    preventiva_plano_id: Number(planoId),
    user,
    detalhes: { status, origem: row.origem || null, forcar: Boolean(forcar) },
  });
  return { ok: true };
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
  encontrarUsuarioPorNomeEscala,
  distribuirPreventivasPorAreaECarga,
  escalarResponsaveisPreventiva,
  distribuirEquipePreventiva: montarEquipePreventiva,
  montarEquipePreventiva,
  obterNomeBaseEquipamento,
  calcularCriticidadePorQuantidade,
  calcularCriticidadePreventiva,
  calcularCriticidade,
  reorganizarPreventivasPendentesPorEscala,
  alocarEquipeExecucaoPreventiva,
  reprocessarPreventivasComNovaEscala,
  reprocessarPreventivasPorTurnoAtual,
  sincronizarPreventivasComEscala,
  revisarCriticidadePreventivasFuturas,
  contarPreventivasPorCriticidade,
  gerarPreventivasAutomaticas,
  gerarCronogramaSemanalInteligente,
  executarCicloAutonomo,
  criarPreventivaManual,
  auditarLeituraEquipamentosPreventivas,
  prevalidarReprocessamentoPreventivas,
  reprocessarModuloPreventivas,
  apagarPreventivaExecucao,
  registrarLogPreventiva,
};
