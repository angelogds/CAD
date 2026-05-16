const db = require("../../database/db");
const { normalizeWhatsapp } = require("../../utils/whatsapp-phone");

const AUTO_EVENTS = new Set(["CRIACAO_OS", "ATRIBUICAO", "REATRIBUICAO_AUTO"]);
const VALID_PROVIDERS = new Set(["manual", "cloud_api", "disabled"]);

function tableExists(name) {
  try {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(String(name || ""));
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

function getProvider() {
  const raw = String(process.env.WHATSAPP_PROVIDER || "disabled").trim().toLowerCase();
  if (VALID_PROVIDERS.has(raw)) return raw;
  return "disabled";
}

function sanitizeText(value, fallback = "-") {
  const text = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+\n/g, "\n").trim();
  return text || fallback;
}

function normalizePhone(phone) {
  try {
    return normalizeWhatsapp(phone, { defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "55" }) || "";
  } catch (_e) {
    return "";
  }
}

function firstValue(obj, keys, fallback = "-") {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") return obj[key];
  }
  return fallback;
}

function formatDateBR(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return sanitizeText(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: process.env.TZ || "America/Bahia",
  }).format(date);
}

function buildVinculo(os) {
  const solicitacao = firstValue(os, ["solicitacao_id", "tarefa_id", "demanda_id", "nao_conformidade_id"], "");
  if (!solicitacao) return "";
  const desc = firstValue(os, ["solicitacao_titulo", "tarefa_titulo", "demanda_titulo", "vinculo_descricao"], "");
  return desc ? `#${solicitacao} - ${desc}` : `#${solicitacao}`;
}

function getEquipeResumo(os = {}) {
  const membros = [
    ["Executor", firstValue(os, ["executor_nome", "mecanico_nome", "executor_user_nome", "responsavel_nome"], "")],
    ["Apoio operacional", firstValue(os, ["auxiliar_nome", "auxiliar_user_nome"], "")],
    ["Executor secundário", firstValue(os, ["executor_secundario_nome"], "")],
    ["Apoio operacional secundário", firstValue(os, ["auxiliar_secundario_nome"], "")],
  ].filter(([, nome]) => String(nome || "").trim());

  if (!membros.length) return "Equipe ainda não definida.";
  return membros.map(([papel, nome]) => `${papel}: ${sanitizeText(nome)}`).join("\n");
}

function buildOsWhatsappMessage(os = {}) {
  const numero = firstValue(os, ["numero_os", "id"], "-");
  const setor = firstValue(os, ["setor", "equipamento_setor", "setor_nome"], "-");
  const equipamento = firstValue(os, ["equipamento_resolvido", "equipamento_nome", "equipamento_manual", "equipamento"], "-");
  const criticidade = firstValue(os, ["criticidade", "grau", "prioridade", "severidade"], "-");
  const tipo = firstValue(os, ["tipo_corretiva", "tipo"], "-");
  const abertura = firstValue(os, ["opened_at", "created_at", "data_abertura"], null);
  const executor = firstValue(os, ["executor_nome", "mecanico_nome", "executor_user_nome", "responsavel_nome"], "-");
  const equipeResumo = getEquipeResumo(os);
  const descricao = firstValue(os, ["descricao", "nao_conformidade", "nc_observacao_curta"], "-");
  const status = firstValue(os, ["status"], "-");
  const modo = firstValue(os, ["alocacao_modo", "modo_alocacao"], "-");
  const vinculo = buildVinculo(os);
  const media = os.has_abertura_media || (Array.isArray(os.fotos_abertura) && os.fotos_abertura.length > 0);

  const lines = [
    "🔧 *NOVA ORDEM DE SERVIÇO - MANUTENÇÃO*",
    "",
    `📌 *OS:* #${sanitizeText(numero)}`,
    `🏭 *Setor:* ${sanitizeText(setor)}`,
    `⚙️ *Equipamento:* ${sanitizeText(equipamento)}`,
    `🚨 *Grau/Criticidade:* ${sanitizeText(criticidade)}`,
    `🛠️ *Tipo:* ${sanitizeText(tipo)}`,
    `📅 *Abertura:* ${formatDateBR(abertura)}`,
    `👨‍🔧 *Responsável:* ${sanitizeText(executor)}`,
    "",
    "👥 *Equipe direcionada:*",
    equipeResumo,
    "",
    "📝 *Problema informado:*",
    sanitizeText(descricao),
    "",
    `📍 *Status atual:* ${sanitizeText(status)}`,
    `🔄 *Modo de alocação:* ${sanitizeText(modo)}`,
  ];

  if (vinculo) lines.push("", `🔗 *Vínculo:* ${sanitizeText(vinculo)}`);
  if (media) lines.push("", "📷 Foto/anexo da abertura vinculado à OS.");

  lines.push(
    "",
    "Acesse o sistema para iniciar, pausar, concluir ou anexar novas mídias.",
    "",
    "*Manutenção Industrial - Reciclagem Campo do Gado*"
  );

  return lines.join("\n");
}

