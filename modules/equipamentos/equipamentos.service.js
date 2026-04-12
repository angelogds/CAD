const crypto = require("crypto");
const db = require("../../database/db");
const aiEmbeddingsService = require("../ai/ai.embeddings.service");

function list() {
  return db
    .prepare(
      `
      SELECT id, codigo, nome, setor, tipo, criticidade, ativo, status_operacional, foto_url, created_at, updated_at
      FROM equipamentos
      ORDER BY ativo DESC, nome ASC
    `
    )
    .all();
}

function getById(id) {
  return db
    .prepare(
      `
      SELECT *
      FROM equipamentos
      WHERE id = ?
    `
    )
    .get(Number(id));
}

function create(data) {
  const nomePadronizado = padronizarNomeComSequencial(data?.nome);
  const stmt = db.prepare(`
    INSERT INTO equipamentos (
      codigo, nome, setor, tipo, criticidade, ativo, status_operacional,
      fabricante, ano_fabricacao, ano_instalacao, capacidade, pressao_trabalho,
      observacao, foto_url, created_at, updated_at
    )
    VALUES (
      @codigo, @nome, @setor, @tipo, @criticidade, @ativo, @status_operacional,
      @fabricante, @ano_fabricacao, @ano_instalacao, @capacidade, @pressao_trabalho,
      @observacao, @foto_url, datetime('now'), datetime('now')
    )
  `);

  const info = stmt.run(normalizeEquipData({ ...data, nome: nomePadronizado }));
  try { aiEmbeddingsService.updateEquipamentoEmbedding(info.lastInsertRowid); } catch (_e) {}
  return info.lastInsertRowid;
}

function update(id, data) {
  const nomePadronizado = padronizarNomeComSequencial(data?.nome, Number(id));
  const stmt = db.prepare(`
    UPDATE equipamentos
    SET
      codigo = @codigo,
      nome = @nome,
      setor = @setor,
      tipo = @tipo,
      criticidade = @criticidade,
      ativo = @ativo,
      status_operacional = @status_operacional,
      fabricante = @fabricante,
      ano_fabricacao = @ano_fabricacao,
      ano_instalacao = @ano_instalacao,
      capacidade = @capacidade,
      pressao_trabalho = @pressao_trabalho,
      observacao = @observacao,
      foto_url = @foto_url,
      updated_at = datetime('now')
    WHERE id = @id
  `);

  stmt.run({ id: Number(id), ...normalizeEquipData({ ...data, nome: nomePadronizado }) });
  try { aiEmbeddingsService.updateEquipamentoEmbedding(id); } catch (_e) {}
}

