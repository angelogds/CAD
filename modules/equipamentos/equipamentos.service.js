const crypto = require("crypto");
const db = require("../../database/db");
const aiEmbeddingsService = require("../ai/ai.embeddings.service");

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

const OPEN_OS_SQL = "UPPER(COALESCE(o.status,'')) NOT IN ('CONCLUIDA','CONCLUÍDA','FINALIZADA','FECHADA','CANCELADA')";

function list() {
  return db.prepare(`SELECT * FROM equipamentos ORDER BY ativo DESC, nome COLLATE NOCASE`).all();
}

function dashboard(filters = {}) {
  const pageSize = [10, 20, 50].includes(Number(filters.limit)) ? Number(filters.limit) : 20;
  const page = Math.max(Number(filters.page) || 1, 1);
  const where = [];
  const params = {};
  const status = String(filters.situacao || filters.tab || "").toUpperCase();
  if (filters.q) {
    where.push("(UPPER(e.codigo) LIKE @q OR UPPER(e.nome) LIKE @q OR UPPER(e.setor) LIKE @q OR UPPER(e.tipo) LIKE @q)");
    params.q = `%${normalizeText(filters.q)}%`;
  }
  [["setor", "e.setor"], ["tipo", "e.tipo"], ["criticidade", "e.criticidade"]].forEach(([key, col]) => {
    if (filters[key]) { where.push(`UPPER(${col}) = @${key}`); params[key] = normalizeText(filters[key]); }
  });
  if (status === "INATIVOS") where.push("e.ativo = 0");
  else if (status === "OS_ABERTAS") where.push(`EXISTS (SELECT 1 FROM os ox WHERE ox.equipamento_id=e.id AND ${OPEN_OS_SQL.replaceAll('o.', 'ox.')})`);
  else if (["EM_OPERACAO", "EM_MANUTENCAO", "PARADO", "INATIVO"].includes(status)) where.push("e.status_operacional = @status"), params.status = status;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const base = `FROM equipamentos e ${whereSql}`;
  const total = db.prepare(`SELECT COUNT(*) total ${base}`).get(params).total;
  params.limit = pageSize; params.offset = (Math.min(page, Math.max(Math.ceil(total / pageSize), 1)) - 1) * pageSize;
  const items = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM os o WHERE o.equipamento_id=e.id AND ${OPEN_OS_SQL}) AS os_ativas,
      (SELECT MAX(COALESCE(o.closed_at,o.data_conclusao,o.data_fim)) FROM os o WHERE o.equipamento_id=e.id AND o.closed_at IS NOT NULL) AS ultima_manutencao
    ${base}
    ORDER BY CASE WHEN e.criticidade='critica' AND e.status_operacional='PARADO' THEN 0
      WHEN e.criticidade='critica' AND EXISTS(SELECT 1 FROM os o WHERE o.equipamento_id=e.id AND ${OPEN_OS_SQL}) THEN 1
      WHEN e.status_operacional='EM_MANUTENCAO' THEN 2 ELSE 3 END, e.nome COLLATE NOCASE
    LIMIT @limit OFFSET @offset`).all(params);
  const indicators = db.prepare(`SELECT COUNT(*) total,
    SUM(CASE WHEN ativo=1 AND status_operacional='EM_OPERACAO' THEN 1 ELSE 0 END) operacao,
    SUM(CASE WHEN status_operacional='EM_MANUTENCAO' OR EXISTS(SELECT 1 FROM os o WHERE o.equipamento_id=e.id AND ${OPEN_OS_SQL} AND UPPER(o.status) IN ('EM_ANDAMENTO','EM ANDAMENTO')) THEN 1 ELSE 0 END) manutencao,
    SUM(CASE WHEN ativo=1 AND criticidade='critica' THEN 1 ELSE 0 END) criticos,
    (SELECT COUNT(*) FROM os o WHERE o.equipamento_id IS NOT NULL AND ${OPEN_OS_SQL}) os_abertas FROM equipamentos e`).get();
  const distribution = db.prepare("SELECT LOWER(COALESCE(criticidade,'media')) criticidade, COUNT(*) total FROM equipamentos WHERE ativo=1 GROUP BY 1").all();
  const attention = db.prepare(`SELECT e.*,
    (SELECT COUNT(*) FROM os o WHERE o.equipamento_id=e.id) falhas,
    (SELECT COUNT(*) FROM os o WHERE o.equipamento_id=e.id AND ${OPEN_OS_SQL}) os_ativas
    FROM equipamentos e WHERE e.ativo=1 AND (e.status_operacional IN ('PARADO','EM_MANUTENCAO') OR
      (e.criticidade='critica' AND EXISTS(SELECT 1 FROM os o WHERE o.equipamento_id=e.id AND ${OPEN_OS_SQL})))
    ORDER BY CASE WHEN e.criticidade='critica' AND e.status_operacional='PARADO' THEN 0 WHEN e.criticidade='critica' THEN 1 ELSE 2 END,
      falhas DESC LIMIT 3`).all();
  const maintenance = db.prepare(`SELECT e.id,e.nome,e.status_operacional,o.id os_id,o.status os_status,
    COALESCE(u.name,e.responsavel_setor) responsavel, ROUND(julianday('now')-julianday(COALESCE(o.data_inicio,o.opened_at)),0) dias
    FROM equipamentos e LEFT JOIN os o ON o.id=(SELECT id FROM os ox WHERE ox.equipamento_id=e.id AND ${OPEN_OS_SQL.replaceAll('o.', 'ox.')} ORDER BY ox.opened_at DESC LIMIT 1)
    LEFT JOIN users u ON u.id=COALESCE(o.responsavel_user_id,o.mecanico_user_id)
    WHERE e.status_operacional='EM_MANUTENCAO' OR o.id IS NOT NULL ORDER BY e.nome LIMIT 8`).all();
  return { items, total, page: Math.floor(params.offset/pageSize)+1, pageSize, pages: Math.max(Math.ceil(total/pageSize),1), indicators, distribution, attention, maintenance };
}

function filterOptions() {
  const values = (column) => db.prepare(`SELECT DISTINCT ${column} value FROM equipamentos WHERE ${column} IS NOT NULL AND trim(${column})<>'' ORDER BY ${column} COLLATE NOCASE`).all().map(r => r.value);
  return { setores: values('setor'), tipos: values('tipo') };
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
      observacao, foto_url, modelo, numero_serie, data_instalacao, responsavel_setor, possui_plano_preventivo, periodicidade_preventiva, unidade_capacidade, unidade_pressao, potencia, unidade_potencia, tensao, observacoes_tecnicas, created_at, updated_at
    )
    VALUES (
      @codigo, @nome, @setor, @tipo, @criticidade, @ativo, @status_operacional,
      @fabricante, @ano_fabricacao, @ano_instalacao, @capacidade, @pressao_trabalho,
      @observacao, @foto_url, @modelo, @numero_serie, @data_instalacao, @responsavel_setor, @possui_plano_preventivo, @periodicidade_preventiva, @unidade_capacidade, @unidade_pressao, @potencia, @unidade_potencia, @tensao, @observacoes_tecnicas, datetime('now'), datetime('now')
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
      modelo=@modelo, numero_serie=@numero_serie, data_instalacao=@data_instalacao,
      responsavel_setor=@responsavel_setor, possui_plano_preventivo=@possui_plano_preventivo,
      periodicidade_preventiva=@periodicidade_preventiva, unidade_capacidade=@unidade_capacidade,
      unidade_pressao=@unidade_pressao, potencia=@potencia, unidade_potencia=@unidade_potencia,
      tensao=@tensao, observacoes_tecnicas=@observacoes_tecnicas,
      updated_at = datetime('now')
    WHERE id = @id
  `);

  stmt.run({ id: Number(id), ...normalizeEquipData({ ...data, nome: nomePadronizado }) });
  try { aiEmbeddingsService.updateEquipamentoEmbedding(id); } catch (_e) {}
}

