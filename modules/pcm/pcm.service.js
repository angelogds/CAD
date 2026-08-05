const db = require("../../database/db");
const intelligenceService = require("./pcm.intelligence.service");

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getIndicadores() {
  const row = db
    .prepare(`
      SELECT
        SUM(CASE WHEN UPPER(tipo)='PREVENTIVA' AND strftime('%Y-%m', opened_at, 'localtime')=strftime('%Y-%m','now', 'localtime') THEN 1 ELSE 0 END) AS prev_mes,
        SUM(CASE WHEN UPPER(tipo)='CORRETIVA' AND strftime('%Y-%m', opened_at, 'localtime')=strftime('%Y-%m','now', 'localtime') THEN 1 ELSE 0 END) AS corr_mes,
        SUM(CASE WHEN UPPER(COALESCE(status,'')) IN ('ABERTA','ANDAMENTO','EM_ANDAMENTO','PAUSADA') AND datetime(opened_at) < datetime('now','-7 day') THEN 1 ELSE 0 END) AS os_atrasadas,
        SUM(CASE WHEN strftime('%Y-%m', opened_at, 'localtime')=strftime('%Y-%m','now', 'localtime') THEN COALESCE(custo_total,0) ELSE 0 END) AS custo_mes,
        SUM(CASE WHEN UPPER(tipo)='CORRETIVA' AND strftime('%Y-%m', opened_at, 'localtime')=strftime('%Y-%m','now', 'localtime')
                 AND (LOWER(descricao) LIKE '%emerg%' OR LOWER(descricao) LIKE '%parada%') THEN 1 ELSE 0 END) AS paradas_np
      FROM os
    `)
    .get() || {};

  const prev = toNum(row.prev_mes);
  const corr = toNum(row.corr_mes);
  const total = prev + corr;

  const mttr = db
    .prepare(`
      SELECT AVG((julianday(COALESCE(closed_at, data_fim)) - julianday(opened_at)) * 24.0) AS mttr_horas
      FROM os
      WHERE COALESCE(closed_at, data_fim) IS NOT NULL
        AND UPPER(COALESCE(status,'')) IN ('CONCLUIDA','FINALIZADA')
        AND datetime(opened_at) >= datetime('now','-180 day')
    `)
    .get();

  const mtbfRows = db
    .prepare(`
      SELECT equipamento_id, opened_at
      FROM os
      WHERE equipamento_id IS NOT NULL
        AND UPPER(tipo)='CORRETIVA'
        AND datetime(opened_at) >= datetime('now','-180 day')
      ORDER BY equipamento_id, datetime(opened_at)
    `)
    .all();

  let sumGap = 0;
  let countGap = 0;
  const lastByEq = {};
  mtbfRows.forEach((r) => {
    const eq = String(r.equipamento_id);
    if (lastByEq[eq]) {
      const gapDays = (new Date(r.opened_at) - new Date(lastByEq[eq])) / (1000 * 60 * 60 * 24);
      if (Number.isFinite(gapDays) && gapDays >= 0) {
        sumGap += gapDays;
        countGap += 1;
      }
    }
    lastByEq[eq] = r.opened_at;
  });

  return {
    preventiva_qtd_mes: prev,
    corretiva_qtd_mes: corr,
    preventiva_pct_mes: total ? Math.round((prev * 1000) / total) / 10 : 0,
    corretiva_pct_mes: total ? Math.round((corr * 1000) / total) / 10 : 0,
    os_atrasadas: toNum(row.os_atrasadas),
    mtbf_medio_dias: countGap ? Math.round((sumGap / countGap) * 10) / 10 : 0,
    mttr_medio_horas: Math.round(toNum(mttr?.mttr_horas) * 10) / 10,
    custo_manutencao_mes: Math.round(toNum(row.custo_mes) * 100) / 100,
    paradas_nao_planejadas: toNum(row.paradas_np),
  };
}

function getRankingEquipamentos(limit = 5, meses = 6) {
  return db
    .prepare(`
      SELECT COALESCE(e.nome, o.equipamento, 'Sem equipamento') AS equipamento,
             COUNT(*) AS total_os
      FROM os o
      LEFT JOIN equipamentos e ON e.id = o.equipamento_id
      WHERE datetime(o.opened_at) >= datetime('now', '-' || ? || ' months')
      GROUP BY COALESCE(e.nome, o.equipamento, 'Sem equipamento')
      ORDER BY total_os DESC, equipamento ASC
      LIMIT ?
    `)
    .all(Number(meses) || 6, Number(limit) || 5);
}

function listPlanos({ equipamento_id, setor, tipo_manutencao } = {}) {
  const hasSetor = hasColumn("equipamentos", "setor");
  let where = "p.ativo = 1";
  const params = {};

  if (equipamento_id) {
    where += " AND p.equipamento_id = @equipamento_id";
    params.equipamento_id = Number(equipamento_id);
  }
  if (setor && hasSetor) {
    where += " AND e.setor = @setor";
    params.setor = String(setor);
  }
  if (tipo_manutencao) {
    where += " AND p.tipo_manutencao = @tipo";
    params.tipo = String(tipo_manutencao).toUpperCase();
  }

  const setorExpr = hasSetor ? "e.setor" : "''";
  const rows = db
    .prepare(`
      SELECT p.*, e.nome AS equipamento_nome, ${setorExpr} AS equipamento_setor
      FROM pcm_planos p
      JOIN equipamentos e ON e.id = p.equipamento_id
      WHERE ${where}
      ORDER BY datetime(p.proxima_data_prevista) ASC, p.id DESC
    `)
    .all(params);

  return rows.map((r) => {
    const due = r.proxima_data_prevista ? new Date(r.proxima_data_prevista) : null;
    const now = new Date();
    let situacao = "NO_PRAZO";
    if (due) {
      const days = (due - now) / (1000 * 60 * 60 * 24);
      if (days < 0) situacao = "ATRASADO";
      else if (days <= 7) situacao = "PROXIMO_VENCIMENTO";
    }
    return { ...r, situacao };
  });
}

function listFiltros() {
  const equipamentos = queryEquipamentosAtivos();
  const setores = [...new Set(equipamentos.map((e) => e.setor || "").sort())].map((setor) => ({ setor }));
  return {
    equipamentos: equipamentos.map((e) => ({ id: e.id, nome: e.nome, setor: e.setor })),
    setores,
    tipos: ["PREVENTIVA", "INSPECAO", "LUBRIFICACAO", "PREDITIVA"],
  };
}

function createPlano({ equipamento_id, atividade_descricao, tipo_manutencao, frequencia_dias, frequencia_horas, proxima_data_prevista, observacao, created_by }) {
  const info = db
    .prepare(`
      INSERT INTO pcm_planos (equipamento_id, atividade_descricao, tipo_manutencao, frequencia_dias, frequencia_horas, proxima_data_prevista, observacao, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `)
    .run(
      Number(equipamento_id),
      String(atividade_descricao || "").trim(),
      String(tipo_manutencao || "PREVENTIVA").toUpperCase(),
      frequencia_dias ? Number(frequencia_dias) : null,
      frequencia_horas ? Number(frequencia_horas) : null,
      proxima_data_prevista || null,
      observacao || null,
      created_by || null
    );

  return Number(info.lastInsertRowid);
}

