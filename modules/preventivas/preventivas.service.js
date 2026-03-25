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
  const stmt = db.prepare(`
    INSERT INTO preventiva_execucoes (
      plano_id, data_prevista, status, responsavel, observacao
    ) VALUES (?, ?, ?, ?, ?)
  `);

  const r = stmt.run(
    Number(planoId),
    (data.data_prevista || "").trim() || null,
    String(data.status || "pendente").trim(),
    String(data.responsavel || "").trim(),
    String(data.observacao || "").trim()
  );

  return Number(r.lastInsertRowid);
}

function updateExecucaoStatus(planoId, execId, status, dataExecutada) {
  const exec = db.prepare(`
    SELECT id FROM preventiva_execucoes
    WHERE id = ? AND plano_id = ?
  `).get(Number(execId), Number(planoId));

  if (!exec) return false;

  db.prepare(`
    UPDATE preventiva_execucoes
    SET status = ?,
        data_executada = ?
    WHERE id = ? AND plano_id = ?
  `).run(
    String(status || "").trim(),
    (dataExecutada || "").trim() || null,
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
    SELECT p.*, e.nome AS equipamento_nome, e.criticidade AS equipamento_criticidade
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

    createExecucao(plano.id, {
      data_prevista: prevista,
      status: "pendente",
      responsavel: "Equipe manutenção",
      observacao: "Gerado automaticamente pelo cronograma inteligente semanal.",
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
  setConfig("preventiva_ia_ciclo_data", hoje);
  return { skipped: false, data: hoje, autoPlanos, autoCronograma };
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
  gerarPreventivasAutomaticas,
  gerarCronogramaSemanalInteligente,
  executarCicloAutonomo,
};