function remove(id) {
  const equipamentoId = Number(id);
  try {
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM equipamento_pecas WHERE equipamento_id = ?`).run(equipamentoId);
      db.prepare(`DELETE FROM documentos_equipamento WHERE equipamento_id = ?`).run(equipamentoId);
      db.prepare(`DELETE FROM equipamento_qrcode WHERE equipamento_id = ?`).run(equipamentoId);
      db.prepare(`DELETE FROM equipamentos WHERE id = ?`).run(equipamentoId);
    });
    tx();
    return true;
  } catch (_err) {
    return false;
  }
}

function obterNomeBaseEquipamento(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:\s*[-_/]?\s*\d+)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function padronizarNomeComSequencial(nome, equipamentoId = null) {
  const base = obterNomeBaseEquipamento(nome);
  if (!base) return String(nome || "").trim();

  const rows = db.prepare(`
    SELECT id, nome
    FROM equipamentos
    WHERE (? IS NULL OR id <> ?)
    ORDER BY id ASC
  `).all(equipamentoId, equipamentoId);

  const indices = rows
    .map((row) => {
      const nomeAtual = String(row?.nome || "").trim();
      const baseAtual = obterNomeBaseEquipamento(nomeAtual);
      if (baseAtual.toUpperCase() !== base.toUpperCase()) return null;
      const match = nomeAtual.match(/(\d+)\s*$/);
      return match ? Number(match[1]) : 1;
    })
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!indices.length) return base;
  let proximo = 1;
  while (indices.includes(proximo)) proximo += 1;
  return `${base} ${proximo}`;
}

function normalizeEquipData(data) {
  return {
    codigo: (data.codigo || "").trim() || null,
    nome: (data.nome || "").trim(),
    setor: (data.setor || "").trim() || null,
    tipo: (data.tipo || "").trim() || null,
    criticidade: (data.criticidade || "media").trim(),
    ativo: data.ativo ? 1 : 0,
    status_operacional: (data.status_operacional || "ATIVO").trim().toUpperCase(),
    fabricante: (data.fabricante || "").trim() || null,
    ano_fabricacao: safeInt(data.ano_fabricacao),
    ano_instalacao: safeInt(data.ano_instalacao),
    capacidade: (data.capacidade || "").trim() || null,
    pressao_trabalho: (data.pressao_trabalho || "").trim() || null,
    observacao: (data.observacao || "").trim() || null,
    foto_url: (data.foto_url || "").trim() || null,
  };
}

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeUnidadeMedida(unidade) {
  const raw = String(unidade || "UNIDADE").trim().toUpperCase();
  if (["UNIDADE", "CAIXA", "QUILO", "LITRO", "METRO"].includes(raw)) return raw;
  return "UNIDADE";
}

function listHistoricoOS(equipamentoId, filtros = {}) {
  const where = ["o.equipamento_id = @equipamento_id"];
  const params = { equipamento_id: Number(equipamentoId) };

  if (filtros.data_inicio) {
    where.push("date(o.opened_at) >= date(@data_inicio)");
    params.data_inicio = filtros.data_inicio;
  }
  if (filtros.data_fim) {
    where.push("date(o.opened_at) <= date(@data_fim)");
    params.data_fim = filtros.data_fim;
  }
  if (filtros.tipo) {
    where.push("UPPER(o.tipo) = UPPER(@tipo)");
    params.tipo = filtros.tipo;
  }

  const grauCol = resolveGrauColumn();
  const grauExpr = grauCol ? `COALESCE(o.${grauCol}, '-')` : "COALESCE(o.prioridade,'-')";

  if (filtros.grau) {
    where.push(`UPPER(${grauExpr}) = UPPER(@grau)`);
    params.grau = filtros.grau;
  }

  return db
    .prepare(
      `
      SELECT o.id,
             o.opened_at,
             o.closed_at,
             o.tipo,
             ${grauExpr} AS grau,
             o.descricao,
             o.custo_total,
             ROUND((julianday(COALESCE(o.closed_at, datetime('now'))) - julianday(o.opened_at)) * 24, 1) AS tempo_parada_horas
      FROM os o
      WHERE ${where.join(" AND ")}
      ORDER BY datetime(o.opened_at) DESC
      LIMIT 300
    `
    )
    .all(params);
}

function resolveGrauColumn() {
  const names = db.prepare("PRAGMA table_info(os)").all().map((c) => c.name);
  if (names.includes("grau")) return "grau";
  if (names.includes("grau_dificuldade")) return "grau_dificuldade";
  if (names.includes("nivel_grau")) return "nivel_grau";
  return null;
}

function listHistoricoPreventivas(equipamentoId, filtros = {}) {
  const where = ["p.equipamento_id = @equipamento_id"];
  const params = { equipamento_id: Number(equipamentoId) };

  if (filtros.data_inicio) {
    where.push("date(COALESCE(pe.data_executada, pe.data_prevista)) >= date(@data_inicio)");
    params.data_inicio = filtros.data_inicio;
  }
  if (filtros.data_fim) {
    where.push("date(COALESCE(pe.data_executada, pe.data_prevista)) <= date(@data_fim)");
    params.data_fim = filtros.data_fim;
  }

  return db.prepare(`
    SELECT pe.id,
           p.titulo AS atividade,
           pe.data_prevista,
           pe.iniciada_em,
           pe.finalizada_em,
           COALESCE(pe.duracao_minutos, CASE WHEN pe.iniciada_em IS NOT NULL AND pe.finalizada_em IS NOT NULL THEN CAST((julianday(pe.finalizada_em) - julianday(pe.iniciada_em)) * 24 * 60 AS INTEGER) END) AS duracao_minutos,
           pe.responsavel,
           u1.name AS responsavel_1_nome,
           u2.name AS responsavel_2_nome,
           pe.observacao,
           pe.status
    FROM preventiva_execucoes pe
    INNER JOIN preventiva_planos p ON p.id = pe.plano_id
    LEFT JOIN users u1 ON u1.id = pe.responsavel_1_id
    LEFT JOIN users u2 ON u2.id = pe.responsavel_2_id
    WHERE ${where.join(" AND ")}
    ORDER BY date(COALESCE(pe.data_executada, pe.data_prevista)) DESC, pe.id DESC
    LIMIT 300
  `).all(params);
}

function listPecasCatalogo() {
  return db.prepare(`SELECT * FROM pecas ORDER BY tipo ASC, modelo_descricao ASC`).all();
}

function listPecasByEquipamento(equipamentoId) {
  return db.prepare(`
    SELECT ep.id,
           ep.aplicacao,
           COALESCE(ep.quantidade, 1) AS quantidade,
           ep.descricao_item,
           ep.unidade_medida,
           p.id AS peca_id,
           p.tipo,
           p.modelo_descricao,
           p.codigo_interno,
           p.fabricante
    FROM equipamento_pecas ep
    INNER JOIN pecas p ON p.id = ep.peca_id
    WHERE ep.equipamento_id = ?
    ORDER BY ep.id ASC
  `).all(Number(equipamentoId));
}

function addPecaToEquipamento(equipamentoId, data) {
  let pecaId = data.peca_id ? Number(data.peca_id) : null;

  if (!pecaId) {
    const info = db.prepare(`
      INSERT INTO pecas (tipo, modelo_descricao, codigo_interno, fabricante, observacao, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      String(data.tipo || "OUTRO").trim(),
      String(data.modelo_descricao || "").trim(),
      String(data.codigo_interno || "").trim() || null,
      String(data.fabricante || "").trim() || null,
      String(data.observacao || "").trim() || null
    );
    pecaId = Number(info.lastInsertRowid);
  }

  db.prepare(`
    INSERT INTO equipamento_pecas (equipamento_id, peca_id, aplicacao, quantidade, descricao_item, unidade_medida)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    Number(equipamentoId),
    Number(pecaId),
    String(data.aplicacao || "").trim() || null,
    Math.max(safeInt(data.quantidade) || 1, 1),
    String(data.descricao_item || "").trim() || null,
    normalizeUnidadeMedida(data.unidade_medida)
  );
}

function updatePecaAssociacao(associacaoId, data) {
  db.prepare(`UPDATE equipamento_pecas SET aplicacao=?, quantidade=?, descricao_item=?, unidade_medida=? WHERE id=?`).run(
    String(data.aplicacao || "").trim() || null,
    Math.max(safeInt(data.quantidade) || 1, 1),
    String(data.descricao_item || "").trim() || null,
    normalizeUnidadeMedida(data.unidade_medida),
    Number(associacaoId)
  );

  if (data.modelo_descricao && String(data.modelo_descricao).trim()) {
    db.prepare(`
      UPDATE pecas
      SET modelo_descricao=?, updated_at=datetime('now')
      WHERE id = (
        SELECT peca_id FROM equipamento_pecas WHERE id=?
      )
    `).run(String(data.modelo_descricao).trim(), Number(associacaoId));
  }
}

function removePecaAssociacao(associacaoId) {
  db.prepare(`DELETE FROM equipamento_pecas WHERE id=?`).run(Number(associacaoId));
}

function listDocumentos(equipamentoId) {
  return db.prepare(`
    SELECT *
    FROM documentos_equipamento
    WHERE equipamento_id = ?
    ORDER BY date(COALESCE(validade, data_emissao, created_at)) DESC, id DESC
  `).all(Number(equipamentoId));
}

function createDocumento(equipamentoId, data) {
  db.prepare(`
    INSERT INTO documentos_equipamento (
      equipamento_id, tipo_documento, descricao, caminho_arquivo, data_emissao, validade, responsavel, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    Number(equipamentoId),
    String(data.tipo_documento || "outro").trim(),
    String(data.descricao || "").trim() || null,
    String(data.caminho_arquivo || "").trim(),
    String(data.data_emissao || "").trim() || null,
    String(data.validade || "").trim() || null,
    String(data.responsavel || "").trim() || null
  );
}

function removeDocumento(id) {
  db.prepare(`DELETE FROM documentos_equipamento WHERE id=?`).run(Number(id));
}

function upsertQrCode(equipamentoId, { forceRegen = false } = {}) {
  const existing = db.prepare(`SELECT * FROM equipamento_qrcode WHERE equipamento_id=? LIMIT 1`).get(Number(equipamentoId));
  if (existing && !forceRegen) return existing;

  const token = crypto.randomBytes(18).toString("hex");

  if (existing) {
    db.prepare(`UPDATE equipamento_qrcode SET token=?, criado_em=datetime('now'), ativo=1 WHERE equipamento_id=?`).run(token, Number(equipamentoId));
  } else {
    db.prepare(`INSERT INTO equipamento_qrcode (equipamento_id, token, criado_em, ativo) VALUES (?, ?, datetime('now'), 1)`).run(Number(equipamentoId), token);
  }

  return db.prepare(`SELECT * FROM equipamento_qrcode WHERE equipamento_id=? LIMIT 1`).get(Number(equipamentoId));
}

function getQrByEquipamento(equipamentoId) {
  return db.prepare(`SELECT * FROM equipamento_qrcode WHERE equipamento_id=? AND ativo=1`).get(Number(equipamentoId));
}

function getEquipamentoByQrToken(token) {
  return db.prepare(`
    SELECT e.*, q.token, q.criado_em
    FROM equipamento_qrcode q
    INNER JOIN equipamentos e ON e.id = q.equipamento_id
    WHERE q.token = ? AND q.ativo = 1
    LIMIT 1
  `).get(String(token || ""));
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  listHistoricoOS,
  listHistoricoPreventivas,
  listPecasCatalogo,
  listPecasByEquipamento,
  addPecaToEquipamento,
  updatePecaAssociacao,
  removePecaAssociacao,
  listDocumentos,
  createDocumento,
  removeDocumento,
  upsertQrCode,
  getQrByEquipamento,
  getEquipamentoByQrToken,
};