function resolvePublicUrl(pathValue) {
  const raw = String(pathValue || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(process.env.PUBLIC_BASE_URL || process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (!base) return null;
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function inferMediaType(pathValue = "") {
  const lower = String(pathValue || "").toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(lower)) return "image";
  if (/\.(mp4|mov|webm|ogg|m4v|avi)$/i.test(lower)) return "video";
  return "document";
}

function getOsAberturaMedia(osId) {
  const empty = { hasMedia: false, mediaType: null, filePath: null, publicUrl: null, originalName: null };
  try {
    let row = null;
    if (tableExists("os_anexos")) {
      row = db.prepare(`
        SELECT path AS filePath, legenda AS originalName
        FROM os_anexos
        WHERE os_id = ? AND UPPER(tipo) = 'ABERTURA'
        ORDER BY CASE WHEN lower(path) GLOB '*.jpg' OR lower(path) GLOB '*.jpeg' OR lower(path) GLOB '*.png' OR lower(path) GLOB '*.webp' THEN 0 ELSE 1 END, id ASC
        LIMIT 1
      `).get(Number(osId));
    }
    if (!row && tableExists("anexos")) {
      row = db.prepare(`
        SELECT filepath AS filePath, filename AS originalName
        FROM anexos
        WHERE owner_type = 'os' AND owner_id = ? AND lower(filename) LIKE 'abertura-%'
        ORDER BY CASE WHEN lower(filepath) GLOB '*.jpg' OR lower(filepath) GLOB '*.jpeg' OR lower(filepath) GLOB '*.png' OR lower(filepath) GLOB '*.webp' THEN 0 ELSE 1 END, id ASC
        LIMIT 1
      `).get(Number(osId));
    }
    if (!row?.filePath) return empty;
    const publicUrl = resolvePublicUrl(row.filePath);
    return {
      hasMedia: true,
      mediaType: inferMediaType(row.filePath),
      filePath: row.filePath,
      publicUrl,
      originalName: row.originalName || null,
    };
  } catch (_e) {
    return empty;
  }
}

function normalizeLookupText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\bluis\b/g, "luiz");
}

function getExistingColumns(table, preferred = []) {
  const cols = tableColumns(table);
  return preferred.filter((col) => cols.includes(col));
}

function buildSelectColumn(alias, table, preferred, fallback = "NULL") {
  const col = getExistingColumns(table, preferred)[0];
  return col ? `${alias}.${col}` : fallback;
}

function isTruthyActive(value) {
  if (value === undefined || value === null || value === "") return true;
  const raw = String(value).trim().toLowerCase();
  return !["0", "false", "inativo", "inativa", "desativado", "disabled", "bloqueado"].includes(raw);
}

function maintenanceScore(row = {}) {
  const text = normalizeLookupText([row.funcao, row.cargo, row.role, row.perfil, row.departamento, row.setor].filter(Boolean).join(" "));
  if (/manutencao|mecanico|mecanica|montador|eletricista|industrial|apoio operacional|encarregado manutencao/.test(text)) return 1;
  return 0;
}

function candidateSortScore(row = {}) {
  return (isTruthyActive(row.ativo ?? row.active ?? row.status) ? 100 : 0)
    + (getRecipientPhone(row) ? 50 : 0)
    + (maintenanceScore(row) ? 20 : 0);
}

function normalizeRecipient(row = {}, papel = "Equipe", origemOverride = null) {
  if (!row) return null;
  const origem = origemOverride || row.origem || (row.tabela && row.id ? `${row.tabela}.id = ${row.id}` : "");
  const id = Number(row.user_id || row.id || row.colaborador_id || 0) || null;
  const nome = row.nome || row.name || row.user_name || row.colaborador_nome || "";
  const isColaborador = (row.tabela_origem || row.tabela) === "colaboradores" || row.colaborador_id;
  const telefonePrincipal = isColaborador
    ? (row.telefone_whatsapp || row.colaborador_telefone_whatsapp || row.user_telefone_whatsapp || row.colaborador_telefone || row.telefone || row.celular || row.whatsapp || null)
    : (row.telefone_whatsapp || row.user_telefone_whatsapp || row.colaborador_telefone_whatsapp || row.telefone || row.celular || row.whatsapp || null);
  const telefoneHerdadoDeUser = isColaborador && !normalizePhone(row.telefone_whatsapp || row.colaborador_telefone_whatsapp || row.colaborador_telefone) && normalizePhone(row.user_telefone_whatsapp);
  const normalized = {
    ...row,
    papel,
    id,
    nome,
    name: nome,
    origem,
    tabela_origem: row.tabela_origem || row.tabela || null,
    telefone_whatsapp: telefonePrincipal,
    telefone_herdado_de_user_id: row.telefone_herdado_de_user_id || (telefoneHerdadoDeUser ? Number(row.user_id || 0) || null : null),
    origem_telefone: row.origem_telefone || (telefoneHerdadoDeUser && row.user_id ? `users.id = ${row.user_id}` : null),
  };
  normalized.telefone_normalizado = getRecipientPhone(normalized);
  return normalized;
}