function tableExists(name) {
  return Boolean(db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(String(name)));
}

function columnExists(tableName, columnName) {
  if (!tableExists(tableName)) return false;
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((c) => String(c.name) === String(columnName));
}

function countEquipamentoVinculos(equipamentoId) {
  const tabelas = [
    { table: "os", label: "ordens de serviço" },
    { table: "preventiva_planos", label: "planos preventivos" },
    { table: "preventiva_execucoes", label: "execuções preventivas" },
    { table: "inspecao_grade", label: "grade de inspeção" },
    { table: "inspecao_nao_conformidades", label: "não conformidades de inspeção" },
    { table: "solicitacoes", label: "solicitações" },
    { table: "tracagens", label: "traçagens" },
    { table: "desenhos_tecnicos", label: "desenhos técnicos" },
    { table: "pcm_planos", label: "planos PCM" },
    { table: "pcm_equipamento_criticidade", label: "criticidade PCM" },
    { table: "escala_horas_extras", label: "horas extras" },
    { table: "ia_interacoes", label: "interações de IA" },
    { table: "ai_image_analyses", label: "análises de imagem" },
    { table: "academia_biblioteca", label: "biblioteca da academia" },
  ];

  return tabelas
    .filter(({ table }) => columnExists(table, "equipamento_id"))
    .map(({ table, label }) => {
      const total = db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE equipamento_id = ?`).get(equipamentoId)?.total || 0;
      return { table, label, total: Number(total) || 0 };
    })
    .filter((item) => item.total > 0);
}

function deactivate(id) {
  db.prepare(`
    UPDATE equipamentos
    SET ativo = 0, status_operacional = 'INATIVO', updated_at = datetime('now')
    WHERE id = ?
  `).run(Number(id));
}

function deleteEquipamentoChildren(tableName, equipamentoId) {
  if (!columnExists(tableName, "equipamento_id")) return;
  db.prepare(`DELETE FROM ${tableName} WHERE equipamento_id = ?`).run(equipamentoId);
}

function remove(id) {
  const equipamentoId = Number(id);
  const vinculos = countEquipamentoVinculos(equipamentoId);

  if (vinculos.length) {
    deactivate(equipamentoId);
    return { removed: false, deactivated: true, vinculos };
  }

  try {
    const tx = db.transaction(() => {
      deleteEquipamentoChildren("equipamento_pecas", equipamentoId);
      deleteEquipamentoChildren("documentos_equipamento", equipamentoId);
      deleteEquipamentoChildren("equipamento_qrcode", equipamentoId);
      db.prepare(`DELETE FROM equipamentos WHERE id = ?`).run(equipamentoId);
    });
    tx();
    return { removed: true, deactivated: false, vinculos: [] };
  } catch (err) {
    return { removed: false, deactivated: false, vinculos: [], error: err };
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
    status_operacional: (data.status_operacional || "EM_OPERACAO").trim().toUpperCase(),
    fabricante: (data.fabricante || "").trim() || null,
    ano_fabricacao: safeInt(data.ano_fabricacao),
    ano_instalacao: safeInt(data.ano_instalacao),
    capacidade: (data.capacidade || "").trim() || null,
    pressao_trabalho: (data.pressao_trabalho || "").trim() || null,
    observacao: (data.observacao || "").trim() || null,
    foto_url: (data.foto_url || "").trim() || null,
    modelo: (data.modelo || "").trim() || null,
    numero_serie: (data.numero_serie || "").trim() || null,
    data_instalacao: (data.data_instalacao || "").trim() || null,
    responsavel_setor: (data.responsavel_setor || "").trim() || null,
    possui_plano_preventivo: data.possui_plano_preventivo ? 1 : 0,
    periodicidade_preventiva: (data.periodicidade_preventiva || "").trim() || null,
    unidade_capacidade: (data.unidade_capacidade || "").trim() || null,
    unidade_pressao: (data.unidade_pressao || "").trim() || null,
    potencia: safeDecimal(data.potencia), unidade_potencia: (data.unidade_potencia || "").trim() || null,
    tensao: (data.tensao || "").trim() || null,
    observacoes_tecnicas: (data.observacoes_tecnicas || "").trim() || null,
  };
}

function safeDecimal(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function codeExists(codigo, exceptId = null) {
  if (!String(codigo || "").trim()) return false;
  return Boolean(db.prepare("SELECT 1 FROM equipamentos WHERE UPPER(codigo)=UPPER(?) AND (? IS NULL OR id<>?)").get(String(codigo).trim(), exceptId, exceptId));
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

/** Dados gerenciais confiáveis usados pela ficha do ativo. */
function getEquipmentDashboard(equipamentoId) {
  const id = Number(equipamentoId);
  const osAtivas = db.prepare(`
    SELECT o.id, o.status, o.tipo, o.prioridade, o.opened_at, o.descricao
    FROM os o WHERE o.equipamento_id = ? AND ${OPEN_OS_SQL}
    ORDER BY datetime(o.opened_at) DESC LIMIT 20
  `).all(id);
  const ultimaManutencao = db.prepare(`
    SELECT o.id, COALESCE(o.closed_at, o.data_conclusao, o.data_fim) AS data
    FROM os o WHERE o.equipamento_id = ?
      AND COALESCE(o.closed_at, o.data_conclusao, o.data_fim) IS NOT NULL
    ORDER BY datetime(COALESCE(o.closed_at, o.data_conclusao, o.data_fim)) DESC LIMIT 1
  `).get(id) || null;
  const proximaPreventiva = db.prepare(`
    SELECT pe.id, pe.data_prevista, pe.status, p.titulo, p.id AS plano_id
    FROM preventiva_execucoes pe INNER JOIN preventiva_planos p ON p.id=pe.plano_id
    WHERE p.equipamento_id=? AND pe.data_prevista IS NOT NULL
      AND UPPER(COALESCE(pe.status,'')) NOT IN ('CONCLUIDA','CONCLUÍDA','FINALIZADA','CANCELADA')
    ORDER BY date(pe.data_prevista), pe.id LIMIT 1
  `).get(id) || null;
  const ultimaFalha = db.prepare(`
    SELECT opened_at FROM os WHERE equipamento_id=? AND UPPER(COALESCE(tipo,''))='CORRETIVA'
    ORDER BY datetime(opened_at) DESC LIMIT 1
  `).get(id) || null;
  return { osAtivas, ultimaManutencao, proximaPreventiva, ultimaFalha };
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
           p.id AS plano_id,
           p.titulo AS atividade,
           pe.data_prevista,
           pe.iniciada_em,
           pe.finalizada_em,
           COALESCE(pe.duracao_minutos, CASE WHEN pe.iniciada_em IS NOT NULL AND pe.finalizada_em IS NOT NULL THEN CAST((julianday(pe.finalizada_em) - julianday(pe.iniciada_em)) * 24 * 60 AS INTEGER) END) AS duracao_minutos,
           pe.responsavel,
           u1.name AS responsavel_1_nome,
           u2.name AS responsavel_2_nome,
           pe.observacao,
           pe.status,
           p.tipo_plano AS tipo_preventiva,
           pe.data_executada,
           pe.descricao_preventiva,
           pe.itens_verificados,
           pe.nao_conformidade,
           pe.acao_corretiva,
           pe.acao_preventiva,
           pe.situacao_final,
           pe.observacoes_tecnicas,
           pe.evidencias,
           pe.os_corretiva_id
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
  dashboard,
  filterOptions,
  codeExists,
  getById,
  create,
  update,
  remove,
  listHistoricoOS,
  listHistoricoPreventivas,
  getEquipmentDashboard,
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
