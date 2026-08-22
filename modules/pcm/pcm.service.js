const db = require("../../database/db");
const intelligenceService = require("./pcm.intelligence.service");
const aiService = require("../ai/ai.service");

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
  const setores = [...new Set(equipamentos.map((e) => (String(e.setor || '').trim() || 'Setor não informado')).sort())].map((setor) => ({ setor }));
  return {
    equipamentos: equipamentos.map((e) => ({ id: e.id, nome: e.nome, setor: String(e.setor || '').trim() || 'Setor não informado' })),
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

function listOSFalhasPreview({ periodo, equipamento, tipo_falha } = {}) {
  const params = {};
  const where = ["UPPER(COALESCE(o.tipo,''))='CORRETIVA'"];
  if (periodo && /^\d{4}-\d{2}$/.test(String(periodo))) {
    where.push("strftime('%Y-%m', o.opened_at)=@periodo");
    params.periodo = String(periodo);
  }
  if (equipamento) {
    where.push("(CAST(o.equipamento_id AS TEXT)=@equipamento OR COALESCE(e.nome,'') LIKE @equipamento_busca)");
    params.equipamento = String(equipamento);
    params.equipamento_busca = `%${String(equipamento).trim()}%`;
  }
  if (tipo_falha) {
    where.push("(COALESCE(f.categoria,'') LIKE @tipo_falha OR COALESCE(f.modo_falha,'') LIKE @tipo_falha OR COALESCE(f.causa_provavel,'') LIKE @tipo_falha)");
    params.tipo_falha = `%${String(tipo_falha).trim()}%`;
  }

  const falhaJoin = tableExistsLocal('pcm_falhas')
    ? 'LEFT JOIN pcm_falhas f ON f.os_id=o.id'
    : 'LEFT JOIN (SELECT NULL os_id, NULL categoria, NULL modo_falha, NULL causa_provavel, NULL indice_criticidade) f ON 1=0';
  const equipamentoManual = hasColumn('os', 'equipamento_manual') ? 'o.equipamento_manual' : 'NULL';
  return safeAll(`
    SELECT o.id, o.equipamento_id,
           COALESCE(e.nome, ${equipamentoManual}, o.equipamento, '-') AS equipamento,
           COALESCE(e.setor,'Setor não informado') AS setor,
           o.tipo, o.status, o.opened_at, COALESCE(o.prioridade,o.grau,'MEDIA') AS prioridade,
           f.categoria, f.modo_falha, f.causa_provavel, f.indice_criticidade,
           CASE WHEN f.os_id IS NULL THEN 0 ELSE 1 END AS classificada
    FROM os o
    LEFT JOIN equipamentos e ON e.id = o.equipamento_id
    ${falhaJoin}
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(o.opened_at) DESC, o.id DESC
    LIMIT 200
  `, params);
}

function failureImpact(payload = {}) {
  const values = [payload.impacto_producao, payload.impacto_seguranca, payload.impacto_ambiental, payload.custo_parada]
    .map((value) => Math.max(1, Math.min(5, Math.round(Number(value) || 3))));
  const indice = Math.round(((values[0] + values[1] + values[2] + values[3]) / 4) * 10) / 10;
  let grau = 'MEDIA';
  if (indice >= 4.5) grau = 'CRITICA';
  else if (indice >= 3.5) grau = 'ALTA';
  else if (indice < 2) grau = 'BAIXA';
  return { values, indice, grau };
}

function createFalhaOS({ equipamento_id, descricao, categoria, modo_falha, causa_provavel, acao_corretiva, inicio_parada_em, fim_parada_em, impacto_producao, impacto_seguranca, impacto_ambiental, custo_parada, observacao }, userId) {
  const equipamentoId = Number(equipamento_id);
  if (!equipamentoId) throw new Error("Selecione um equipamento para registrar a falha.");
  const eq = getEquipamentoById(equipamentoId);
  if (!eq) throw new Error("Equipamento não encontrado.");

  const { values: calc, indice, grau } = failureImpact({ impacto_producao, impacto_seguranca, impacto_ambiental, custo_parada });

  const payload = [
    `[PCM-FALHA] ${String(descricao || "Falha registrada via PCM").trim()}`,
    categoria ? `Categoria: ${String(categoria).trim()}` : null,
    modo_falha ? `Modo de falha: ${String(modo_falha).trim()}` : null,
    causa_provavel ? `Causa provável: ${String(causa_provavel).trim()}` : null,
    `Impacto produção: ${calc[0]}/5`,
    `Impacto segurança: ${calc[1]}/5`,
    `Impacto ambiental: ${calc[2]}/5`,
    `Custo de parada: ${calc[3]}/5`,
    `Índice calculado: ${indice}`,
    observacao ? `Observações: ${String(observacao).trim()}` : null,
  ].filter(Boolean).join("\n");

  return db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO os (equipamento, equipamento_id, descricao, tipo, status, prioridade, grau, opened_by, opened_at)
      VALUES (?, ?, ?, 'CORRETIVA', 'ABERTA', ?, ?, ?, datetime('now'))
    `).run(eq.nome, equipamentoId, payload, grau, grau, userId || null);
    const osId = Number(info.lastInsertRowid);
    if (tableExistsLocal('pcm_falhas')) {
      db.prepare(`
        INSERT INTO pcm_falhas (
          os_id,equipamento_id,categoria,modo_falha,causa_provavel,acao_corretiva,
          inicio_parada_em,fim_parada_em,impacto_producao,impacto_seguranca,
          impacto_ambiental,custo_parada,indice_criticidade,observacao,created_by,updated_by
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        osId, equipamentoId, String(categoria || 'OUTRA').trim().toUpperCase(),
        String(modo_falha || descricao || '').trim() || null,
        String(causa_provavel || '').trim() || null,
        String(acao_corretiva || '').trim() || null,
        inicio_parada_em || null, fim_parada_em || null,
        calc[0], calc[1], calc[2], calc[3], indice,
        String(observacao || '').trim() || null, userId || null, userId || null
      );
    }
    return osId;
  })();
}