function queryUserById(userId, papel = "Equipe") {
  const id = Number(userId || 0);
  const table = tableExists("users") ? "users" : (tableExists("usuarios") ? "usuarios" : null);
  if (!id || !table) return null;
  const uCols = tableColumns(table);
  const hasColaboradores = tableExists("colaboradores");
  const cCols = hasColaboradores ? tableColumns("colaboradores") : [];
  const row = db.prepare(`
    SELECT u.id AS id,
           u.id AS user_id,
           ${buildSelectColumn("u", table, ["name", "nome", "usuario_nome"])} AS nome,
           ${buildSelectColumn("u", table, ["telefone_whatsapp", "whatsapp", "celular_whatsapp", "celular", "telefone"])} AS user_telefone_whatsapp,
           ${buildSelectColumn("u", table, ["telefone", "celular"])} AS telefone,
           ${buildSelectColumn("u", table, ["role", "perfil"])} AS role,
           ${buildSelectColumn("u", table, ["funcao", "cargo"])} AS funcao,
           ${buildSelectColumn("u", table, ["ativo", "active", "status"], "1")} AS ativo,
           ${hasColaboradores ? "c.id" : "NULL"} AS colaborador_id,
           ${hasColaboradores && cCols.includes("nome") ? "c.nome" : "NULL"} AS colaborador_nome,
           ${hasColaboradores && cCols.includes("telefone_whatsapp") ? "c.telefone_whatsapp" : "NULL"} AS colaborador_telefone_whatsapp,
           ${hasColaboradores && cCols.includes("telefone") ? "c.telefone" : "NULL"} AS colaborador_telefone,
           '${table}' AS tabela_origem,
           '${table}.id = ' || u.id AS origem
    FROM ${table} u
    ${hasColaboradores && cCols.includes("user_id") ? "LEFT JOIN colaboradores c ON c.user_id = u.id" : ""}
    WHERE u.id = ?
  `).get(id);
  return normalizeRecipient(row, papel);
}

function queryColaboradorById(colaboradorId, papel = "Equipe") {
  const id = Number(colaboradorId || 0);
  if (!id || !tableExists("colaboradores")) return null;
  const cCols = tableColumns("colaboradores");
  const hasUsers = tableExists("users");
  const uCols = hasUsers ? tableColumns("users") : [];
  const row = db.prepare(`
    SELECT c.id AS colaborador_id,
           c.${cCols.includes("user_id") ? "user_id" : "id"} AS id,
           ${cCols.includes("user_id") ? "c.user_id" : "NULL"} AS user_id,
           ${buildSelectColumn("c", "colaboradores", ["nome", "name"])} AS nome,
           ${cCols.includes("telefone_whatsapp") ? "c.telefone_whatsapp" : "NULL"} AS colaborador_telefone_whatsapp,
           ${cCols.includes("telefone") ? "c.telefone" : "NULL"} AS colaborador_telefone,
           ${buildSelectColumn("c", "colaboradores", ["funcao", "cargo"])} AS funcao,
           ${buildSelectColumn("c", "colaboradores", ["ativo", "active", "status"], "1")} AS ativo,
           ${hasUsers ? "u.name" : "NULL"} AS user_name,
           ${hasUsers && uCols.includes("telefone_whatsapp") ? "u.telefone_whatsapp" : "NULL"} AS user_telefone_whatsapp,
           'colaboradores' AS tabela_origem,
           'colaboradores.id = ' || c.id AS origem
    FROM colaboradores c
    ${hasUsers && cCols.includes("user_id") ? "LEFT JOIN users u ON u.id = c.user_id" : ""}
    WHERE c.id = ?
  `).get(id);
  return normalizeRecipient(row, papel);
}

function queryGenericPersonById(table, personId, papel = "Equipe") {
  const id = Number(personId || 0);
  if (!id || !tableExists(table)) return null;
  if (table === "users" || table === "usuarios") return queryUserById(id, papel);
  if (table === "colaboradores") return queryColaboradorById(id, papel);
  const cols = tableColumns(table);
  if (!cols.includes("id")) return null;
  const row = db.prepare(`
    SELECT id,
           ${buildSelectColumn("p", table, ["nome", "name", "descricao"])} AS nome,
           ${buildSelectColumn("p", table, ["telefone_whatsapp", "whatsapp", "celular_whatsapp", "celular", "telefone"])} AS telefone_whatsapp,
           ${buildSelectColumn("p", table, ["telefone", "celular"])} AS telefone,
           ${buildSelectColumn("p", table, ["funcao", "cargo", "role", "perfil"])} AS funcao,
           ${buildSelectColumn("p", table, ["ativo", "active", "status"], "1")} AS ativo,
           '${table}' AS tabela_origem,
           '${table}.id = ' || id AS origem
    FROM ${table} p
    WHERE id = ?
  `).get(id);
  return normalizeRecipient(row, papel);
}