function gerarOS(planoId, userId) {
  const plano = db
    .prepare(`SELECT p.*, e.nome AS equipamento_nome FROM pcm_planos p JOIN equipamentos e ON e.id=p.equipamento_id WHERE p.id=?`)
    .get(Number(planoId));
  if (!plano) throw new Error("Plano não encontrado.");

  const descricao = `[PCM-PLANO #${plano.id}] ${plano.atividade_descricao}`;

  const trx = db.transaction(() => {
    const osInfo = db
      .prepare(`
        INSERT INTO os (equipamento, equipamento_id, descricao, tipo, status, opened_by, opened_at)
        VALUES (?, ?, ?, 'PREVENTIVA', 'ABERTA', ?, datetime('now'))
      `)
      .run(plano.equipamento_nome, plano.equipamento_id, descricao, userId || null);

    db.prepare(`
      INSERT INTO pcm_execucoes (plano_id, os_id, tipo_evento, observacao, created_by, created_at)
      VALUES (?, ?, 'GERADA_OS', 'OS preventiva gerada automaticamente', ?, datetime('now'))
    `).run(plano.id, Number(osInfo.lastInsertRowid), userId || null);

    return Number(osInfo.lastInsertRowid);
  });

  return trx();
}

function registrarExecucao(planoId, userId) {
  const plano = db.prepare(`SELECT * FROM pcm_planos WHERE id=?`).get(Number(planoId));
  if (!plano) throw new Error("Plano não encontrado.");

  const os = db
    .prepare(`
      SELECT o.*
      FROM os o
      WHERE o.equipamento_id = ?
        AND UPPER(o.tipo)='PREVENTIVA'
        AND UPPER(o.status) IN ('CONCLUIDA','FINALIZADA')
        AND o.descricao LIKE ?
      ORDER BY datetime(o.closed_at) DESC, o.id DESC
      LIMIT 1
    `)
    .get(plano.equipamento_id, `%[PCM-PLANO #${plano.id}]%`);

  if (!os) throw new Error("Não encontrei OS preventiva concluída vinculada a este plano.");

  const existe = db
    .prepare(`SELECT id FROM pcm_execucoes WHERE plano_id=? AND os_id=? AND tipo_evento='EXECUCAO'`)
    .get(plano.id, os.id);

  if (existe) throw new Error("Esta execução já foi registrada para a OS selecionada.");

  const days = Number(plano.frequencia_dias || 0);
  const nextDateSql = days > 0 ? `datetime('now', '+${days} day')` : "NULL";

  const trx = db.transaction(() => {
    db.prepare(`
      INSERT INTO pcm_execucoes (plano_id, os_id, tipo_evento, observacao, created_by, created_at)
      VALUES (?, ?, 'EXECUCAO', 'Execução registrada via OS concluída', ?, datetime('now'))
    `).run(plano.id, os.id, userId || null);

    db.prepare(`
      UPDATE pcm_planos
      SET ultima_execucao_em = datetime('now'),
          proxima_data_prevista = ${nextDateSql},
          updated_at = datetime('now')
      WHERE id = ?
    `).run(plano.id);
  });

  trx();
  return os.id;
}



function safeAll(sql, params) {
  try {
    const stmt = db.prepare(sql);
    if (Array.isArray(params)) return stmt.all(...params);
    if (params && typeof params === 'object') return stmt.all(params);
    return stmt.all();
  } catch (_e) {
    return [];
  }
}

function hasColumn(table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    return cols.includes(column);
  } catch (_e) {
    return false;
  }
}

function ensurePcmTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pcm_bom_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipamento_id INTEGER NOT NULL,
      categoria TEXT,
      modelo_comercial TEXT,
      descricao_tecnica TEXT,
      codigo_interno TEXT,
      aplicacao_posicao TEXT,
      estoque_item_id INTEGER,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pcm_bom_estoque_config (
      bom_item_id INTEGER PRIMARY KEY,
      peca_critica INTEGER NOT NULL DEFAULT 0,
      estoque_item_id INTEGER,
      estoque_minimo_pcm REAL,
      updated_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(bom_item_id) REFERENCES pcm_bom_itens(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pcm_lubrificacao_planos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipamento_id INTEGER NOT NULL,
      ponto_lubrificacao TEXT NOT NULL,
      tipo_lubrificante_texto TEXT,
      quantidade REAL,
      unidade TEXT,
      frequencia_dias INTEGER,
      frequencia_semanas INTEGER,
      frequencia_meses INTEGER,
      frequencia_horas_operacao INTEGER,
      observacao TEXT,
      proxima_execucao_em TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pcm_rotas_inspecao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'INSPECAO',
      frequencia_dias INTEGER,
      responsavel TEXT,
      equipamentos_json TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pcm_rotas_execucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rota_id INTEGER NOT NULL,
      observacao TEXT,
      gerou_os_id INTEGER,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(rota_id) REFERENCES pcm_rotas_inspecao(id) ON DELETE CASCADE,
      FOREIGN KEY(gerou_os_id) REFERENCES os(id)
    );
  `);
}

function queryEquipamentosAtivos() {
  const hasTag = hasColumn("equipamentos", "tag");
  const hasCodigo = hasColumn("equipamentos", "codigo");
  const hasSetor = hasColumn("equipamentos", "setor");
  const hasCriticidade = hasColumn("equipamentos", "criticidade");
  const tagExpr = hasTag ? "tag" : (hasCodigo ? "codigo" : "''");
  const setorExpr = hasSetor ? "setor" : "''";
  const criticidadeExpr = hasCriticidade ? "criticidade" : "'media'";
  const filtroAtivo = hasColumn("equipamentos", "ativo") ? "COALESCE(ativo,1)=1 AND" : "";
  const query = `
    SELECT id, COALESCE(${tagExpr}, '') AS tag, nome, COALESCE(${setorExpr},'') AS setor, COALESCE(${criticidadeExpr},'media') AS criticidade
    FROM equipamentos
    WHERE ${filtroAtivo} COALESCE(nome,'') <> ''
    ORDER BY nome
  `;
  return safeAll(query);
}

function getEquipamentos() {
  return queryEquipamentosAtivos();
}

function getEquipamentoById(id) {
  if (!id) return null;
  try {
    return db.prepare(`
      SELECT e.id, COALESCE(e.tag, e.codigo, '') AS tag, e.nome, COALESCE(e.setor,'') AS setor,
             COALESCE(c.nivel_criticidade, 'N/D') AS criticidade
      FROM equipamentos e
      LEFT JOIN pcm_equipamento_criticidade c ON c.equipamento_id = e.id
      WHERE e.id = ?
    `).get(Number(id));
  } catch (_e) {
    return db.prepare(`SELECT id, COALESCE(tag, codigo, '') AS tag, nome, COALESCE(setor,'') AS setor FROM equipamentos WHERE id=?`).get(Number(id)) || null;
  }
}

function getCriticidadeByEquipamentoId(equipamentoId) {
  const id = Number(equipamentoId);
  if (!id) return null;

  let criticidade = null;
  try {
    criticidade = db.prepare(`
      SELECT
        equipamento_id,
        UPPER(COALESCE(nivel_criticidade, 'MEDIA')) AS nivel_criticidade,
        COALESCE(impacto_producao, 3) AS impacto_producao,
        COALESCE(impacto_seguranca, 3) AS impacto_seguranca,
        COALESCE(impacto_ambiental, 3) AS impacto_ambiental,
        COALESCE(custo_parada, 3) AS custo_parada,
        COALESCE(indice_criticidade, 3) AS indice_criticidade,
        COALESCE(observacoes, '') AS observacoes
      FROM pcm_equipamento_criticidade
      WHERE equipamento_id = ?
    `).get(id);
  } catch (_e) {
    criticidade = null;
  }

  if (criticidade) return criticidade;

  const equipamento = db.prepare(`
    SELECT id, UPPER(COALESCE(criticidade, 'MEDIA')) AS criticidade
    FROM equipamentos
    WHERE id = ?
  `).get(id);

  if (!equipamento) return null;

  return {
    equipamento_id: id,
    nivel_criticidade: equipamento.criticidade,
    impacto_producao: 3,
    impacto_seguranca: 3,
    impacto_ambiental: 3,
    custo_parada: 3,
    indice_criticidade: 3,
    observacoes: "",
  };
}

function saveCriticidade(payload = {}, userId = null) {
  const equipamentoId = Number(payload.equipamento_id);
  if (!equipamentoId) throw new Error("Equipamento obrigatório para salvar criticidade.");

  const nivel = String(payload.nivel_criticidade || "MEDIA").trim().toUpperCase();
  if (!["BAIXA", "MEDIA", "ALTA", "CRITICA"].includes(nivel)) {
    throw new Error("Nível de criticidade inválido. Use BAIXA, MEDIA, ALTA ou CRITICA.");
  }

  const sanitizeImpact = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 3;
    return Math.max(1, Math.min(5, Math.round(n)));
  };

  const impactoProducao = sanitizeImpact(payload.impacto_producao);
  const impactoSeguranca = sanitizeImpact(payload.impacto_seguranca);
  const impactoAmbiental = sanitizeImpact(payload.impacto_ambiental);
  const custoParada = sanitizeImpact(payload.custo_parada);
  const indice = Math.round((((impactoProducao + impactoSeguranca + impactoAmbiental + custoParada) / 4) * 10)) / 10;
  const observacoes = String(payload.observacoes || "").trim();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE equipamentos
      SET criticidade = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nivel.toLowerCase(), equipamentoId);

    try {
      db.prepare(`
        INSERT INTO pcm_equipamento_criticidade (
          equipamento_id, nivel_criticidade, impacto_producao, impacto_seguranca,
          impacto_ambiental, custo_parada, indice_criticidade, observacoes,
          updated_by, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(equipamento_id) DO UPDATE SET
          nivel_criticidade=excluded.nivel_criticidade,
          impacto_producao=excluded.impacto_producao,
          impacto_seguranca=excluded.impacto_seguranca,
          impacto_ambiental=excluded.impacto_ambiental,
          custo_parada=excluded.custo_parada,
          indice_criticidade=excluded.indice_criticidade,
          observacoes=excluded.observacoes,
          updated_by=excluded.updated_by,
          updated_at=datetime('now')
      `).run(
        equipamentoId,
        nivel,
        impactoProducao,
        impactoSeguranca,
        impactoAmbiental,
        custoParada,
        indice,
        observacoes || null,
        userId || null
      );
    } catch (_e) {
      // Banco legado sem tabela dedicada: mantém atualização no cadastro base.
    }
  });

  tx();

  return {
    equipamento_id: equipamentoId,
    nivel_criticidade: nivel,
    impacto_producao: impactoProducao,
    impacto_seguranca: impactoSeguranca,
    impacto_ambiental: impactoAmbiental,
    custo_parada: custoParada,
    indice_criticidade: indice,
  };
}

function listBom({ equipamento_id, categoria, busca } = {}) {
  let where = '1=1';
  const params = {};
  if (equipamento_id) { where += ' AND b.equipamento_id=@equipamento_id'; params.equipamento_id = Number(equipamento_id); }
  if (categoria) { where += ' AND UPPER(COALESCE(b.categoria, "")) = UPPER(@categoria)'; params.categoria = String(categoria); }
  if (busca) { where += ' AND (COALESCE(b.codigo_interno,"") LIKE @q OR COALESCE(b.modelo_comercial,"") LIKE @q OR COALESCE(b.descricao_tecnica,"") LIKE @q)'; params.q = `%${busca}%`; }
  return safeAll(`
    SELECT b.*, COALESCE(cfg.peca_critica,0) AS peca_critica
    FROM pcm_bom_itens b
    LEFT JOIN pcm_bom_estoque_config cfg ON cfg.bom_item_id = b.id
    WHERE ${where}
    ORDER BY b.id DESC
  `, params);
}

function listLubrificacao({ equipamento_id, setor } = {}) {
  let where = '1=1';
  const params = {};
  if (equipamento_id) { where += ' AND l.equipamento_id=@equipamento_id'; params.equipamento_id = Number(equipamento_id); }
  if (setor) { where += ' AND COALESCE(e.setor,"")=@setor'; params.setor = String(setor); }
  const rows = safeAll(`
    SELECT l.*, e.nome AS equipamento_nome, e.setor
    FROM pcm_lubrificacao_planos l
    JOIN equipamentos e ON e.id = l.equipamento_id
    WHERE ${where}
    ORDER BY datetime(l.proxima_execucao_em) ASC, l.id DESC
  `, params);
  return rows.map((r) => {
    const dias = Number(r.frequencia_dias || 0);
    const sem = Number(r.frequencia_semanas || 0);
    const mes = Number(r.frequencia_meses || 0);
    const horas = Number(r.frequencia_horas_operacao || 0);
    const freq = dias ? `${dias}d` : sem ? `${sem} sem` : mes ? `${mes} mês` : horas ? `${horas}h op.` : '-';
    let situacao = 'NO_PRAZO';
    if (r.proxima_execucao_em) {
      const diff = (new Date(r.proxima_execucao_em) - new Date()) / 86400000;
      if (diff < 0) situacao = 'ATRASADO';
      else if (diff <= 7) situacao = 'EM_BREVE';
    }
    return { ...r, frequencia_label: freq, situacao };
  });
}

function listPecasCriticas({ tipo, busca, abaixo_minimo } = {}) {
  let where = 'COALESCE(cfg.peca_critica,0)=1';
  const params = {};
  if (tipo) { where += ' AND UPPER(COALESCE(b.categoria,""))=UPPER(@tipo)'; params.tipo = String(tipo); }
  if (busca) { where += ' AND (COALESCE(b.codigo_interno,"") LIKE @q OR COALESCE(b.modelo_comercial,"") LIKE @q OR COALESCE(b.descricao_tecnica,"") LIKE @q)'; params.q = `%${busca}%`; }
  if (abaixo_minimo) {
    where += ' AND COALESCE(ei.quantidade_atual,0) < COALESCE(cfg.estoque_minimo_pcm, ei.estoque_minimo, 0)';
  }
  return safeAll(`
    SELECT b.*, cfg.peca_critica,
           COALESCE(ei.quantidade_atual,0) AS estoque_atual,
           COALESCE(cfg.estoque_minimo_pcm, ei.estoque_minimo, 0) AS estoque_minimo,
           1 AS qtd_equipamentos
    FROM pcm_bom_itens b
    LEFT JOIN pcm_bom_estoque_config cfg ON cfg.bom_item_id = b.id
    LEFT JOIN estoque_itens ei ON ei.id = cfg.estoque_item_id
    WHERE ${where}
    ORDER BY b.id DESC
  `, params);
}

function listBacklogSimples() {
  const osRows = safeAll(`
    SELECT o.id, COALESCE(e.nome, o.equipamento, 'Sem equipamento') AS equipamento,
           UPPER(COALESCE(o.tipo,'CORRETIVA')) AS tipo,
           COALESCE(o.prioridade,'MEDIA') AS prioridade,
           COALESCE(c.nivel_criticidade,'N/D') AS criticidade,
           COALESCE(o.status,'ABERTA') AS status,
           COALESCE(o.opened_at,'') AS data_ref,
           CAST(julianday('now') - julianday(o.opened_at) AS INTEGER) AS atraso
    FROM os o
    LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    LEFT JOIN pcm_equipamento_criticidade c ON c.equipamento_id=o.equipamento_id
    WHERE UPPER(COALESCE(o.status,'')) NOT IN ('CONCLUIDA','FINALIZADA')
    ORDER BY datetime(o.opened_at) ASC
    LIMIT 100
  `);
  return osRows.map((r) => ({ ...r, numero: `OS-${r.id}` }));
}

function listOSFalhasPreview() {
  return safeAll(`
    SELECT o.id,
           COALESCE(e.nome, o.equipamento_manual, o.equipamento, '-') AS equipamento,
           o.tipo,
           o.status,
           o.opened_at
    FROM os o
    LEFT JOIN equipamentos e ON e.id = o.equipamento_id
    WHERE UPPER(COALESCE(tipo,''))='CORRETIVA'
    ORDER BY datetime(o.opened_at) DESC
    LIMIT 20
  `);
}

function createFalhaOS({ equipamento_id, descricao, impacto_producao, impacto_seguranca, impacto_ambiental, custo_parada, observacao }, userId) {
  const equipamentoId = Number(equipamento_id);
  if (!equipamentoId) throw new Error("Selecione um equipamento para registrar a falha.");
  const eq = getEquipamentoById(equipamentoId);
  if (!eq) throw new Error("Equipamento não encontrado.");

  const calc = [impacto_producao, impacto_seguranca, impacto_ambiental, custo_parada]
    .map((v) => Math.max(1, Math.min(5, Number(v) || 3)));
  const indice = Math.round(((calc[0] + calc[1] + calc[2] + calc[3]) / 4) * 10) / 10;

  let grau = "MEDIA";
  if (indice >= 4.5) grau = "CRITICA";
  else if (indice >= 3.5) grau = "ALTA";
  else if (indice < 2) grau = "BAIXA";

  const payload = [
    `[PCM-FALHA] ${String(descricao || "Falha registrada via PCM").trim()}`,
    `Impacto produção: ${calc[0]}/5`,
    `Impacto segurança: ${calc[1]}/5`,
    `Impacto ambiental: ${calc[2]}/5`,
    `Custo de parada: ${calc[3]}/5`,
    `Índice calculado: ${indice}`,
    observacao ? `Observações: ${String(observacao).trim()}` : null,
  ].filter(Boolean).join("\n");

  const info = db.prepare(`
    INSERT INTO os (equipamento, equipamento_id, descricao, tipo, status, prioridade, grau, opened_by, opened_at)
    VALUES (?, ?, ?, 'CORRETIVA', 'ABERTA', ?, ?, ?, datetime('now'))
  `).run(eq.nome, equipamentoId, payload, grau, grau, userId || null);

  return Number(info.lastInsertRowid);
}

function addComponenteBOM({ equipamento_id, categoria, modelo_comercial, descricao_tecnica, codigo_interno, aplicacao_posicao, estoque_item_id, peca_critica }, userId) {
  ensurePcmTables();
  const equipamentoId = Number(equipamento_id);
  if (!equipamentoId) throw new Error("Selecione um equipamento para adicionar o componente.");
  const info = db.prepare(`
    INSERT INTO pcm_bom_itens (equipamento_id, categoria, modelo_comercial, descricao_tecnica, codigo_interno, aplicacao_posicao, estoque_item_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    equipamentoId,
    (categoria || "").trim() || null,
    (modelo_comercial || "").trim() || null,
    (descricao_tecnica || "").trim() || null,
    (codigo_interno || "").trim() || null,
    (aplicacao_posicao || "").trim() || null,
    estoque_item_id ? Number(estoque_item_id) : null,
    userId || null
  );
  const bomId = Number(info.lastInsertRowid);
  db.prepare(`
    INSERT INTO pcm_bom_estoque_config (bom_item_id, peca_critica, estoque_item_id, updated_by, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(bom_item_id) DO UPDATE SET
      peca_critica=excluded.peca_critica,
      estoque_item_id=excluded.estoque_item_id,
      updated_by=excluded.updated_by,
      updated_at=datetime('now')
  `).run(bomId, peca_critica ? 1 : 0, estoque_item_id ? Number(estoque_item_id) : null, userId || null);
  return bomId;
}

function addPontoLubrificacao({ equipamento_id, ponto_lubrificacao, tipo_lubrificante_texto, quantidade, unidade, frequencia_dias, observacao }, userId) {
  ensurePcmTables();
  const equipamentoId = Number(equipamento_id);
  if (!equipamentoId) throw new Error("Selecione um equipamento para adicionar um ponto de lubrificação.");
  if (!String(ponto_lubrificacao || "").trim()) throw new Error("Informe o ponto de lubrificação.");

  const dias = Math.max(1, Number(frequencia_dias) || 30);
  const prox = db.prepare(`SELECT datetime('now', '+' || ? || ' day') AS dt`).get(dias)?.dt || null;

  const info = db.prepare(`
    INSERT INTO pcm_lubrificacao_planos (
      equipamento_id, ponto_lubrificacao, tipo_lubrificante_texto, quantidade, unidade,
      frequencia_dias, observacao, proxima_execucao_em, created_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    equipamentoId,
    String(ponto_lubrificacao).trim(),
    (tipo_lubrificante_texto || "").trim() || null,
    quantidade ? Number(quantidade) : null,
    (unidade || "").trim() || null,
    dias,
    (observacao || "").trim() || null,
    prox,
    userId || null
  );

  return Number(info.lastInsertRowid);
}

function gerarSugestaoPlanoLubrificacao(equipamentoId) {
  const eq = getEquipamentoById(equipamentoId);
  if (!eq) throw new Error("Equipamento não encontrado para sugestão de lubrificação.");
  const critic = String(eq.criticidade || "MEDIA").toUpperCase();
  const diasBase = critic === "CRITICA" ? 7 : critic === "ALTA" ? 14 : critic === "BAIXA" ? 45 : 30;
  const lubrificantePadrao = "Graxa EP2";
  return {
    equipamento_id: Number(eq.id),
    equipamento_nome: eq.nome,
    setor: eq.setor || "",
    criticidade: critic,
    plano: [
      {
        ponto_lubrificacao: "Mancal principal",
        tipo_lubrificante_texto: lubrificantePadrao,
        frequencia_dias: diasBase,
        quantidade: 60,
        unidade: "g",
        observacao: "Aplicar com equipamento parado e limpar excesso.",
      },
      {
        ponto_lubrificacao: "Rolamento de apoio",
        tipo_lubrificante_texto: lubrificantePadrao,
        frequencia_dias: diasBase * 2,
        quantidade: 40,
        unidade: "g",
        observacao: "Aplicação complementar e inspeção visual de vedação.",
      },
    ],
  };
}

function aplicarSugestaoPlanoLubrificacao(sugestao, userId) {
  if (!sugestao?.equipamento_id || !Array.isArray(sugestao?.plano) || !sugestao.plano.length) {
    throw new Error("Gere uma sugestão IA antes de aplicar automaticamente.");
  }
  const ids = [];
  sugestao.plano.forEach((ponto) => {
    ids.push(addPontoLubrificacao({
      equipamento_id: sugestao.equipamento_id,
      ponto_lubrificacao: ponto.ponto_lubrificacao,
      tipo_lubrificante_texto: ponto.tipo_lubrificante_texto || "Graxa EP2",
      quantidade: ponto.quantidade,
      unidade: ponto.unidade || "g",
      frequencia_dias: ponto.frequencia_dias,
      observacao: ponto.observacao,
    }, userId));
  });
  return ids;
}

function listRotasInspecao() {
  ensurePcmTables();
  const rows = safeAll(`
    SELECT *
    FROM pcm_rotas_inspecao
    WHERE COALESCE(ativo,1)=1
    ORDER BY datetime(updated_at) DESC, id DESC
    LIMIT 100
  `);
  return rows.map((r) => {
    let equipamentos = [];
    try { equipamentos = JSON.parse(r.equipamentos_json || "[]"); } catch (_e) {}
    const freq = Number(r.frequencia_dias || 0) > 0 ? `${r.frequencia_dias} dia(s)` : "-";
    return {
      ...r,
      frequencia: freq,
      qtd_equipamentos: equipamentos.length,
      proxima_execucao: r.frequencia_dias ? db.prepare(`SELECT date('now', '+' || ? || ' day') AS dt`).get(Number(r.frequencia_dias))?.dt : "-",
    };
  });
}

function createRotaInspecaoRapida({ nome, tipo, frequencia_dias, responsavel, equipamentos }, userId) {
  ensurePcmTables();
  const nomeRota = String(nome || "").trim();
  if (!nomeRota) throw new Error("Informe o nome da rota.");
  const equipamentoIds = Array.isArray(equipamentos)
    ? equipamentos.map(Number).filter(Boolean)
    : String(equipamentos || "").split(",").map((x) => Number(x.trim())).filter(Boolean);
  const info = db.prepare(`
    INSERT INTO pcm_rotas_inspecao (nome, tipo, frequencia_dias, responsavel, equipamentos_json, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    nomeRota,
    String(tipo || "INSPECAO").toUpperCase(),
    frequencia_dias ? Number(frequencia_dias) : null,
    (responsavel || "").trim() || null,
    JSON.stringify(equipamentoIds),
    userId || null
  );
  return Number(info.lastInsertRowid);
}

function registrarExecucaoRota({ rota_id, observacao, gerar_os }, userId) {
  ensurePcmTables();
  const rotaId = Number(rota_id);
  if (!rotaId) throw new Error("Selecione a rota executada.");
  const rota = db.prepare(`SELECT * FROM pcm_rotas_inspecao WHERE id=?`).get(rotaId);
  if (!rota) throw new Error("Rota não encontrada.");
  let osId = null;
  if (gerar_os) {
    let equipamentos = [];
    try { equipamentos = JSON.parse(rota.equipamentos_json || "[]"); } catch (_e) {}
    const equipamentoId = Number(equipamentos[0] || 0);
    if (equipamentoId) {
      osId = createFalhaOS({
        equipamento_id: equipamentoId,
        descricao: `Rota de inspeção "${rota.nome}" apontou necessidade de intervenção.`,
        observacao,
      }, userId);
    }
  }
  db.prepare(`
    INSERT INTO pcm_rotas_execucoes (rota_id, observacao, gerou_os_id, created_by, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(rotaId, (observacao || "").trim() || null, osId, userId || null);
  return { rota: rota.nome, osId };
}


const DASHBOARD_DEFAULT_CARDS = [
  'total_os','os_abertas','os_andamento','os_concluidas','os_atrasadas','preventivas_programadas','preventivas_vencidas','preventivas_concluidas','demandas_abertas','solicitacoes_pendentes','equipamentos_criticos','tempo_medio_atendimento','tempo_medio_conclusao','manutencoes_por_equipamento','servicos_por_mecanico','falhas_por_setor','percentual_corretiva','percentual_preventiva','corretivas','preventivas','equipamentos_atencao'
];
const DASHBOARD_DEFAULT_GRAFICOS = ['os_status','os_periodo','corretivas_preventivas','falhas_equipamento','servicos_setor','servicos_mecanico','preventivas_cumprimento','evolucao_ocorrencias','ranking_mecanicos','ranking_solicitantes'];

function parseJsonSafe(value, fallback) { try { const out = JSON.parse(value || ''); return out ?? fallback; } catch (_e) { return fallback; } }
function ymd(date) { return date.toISOString().slice(0, 10); }
function addMonths(date, months) { const d = new Date(date); d.setMonth(d.getMonth() + months); return d; }
function monthStart(date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }
function monthEnd(date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)); }

function dashboardPeriodo(shortcut = 'mes_atual', query = {}) {
  const now = new Date();
  let ini = monthStart(now); let fim = monthEnd(now);
  if (shortcut === 'mes_anterior') { const m = addMonths(now, -1); ini = monthStart(m); fim = monthEnd(m); }
  else if (shortcut === 'ultimos_3_meses') { ini = monthStart(addMonths(now, -2)); fim = monthEnd(now); }
  else if (shortcut === 'ultimos_6_meses') { ini = monthStart(addMonths(now, -5)); fim = monthEnd(now); }
  else if (shortcut === 'ultimos_12_meses') { ini = monthStart(addMonths(now, -11)); fim = monthEnd(now); }
  if (query.ano && query.mes) { const d = new Date(Date.UTC(Number(query.ano), Number(query.mes) - 1, 1)); if (!Number.isNaN(d.getTime())) { ini = monthStart(d); fim = monthEnd(d); } }
  if (query.data_inicial) { const d = new Date(`${query.data_inicial}T00:00:00Z`); if (!Number.isNaN(d.getTime())) ini = d; }
  if (query.data_final) { const d = new Date(`${query.data_final}T00:00:00Z`); if (!Number.isNaN(d.getTime())) fim = d; }
  return { data_inicial: ymd(ini), data_final: ymd(fim), shortcut };
}

function buildDashboardFilters(query = {}) {
  const periodo = dashboardPeriodo(query.periodo || 'mes_atual', query);
  const filtros = {
    ...periodo,
    mes: String(query.mes || ''), ano: String(query.ano || ''), setor: String(query.setor || ''), equipamento_id: query.equipamento_id ? Number(query.equipamento_id) : null,
    tipo_manutencao: String(query.tipo_manutencao || '').toUpperCase(), status: String(query.status || '').toUpperCase(), mecanico_id: query.mecanico_id ? Number(query.mecanico_id) : null,
    solicitante_id: query.solicitante_id ? Number(query.solicitante_id) : null, prioridade: String(query.prioridade || '').toUpperCase(), criticidade: String(query.criticidade || '').toUpperCase(), ativo: query.ativo === '0' || query.ativo === '1' ? String(query.ativo) : '',
  };
  return filtros;
}

function whereOS(filtros) {
  const where = ["date(o.opened_at) BETWEEN date(@data_inicial) AND date(@data_final)"]; const params = { ...filtros };
  if (filtros.setor) where.push("COALESCE(e.setor,'') = @setor");
  if (filtros.equipamento_id) where.push("o.equipamento_id = @equipamento_id");
  if (filtros.tipo_manutencao) where.push("UPPER(COALESCE(o.tipo,'')) = @tipo_manutencao");
  if (filtros.status) where.push("UPPER(COALESCE(o.status,'')) = @status");
  if (filtros.prioridade) where.push("UPPER(COALESCE(o.prioridade,'')) = @prioridade");
  if (filtros.criticidade) where.push("UPPER(COALESCE(e.criticidade,'')) = @criticidade");
  if (filtros.ativo !== '') where.push("COALESCE(e.ativo,1) = @ativo");
  if (filtros.solicitante_id) where.push("o.opened_by = @solicitante_id");
  const execUserCol = firstColumn('os_execucoes', ['mecanico_user_id','executor_user_id','user_id','responsavel_id','tecnico_id']);
  if (filtros.mecanico_id && tableExistsLocal('os_execucoes') && execUserCol) where.push(`EXISTS (SELECT 1 FROM os_execucoes x WHERE x.os_id=o.id AND x.${execUserCol}=@mecanico_id)`);
  return { sql: where.join(' AND '), params };
}
function tableExistsLocal(name) { try { return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch(_e){ return false; } }
function col(table, name) { return hasColumn(table, name); }
function firstColumn(table, names) { return names.find((n) => hasColumn(table, n)); }

function getDashboardPreferences(userId) {
  const fallback = { cards: DASHBOARD_DEFAULT_CARDS, graficos: DASHBOARD_DEFAULT_GRAFICOS, periodo_padrao: 'mes_atual', ordem: [], limites: { falhas_periodo: 3, dias_preventiva_atraso: 1, horas_parada: 24 } };
  if (!userId || !tableExistsLocal('pcm_dashboard_preferences')) return fallback;
  const row = db.prepare('SELECT * FROM pcm_dashboard_preferences WHERE user_id=?').get(Number(userId));
  if (!row) return fallback;
  return { cards: parseJsonSafe(row.cards_json, fallback.cards), graficos: parseJsonSafe(row.graficos_json, fallback.graficos), periodo_padrao: row.periodo_padrao || 'mes_atual', ordem: parseJsonSafe(row.ordem_json, []), limites: { ...fallback.limites, ...parseJsonSafe(row.limites_json, {}) } };
}

function saveDashboardPreferences(userId, payload = {}) {
  const prefs = { cards: Array.isArray(payload.cards) ? payload.cards : DASHBOARD_DEFAULT_CARDS, graficos: Array.isArray(payload.graficos) ? payload.graficos : DASHBOARD_DEFAULT_GRAFICOS, periodo_padrao: String(payload.periodo_padrao || 'mes_atual'), ordem: Array.isArray(payload.ordem) ? payload.ordem : [], limites: payload.limites && typeof payload.limites === 'object' ? payload.limites : {} };
  db.prepare(`INSERT INTO pcm_dashboard_preferences (user_id,cards_json,graficos_json,periodo_padrao,ordem_json,limites_json,created_at,updated_at)
    VALUES (@user_id,@cards,@graficos,@periodo,@ordem,@limites,datetime('now'),datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET cards_json=excluded.cards_json, graficos_json=excluded.graficos_json, periodo_padrao=excluded.periodo_padrao, ordem_json=excluded.ordem_json, limites_json=excluded.limites_json, updated_at=datetime('now')`)
    .run({ user_id: Number(userId), cards: JSON.stringify(prefs.cards), graficos: JSON.stringify(prefs.graficos), periodo: prefs.periodo_padrao, ordem: JSON.stringify(prefs.ordem), limites: JSON.stringify(prefs.limites) });
  return prefs;
}

function dashboardQueryLog(label, sql, params, error) {
  console.error('[PCM Dashboard] Falha na consulta:', label, { sql, params, erro: error?.message || error });
}

function safeGetDashboard(label, sql, params = {}) {
  try { return db.prepare(sql).get(params) || {}; } catch (e) { dashboardQueryLog(label, sql, params, e); return {}; }
}

function safeAllDashboard(label, sql, params = {}) {
  try { return db.prepare(sql).all(params) || []; } catch (e) { dashboardQueryLog(label, sql, params, e); return []; }
}

function sqlExpr(alias, sourceTable, candidates, fallbackSql) {
  const found = candidates.find((name) => hasColumn(sourceTable, name));
  return found ? `${alias}.${found}` : fallbackSql;
}

function getResponsaveisFiltro() {
  if (!tableExistsLocal('users')) return [];
  return safeAllDashboard('filtro_mecanicos', `SELECT id, COALESCE(name,email,'Usuário #' || id) nome FROM users WHERE UPPER(COALESCE(role,'')) IN ('MECANICO','MANUTENCAO','MANUTENCAO_SUPERVISOR','SUPERVISOR_MANUTENCAO','ENCARREGADO_MANUTENCAO','PCM','ADMIN') ORDER BY nome LIMIT 200`);
}


function getSolicitantesFiltro() {
  if (!tableExistsLocal('users')) return [];
  return safeAllDashboard('filtro_solicitantes', `SELECT DISTINCT u.id, COALESCE(u.name,u.email,'Usuário #' || u.id) nome FROM users u JOIN os o ON o.opened_by=u.id ORDER BY nome LIMIT 200`);
}

// Calcula média de dias entre falhas com datas de OS corretivas do mesmo equipamento.
// Se não houver pelo menos duas ocorrências válidas, retorna null para evitar inventar MTBF.
function calcularMediaDiasEntreFalhas(equipamentoId, filtros = {}) {
  if (!equipamentoId) return null;
  const rows = safeAllDashboard('media_dias_entre_falhas', `SELECT o.opened_at FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE o.equipamento_id=@equipamento_id AND date(o.opened_at) BETWEEN date(@data_inicial) AND date(@data_final) AND UPPER(COALESCE(o.tipo,o.tipo_manutencao,''))='CORRETIVA' AND UPPER(COALESCE(o.status,'')) NOT IN ('CANCELADA','CANCELADO') ORDER BY datetime(o.opened_at)`, { ...filtros, equipamento_id: equipamentoId });
  let sum = 0; let count = 0; let prev = null;
  for (const row of rows) {
    const curr = row.opened_at ? new Date(row.opened_at) : null;
    if (!curr || Number.isNaN(curr.getTime())) continue;
    if (prev) {
      const days = (curr - prev) / 86400000;
      if (Number.isFinite(days) && days >= 0) { sum += days; count += 1; }
    }
    prev = curr;
  }
  return count ? Math.round((sum / count) * 10) / 10 : null;
}

function getStatusFiltro() {
  if (!tableExistsLocal('os')) return [];
  return safeAllDashboard('filtro_status_os', `SELECT DISTINCT UPPER(COALESCE(status,'')) status FROM os WHERE COALESCE(status,'')<>'' ORDER BY status`).map((r) => r.status);
}

function getTiposFiltro() {
  if (!tableExistsLocal('os')) return ['CORRETIVA','PREVENTIVA','INSPECAO','LUBRIFICACAO','PREDITIVA'];
  const tipos = safeAllDashboard('filtro_tipos_os', `SELECT DISTINCT UPPER(COALESCE(tipo,'')) tipo FROM os WHERE COALESCE(tipo,'')<>'' ORDER BY tipo`).map((r) => r.tipo);
  return [...new Set([...tipos, 'CORRETIVA','PREVENTIVA','INSPECAO','LUBRIFICACAO','PREDITIVA'])];
}

function getCriticidadesFiltro() {
  if (!tableExistsLocal('equipamentos') || !hasColumn('equipamentos', 'criticidade')) return ['BAIXA','MEDIA','ALTA','CRITICA'];
  const vals = safeAllDashboard('filtro_criticidades', `SELECT DISTINCT UPPER(COALESCE(criticidade,'')) criticidade FROM equipamentos WHERE COALESCE(criticidade,'')<>'' ORDER BY criticidade`).map((r) => r.criticidade);
  return [...new Set([...vals, 'BAIXA','MEDIA','ALTA','CRITICA'])];
}

function getDashboardGerencial(query = {}, userId = null) {
  const prefs = getDashboardPreferences(userId);
  const filtros = buildDashboardFilters({ periodo: prefs.periodo_padrao, ...query });
  if (filtros.data_inicial > filtros.data_final) {
    const tmp = filtros.data_inicial; filtros.data_inicial = filtros.data_final; filtros.data_final = tmp; filtros.aviso = 'Período inicial maior que o final: as datas foram ajustadas automaticamente.';
  }

  const empty = { filtros, prefs, cards: {}, graficos: {}, equipamentos_atencao: [], tabelas: { ordens: [], equipamentos: [], preventivas: [] }, opcoesExtras: { mecanicos: [], status: [], tipos: [], criticidades: [] }, erros: [] };
  if (!tableExistsLocal('os')) {
    empty.erros.push('Tabela de ordens de serviço ainda não existe. Execute as migrations do banco.');
    return empty;
  }

  const w = whereOS(filtros);
  const statusConcluida = "('CONCLUIDA','FINALIZADA','FECHADA')";
  const statusAberta = "('ABERTA','NOVA')";
  const statusAnd = "('ANDAMENTO','EM_ANDAMENTO','EM EXECUCAO','EM_EXECUCAO','PAUSADA')";
  const equipNome = tableExistsLocal('equipamentos') ? "COALESCE(e.nome,o.equipamento,'Sem equipamento')" : "COALESCE(o.equipamento,'Sem equipamento')";
  const equipCodigo = tableExistsLocal('equipamentos') ? "COALESCE(e.codigo,e.tag,'')" : "''";
  const equipSetor = tableExistsLocal('equipamentos') ? "COALESCE(e.setor,'')" : "''";
  const equipCrit = tableExistsLocal('equipamentos') && hasColumn('equipamentos','criticidade') ? "COALESCE(e.criticidade,'')" : "''";
  const closedAt = sqlExpr('o', 'os', ['closed_at','data_conclusao','data_fim','finished_at'], 'NULL');
  const startedAt = sqlExpr('o', 'os', ['started_at','data_inicio','opened_at'], 'o.opened_at');

  const resumo = safeGetDashboard('resumo_cards', `SELECT COUNT(*) total_os,
    SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusAberta} THEN 1 ELSE 0 END) os_abertas,
    SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusAnd} THEN 1 ELSE 0 END) os_andamento,
    SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusConcluida} THEN 1 ELSE 0 END) os_concluidas,
    SUM(CASE WHEN UPPER(COALESCE(o.status,'')) NOT IN ${statusConcluida} AND o.opened_at IS NOT NULL AND datetime(o.opened_at) < datetime('now','-7 day') THEN 1 ELSE 0 END) os_atrasadas,
    SUM(CASE WHEN UPPER(COALESCE(o.tipo,''))='CORRETIVA' THEN 1 ELSE 0 END) corretivas,
    SUM(CASE WHEN UPPER(COALESCE(o.tipo,''))='PREVENTIVA' THEN 1 ELSE 0 END) preventivas,
    AVG(CASE WHEN ${startedAt} IS NOT NULL THEN (julianday(${startedAt})-julianday(o.opened_at))*24 END) tempo_atendimento_h,
    AVG(CASE WHEN ${closedAt} IS NOT NULL THEN (julianday(${closedAt})-julianday(o.opened_at))*24 END) tempo_conclusao_h
    FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql}`, w.params);

  const planosWhere = [`date(COALESCE(p.proxima_data_prevista,p.created_at,'now')) BETWEEN date(@data_inicial) AND date(@data_final)`];
  if (filtros.setor) planosWhere.push("COALESCE(e.setor,'')=@setor");
  if (filtros.equipamento_id) planosWhere.push('p.equipamento_id=@equipamento_id');
  if (filtros.tipo_manutencao) planosWhere.push("UPPER(COALESCE(p.tipo_manutencao,''))=@tipo_manutencao");
  const planosSql = tableExistsLocal('pcm_planos') ? `SELECT COUNT(*) programadas, SUM(CASE WHEN date(p.proxima_data_prevista)<date('now') THEN 1 ELSE 0 END) vencidas FROM pcm_planos p LEFT JOIN equipamentos e ON e.id=p.equipamento_id WHERE ${planosWhere.join(' AND ')}` : null;
  const planos = planosSql ? safeGetDashboard('preventivas_planos', planosSql, w.params) : {};
  const demandas = tableExistsLocal('demandas') ? safeGetDashboard('demandas_abertas', `SELECT COUNT(*) abertas FROM demandas WHERE UPPER(COALESCE(status,'')) NOT IN ${statusConcluida}`, w.params) : {};
  const solicitacoes = tableExistsLocal('solicitacoes') ? safeGetDashboard('solicitacoes_pendentes', `SELECT COUNT(*) pendentes FROM solicitacoes WHERE UPPER(COALESCE(status,'')) NOT IN ('FECHADA','CONCLUIDA','CANCELADA','RECEBIDA')`, w.params) : {};
  const criticos = tableExistsLocal('equipamentos') ? safeGetDashboard('equipamentos_criticos', `SELECT COUNT(*) total FROM equipamentos WHERE ativo=1 AND UPPER(COALESCE(criticidade,'')) IN ('ALTA','CRITICA','CRÍTICA')`) : {};

  const byStatus = safeAllDashboard('os_por_status', `SELECT UPPER(COALESCE(o.status,'SEM STATUS')) status, COUNT(*) total FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} GROUP BY UPPER(COALESCE(o.status,'SEM STATUS')) ORDER BY total DESC`, w.params);
  const byMonth = safeAllDashboard('os_por_mes', `SELECT strftime('%Y-%m', o.opened_at) mes, COUNT(*) total, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusAberta} THEN 1 ELSE 0 END) abertas, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusAnd} THEN 1 ELSE 0 END) andamento, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusConcluida} THEN 1 ELSE 0 END) concluidas, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) NOT IN ${statusConcluida} AND datetime(o.opened_at)<datetime('now','-7 day') THEN 1 ELSE 0 END) atrasadas FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} AND o.opened_at IS NOT NULL GROUP BY strftime('%Y-%m', o.opened_at) ORDER BY mes`, w.params);
  const falhas = safeAllDashboard('falhas_por_equipamento', `SELECT COALESCE(e.id,o.equipamento_id,0) equipamento_id, ${equipCodigo} codigo, ${equipNome} nome, ${equipSetor} setor, ${equipCrit} criticidade, COUNT(*) falhas, SUM(CASE WHEN UPPER(COALESCE(o.prioridade,o.grau,'')) IN ('ALTA','CRITICA','CRÍTICA','EMERGENCIAL','URGENTE') THEN 1 ELSE 0 END) falhas_criticas, MAX(o.opened_at) ultima_ocorrencia, COUNT(*) - COUNT(DISTINCT date(o.opened_at)) reincidencias FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} AND UPPER(COALESCE(o.tipo,o.tipo_manutencao,''))='CORRETIVA' AND UPPER(COALESCE(o.status,'')) NOT IN ('CANCELADA','CANCELADO') GROUP BY COALESCE(e.id,o.equipamento_id,0), nome, setor, criticidade ORDER BY falhas DESC, ultima_ocorrencia DESC LIMIT 20`, w.params).map((f) => ({ ...f, media_dias_entre_falhas: calcularMediaDiasEntreFalhas(Number(f.equipamento_id), filtros) }));
  const tipos = safeAllDashboard('corretivas_preventivas', `SELECT UPPER(COALESCE(o.tipo,o.tipo_manutencao,'OUTROS')) tipo, COUNT(*) total FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} GROUP BY UPPER(COALESCE(o.tipo,o.tipo_manutencao,'OUTROS')) ORDER BY total DESC`, w.params);
  const servicosSetor = safeAllDashboard('servicos_por_setor', `SELECT ${equipSetor} setor, COUNT(*) total FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} GROUP BY ${equipSetor} ORDER BY total DESC LIMIT 20`, w.params);
  const falhasSetor = safeAllDashboard('falhas_por_setor', `SELECT ${equipSetor} setor, COUNT(*) total FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} AND UPPER(COALESCE(o.tipo,''))='CORRETIVA' GROUP BY ${equipSetor} ORDER BY total DESC LIMIT 20`, w.params);
  const execUserCol = firstColumn('os_execucoes', ['mecanico_user_id','executor_user_id','user_id','responsavel_id','tecnico_id']);
  const mecanicos = tableExistsLocal('os_execucoes') && execUserCol ? safeAllDashboard('servicos_por_mecanico', `SELECT COALESCE(u.name,u.email,'Não informado') mecanico, COUNT(DISTINCT o.id) atendidas, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusConcluida} THEN 1 ELSE 0 END) concluidas, AVG(CASE WHEN ${closedAt} IS NOT NULL THEN (julianday(${closedAt})-julianday(o.opened_at))*24 END) tempo_medio_h, GROUP_CONCAT(DISTINCT UPPER(COALESCE(o.tipo,'OUTROS'))) tipos_servico FROM os o JOIN os_execucoes x ON x.os_id=o.id LEFT JOIN users u ON u.id=x.${execUserCol} LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} GROUP BY u.id, mecanico ORDER BY atendidas DESC LIMIT 20`, w.params) : [];
  const solicitantes = tableExistsLocal('users') ? safeAllDashboard('ranking_solicitantes', `SELECT COALESCE(u.name,u.email,'Não informado') solicitante, COUNT(*) demandas, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusConcluida} THEN 1 ELSE 0 END) concluidas, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) NOT IN ${statusConcluida} THEN 1 ELSE 0 END) pendentes, GROUP_CONCAT(DISTINCT ${equipNome}) equipamentos FROM os o LEFT JOIN users u ON u.id=o.opened_by LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} GROUP BY COALESCE(u.id,0), solicitante ORDER BY demandas DESC LIMIT 20`, w.params) : [];
  const ordens = safeAllDashboard('tabela_ordens', `SELECT o.id, o.opened_at, ${closedAt} closed_at, o.tipo, o.status, ${hasColumn('os','prioridade')?'o.prioridade':'NULL'} prioridade, ${equipCodigo} codigo, ${equipNome} equipamento, ${equipSetor} setor, ${tableExistsLocal('users')?"COALESCE(u.name,u.email,'')":"''"} solicitante FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id LEFT JOIN users u ON u.id=o.opened_by WHERE ${w.sql} ORDER BY datetime(o.opened_at) DESC LIMIT 1000`, w.params);
  const prevTabela = tableExistsLocal('pcm_planos') ? safeAllDashboard('tabela_preventivas', `SELECT p.id, p.tipo_manutencao, p.atividade_descricao, p.proxima_data_prevista, COALESCE(e.nome,'Sem equipamento') equipamento, COALESCE(e.setor,'') setor FROM pcm_planos p LEFT JOIN equipamentos e ON e.id=p.equipamento_id WHERE ${planosWhere.join(' AND ')} ORDER BY date(p.proxima_data_prevista)`, w.params) : [];
  const total = toNum(resumo.total_os); const cor = toNum(resumo.corretivas); const prev = toNum(resumo.preventivas);
  const atencao = falhas.filter(f => Number(f.falhas) >= Number(prefs.limites?.falhas_periodo || 3)).map(f => ({ ...f, motivos: [`${f.falhas} corretivas no período`] }));
  return { filtros, prefs,
    cards: { total_os: total, os_abertas: toNum(resumo.os_abertas), os_andamento: toNum(resumo.os_andamento), os_concluidas: toNum(resumo.os_concluidas), os_atrasadas: toNum(resumo.os_atrasadas), preventivas_programadas: toNum(planos.programadas), preventivas_vencidas: toNum(planos.vencidas), preventivas_concluidas: prev, preventivas_realizadas: prev, preventivas_pendentes: Math.max(0, toNum(planos.programadas)-prev), preventivas_atrasadas: toNum(planos.vencidas), demandas_abertas: toNum(demandas.abertas), solicitacoes_pendentes: toNum(solicitacoes.pendentes), equipamentos_criticos: toNum(criticos.total), tempo_medio_atendimento: Math.round(toNum(resumo.tempo_atendimento_h)*10)/10, tempo_medio_conclusao: Math.round(toNum(resumo.tempo_conclusao_h)*10)/10, manutencoes_por_equipamento: falhas.reduce((a,b)=>a+toNum(b.falhas),0), servicos_por_mecanico: mecanicos.reduce((a,b)=>a+toNum(b.atendidas),0), falhas_por_setor: falhasSetor.reduce((a,b)=>a+toNum(b.total),0), corretivas: cor, preventivas: prev, percentual_corretiva: total ? Math.round(cor*1000/total)/10 : 0, percentual_preventiva: total ? Math.round(prev*1000/total)/10 : 0, equipamentos_parados: toNum(resumo.os_atrasadas), equipamentos_atencao: atencao.length },
    graficos: { os_status: byStatus, os_periodo: byMonth, os_mes: byMonth, corretivas_preventivas: tipos.filter(t=>['CORRETIVA','PREVENTIVA'].includes(t.tipo)), falhas_equipamento: falhas, servicos_setor: servicosSetor, servicos_mecanico: mecanicos, falhas_setor: falhasSetor, tipos_manutencao: tipos, preventivas_cumprimento: [{ situacao:'Concluídas', total: prev },{ situacao:'Pendentes', total: Math.max(0, toNum(planos.programadas)-prev) },{ situacao:'Vencidas', total: toNum(planos.vencidas) }], ranking_mecanicos: mecanicos, ranking_solicitantes: solicitantes, comparativo_mensal: byMonth, evolucao_ocorrencias: byMonth },
    equipamentos_atencao: atencao, tabelas: { ordens, equipamentos: falhas, preventivas: prevTabela }, opcoesExtras: { mecanicos: getResponsaveisFiltro(), solicitantes: getSolicitantesFiltro(), status: getStatusFiltro(), tipos: getTiposFiltro(), criticidades: getCriticidadesFiltro() }, erros: [], observacoes: { visualizacoes: 'Quando não houver dados, os cards e gráficos são exibidos zerados para evitar tela em branco.' } };
}

function logDashboardReport(userId, tipo, filtros) { if (tableExistsLocal('pcm_dashboard_report_logs')) db.prepare('INSERT INTO pcm_dashboard_report_logs (user_id,tipo,filtros_json,emitted_at) VALUES (?,?,?,datetime(\'now\'))').run(userId || null, tipo, JSON.stringify(filtros || {})); }

ensurePcmTables();

module.exports = {
  getIndicadores,
  getRankingEquipamentos,
  listPlanos,
  listFiltros,
  createPlano,
  gerarOS,
  registrarExecucao,
  getEquipamentos,
  getEquipamentoById,
  getCriticidadeByEquipamentoId,
  saveCriticidade,
  listBom,
  listLubrificacao,
  listPecasCriticas,
  listBacklogSimples,
  listOSFalhasPreview,
  createFalhaOS,
  addComponenteBOM,
  addPontoLubrificacao,
  gerarSugestaoPlanoLubrificacao,
  aplicarSugestaoPlanoLubrificacao,
  listRotasInspecao,
  createRotaInspecaoRapida,
  registrarExecucaoRota,
  atualizarScoresRiscoEquipamentos: intelligenceService.atualizarScoresRiscoEquipamentos,
  getRankingTecnicos: intelligenceService.getRankingTecnicos,
  listarAlertasOperacionais: intelligenceService.listarAlertas,
  processarAutomacaoOS: intelligenceService.processarAutomacaoOS,
  buildDashboardFilters,
  getDashboardGerencial,
  getDashboardPreferences,
  saveDashboardPreferences,
  logDashboardReport,
  DASHBOARD_DEFAULT_CARDS,
  DASHBOARD_DEFAULT_GRAFICOS,
};
