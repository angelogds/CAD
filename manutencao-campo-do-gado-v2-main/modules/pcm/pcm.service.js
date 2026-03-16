const db = require("../../database/db");

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getIndicadores() {
  const row = db
    .prepare(`
      SELECT
        SUM(CASE WHEN UPPER(tipo)='PREVENTIVA' AND strftime('%Y-%m', opened_at)=strftime('%Y-%m','now') THEN 1 ELSE 0 END) AS prev_mes,
        SUM(CASE WHEN UPPER(tipo)='CORRETIVA' AND strftime('%Y-%m', opened_at)=strftime('%Y-%m','now') THEN 1 ELSE 0 END) AS corr_mes,
        SUM(CASE WHEN status IN ('ABERTA','ANDAMENTO','PAUSADA') AND datetime(opened_at) < datetime('now','-7 day') THEN 1 ELSE 0 END) AS os_atrasadas,
        SUM(CASE WHEN strftime('%Y-%m', opened_at)=strftime('%Y-%m','now') THEN COALESCE(custo_total,0) ELSE 0 END) AS custo_mes,
        SUM(CASE WHEN UPPER(tipo)='CORRETIVA' AND strftime('%Y-%m', opened_at)=strftime('%Y-%m','now')
                 AND (LOWER(descricao) LIKE '%emerg%' OR LOWER(descricao) LIKE '%parada%') THEN 1 ELSE 0 END) AS paradas_np
      FROM os
    `)
    .get() || {};

  const prev = toNum(row.prev_mes);
  const corr = toNum(row.corr_mes);
  const total = prev + corr;

  const mttr = db
    .prepare(`
      SELECT AVG((julianday(closed_at) - julianday(opened_at)) * 24.0) AS mttr_horas
      FROM os
      WHERE closed_at IS NOT NULL
        AND status IN ('CONCLUIDA','FINALIZADA')
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
  let where = "p.ativo = 1";
  const params = {};

  if (equipamento_id) {
    where += " AND p.equipamento_id = @equipamento_id";
    params.equipamento_id = Number(equipamento_id);
  }
  if (setor) {
    where += " AND e.setor = @setor";
    params.setor = String(setor);
  }
  if (tipo_manutencao) {
    where += " AND p.tipo_manutencao = @tipo";
    params.tipo = String(tipo_manutencao).toUpperCase();
  }

  const rows = db
    .prepare(`
      SELECT p.*, e.nome AS equipamento_nome, e.setor AS equipamento_setor
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
  return {
    equipamentos: db.prepare(`SELECT id, nome, setor FROM equipamentos WHERE ativo=1 ORDER BY nome`).all(),
    setores: db.prepare(`SELECT DISTINCT COALESCE(setor,'') AS setor FROM equipamentos WHERE ativo=1 ORDER BY setor`).all(),
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

function getEquipamentos() {
  return safeAll(`SELECT id, COALESCE(tag, codigo, '') AS tag, nome, COALESCE(setor,'') AS setor FROM equipamentos WHERE ativo=1 ORDER BY nome`);
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
    SELECT id, equipamento, tipo, status, opened_at
    FROM os
    WHERE UPPER(COALESCE(tipo,''))='CORRETIVA'
    ORDER BY datetime(opened_at) DESC
    LIMIT 20
  `);
}

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
  listBom,
  listLubrificacao,
  listPecasCriticas,
  listBacklogSimples,
  listOSFalhasPreview,
};