function getColaboradorRecipient(colaboradorId, papel = "Equipe") {
  return queryColaboradorById(colaboradorId, papel);
}

function getUserRecipient(userId, papel = "Equipe") {
  return queryUserById(userId, papel);
}

function findPeopleByName(nome, papel = "Equipe") {
  const wanted = normalizeLookupText(nome);
  if (!wanted) return [];
  const personTables = ["users", "usuarios", "funcionarios", "colaboradores", "equipe", "mecanicos"];
  const candidates = [];
  for (const table of personTables) {
    if (!tableExists(table)) continue;
    const cols = tableColumns(table);
    if (!cols.includes("id")) continue;
    const nameCol = getExistingColumns(table, ["name", "nome", "usuario_nome", "descricao"])[0];
    if (!nameCol) continue;
    const phoneCol = getExistingColumns(table, ["telefone_whatsapp", "whatsapp", "celular_whatsapp", "celular", "telefone"])[0];
    const extraCols = ["funcao", "cargo", "role", "perfil", "ativo", "active", "status", "user_id"].filter((c) => cols.includes(c));
    const rows = db.prepare(`SELECT id, ${nameCol} AS nome${phoneCol ? `, ${phoneCol} AS telefone_whatsapp` : ""}${extraCols.length ? `, ${extraCols.join(", ")}` : ""} FROM ${table}`).all();
    for (const row of rows) {
      const normalizedName = normalizeLookupText(row.nome);
      if (!normalizedName) continue;
      if (normalizedName === wanted || normalizedName.includes(wanted) || wanted.includes(normalizedName)) {
        const byId = queryGenericPersonById(table, row.id, papel) || normalizeRecipient({ ...row, tabela_origem: table, origem: `${table}.id = ${row.id}` }, papel);
        candidates.push({ ...byId, match_nome: row.nome, match_normalizado: normalizedName });
      }
    }
  }
  candidates.sort((a, b) => candidateSortScore(b) - candidateSortScore(a) || String(a.nome || "").localeCompare(String(b.nome || "")));
  return candidates;
}

function findUserFallbackForRecipient(recipient = {}, papel = "Equipe") {
  if (!recipient || !tableExists("users")) return null;
  const userId = Number(recipient.user_id || 0);
  if (userId) return queryUserById(userId, papel);

  const wanted = normalizeLookupText(recipient.nome || recipient.name || recipient.colaborador_nome || "");
  if (!wanted) return null;
  const cols = tableColumns("users");
  const nameCol = getExistingColumns("users", ["name", "nome", "usuario_nome"])[0];
  if (!nameCol) return null;
  const rows = db.prepare(`SELECT id, ${nameCol} AS nome FROM users`).all();
  for (const row of rows) {
    if (normalizeLookupText(row.nome) === wanted) return queryUserById(row.id, papel);
  }
  return null;
}

function applyUserPhoneFallback(recipient = {}, papel = "Equipe") {
  if (!recipient) return recipient;
  const normalized = normalizeRecipient(recipient, papel, recipient.origem);
  if (getRecipientPhone(normalized)) return normalized;
  const fallbackUser = findUserFallbackForRecipient(normalized, papel);
  const fallbackPhone = getRecipientPhone(fallbackUser || {});
  if (!fallbackPhone) return normalized;
  return normalizeRecipient({
    ...normalized,
    user_id: normalized.user_id || fallbackUser.user_id || fallbackUser.id,
    user_name: normalized.user_name || fallbackUser.nome || fallbackUser.name,
    user_telefone_whatsapp: fallbackUser.user_telefone_whatsapp || fallbackUser.telefone_whatsapp || fallbackPhone,
    telefone_whatsapp: fallbackPhone,
    telefone_herdado_de_user_id: fallbackUser.user_id || fallbackUser.id,
    origem_telefone: `users.id = ${fallbackUser.user_id || fallbackUser.id}`,
  }, papel, normalized.origem);
}

function mergeRecipients(existing, incoming) {
  const existingIsColaborador = !!existing.colaborador_id || existing.tabela_origem === "colaboradores";
  const incomingIsColaborador = !!incoming.colaborador_id || incoming.tabela_origem === "colaboradores";
  const primary = incomingIsColaborador && !existingIsColaborador ? incoming : existing;
  const secondary = primary === existing ? incoming : existing;
  const primaryPhone = getRecipientPhone(primary);
  const secondaryPhone = getRecipientPhone(secondary);
  const merged = {
    ...secondary,
    ...primary,
    user_id: primary.user_id || secondary.user_id || null,
    colaborador_id: primary.colaborador_id || secondary.colaborador_id || null,
    user_telefone_whatsapp: primary.user_telefone_whatsapp || secondary.user_telefone_whatsapp || null,
    colaborador_telefone_whatsapp: primary.colaborador_telefone_whatsapp || secondary.colaborador_telefone_whatsapp || null,
    telefone_whatsapp: primaryPhone ? primary.telefone_whatsapp : (secondary.telefone_whatsapp || secondaryPhone || primary.telefone_whatsapp || null),
    telefone_herdado_de_user_id: primary.telefone_herdado_de_user_id || secondary.telefone_herdado_de_user_id || (!primaryPhone && secondary.user_id ? secondary.user_id : null),
    origem_telefone: primary.origem_telefone || (!primaryPhone && secondaryPhone && secondary.user_id ? `users.id = ${secondary.user_id}` : secondary.origem_telefone || null),
  };
  merged.telefone_normalizado = getRecipientPhone(merged) || primaryPhone || secondaryPhone;
  return merged;
}