function classificarFalhaOS(osId, payload = {}, userId = null) {
  const ordemId = Number(osId);
  const ordem = db.prepare("SELECT id,equipamento_id,tipo FROM os WHERE id=?").get(ordemId);
  if (!ordem || String(ordem.tipo || '').toUpperCase() !== 'CORRETIVA') {
    throw new Error('A classificação deve estar vinculada a uma OS corretiva válida.');
  }
  if (!ordem.equipamento_id) throw new Error('A OS precisa possuir equipamento vinculado.');
  if (!tableExistsLocal('pcm_falhas')) throw new Error('A migration do banco de falhas ainda não foi aplicada.');
  const { values, indice } = failureImpact(payload);
  db.prepare(`
    INSERT INTO pcm_falhas (
      os_id,equipamento_id,categoria,modo_falha,causa_provavel,acao_corretiva,
      inicio_parada_em,fim_parada_em,impacto_producao,impacto_seguranca,
      impacto_ambiental,custo_parada,indice_criticidade,observacao,created_by,updated_by,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(os_id) DO UPDATE SET
      categoria=excluded.categoria,modo_falha=excluded.modo_falha,
      causa_provavel=excluded.causa_provavel,acao_corretiva=excluded.acao_corretiva,
      inicio_parada_em=excluded.inicio_parada_em,fim_parada_em=excluded.fim_parada_em,
      impacto_producao=excluded.impacto_producao,impacto_seguranca=excluded.impacto_seguranca,
      impacto_ambiental=excluded.impacto_ambiental,custo_parada=excluded.custo_parada,
      indice_criticidade=excluded.indice_criticidade,observacao=excluded.observacao,
      updated_by=excluded.updated_by,updated_at=datetime('now')
  `).run(
    ordemId, Number(ordem.equipamento_id), String(payload.categoria || 'OUTRA').trim().toUpperCase(),
    String(payload.modo_falha || '').trim() || null, String(payload.causa_provavel || '').trim() || null,
    String(payload.acao_corretiva || '').trim() || null, payload.inicio_parada_em || null,
    payload.fim_parada_em || null, values[0], values[1], values[2], values[3], indice,
    String(payload.observacao || '').trim() || null, userId || null, userId || null
  );
  return ordemId;
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

function gerarSugestaoPlanoLubrificacaoLocal(equipamentoId) {
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
    origem: 'LOCAL',
    aviso: 'Plano inicial genérico. Confirme lubrificante, quantidade e frequência no manual do fabricante antes de aplicar.',
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

async function gerarSugestaoPlanoLubrificacao(equipamentoId) {
  const local = gerarSugestaoPlanoLubrificacaoLocal(equipamentoId);
  const existentes = listLubrificacao({ equipamento_id: equipamentoId }).map((item) => ({
    ponto: item.ponto_lubrificacao,
    lubrificante: item.tipo_lubrificante_texto,
    frequencia_dias: item.frequencia_dias,
  }));
  try {
    const result = await aiService.askJSONSchemaStrict({
      model: process.env.OPENAI_MODEL_PCM || process.env.OPENAI_MODEL_TEXT,
      schemaName: 'pcm_plano_lubrificacao_sugerido',
      systemPrompt: [
        'Você auxilia um planejador de manutenção industrial a preparar um rascunho de plano de lubrificação.',
        'Use somente os dados informados. Não invente especificação do fabricante, viscosidade, compatibilidade química ou intervalo garantido.',
        'Quando os dados forem insuficientes, mantenha recomendações conservadoras e declare a necessidade de consultar o manual.',
        'A resposta será revisada por um técnico antes de qualquer cadastro. Responda em português-BR no schema solicitado.',
      ].join(' '),
      userPayload: {
        equipamento: local.equipamento_nome,
        setor: local.setor,
        criticidade: local.criticidade,
        pontos_ja_cadastrados: existentes,
      },
      schema: {
        type: 'object', additionalProperties: false,
        required: ['aviso_tecnico', 'plano'],
        properties: {
          aviso_tecnico: { type: 'string' },
          plano: { type: 'array', minItems: 1, maxItems: 6, items: {
            type: 'object', additionalProperties: false,
            required: ['ponto_lubrificacao','tipo_lubrificante_texto','frequencia_dias','quantidade','unidade','observacao'],
            properties: {
              ponto_lubrificacao: { type: 'string' },
              tipo_lubrificante_texto: { type: 'string' },
              frequencia_dias: { type: 'integer', minimum: 1, maximum: 365 },
              quantidade: { type: 'number', minimum: 0 },
              unidade: { type: 'string' },
              observacao: { type: 'string' },
            },
          } },
        },
      },
      maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS_PCM || 700),
      temperature: 0.1,
    });
    return { ...local, origem: 'OPENAI', aviso: result.aviso_tecnico, plano: result.plano };
  } catch (error) {
    return { ...local, erro_codigo: String(error?.code || 'AI_ERROR') };
  }
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

const DASHBOARD_DEFAULT_CARDS = [
  'total_os','os_abertas','os_andamento','os_concluidas','os_atrasadas','preventivas_programadas','preventivas_vencidas','preventivas_concluidas','demandas_abertas','solicitacoes_pendentes','equipamentos_criticos','tempo_medio_atendimento','tempo_medio_conclusao','manutencoes_por_equipamento','servicos_por_mecanico','falhas_por_setor','percentual_corretiva','percentual_preventiva','corretivas','preventivas','equipamentos_atencao'
];
const DASHBOARD_DEFAULT_GRAFICOS = ['os_status','os_periodo','corretivas_preventivas','falhas_equipamento','servicos_setor','servicos_mecanico','preventivas_cumprimento','evolucao_ocorrencias','ranking_mecanicos','ranking_solicitantes'];

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
  if (filtros.setor) where.push(filtros.setor === 'Setor não informado' ? "COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado') = @setor" : "COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado') = @setor");
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
function firstColumn(table, names) { return names.find((n) => hasColumn(table, n)); }

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

function demandaDateColumn() { return firstColumn('demandas', ['created_at','data_abertura','opened_at','updated_at']); }
function demandaOsColumn() { return firstColumn('demandas', ['os_id','ordem_servico_id','ordem_id']); }
function demandaEquipColumn() { return firstColumn('demandas', ['equipamento_id']); }
function demandaSetorExpr(alias = 'd', equipAlias = 'e') {
  if (hasColumn('demandas', 'setor')) return `COALESCE(NULLIF(TRIM(${alias}.setor),''),'Setor não informado')`;
  if (hasColumn('demandas', 'setor_nome')) return `COALESCE(NULLIF(TRIM(${alias}.setor_nome),''),'Setor não informado')`;
  if (hasColumn('demandas', 'equipamento_id') && tableExistsLocal('equipamentos')) return `COALESCE(NULLIF(TRIM(${equipAlias}.setor),''),'Setor não informado')`;
  return "'Setor não informado'";
}
function demandaJoinEquip(alias = 'd') { return hasColumn('demandas', 'equipamento_id') && tableExistsLocal('equipamentos') ? ` LEFT JOIN equipamentos e ON e.id=${alias}.equipamento_id ` : ' '; }
function demandaWhere(filtros) {
  const dateCol = demandaDateColumn();
  const where = dateCol ? [`date(d.${dateCol}) BETWEEN date(@data_inicial) AND date(@data_final)`] : ['1=1'];
  if (filtros.setor) where.push(`${demandaSetorExpr('d','e')}=@setor`);
  if (filtros.equipamento_id && hasColumn('demandas','equipamento_id')) where.push('d.equipamento_id=@equipamento_id');
  if (filtros.prioridade && hasColumn('demandas','prioridade')) where.push("UPPER(COALESCE(d.prioridade,''))=@prioridade");
  if (filtros.status && hasColumn('demandas','status')) where.push("UPPER(COALESCE(d.status,''))=@status");
  return { sql: where.join(' AND '), params: { ...filtros } };
}

function getDashboardGerencial(query = {}, userId = null) {
  // O painel da Diretoria possui composição institucional fixa. Preferências
  // legadas são preservadas no banco apenas para compatibilidade/histórico.
  const prefs = {
    cards: DASHBOARD_DEFAULT_CARDS,
    graficos: DASHBOARD_DEFAULT_GRAFICOS,
    periodo_padrao: 'mes_atual',
    ordem: [],
    limites: { falhas_periodo: 3, dias_preventiva_atraso: 1, horas_parada: 24 },
  };
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
  const equipSetor = tableExistsLocal('equipamentos') ? "COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado')" : "'Setor não informado'";
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
  if (filtros.setor) planosWhere.push("COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado')=@setor");
  if (filtros.equipamento_id) planosWhere.push('p.equipamento_id=@equipamento_id');
  if (filtros.tipo_manutencao) planosWhere.push("UPPER(COALESCE(p.tipo_manutencao,''))=@tipo_manutencao");
  const planosSql = tableExistsLocal('pcm_planos') ? `SELECT COUNT(*) programadas, SUM(CASE WHEN date(p.proxima_data_prevista)<date('now') THEN 1 ELSE 0 END) vencidas FROM pcm_planos p LEFT JOIN equipamentos e ON e.id=p.equipamento_id WHERE ${planosWhere.join(' AND ')}` : null;
  const planos = planosSql ? safeGetDashboard('preventivas_planos', planosSql, w.params) : {};
  const dw = tableExistsLocal('demandas') ? demandaWhere(filtros) : { sql: '1=0', params: w.params };
  const demandaJoin = tableExistsLocal('demandas') ? demandaJoinEquip('d') : ' ';
  const demandaSetor = tableExistsLocal('demandas') ? demandaSetorExpr('d','e') : "'Setor não informado'";
  const demandaEquipCol = tableExistsLocal('demandas') ? demandaEquipColumn() : null;
  const demandaOsCol = tableExistsLocal('demandas') ? demandaOsColumn() : null;
  const demandas = tableExistsLocal('demandas') ? safeGetDashboard('demandas_resumo_pcm', `SELECT COUNT(*) total,
    SUM(CASE WHEN UPPER(COALESCE(d.status,'')) NOT IN ${statusConcluida} AND UPPER(COALESCE(d.status,'')) NOT IN ('CANCELADA','CANCELADO') THEN 1 ELSE 0 END) abertas,
    SUM(CASE WHEN UPPER(COALESCE(d.status,'')) IN ('PROGRAMADA','PROGRAMADO','AGENDADA','AGENDADO') THEN 1 ELSE 0 END) programadas,
    SUM(CASE WHEN UPPER(COALESCE(d.status,'')) IN ${statusAnd} THEN 1 ELSE 0 END) andamento,
    SUM(CASE WHEN UPPER(COALESCE(d.status,'')) NOT IN ${statusConcluida} AND UPPER(COALESCE(d.status,'')) NOT IN ('CANCELADA','CANCELADO') AND datetime(COALESCE(d.updated_at,d.created_at)) < datetime('now','-7 day') THEN 1 ELSE 0 END) atrasadas,
    SUM(CASE WHEN UPPER(COALESCE(d.status,'')) IN ${statusConcluida} THEN 1 ELSE 0 END) concluidas,
    ${demandaOsCol ? `SUM(CASE WHEN d.${demandaOsCol} IS NOT NULL THEN 1 ELSE 0 END)` : '0'} convertidas_os,
    AVG(CASE WHEN d.finished_at IS NOT NULL THEN (julianday(d.finished_at)-julianday(d.created_at))*24 END) prazo_medio_h
    FROM demandas d ${demandaJoin} WHERE ${dw.sql}`, dw.params) : {};
  const solicitacoes = tableExistsLocal('solicitacoes') ? safeGetDashboard('solicitacoes_pendentes', `SELECT COUNT(*) pendentes FROM solicitacoes WHERE UPPER(COALESCE(status,'')) NOT IN ('FECHADA','CONCLUIDA','CANCELADA','RECEBIDA')`, w.params) : {};
  const criticos = tableExistsLocal('equipamentos') ? safeGetDashboard('equipamentos_criticos', `SELECT COUNT(*) total FROM equipamentos WHERE ativo=1 AND UPPER(COALESCE(criticidade,'')) IN ('ALTA','CRITICA','CRÍTICA')`) : {};

  const byStatus = safeAllDashboard('os_por_status', `SELECT UPPER(COALESCE(o.status,'SEM STATUS')) status, COUNT(*) total FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} GROUP BY UPPER(COALESCE(o.status,'SEM STATUS')) ORDER BY total DESC`, w.params);
  const demandasStatus = tableExistsLocal('demandas') ? safeAllDashboard('demandas_por_status', `SELECT UPPER(COALESCE(d.status,'SEM STATUS')) status, COUNT(*) total FROM demandas d ${demandaJoin} WHERE ${dw.sql} GROUP BY UPPER(COALESCE(d.status,'SEM STATUS')) ORDER BY total DESC`, dw.params) : [];
  const demandasSetor = tableExistsLocal('demandas') ? safeAllDashboard('demandas_por_setor', `SELECT ${demandaSetor} setor, COUNT(*) total FROM demandas d ${demandaJoin} WHERE ${dw.sql} GROUP BY ${demandaSetor} ORDER BY total DESC`, dw.params) : [];
  const demandasPrioridade = tableExistsLocal('demandas') && hasColumn('demandas','prioridade') ? safeAllDashboard('demandas_por_prioridade', `SELECT UPPER(COALESCE(d.prioridade,'SEM PRIORIDADE')) prioridade, COUNT(*) total FROM demandas d ${demandaJoin} WHERE ${dw.sql} GROUP BY UPPER(COALESCE(d.prioridade,'SEM PRIORIDADE')) ORDER BY total DESC`, dw.params) : [];
  const demandasEquipamento = tableExistsLocal('demandas') && demandaEquipCol ? safeAllDashboard('demandas_por_equipamento', `SELECT COALESCE(e.nome,'Sem equipamento') equipamento, COUNT(*) total FROM demandas d ${demandaJoin} WHERE ${dw.sql} GROUP BY COALESCE(e.nome,'Sem equipamento') ORDER BY total DESC LIMIT 20`, dw.params) : [];
  const byMonth = safeAllDashboard('os_por_mes', `SELECT strftime('%Y-%m', o.opened_at) mes, COUNT(*) total, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusAberta} THEN 1 ELSE 0 END) abertas, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusAnd} THEN 1 ELSE 0 END) andamento, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusConcluida} THEN 1 ELSE 0 END) concluidas, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) NOT IN ${statusConcluida} AND datetime(o.opened_at)<datetime('now','-7 day') THEN 1 ELSE 0 END) atrasadas FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} AND o.opened_at IS NOT NULL GROUP BY strftime('%Y-%m', o.opened_at) ORDER BY mes`, w.params);
  const falhas = safeAllDashboard('falhas_por_equipamento', `SELECT COALESCE(e.id,o.equipamento_id,0) equipamento_id, ${equipCodigo} codigo, ${equipNome} nome, ${equipSetor} setor, ${equipCrit} criticidade, COUNT(*) falhas, SUM(CASE WHEN UPPER(COALESCE(o.prioridade,o.grau,'')) IN ('ALTA','CRITICA','CRÍTICA','EMERGENCIAL','URGENTE') THEN 1 ELSE 0 END) falhas_criticas, MAX(o.opened_at) ultima_ocorrencia, COUNT(*) - COUNT(DISTINCT date(o.opened_at)) reincidencias FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} AND UPPER(COALESCE(o.tipo,o.tipo_manutencao,''))='CORRETIVA' AND UPPER(COALESCE(o.status,'')) NOT IN ('CANCELADA','CANCELADO') GROUP BY COALESCE(e.id,o.equipamento_id,0), nome, setor, criticidade ORDER BY falhas DESC, ultima_ocorrencia DESC LIMIT 20`, w.params).map((f) => ({ ...f, media_dias_entre_falhas: calcularMediaDiasEntreFalhas(Number(f.equipamento_id), filtros) }));
  const tipos = safeAllDashboard('corretivas_preventivas', `SELECT UPPER(COALESCE(o.tipo,o.tipo_manutencao,'OUTROS')) tipo, COUNT(*) total FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} GROUP BY UPPER(COALESCE(o.tipo,o.tipo_manutencao,'OUTROS')) ORDER BY total DESC`, w.params);
  const criticidadeNiveis = tableExistsLocal('equipamentos') ? safeAllDashboard('criticidade_niveis', `SELECT UPPER(COALESCE(NULLIF(TRIM(e.criticidade),''),'SEM CRITICIDADE')) criticidade, COUNT(*) total FROM equipamentos e WHERE 1=1 ${filtros.ativo!==''?' AND COALESCE(e.ativo,1)=@ativo':''} GROUP BY UPPER(COALESCE(NULLIF(TRIM(e.criticidade),''),'SEM CRITICIDADE')) ORDER BY total DESC`, w.params) : [];
  const critWhere = "UPPER(COALESCE(e.criticidade,'')) IN ('A','ALTA','CRITICA','CRÍTICA')";
  const criticidadeResumo = tableExistsLocal('equipamentos') ? safeGetDashboard('criticidade_resumo_pcm', `SELECT COUNT(*) alta_criticidade,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM os o2 WHERE o2.equipamento_id=e.id AND UPPER(COALESCE(o2.status,'')) NOT IN ${statusConcluida} AND UPPER(COALESCE(o2.status,'')) NOT IN ('CANCELADA','CANCELADO')) THEN 1 ELSE 0 END) criticos_os_aberta,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM pcm_planos p2 WHERE p2.equipamento_id=e.id AND date(p2.proxima_data_prevista)<date('now')) THEN 1 ELSE 0 END) criticos_preventiva_vencida,
    SUM(CASE WHEN UPPER(COALESCE(e.status_operacional,'')) IN ('PARADO','INATIVO','MANUTENCAO','MANUTENÇÃO') THEN 1 ELSE 0 END) criticos_parados,
    SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM pcm_planos p3 WHERE p3.equipamento_id=e.id) THEN 1 ELSE 0 END) criticos_sem_preventiva,
    ${tableExistsLocal('demandas') && hasColumn('demandas','equipamento_id') ? `SUM(CASE WHEN EXISTS (SELECT 1 FROM demandas d2 WHERE d2.equipamento_id=e.id AND UPPER(COALESCE(d2.status,'')) NOT IN ${statusConcluida} AND UPPER(COALESCE(d2.status,'')) NOT IN ('CANCELADA','CANCELADO')) THEN 1 ELSE 0 END)` : '0'} criticos_demanda_pendente
    FROM equipamentos e WHERE ${critWhere}`, w.params) : {};
  const servicosSetor = safeAllDashboard('servicos_por_setor', `SELECT ${equipSetor} setor, COUNT(*) total FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} GROUP BY ${equipSetor} ORDER BY total DESC LIMIT 20`, w.params);
  const falhasSetor = safeAllDashboard('falhas_por_setor', `SELECT ${equipSetor} setor, COUNT(*) total FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} AND UPPER(COALESCE(o.tipo,''))='CORRETIVA' GROUP BY ${equipSetor} ORDER BY total DESC LIMIT 20`, w.params);
  const execUserCol = firstColumn('os_execucoes', ['mecanico_user_id','executor_user_id','user_id','responsavel_id','tecnico_id']);
  const mecanicos = tableExistsLocal('os_execucoes') && execUserCol ? safeAllDashboard('servicos_por_mecanico', `SELECT COALESCE(u.name,u.email,'Não informado') mecanico, COUNT(DISTINCT o.id) atendidas, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusConcluida} THEN 1 ELSE 0 END) concluidas, AVG(CASE WHEN ${closedAt} IS NOT NULL THEN (julianday(${closedAt})-julianday(o.opened_at))*24 END) tempo_medio_h, GROUP_CONCAT(DISTINCT UPPER(COALESCE(o.tipo,'OUTROS'))) tipos_servico FROM os o JOIN os_execucoes x ON x.os_id=o.id LEFT JOIN users u ON u.id=x.${execUserCol} LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} GROUP BY u.id, mecanico ORDER BY atendidas DESC LIMIT 20`, w.params) : [];
  const solicitantes = tableExistsLocal('users') ? safeAllDashboard('ranking_solicitantes', `SELECT COALESCE(u.name,u.email,'Não informado') solicitante, COUNT(*) demandas, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) IN ${statusConcluida} THEN 1 ELSE 0 END) concluidas, SUM(CASE WHEN UPPER(COALESCE(o.status,'')) NOT IN ${statusConcluida} THEN 1 ELSE 0 END) pendentes, GROUP_CONCAT(DISTINCT ${equipNome}) equipamentos FROM os o LEFT JOIN users u ON u.id=o.opened_by LEFT JOIN equipamentos e ON e.id=o.equipamento_id WHERE ${w.sql} GROUP BY COALESCE(u.id,0), solicitante ORDER BY demandas DESC LIMIT 20`, w.params) : [];
  const ordens = safeAllDashboard('tabela_ordens', `SELECT o.id, o.opened_at, ${closedAt} closed_at, o.tipo, o.status, ${hasColumn('os','prioridade')?'o.prioridade':'NULL'} prioridade, ${equipCodigo} codigo, ${equipNome} equipamento, ${equipSetor} setor, ${tableExistsLocal('users')?"COALESCE(u.name,u.email,'')":"''"} solicitante FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id LEFT JOIN users u ON u.id=o.opened_by WHERE ${w.sql} ORDER BY datetime(o.opened_at) DESC LIMIT 1000`, w.params);
  const prevTabela = tableExistsLocal('pcm_planos') ? safeAllDashboard('tabela_preventivas', `SELECT p.id, p.tipo_manutencao, p.atividade_descricao, p.proxima_data_prevista, COALESCE(e.nome,'Sem equipamento') equipamento, COALESCE(NULLIF(TRIM(e.setor),''),'Setor não informado') setor FROM pcm_planos p LEFT JOIN equipamentos e ON e.id=p.equipamento_id WHERE ${planosWhere.join(' AND ')} ORDER BY date(p.proxima_data_prevista)`, w.params) : [];
  const total = toNum(resumo.total_os); const cor = toNum(resumo.corretivas); const prev = toNum(resumo.preventivas);
  const servicosProgramados = toNum(planos.programadas) + toNum(demandas.programadas);
  const programadosConcluidos = toNum(resumo.os_concluidas) + toNum(demandas.concluidas);
  const cumprimentoProgramacao = servicosProgramados ? Math.round((programadosConcluidos / servicosProgramados) * 1000) / 10 : 0;
  const servicosPlanejados = prev + toNum(planos.programadas);
  const percentualPlanejada = total ? Math.round((servicosPlanejados / total) * 1000) / 10 : 0;
  const disponibilidade = null;
  const atencao = falhas.filter(f => Number(f.falhas) >= Number(prefs.limites?.falhas_periodo || 3)).map(f => ({ ...f, motivos: [`${f.falhas} corretivas no período`] }));
  return { filtros, prefs,
    cards: { total_os: total, os_abertas: toNum(resumo.os_abertas), os_andamento: toNum(resumo.os_andamento), os_concluidas: toNum(resumo.os_concluidas), os_atrasadas: toNum(resumo.os_atrasadas), preventivas_programadas: toNum(planos.programadas), preventivas_vencidas: toNum(planos.vencidas), preventivas_concluidas: prev, preventivas_realizadas: prev, preventivas_pendentes: Math.max(0, toNum(planos.programadas)-prev), preventivas_atrasadas: toNum(planos.vencidas), demandas_total: toNum(demandas.total), demandas_abertas: toNum(demandas.abertas), demandas_programadas: toNum(demandas.programadas), demandas_andamento: toNum(demandas.andamento), demandas_atrasadas: toNum(demandas.atrasadas), demandas_concluidas: toNum(demandas.concluidas), demandas_convertidas_os: toNum(demandas.convertidas_os), prazo_medio_demandas: Math.round(toNum(demandas.prazo_medio_h)*10)/10, solicitacoes_pendentes: toNum(solicitacoes.pendentes), equipamentos_criticos: toNum(criticos.total), tempo_medio_atendimento: Math.round(toNum(resumo.tempo_atendimento_h)*10)/10, tempo_medio_conclusao: Math.round(toNum(resumo.tempo_conclusao_h)*10)/10, manutencoes_por_equipamento: falhas.reduce((a,b)=>a+toNum(b.falhas),0), servicos_por_mecanico: mecanicos.reduce((a,b)=>a+toNum(b.atendidas),0), falhas_por_setor: falhasSetor.reduce((a,b)=>a+toNum(b.total),0), corretivas: cor, preventivas: prev, percentual_corretiva: total ? Math.round(cor*1000/total)/10 : 0, percentual_preventiva: total ? Math.round(prev*1000/total)/10 : 0, cumprimento_programacao: cumprimentoProgramacao, percentual_manutencao_planejada: percentualPlanejada, percentual_manutencao_emergencial: total ? Math.round(cor*1000/total)/10 : 0, servicos_planejados: servicosPlanejados, servicos_nao_planejados: Math.max(0,total-servicosPlanejados), servicos_programados: servicosProgramados, servicos_executados: toNum(resumo.os_concluidas), backlog_manutencao: toNum(resumo.os_abertas)+toNum(resumo.os_andamento)+toNum(demandas.abertas), servicos_pendentes: toNum(resumo.os_abertas)+toNum(resumo.os_andamento), disponibilidade: disponibilidade, equipamentos_parados: toNum(resumo.os_atrasadas), equipamentos_atencao: atencao.length },
    graficos: { os_status: byStatus, demandas_status: demandasStatus, demandas_setor: demandasSetor, demandas_prioridade: demandasPrioridade, demandas_equipamento: demandasEquipamento, os_periodo: byMonth, os_mes: byMonth, corretivas_preventivas: tipos.filter(t=>['CORRETIVA','PREVENTIVA'].includes(t.tipo)), falhas_equipamento: falhas, servicos_setor: servicosSetor, servicos_mecanico: mecanicos, falhas_setor: falhasSetor, tipos_manutencao: tipos, criticidade_niveis: criticidadeNiveis, preventivas_cumprimento: [{ situacao:'Concluídas', total: prev },{ situacao:'Pendentes', total: Math.max(0, toNum(planos.programadas)-prev) },{ situacao:'Vencidas', total: toNum(planos.vencidas) }], ranking_mecanicos: mecanicos, ranking_solicitantes: solicitantes, comparativo_mensal: byMonth, evolucao_ocorrencias: byMonth },
    equipamentos_atencao: atencao, tabelas: { ordens, equipamentos: falhas, preventivas: prevTabela }, opcoesExtras: { mecanicos: getResponsaveisFiltro(), solicitantes: getSolicitantesFiltro(), status: getStatusFiltro(), tipos: getTiposFiltro(), criticidades: getCriticidadesFiltro() }, erros: [], criticidade: criticidadeResumo, confiabilidade: { mtbf: null, mttr: null, disponibilidade: null, status: 'Dados insuficientes para cálculo', campos_necessarios: ['data/hora de início da parada', 'data/hora de retorno à operação', 'falha vinculada ao equipamento', 'tempo real de execução'] }, observacoes: { visualizacoes: 'Quando não houver dados, os cards e gráficos são exibidos zerados para evitar tela em branco.' } };
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
  classificarFalhaOS,
  addComponenteBOM,
  addPontoLubrificacao,
  gerarSugestaoPlanoLubrificacao,
  aplicarSugestaoPlanoLubrificacao,
  atualizarScoresRiscoEquipamentos: intelligenceService.atualizarScoresRiscoEquipamentos,
  getRankingTecnicos: intelligenceService.getRankingTecnicos,
  listarAlertasOperacionais: intelligenceService.listarAlertas,
  processarAutomacaoOS: intelligenceService.processarAutomacaoOS,
  buildDashboardFilters,
  getDashboardGerencial,
  logDashboardReport,
  DASHBOARD_DEFAULT_CARDS,
  DASHBOARD_DEFAULT_GRAFICOS,
};
