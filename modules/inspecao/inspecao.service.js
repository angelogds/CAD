const db = require("../../database/db");

const STATUS_PRIORITY = { C: 0, SP: 1, EA: 2, NC: 3 };
const KEYWORDS = ["rolamento", "correia", "bomba", "motor", "vazamento"];

function tableExists(name) {
  try {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  } catch (_e) {
    return false;
  }
}

function tableColumns(table) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  } catch (_e) {
    return [];
  }
}

function normalizeText(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeStatus(v) {
  const raw = normalizeText(v);
  if (raw.includes("finaliz") || raw.includes("fechad") || raw.includes("conclu")) return "FECHADA";
  if (raw.includes("andamento") || raw.includes("em_andamento")) return "EM_ANDAMENTO";
  if (raw.includes("aberta")) return "ABERTA";
  return String(v || "").toUpperCase();
}

function normalizeDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const iso = str.includes("T") ? str : str.replace(" ", "T");
  const dt = new Date(iso);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  const m = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function parseDate(value) {
  const date = normalizeDate(value);
  if (!date) return null;
  return new Date(`${date}T00:00:00`);
}

function formatDate(value) {
  return normalizeDate(value) || "";
}

function resolveInspectionTable() {
  return "inspecoes_pac01";
}

function resolveGradeTable() {
  return tableExists("inspecao_pac01_grade") ? "inspecao_pac01_grade" : "inspecao_pac01_itens";
}

function resolveNCTable() {
  if (tableExists("inspecao_pac01_nao_conformidades")) return "inspecao_pac01_nao_conformidades";
  return "inspecao_pac01_nc";
}

function resolveOSTable() {
  if (tableExists("ordens_servico")) return "ordens_servico";
  return "os";
}

function getColumnValue(row, options = []) {
  for (const key of options) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function normalizarAcoesInspecao(data = {}) {
  const acaoCorretiva = String(data.acao_corretiva || "").trim() || null;
  const acaoPreventiva = String(data.acao_preventiva || "").trim() || null;

  return {
    // Compatibilidade legada da inspeção: colunas invertidas no histórico.
    legado: {
      acao_corretiva: acaoCorretiva,
      acao_preventiva: acaoPreventiva,
    },
    // Mapeamento canônico alinhado com OS.
    canonico: {
      acao_corretiva: acaoPreventiva,
      acao_preventiva: acaoCorretiva,
    },
  };
}


function isClosedStatus(value) {
  return normalizeStatus(value) === "FECHADA";
}

function buildEquipamentoLookup() {
  const byCode = new Map();
  const byName = new Map();
  for (const eq of listEquipamentosAtivos()) {
    if (eq?.codigo) byCode.set(normalizeText(eq.codigo), eq.id);
    if (eq?.nome) byName.set(normalizeText(eq.nome), eq.id);
  }
  return { byCode, byName };
}

function mapOSToEquipamentoId(osRow, lookup) {
  const byId = Number(osRow?.equipamento_id || 0);
  if (byId > 0) return byId;

  const rawRefs = [osRow?.equipamento_id, osRow?.equipamento, osRow?.equipamento_manual];
  for (const ref of rawRefs) {
    const key = normalizeText(ref);
    if (!key) continue;
    if (lookup.byCode.has(key)) return lookup.byCode.get(key);
    if (lookup.byName.has(key)) return lookup.byName.get(key);
  }

  return null;
}

function getOrCreateInspecao(mes, ano, userId) {
  const table = resolveInspectionTable();
  const createdByColumn = tableColumns(table).includes("created_by") ? "created_by" : "criado_por";

  let row = db.prepare(`SELECT * FROM ${table} WHERE mes = ? AND ano = ?`).get(mes, ano);
  if (row) return row;

  const insert = db.prepare(
    `INSERT INTO ${table} (mes, ano, frequencia, monitor_nome, verificador_nome, ${createdByColumn})
     VALUES (?, ?, 'Diária', '', '', ?)`
  );
  const info = insert.run(mes, ano, userId || null);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
}

function getOrCreateInspection(mes, ano, userId) {
  return getOrCreateInspecao(mes, ano, userId);
}

function daysInMonth(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

function listEquipamentosAtivos() {
  const columns = tableColumns("equipamentos");
  const itemExpr = columns.includes("codigo") ? "COALESCE(codigo, nome)" : "nome";
  return db
    .prepare(
      `SELECT id, nome, ${itemExpr} AS item, COALESCE(ativo, 1) AS ativo
       FROM equipamentos
       ORDER BY nome`
    )
    .all();
}

function updateHeader(inspecaoId, data = {}) {
  db.prepare(
    `UPDATE ${resolveInspectionTable()}
     SET monitor_nome = COALESCE(?, monitor_nome),
         verificador_nome = COALESCE(?, verificador_nome),
         frequencia = COALESCE(?, frequencia),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    String(data.monitor_nome || "").trim() || null,
    String(data.verificador_nome || "").trim() || null,
    String(data.frequencia || "").trim() || null,
    inspecaoId
  );
}

function isNC(osRow) {
  if (!osRow) return false;
  if (Number(getColumnValue(osRow, ["nao_conforme"])) === 1) return true;

  const tipo = normalizeText(getColumnValue(osRow, ["tipo"]));
  const ncText = String(
    getColumnValue(osRow, ["descricao_problema", "descricao", "solicitacao", "relato", "texto_problema"]) || ""
  ).trim();

  if (tipo.includes("corretiva") && ncText) return true;

  const fallback = normalizeText(
    `${ncText} ${getColumnValue(osRow, ["causa_diagnostico", "causa", "diagnostico"]) || ""}`
  );
  return KEYWORDS.some((k) => fallback.includes(k));
}

function statusValue(current, next) {
  return STATUS_PRIORITY[next] > STATUS_PRIORITY[current] ? next : current;
}

function ensureGradeRows(inspecaoId, ano, mes, equipamentos) {
  const gradeTable = resolveGradeTable();
  const dias = daysInMonth(ano, mes);
  const usesEquipamentoNome = tableColumns(gradeTable).includes("equipamento_nome");

  const insert = usesEquipamentoNome
    ? db.prepare(
        `INSERT OR IGNORE INTO ${gradeTable}
        (inspecao_id, equipamento_id, equipamento_nome, dia, status, os_id, observacao, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, NULL, datetime('now'))`
      )
    : db.prepare(
        `INSERT OR IGNORE INTO ${gradeTable}
        (inspecao_id, equipamento_id, dia, status, os_id, observacao, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, datetime('now'))`
      );

  for (const eq of equipamentos) {
    const baseStatus = Number(eq.ativo || 0) === 1 ? "C" : "SP";
    for (let dia = 1; dia <= dias; dia += 1) {
      if (usesEquipamentoNome) insert.run(inspecaoId, eq.id, eq.nome, dia, baseStatus);
      else insert.run(inspecaoId, eq.id, dia, baseStatus);
    }
  }
}

function getOSRowsByMonth(ano, mes) {
  const osTable = resolveOSTable();
  const cols = tableColumns(osTable);

  const startCols = ["data_inicio", "opened_at", "created_at"].filter((c) => cols.includes(c));
  const endCols = ["data_fim", "data_conclusao", "closed_at"].filter((c) => cols.includes(c));
  const startExpr = startCols.length ? `COALESCE(${startCols.join(", ")})` : "NULL";
  const endExpr = endCols.length ? `COALESCE(${endCols.join(", ")})` : "NULL";

  const equipExpr = cols.includes("equipamento_id") ? "equipamento_id" : "NULL AS equipamento_id";
  const equipLabelExpr = cols.includes("equipamento") ? "equipamento" : "NULL AS equipamento";
  const equipManualExpr = cols.includes("equipamento_manual") ? "equipamento_manual" : "NULL AS equipamento_manual";
  const idCol = cols.includes("id") ? "id" : "os_id";

  const y = String(ano);
  const m = String(mes).padStart(2, "0");

  const rows = db
    .prepare(
      `SELECT ${idCol} AS id, ${equipExpr}, ${equipLabelExpr}, ${equipManualExpr},
              ${startExpr} AS data_inicio,
              ${endExpr} AS data_fim,
              ${cols.includes("status") ? "status" : "'' AS status"},
              ${cols.includes("tipo") ? "tipo" : "'' AS tipo"},
              ${cols.includes("descricao") ? "descricao" : "'' AS descricao"},
              ${cols.includes("descricao_problema") ? "descricao_problema" : "NULL AS descricao_problema"},
              ${cols.includes("solicitacao") ? "solicitacao" : "NULL AS solicitacao"},
              ${cols.includes("relato") ? "relato" : "NULL AS relato"},
              ${cols.includes("texto_problema") ? "texto_problema" : "NULL AS texto_problema"},
              ${cols.includes("resumo_tecnico") ? "resumo_tecnico" : (cols.includes("execucao") ? "execucao" : (cols.includes("servico_realizado") ? "servico_realizado" : "NULL"))} AS acao_corretiva,
              ${cols.includes("causa_diagnostico") ? "causa_diagnostico" : (cols.includes("causa") ? "causa" : (cols.includes("diagnostico") ? "diagnostico" : "NULL"))} AS acao_preventiva,
              ${cols.includes("nao_conforme") ? "nao_conforme" : "0 AS nao_conforme"}
       FROM ${osTable}
       WHERE strftime('%Y', ${startExpr}) = ? AND strftime('%m', ${startExpr}) = ?`
    )
    .all(y, m);

  const lookup = buildEquipamentoLookup();
  return rows
    .map((row) => ({ ...row, equipamento_id: mapOSToEquipamentoId(row, lookup) }))
    .filter((row) => Number(row.equipamento_id || 0) > 0 && normalizeDate(row.data_inicio));
}

function recalculate(inspecaoId, mes, ano) {
  const gradeTable = resolveGradeTable();
  const ncTable = resolveNCTable();
  const equipamentos = listEquipamentosAtivos();
  const dias = daysInMonth(ano, mes);

  ensureGradeRows(inspecaoId, ano, mes, equipamentos);

  const baseStatusByEq = new Map(equipamentos.map((eq) => [eq.id, Number(eq.ativo || 0) === 1 ? "C" : "SP"]));

  const tx = db.transaction(() => {
    const reset = db.prepare(
      `UPDATE ${gradeTable}
       SET status = ?, os_id = NULL, updated_at = datetime('now')
       WHERE inspecao_id = ? AND equipamento_id = ? AND dia BETWEEN 1 AND ?`
    );

    for (const eq of equipamentos) {
      reset.run(baseStatusByEq.get(eq.id) || "C", inspecaoId, eq.id, dias);
    }

    db.prepare(`DELETE FROM ${ncTable} WHERE inspecao_id = ?`).run(inspecaoId);

    const gradeByEq = new Map(equipamentos.map((eq) => [eq.id, Array.from({ length: dias }, () => baseStatusByEq.get(eq.id))]));
    const osByCell = {};
    const ncRows = [];

    const osRows = getOSRowsByMonth(ano, mes);
    console.log("[INSPECAO_RECALC] base", { inspecaoId, ano, mes, osCount: osRows.length });

    for (const os of osRows) {
      if (!isNC(os)) continue;
      const start = parseDate(os.data_inicio);
      if (!start) continue;
      const eqId = Number(os.equipamento_id);
      const grid = gradeByEq.get(eqId);
      if (!grid) continue;

      const startDay = start.getDate();
      if (startDay >= 1 && startDay <= dias) {
        grid[startDay - 1] = statusValue(grid[startDay - 1], "NC");
        osByCell[`${eqId}-${startDay}`] = (osByCell[`${eqId}-${startDay}`] || []).concat(os.id);
      }

      const endRaw = parseDate(os.data_fim);
      const closed = isClosedStatus(os.status);
      const end = endRaw || (closed ? start : null);
      const endDay = end ? Math.min(dias, end.getDate()) : dias;

      for (let day = startDay + 1; day <= endDay; day += 1) {
        grid[day - 1] = statusValue(grid[day - 1], "EA");
        osByCell[`${eqId}-${day}`] = (osByCell[`${eqId}-${day}`] || []).concat(os.id);
      }

      const acoes = normalizarAcoesInspecao({
        acao_corretiva: String(os.acao_corretiva || "").trim() || null,
        acao_preventiva: String(os.acao_preventiva || "").trim() || null,
      });

      ncRows.push({
        equipamento_id: eqId,
        data_ocorrencia: formatDate(os.data_inicio),
        nao_conformidade: String(
          getColumnValue(os, ["descricao_problema", "descricao", "solicitacao", "relato", "texto_problema"]) || ""
        ).trim(),
        acao_corretiva: acoes.legado.acao_corretiva,
        acao_preventiva: acoes.legado.acao_preventiva,
        data_correcao: formatDate(os.data_fim) || null,
        os_id: os.id,
      });
    }

    const upsertGrade = db.prepare(
      `INSERT INTO ${gradeTable} (inspecao_id, equipamento_id, dia, status, os_id, observacao, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, datetime('now'))
       ON CONFLICT(inspecao_id, equipamento_id, dia)
       DO UPDATE SET status = excluded.status, os_id = excluded.os_id, updated_at = datetime('now')`
    );

    for (const [eqId, row] of gradeByEq.entries()) {
      for (let day = 1; day <= dias; day += 1) {
        upsertGrade.run(inspecaoId, eqId, day, row[day - 1]);
      }
    }

    const ncCols = tableColumns(ncTable);
    const hasEquipNome = ncCols.includes("equipamento_nome");
    const insertNc = hasEquipNome
      ? db.prepare(
          `INSERT OR REPLACE INTO ${ncTable}
          (inspecao_id, equipamento_id, equipamento_nome, data_ocorrencia, nao_conformidade, acao_corretiva, acao_preventiva, data_correcao, os_id, updated_at)
          VALUES (?, ?, (SELECT nome FROM equipamentos WHERE id = ?), ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
      : db.prepare(
          `INSERT OR REPLACE INTO ${ncTable}
          (inspecao_id, equipamento_id, data_ocorrencia, nao_conformidade, acao_corretiva, acao_preventiva, data_correcao, os_id, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        );

    for (const nc of ncRows) {
      if (hasEquipNome) {
        insertNc.run(
          inspecaoId,
          nc.equipamento_id,
          nc.equipamento_id,
          nc.data_ocorrencia,
          nc.nao_conformidade,
          nc.acao_corretiva,
          nc.acao_preventiva,
          nc.data_correcao,
          nc.os_id
        );
      } else {
        insertNc.run(
          inspecaoId,
          nc.equipamento_id,
          nc.data_ocorrencia,
          nc.nao_conformidade,
          nc.acao_corretiva,
          nc.acao_preventiva,
          nc.data_correcao,
          nc.os_id
        );
      }
    }

    console.log("[INSPECAO_RECALC] resultado", { inspecaoId, ano, mes, osCount: osRows.length, ncCount: ncRows.length });
    return { osCount: osRows.length, ncCount: ncRows.length, osByCell };
  });

  return tx();
}

function buildMatrix(inspecaoId, ano, mes, equipamentos = []) {
  const dias = daysInMonth(ano, mes);
  const gradeTable = resolveGradeTable();

  const rows = db
    .prepare(
      `SELECT equipamento_id, dia, status, os_id
       FROM ${gradeTable}
       WHERE inspecao_id = ? AND dia BETWEEN 1 AND 31`
    )
    .all(inspecaoId);

  const matrix = new Map();
  for (const eq of equipamentos) {
    const base = Number(eq.ativo || 0) === 1 ? "C" : "SP";
    matrix.set(
      eq.id,
      Array.from({ length: 31 }, (_, idx) => ({ status: idx + 1 <= dias ? base : "-", os_id: null }))
    );
  }

  for (const row of rows) {
    const line = matrix.get(row.equipamento_id);
    if (!line) continue;
    if (row.dia >= 1 && row.dia <= 31) line[row.dia - 1] = { status: row.status || "C", os_id: row.os_id || null };
  }

  return matrix;
}

function listNC(inspecaoId) {
  const ncTable = resolveNCTable();

  const sql = `
    SELECT
      nc.id,
      nc.inspecao_id,
      nc.equipamento_id,
      nc.data_ocorrencia,
      nc.nao_conformidade,
      nc.acao_corretiva,
      nc.acao_preventiva,
      nc.data_correcao,
      nc.os_id,
      e.nome AS equipamento_nome,
      e.codigo AS equipamento_codigo
    FROM ${ncTable} nc
    LEFT JOIN equipamentos e ON e.id = nc.equipamento_id
    WHERE nc.inspecao_id = ?
    ORDER BY date(nc.data_ocorrencia) DESC, nc.id DESC
  `;

  return db.prepare(sql).all(inspecaoId).map((row) => {
    const acoes = normalizarAcoesInspecao(row);
    return {
      ...row,
      data_ocorrencia: formatDate(row.data_ocorrencia),
      data_correcao: formatDate(row.data_correcao),
      item: row.equipamento_codigo || row.equipamento_nome || `Eq #${row.equipamento_id || "-"}`,
      acao_corretiva_canonica: acoes.canonico.acao_corretiva,
      acao_preventiva_canonica: acoes.canonico.acao_preventiva,
    };
  });
}

function saveNC(inspecaoId, data = {}) {
  const ncTable = resolveNCTable();
  const id = Number(data.id || 0);
  if (!id) return;

  const acoes = normalizarAcoesInspecao(data);

  db.prepare(
    `UPDATE ${ncTable}
     SET acao_corretiva = COALESCE(?, acao_corretiva),
         acao_preventiva = COALESCE(?, acao_preventiva),
         data_correcao = COALESCE(?, data_correcao),
         updated_at = datetime('now')
     WHERE id = ? AND inspecao_id = ?`
  ).run(
    acoes.legado.acao_corretiva,
    acoes.legado.acao_preventiva,
    String(data.data_correcao || "").trim() || null,
    id,
    inspecaoId
  );
}

function updateObservation(inspecaoId, data = {}) {
  const gradeTable = resolveGradeTable();
  const equipamentoId = Number(data.equipamento_id || data.equipamento || 0);
  const dia = Number(data.dia || 0);
  if (!equipamentoId || !dia) return;

  db.prepare(
    `UPDATE ${gradeTable}
     SET observacao = ?, updated_at = datetime('now')
     WHERE inspecao_id = ? AND equipamento_id = ? AND dia = ?`
  ).run(String(data.observacao || "").trim() || null, inspecaoId, equipamentoId, dia);
}

function listOSDetailsByInspecao(inspecaoId, mes, ano) {
  const map = {};
  const osRows = getOSRowsByMonth(ano, mes);

  for (const os of osRows) {
    if (!isNC(os)) continue;
    const start = parseDate(os.data_inicio);
    if (!start) continue;

    const eqId = Number(os.equipamento_id || 0);
    if (!eqId) continue;

    const startDay = start.getDate();
    const endRaw = parseDate(os.data_fim);
    const closed = isClosedStatus(os.status);
    const endDay = endRaw ? endRaw.getDate() : (closed ? startDay : daysInMonth(ano, mes));

    for (let day = startDay; day <= endDay; day += 1) {
      const key = `${eqId}-${day}`;
      map[key] = map[key] || [];
      map[key].push({
        id: os.id,
        status: os.status,
        nao_conformidade: getColumnValue(os, ["descricao_problema", "descricao", "solicitacao", "relato", "texto_problema"]),
        resumo_tecnico: os.acao_preventiva,
        causa_diagnostico: os.acao_corretiva,
        data_inicio: formatDate(os.data_inicio),
        data_fim: formatDate(os.data_fim),
      });
    }
  }

  return map;
}

function syncFromClosedOS(osId) {
  const osTable = resolveOSTable();
  const cols = tableColumns(osTable);
  const statusCol = cols.includes("status") ? "status" : "''";
  const startCols = ["data_inicio", "opened_at", "created_at"].filter((c) => cols.includes(c));
  const endCols = ["data_fim", "data_conclusao", "closed_at"].filter((c) => cols.includes(c));
  const dataInicioExpr = startCols.length ? `COALESCE(${startCols.join(", ")})` : "NULL";
  const dataFimExpr = endCols.length ? `COALESCE(${endCols.join(", ")})` : "NULL";

  const os = db
    .prepare(
      `SELECT *, ${statusCol} AS status_normalized, ${dataInicioExpr} AS data_inicio_normalized, ${dataFimExpr} AS data_fim_normalized
       FROM ${osTable}
       WHERE id = ?`
    )
    .get(osId);

  if (!os) return { synced: false, reason: "os_not_found" };
  if (!normalizeDate(os.data_inicio_normalized)) return { synced: false, reason: "os_or_data_missing" };

  if (!isClosedStatus(os.status_normalized)) return { synced: false, reason: "os_not_closed" };

  const data = parseDate(os.data_inicio_normalized);
  const mes = data.getMonth() + 1;
  const ano = data.getFullYear();
  const inspecao = getOrCreateInspecao(mes, ano, os.closed_by || os.opened_by || null);
  const result = recalculate(inspecao.id, mes, ano);
  console.log("[INSPECAO_RECALC] syncFromClosedOS", {
    osId,
    inspecaoId: inspecao.id,
    ano,
    mes,
    osCount: result.osCount,
    ncCount: result.ncCount,
  });
  return { synced: true, inspecaoId: inspecao.id, ...result };
}

function syncFromOS(osId) {
  const osTable = resolveOSTable();
  const cols = tableColumns(osTable);
  const dataInicioCol = cols.includes("data_inicio") ? "data_inicio" : (cols.includes("opened_at") ? "opened_at" : "NULL");
  const os = db.prepare(`SELECT id, ${dataInicioCol} AS data_inicio FROM ${osTable} WHERE id = ?`).get(osId);
  if (!os || !normalizeDate(os.data_inicio)) return { synced: false, reason: "os_or_data_missing" };

  const dt = parseDate(os.data_inicio);
  const mes = dt.getMonth() + 1;
  const ano = dt.getFullYear();
  const inspecao = getOrCreateInspecao(mes, ano, null);
  const result = recalculate(inspecao.id, mes, ano);
  return { synced: true, inspecaoId: inspecao.id, ...result };
}

function computeGrade(inspecaoId, mes, ano) {
  return recalculate(inspecaoId, mes, ano);
}

module.exports = {
  getOrCreateInspecao,
  getOrCreateInspection,
  daysInMonth,
  listEquipamentosAtivos,
  buildMatrix,
  listNC,
  computeGrade,
  recalculate,
  saveNC,
  updateObservation,
  updateHeader,
  listOSDetailsByInspecao,
  syncFromClosedOS,
  syncFromOS,
  normalizarAcoesInspecao,
};