function shouldMergeRecipients(a = {}, b = {}) {
  if (!a || !b) return false;
  if (a.colaborador_id && b.colaborador_id && Number(a.colaborador_id) === Number(b.colaborador_id)) return true;
  if (a.user_id && b.user_id && Number(a.user_id) === Number(b.user_id)) return true;
  const aName = normalizeLookupText(a.nome || a.name || a.user_name || a.colaborador_nome || "");
  const bName = normalizeLookupText(b.nome || b.name || b.user_name || b.colaborador_nome || "");
  if (!aName || aName !== bName) return false;
  const aIsColaborador = !!a.colaborador_id || a.tabela_origem === "colaboradores";
  const bIsColaborador = !!b.colaborador_id || b.tabela_origem === "colaboradores";
  return aIsColaborador !== bIsColaborador || !!getRecipientPhone(a) || !!getRecipientPhone(b);
}

function resolveAmbiguity(candidates = [], rawName = "") {
  if (!candidates.length) return { selected: null, warning: null };
  const topScore = candidateSortScore(candidates[0]);
  const tied = candidates.filter((c) => candidateSortScore(c) === topScore);
  const selected = candidates[0];
  const distinct = new Set(tied.map((c) => c.origem || `${c.tabela_origem}:${c.id}`));
  const warning = distinct.size > 1
    ? `Mais de um cadastro encontrado para ${String(rawName || selected.nome || "responsável").trim()}. Ajuste o vínculo do responsável da OS.`
    : null;
  return { selected: { ...selected, aviso_ambiguidade: warning }, warning };
}

function collectRoleSpecs(os = {}) {
  return [
    { papel: "Executor", idFields: ["executor_colaborador_id", "colaborador_id", "responsavel_colaborador_id", "responsavel_id"], table: "colaboradores", textFields: ["executor_nome", "mecanico_nome", "executor_user_nome", "responsavel_nome", "responsavel", "executor_nome_textual", "executor"] },
    { papel: "Executor", idFields: ["responsavel_user_id", "mecanico_user_id", "executor_user_id", "usuario_id", "user_id", "executor_id", "responsavel_id"], table: "users", textFields: ["executor_nome", "mecanico_nome", "executor_user_nome", "responsavel_nome", "responsavel", "executor_nome_textual", "executor"] },
    { papel: "Executor", idFields: ["funcionario_id", "executor_funcionario_id", "responsavel_funcionario_id"], table: "funcionarios", textFields: ["executor_nome", "mecanico_nome", "responsavel_nome", "responsavel"] },
    { papel: "Executor", idFields: ["mecanico_id", "executor_mecanico_id", "responsavel_mecanico_id"], table: "mecanicos", textFields: ["executor_nome", "mecanico_nome", "responsavel_nome", "responsavel"] },
    { papel: "Apoio operacional", idFields: ["auxiliar_colaborador_id", "apoio_operacional_colaborador_id"], table: "colaboradores", textFields: ["auxiliar_nome", "auxiliar_user_nome", "apoio_operacional_nome", "apoio_nome"] },
    { papel: "Apoio operacional", idFields: ["auxiliar_user_id", "apoio_operacional_user_id", "auxiliar_id"], table: "users", textFields: ["auxiliar_nome", "auxiliar_user_nome", "apoio_operacional_nome", "apoio_nome"] },
    { papel: "2º mecânico", idFields: ["executor_secundario_colaborador_id", "segundo_mecanico_colaborador_id", "mecanico_2_colaborador_id"], table: "colaboradores", textFields: ["executor_secundario_nome", "segundo_mecanico_nome", "mecanico_2_nome"] },
    { papel: "2º mecânico", idFields: ["executor_secundario_user_id", "segundo_mecanico_user_id", "mecanico_2_user_id"], table: "users", textFields: ["executor_secundario_nome", "segundo_mecanico_nome", "mecanico_2_nome"] },
    { papel: "Apoio operacional secundário", idFields: ["auxiliar_secundario_colaborador_id", "apoio_secundario_colaborador_id"], table: "colaboradores", textFields: ["auxiliar_secundario_nome", "apoio_secundario_nome"] },
    { papel: "Apoio operacional secundário", idFields: ["auxiliar_secundario_user_id", "apoio_secundario_user_id"], table: "users", textFields: ["auxiliar_secundario_nome", "apoio_secundario_nome"] },
  ].map((spec) => ({ ...spec, ids: spec.idFields.map((f) => [f, os[f]]).filter(([, value]) => Number(value || 0)), names: spec.textFields.map((f) => [f, os[f]]).filter(([, value]) => String(value || "").trim()) }));
}

