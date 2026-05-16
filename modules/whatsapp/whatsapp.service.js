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
  const raw = String(process.env.WHATSAPP_PROVIDER || "").trim().toLowerCase();
  if (!raw) return "disabled";
  return raw;
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

function getColaboradorRecipient(colaboradorId, papel = "Equipe") {
  const id = Number(colaboradorId || 0);
  if (!id || !tableExists("colaboradores")) return null;
  const cCols = tableColumns("colaboradores");
  const hasUsers = tableExists("users");
  const uCols = hasUsers ? tableColumns("users") : [];
  return db.prepare(`
    SELECT c.id AS colaborador_id,
           c.nome AS name,
           c.nome AS colaborador_nome,
           c.user_id AS id,
           c.user_id AS user_id,
           ? AS papel,
           ${cCols.includes("telefone_whatsapp") ? "c.telefone_whatsapp" : "NULL"} AS colaborador_telefone_whatsapp,
           ${cCols.includes("telefone") ? "c.telefone" : "NULL"} AS colaborador_telefone,
           ${hasUsers ? "u.name" : "NULL"} AS user_name,
           ${hasUsers && uCols.includes("telefone_whatsapp") ? "u.telefone_whatsapp" : "NULL"} AS user_telefone_whatsapp
    FROM colaboradores c
    ${hasUsers ? "LEFT JOIN users u ON u.id = c.user_id" : ""}
    WHERE c.id = ?
  `).get(papel, id);
}

function getUserRecipient(userId, papel = "Equipe") {
  const id = Number(userId || 0);
  if (!id || !tableExists("users")) return null;
  const cols = tableColumns("users");
  return db.prepare(`
    SELECT id, id AS user_id, name, name AS user_name, ? AS papel,
           ${cols.includes("telefone_whatsapp") ? "telefone_whatsapp" : "NULL"} AS user_telefone_whatsapp
    FROM users
    WHERE id = ?
  `).get(papel, id);
}

function dedupeRecipients(recipients = []) {
  const seen = new Set();
  const result = [];
  for (const recipient of recipients) {
    if (!recipient) continue;
    const phone = getRecipientPhone(recipient);
    const key = recipient.colaborador_id
      ? `c:${recipient.colaborador_id}`
      : (recipient.user_id ? `u:${recipient.user_id}` : `p:${phone || recipient.name || result.length}`);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...recipient, telefone_normalizado: phone });
  }
  return result;
}

function getUsuariosEquipeOS(os = {}) {
  const recipients = [];
  const colabRoles = [
    [os.executor_colaborador_id, "Executor"],
    [os.auxiliar_colaborador_id, "Apoio operacional"],
    [os.executor_secundario_colaborador_id, "Executor secundário"],
    [os.auxiliar_secundario_colaborador_id, "Apoio operacional secundário"],
  ];
  for (const [id, papel] of colabRoles) recipients.push(getColaboradorRecipient(id, papel));

  if (!recipients.some((r) => r?.papel === "Executor")) {
    recipients.push(getUserRecipient(os.mecanico_user_id || os.executor_user_id, "Executor"));
  }
  if (!recipients.some((r) => r?.papel === "Apoio operacional")) {
    recipients.push(getUserRecipient(os.auxiliar_user_id, "Apoio operacional"));
  }

  return dedupeRecipients(recipients);
}

function getUsuarioResponsavelOS(os = {}) {
  return getUsuariosEquipeOS(os)[0] || null;
}

function getRecipientPhone(usuario = {}) {
  return normalizePhone(usuario.colaborador_telefone_whatsapp || usuario.telefone_whatsapp || usuario.user_telefone_whatsapp || usuario.colaborador_telefone);
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
  if (status === "SEM_TELEFONE" && hasSameEventStatus({ osId, usuarioId, telefone, tipoEvento, status })) return null;
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
      WHERE os_id = ? AND usuario_id = ? AND tipo_evento = ? AND status = 'ENVIADO'
      LIMIT 1
    `).get(Number(osId), usuarioId, tipoEvento);
  }
  return !!db.prepare(`
    SELECT 1 FROM os_whatsapp_notificacoes
    WHERE os_id = ? AND IFNULL(telefone,'') = IFNULL(?, '') AND tipo_evento = ? AND status = 'ENVIADO'
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
  const resolvedUsuario = usuario || getUsuarioResponsavelOS(os || {});
  const usuarioId = getRecipientUserId(resolvedUsuario || {});
  const telefone = getRecipientPhone(resolvedUsuario || {});
  const media = getOsAberturaMedia(os?.id);
  const osForMessage = { ...(os || {}), has_abertura_media: media.hasMedia };
  const mensagem = buildOsWhatsappMessage(osForMessage);
  const mediaUrl = media.publicUrl || null;

  try {
    if (!telefone) {
      insertLog({ osId: os?.id, usuarioId, telefone: null, tipoEvento, provider, status: "SEM_TELEFONE", mensagem, mediaUrl, criadoPor });
      return { ok: false, status: "SEM_TELEFONE", message: "Responsável sem número de WhatsApp cadastrado." };
    }

    if (provider === "disabled") {
      insertLog({ osId: os?.id, usuarioId, telefone, tipoEvento, provider, status: "IGNORADO", mensagem, mediaUrl, erro: "Provider desabilitado.", criadoPor });
      return { ok: true, status: "IGNORADO" };
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
  const recipients = getUsuariosEquipeOS(os || {});
  if (!recipients.length) {
    const result = await sendOsNotification({ os, usuario: null, tipoEvento, criadoPor });
    return { ok: !!result?.ok, total: 0, sent: result?.status === "ENVIADO" ? 1 : 0, results: [result], recipients: [] };
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

module.exports = {
  buildOsWhatsappMessage,
  getOsAberturaMedia,
  getUsuarioResponsavelOS,
  getUsuariosEquipeOS,
  sendOsNotification,
  sendOsTeamNotifications,
  sendTextMessage,
  sendMediaMessage,
  generateWaMeLink,
  listOsNotificationLogs,
  getLastOsNotification,
  getProvider,
};