function dedupeRecipients(recipients = []) {
  const result = [];
  for (const recipient of recipients) {
    if (!recipient) continue;
    const normalized = applyUserPhoneFallback(recipient, recipient.papel || "Equipe");
    const phone = getRecipientPhone(normalized);
    const existingIndex = result.findIndex((item) => shouldMergeRecipients(item, normalized));
    if (existingIndex >= 0) {
      result[existingIndex] = mergeRecipients(result[existingIndex], { ...normalized, telefone_normalizado: phone });
      continue;
    }
    result.push({ ...normalized, telefone_normalizado: phone });
  }
  return result;
}

function getOSRawById(osId) {
  if (!tableExists("os")) return null;
  return db.prepare("SELECT * FROM os WHERE id = ?").get(Number(osId));
}

function resolveWhatsappDestinatariosDaOS(osIdOrOs) {
  const os = typeof osIdOrOs === "object" && osIdOrOs ? osIdOrOs : getOSRawById(osIdOrOs);
  if (!os) return [];
  const recipients = [];
  const diagnostics = [];
  for (const spec of collectRoleSpecs(os)) {
    let resolved = null;
    for (const [field, id] of spec.ids) {
      resolved = queryGenericPersonById(spec.table, id, spec.papel);
      diagnostics.push({ papel: spec.papel, campo: field, valor: id, origem_tentada: `${spec.table}.id`, encontrado: !!resolved });
      if (resolved) break;
    }
    if (!resolved) {
      for (const [field, name] of spec.names) {
        const candidates = findPeopleByName(name, spec.papel);
        const { selected, warning } = resolveAmbiguity(candidates, name);
        diagnostics.push({ papel: spec.papel, campo: field, valor: name, origem_tentada: "busca por nome normalizado", encontrados: candidates.length, aviso: warning });
        if (selected) {
          resolved = { ...selected, origem: selected.origem || `nome textual: ${field}`, campo_nome_textual: field };
          break;
        }
      }
    }
    if (resolved) recipients.push(resolved);
  }
  const deduped = dedupeRecipients(recipients);
  Object.defineProperty(deduped, "diagnostics", { value: diagnostics, enumerable: false });
  return deduped;
}

function getUsuariosEquipeOS(os = {}) {
  return resolveWhatsappDestinatariosDaOS(os);
}

function getUsuarioResponsavelOS(os = {}) {
  const usuarios = getUsuariosEquipeOS(os);
  return usuarios.find((usuario) => getRecipientPhone(usuario)) || usuarios[0] || null;
}

function getRecipientPhone(usuario = {}) {
  return normalizePhone(usuario.telefone_whatsapp || usuario.colaborador_telefone_whatsapp || usuario.user_telefone_whatsapp || usuario.colaborador_telefone || usuario.telefone || usuario.celular || usuario.whatsapp);
}

function getRecipientUserId(usuario = {}) {
  return Number(usuario.user_id || usuario.id || 0) || null;
}

function sanitizeError(err) {
  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || "");
  let msg = String(err?.message || err || "Erro desconhecido");
  if (token) msg = msg.split(token).join("[token]");
  return msg.slice(0, 500);
}

function hasSameEventStatus({ osId, usuarioId, telefone, tipoEvento, status }) {
  if (!tableExists("os_whatsapp_notificacoes")) return false;
  const normalizedOsId = Number(osId || 0);
  const normalizedUserId = Number(usuarioId || 0) || null;
  if (normalizedUserId) {
    return !!db.prepare(`
      SELECT 1 FROM os_whatsapp_notificacoes
      WHERE os_id = ? AND usuario_id = ? AND tipo_evento = ? AND status = ?
      LIMIT 1
    `).get(normalizedOsId, normalizedUserId, tipoEvento, status);
  }
  return !!db.prepare(`
    SELECT 1 FROM os_whatsapp_notificacoes
    WHERE os_id = ?
      AND usuario_id IS NULL
      AND IFNULL(telefone,'') = IFNULL(?, '')
      AND tipo_evento = ?
      AND status = ?
    LIMIT 1
  `).get(normalizedOsId, telefone || null, tipoEvento, status);
}

function insertLog({ osId, usuarioId, telefone, tipoEvento, provider, status, mensagem, mediaUrl, erro, criadoPor }) {
  if (!tableExists("os_whatsapp_notificacoes")) return null;
  if (["SEM_TELEFONE", "WHATSAPP_DESATIVADO"].includes(status) && hasSameEventStatus({ osId, usuarioId, telefone, tipoEvento, status })) return null;
  const info = db.prepare(`
    INSERT INTO os_whatsapp_notificacoes (os_id, usuario_id, telefone, tipo_evento, provider, status, mensagem, media_url, erro, criado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(Number(osId), usuarioId || null, telefone || null, tipoEvento, provider, status, mensagem || null, mediaUrl || null, erro || null, criadoPor || null);
  return Number(info.lastInsertRowid || 0) || null;
}

function hasSentAutomatic({ osId, usuarioId, telefone, tipoEvento }) {
  if (!tableExists("os_whatsapp_notificacoes")) return false;
  if (usuarioId) {
    return !!db.prepare(`
      SELECT 1 FROM os_whatsapp_notificacoes
      WHERE os_id = ? AND usuario_id = ? AND tipo_evento = ? AND status IN ('ENVIADO','MANUAL_LINK_GERADO')
      LIMIT 1
    `).get(Number(osId), usuarioId, tipoEvento);
  }
  return !!db.prepare(`
    SELECT 1 FROM os_whatsapp_notificacoes
    WHERE os_id = ? AND IFNULL(telefone,'') = IFNULL(?, '') AND tipo_evento = ? AND status IN ('ENVIADO','MANUAL_LINK_GERADO')
    LIMIT 1
  `).get(Number(osId), telefone || null, tipoEvento);
}

function listOsNotificationLogs(osId, { limit = 50 } = {}) {
  if (!tableExists("os_whatsapp_notificacoes")) return [];
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 50)));
  return db.prepare(`
    SELECT n.*, COALESCE(u.name, c.nome) AS usuario_nome
    FROM os_whatsapp_notificacoes n
    LEFT JOIN users u ON u.id = n.usuario_id
    LEFT JOIN colaboradores c ON c.user_id = n.usuario_id
    WHERE n.os_id = ?
    ORDER BY datetime(n.enviado_em) DESC, n.id DESC
    LIMIT ?
  `).all(Number(osId), safeLimit);
}

function getLastOsNotification(osId) {
  return listOsNotificationLogs(osId)[0] || null;
}

function generateWaMeLink({ phone, message }) {
  const normalized = normalizePhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(String(message || ""))}`;
}

async function postCloudApi(payload) {
  const version = String(process.env.WHATSAPP_API_VERSION || "v20.0").trim() || "v20.0";
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  if (!phoneNumberId || !token) throw new Error("Configuração da WhatsApp Cloud API incompleta.");

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Falha WhatsApp Cloud API: ${apiMessage}`);
  }
  return data;
}

async function sendTextMessage({ to, message }) {
  return postCloudApi({
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "text",
    text: { preview_url: false, body: String(message || "") },
  });
}

async function sendMediaMessage({ to, message, mediaUrl, mediaType }) {
  const type = ["image", "video", "document"].includes(mediaType) ? mediaType : "document";
  const payload = {
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type,
    [type]: type === "document"
      ? { link: mediaUrl, caption: String(message || "") }
      : { link: mediaUrl, caption: String(message || "") },
  };
  return postCloudApi(payload);
}

async function sendOsNotification({ os, usuario, tipoEvento, criadoPor } = {}) {
  const provider = getProvider();
  const media = getOsAberturaMedia(os?.id);
  const osForMessage = { ...(os || {}), has_abertura_media: media.hasMedia };
  const mensagem = buildOsWhatsappMessage(osForMessage);
  const mediaUrl = media.publicUrl || null;
  let usuarioId = null;
  let telefone = null;

  try {
    if (provider === "disabled") {
      insertLog({ osId: os?.id, usuarioId: null, telefone: null, tipoEvento, provider, status: "WHATSAPP_DESATIVADO", mensagem, mediaUrl, erro: "WhatsApp desativado. Configure WHATSAPP_PROVIDER=manual ou cloud_api.", criadoPor });
      return { ok: false, status: "WHATSAPP_DESATIVADO", message: "WhatsApp desativado. Configure WHATSAPP_PROVIDER=manual ou cloud_api." };
    }

    const resolvedUsuario = usuario || getUsuarioResponsavelOS(os || {});
    usuarioId = getRecipientUserId(resolvedUsuario || {});
    telefone = getRecipientPhone(resolvedUsuario || {});

    if (!telefone) {
      insertLog({ osId: os?.id, usuarioId, telefone: null, tipoEvento, provider, status: "SEM_TELEFONE", mensagem, mediaUrl, erro: "Nenhum telefone encontrado nas tabelas de pessoas vinculadas à OS.", criadoPor });
      return { ok: false, status: "SEM_TELEFONE", message: "Responsável sem número de WhatsApp cadastrado." };
    }

    if (AUTO_EVENTS.has(String(tipoEvento || "")) && hasSentAutomatic({ osId: os?.id, usuarioId, telefone, tipoEvento })) {
      return { ok: true, status: "DUPLICADO_IGNORADO" };
    }

    if (provider === "manual") {
      const waMeLink = generateWaMeLink({ phone: telefone, message: mediaUrl ? `${mensagem}\n\n📎 Anexo: ${mediaUrl}` : mensagem });
      insertLog({ osId: os?.id, usuarioId, telefone, tipoEvento, provider, status: "MANUAL_LINK_GERADO", mensagem, mediaUrl, criadoPor });
      return { ok: true, status: "MANUAL_LINK_GERADO", waMeLink };
    }

    if (provider !== "cloud_api") {
      insertLog({ osId: os?.id, usuarioId, telefone, tipoEvento, provider, status: "SEM_PROVIDER", mensagem, mediaUrl, erro: "Provider inválido ou não configurado.", criadoPor });
      return { ok: false, status: "SEM_PROVIDER" };
    }

    if (media.hasMedia && media.mediaType === "image" && media.publicUrl) {
      await sendMediaMessage({ to: telefone, message: mensagem, mediaUrl: media.publicUrl, mediaType: "image" });
    } else {
      const obs = media.hasMedia && !media.publicUrl ? "\n\n📎 Há mídia de abertura, mas sem URL pública configurada." : "";
      await sendTextMessage({ to: telefone, message: `${mensagem}${obs}` });
    }

    insertLog({ osId: os?.id, usuarioId, telefone, tipoEvento, provider, status: "ENVIADO", mensagem, mediaUrl, criadoPor });
    return { ok: true, status: "ENVIADO" };
  } catch (err) {
    const erro = sanitizeError(err);
    insertLog({ osId: os?.id, usuarioId, telefone, tipoEvento, provider, status: "ERRO", mensagem, mediaUrl, erro, criadoPor });
    return { ok: false, status: "ERRO", error: erro };
  }
}

async function sendOsTeamNotifications({ os, tipoEvento, criadoPor } = {}) {
  const provider = getProvider();
  if (provider === "disabled") {
    const result = await sendOsNotification({ os, usuario: null, tipoEvento, criadoPor });
    return { ok: false, total: 0, sent: 0, results: [result], recipients: [], generatedLinks: [] };
  }

  const recipients = getUsuariosEquipeOS(os || {});
  if (!recipients.length) {
    const result = await sendOsNotification({ os, usuario: null, tipoEvento, criadoPor });
    return { ok: !!result?.ok, total: 0, sent: result?.status === "ENVIADO" ? 1 : 0, results: [result], recipients: [], generatedLinks: result?.waMeLink ? [result.waMeLink] : [] };
  }

  const results = [];
  for (const usuario of recipients) {
    // Envia a mesma OS para executor e apoio operacional para todos saberem quem compõe a equipe.
    // A deduplicação continua por OS + destinatário + evento para não repetir disparos automáticos.
    // eslint-disable-next-line no-await-in-loop
    results.push(await sendOsNotification({ os, usuario, tipoEvento, criadoPor }));
  }

  return {
    ok: results.some((r) => r?.ok),
    total: recipients.length,
    sent: results.filter((r) => r?.status === "ENVIADO").length,
    generatedLinks: results.filter((r) => r?.waMeLink).map((r) => r.waMeLink),
    results,
    recipients,
  };
}


function getWhatsappOsDiagnostic(osId, osDetalhada = null) {
  const os = osDetalhada || getOSRawById(osId);
  const provider = getProvider();
  const destinatarios = resolveWhatsappDestinatariosDaOS(os || osId);
  const responsavel = destinatarios.find((destinatario) => getRecipientPhone(destinatario)) || destinatarios[0] || null;
  const media = getOsAberturaMedia(os?.id || osId);
  const mensagem = buildOsWhatsappMessage({ ...(os || {}), has_abertura_media: media.hasMedia });
  const telefone = responsavel ? getRecipientPhone(responsavel) : "";
  return {
    os,
    responsavel_bruto: os ? {
      executor_colaborador_id: os.executor_colaborador_id || null,
      responsavel_user_id: os.responsavel_user_id || null,
      mecanico_user_id: os.mecanico_user_id || null,
      auxiliar_colaborador_id: os.auxiliar_colaborador_id || null,
      auxiliar_user_id: os.auxiliar_user_id || null,
      executor_nome: os.executor_nome || os.mecanico_nome || os.responsavel_nome || os.responsavel || null,
      auxiliar_nome: os.auxiliar_nome || null,
    } : null,
    responsavel_resolvido: responsavel,
    telefone_encontrado: telefone || null,
    provider,
    destinatarios,
    diagnostico_busca: destinatarios.diagnostics || [],
    mensagem,
    waMeLink: provider === "manual" && telefone ? generateWaMeLink({ phone: telefone, message: media.publicUrl ? `${mensagem}\n\n📎 Anexo: ${media.publicUrl}` : mensagem }) : null,
  };
}

module.exports = {
  buildOsWhatsappMessage,
  getOsAberturaMedia,
  getUsuarioResponsavelOS,
  getUsuariosEquipeOS,
  resolveWhatsappDestinatariosDaOS,
  getWhatsappOsDiagnostic,
  sendOsNotification,
  sendOsTeamNotifications,
  sendTextMessage,
  sendMediaMessage,
  generateWaMeLink,
  listOsNotificationLogs,
  getLastOsNotification,
  getProvider,
};
