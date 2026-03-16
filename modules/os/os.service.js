const db = require("../../database/db");
const { classifyOSPriority } = require("./os-priority.service");
const osIAService = require("./os-ia.service");
const alertsHub = require("../alerts/alerts.hub");
const alertsService = require("../alerts/alerts.service");
const pushService = require("../push/push.service");
const escalaService = require("../escala/escala.service");
let inspecaoService = null;
try {
  inspecaoService = require("../inspecao/inspecao.service");
} catch (_e) {}

function getOSColumns() {
  return db.prepare(`PRAGMA table_info(os)`).all().map((c) => c.name);
}

function tableExists(name) {
  try {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(String(name || ""));
    return !!row;
  } catch (_e) {
    return false;
  }
}

function getTableColumns(tableName) {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map((c) => c.name);
  } catch (_e) {
    return [];
  }
}

function resolveAnexosTable() {
  if (tableExists("os_anexos")) return "os_anexos";
  if (tableExists("anexos")) return "anexos";
  return null;
}

function resolveGrauColumn(columns) {
  if (columns.includes("grau")) return "grau";
  if (columns.includes("grau_dificuldade")) return "grau_dificuldade";
  if (columns.includes("nivel_grau")) return "nivel_grau";
  return null;
}

function normalizeTipoOS(tipo) {
  const raw = String(tipo || "CORRETIVA").trim().toUpperCase();
  if (raw === "NR12") return "NRS";
  if (["CORRETIVA", "PREVENTIVA", "ELETRICA", "NRS", "OUTROS"].includes(raw)) return raw;
  return "OUTROS";
}

function normalizeGrau(grau) {
  const raw = String(grau || "MEDIA").trim().toUpperCase();
  if (["BAIXA", "MEDIA", "ALTA", "CRITICA"].includes(raw)) return raw;
  if (raw === "MÉDIA") return "MEDIA";
  if (raw === "CRÍTICA") return "CRITICA";
  return "MEDIA";
}

function normalizeColaboradorFuncao(funcao) {
  const raw = String(funcao || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  if (raw.includes("MECAN")) return "MECANICO";
  if (raw.includes("AUXILIAR")) return "AUXILIAR";
  if (raw.includes("OPERACIONAL") || raw.includes("APOIO")) return "APOIO";
  return "APOIO";
}

function getTurnoAtual() {
  return getTurnoAgora();
}

function getEscalaSemanaAtual() {
  return getSemanaAtual();
}

function getPessoasDoTurnoAtual() {
  const semanaAtual = getEscalaSemanaAtual();
  if (!semanaAtual?.id || !tableExists("escala_alocacoes") || !tableExists("colaboradores")) return [];

  const turnoAtual = getTurnoAtual();
  const turnosPermitidos = turnoAtual === "NOITE"
    ? ["plantao", "noturno"]
    : ["diurno", "apoio"];

  const placeholders = turnosPermitidos.map(() => "?").join(",");
  const usersJoin = tableExists("users");
  const rows = db.prepare(`
    SELECT c.user_id,
           ${usersJoin ? "u.name" : "c.nome"} AS nome,
           c.funcao,
           a.tipo_turno
    FROM escala_alocacoes a
    JOIN colaboradores c ON c.id = a.colaborador_id
    ${usersJoin ? "LEFT JOIN users u ON u.id = c.user_id" : ""}
    WHERE a.semana_id = ?
      AND a.tipo_turno IN (${placeholders})
      AND c.user_id IS NOT NULL
      AND IFNULL(c.ativo,1) = 1
    ORDER BY nome ASC
  `).all(semanaAtual.id, ...turnosPermitidos);

  return rows
    .map((row) => ({
      user_id: Number(row.user_id),
      nome: row.nome,
      funcao: normalizeColaboradorFuncao(row.funcao),
      tipo_turno: String(row.tipo_turno || "").toUpperCase(),
    }))
    .filter((row) => row.user_id && row.nome);
}

function isUserOcupado(userId) {
  if (!userId || !tableExists("os_execucoes")) return false;
  const execCols = getTableColumns("os_execucoes");
  const executorCol = execCols.includes("executor_user_id") ? "executor_user_id" : "mecanico_user_id";
  const row = db.prepare(`
    SELECT 1 FROM os_execucoes
    WHERE finalizado_em IS NULL
      AND (${executorCol} = ? OR auxiliar_user_id = ?)
    LIMIT 1
  `).get(Number(userId), Number(userId));
  return !!row;
}

function getPlantonistaNoite() {
  const candidatos = getColaboradoresTurnoAtual("NOITE");
  return candidatos.find((c) => normalizeColaboradorFuncao(c.funcao) === "MECANICO") || null;
}

function listEquipamentosAtivos() {
  try {
    return db.prepare(`SELECT id, nome FROM equipamentos WHERE ativo = 1 ORDER BY nome`).all();
  } catch (_e) {
    return [];
  }
}

function listTipoOptions() {
  return ["CORRETIVA", "PREVENTIVA", "ELETRICA", "NRS", "OUTROS"];
}

function listGrauOptions() {
  return ["BAIXA", "MEDIA", "ALTA", "CRITICA"];
}

function listAnexos(osId, tipo) {
  try {
    const table = resolveAnexosTable();
    if (!table) return [];

    const t = String(tipo || "").toUpperCase();

    if (table === "os_anexos") {
      return db
        .prepare(
          `SELECT id, os_id, tipo, path, legenda, created_at
           FROM os_anexos
           WHERE os_id = ? AND tipo = ?
           ORDER BY id DESC`
        )
        .all(osId, t);
    }

    return db
      .prepare(
        `SELECT id,
                owner_id AS os_id,
                UPPER(CASE
                  WHEN filename LIKE '%fechamento%' THEN 'FECHAMENTO'
                  ELSE 'ABERTURA'
                END) AS tipo,
                filepath AS path,
                filename AS legenda,
                uploaded_at AS created_at
         FROM anexos
         WHERE owner_type = 'os' AND owner_id = ?
         ORDER BY id DESC`
      )
      .all(osId)
      .filter((row) => row.tipo === t);
  } catch (_e) {
    return [];
  }
}

function listPecasUtilizadas(osId) {
  try {
    return db
      .prepare(
        `SELECT id, os_id, peca_descricao, quantidade, created_at
         FROM os_pecas_utilizadas
         WHERE os_id = ?
         ORDER BY id`
      )
      .all(osId);
  } catch (_e) {
    return [];
  }
}

function listAlocacoesEquipe(osId) {
  if (!tableExists("os_alocacoes")) return [];
  const cols = getTableColumns("os_alocacoes");
  if (cols.includes("mecanico_user_id") && cols.includes("auxiliar_user_id")) {
    return db
      .prepare(
        `SELECT oa.id,
                oa.os_id,
                oa.alocado_em AS created_at,
                m.id AS mecanico_user_id,
                m.name AS mecanico_nome,
                a.id AS auxiliar_user_id,
                a.name AS auxiliar_nome
         FROM os_alocacoes oa
         JOIN users m ON m.id = oa.mecanico_user_id
         JOIN users a ON a.id = oa.auxiliar_user_id
         WHERE oa.os_id = ?
         ORDER BY oa.id DESC`
      )
      .all(osId);
  }

  return db
    .prepare(
      `SELECT oa.id,
              oa.os_id,
              oa.user_id,
              oa.papel,
              oa.created_at,
              u.name,
              UPPER(COALESCE(NULLIF(${getTableColumns('users').includes('funcao') ? 'u.funcao' : "''"}, ''), CASE WHEN UPPER(u.role)='MECANICO' THEN 'MECANICO' ELSE 'AUXILIAR' END)) AS funcao
       FROM os_alocacoes oa
       JOIN users u ON u.id = oa.user_id
       WHERE oa.os_id = ?
       ORDER BY CASE oa.papel WHEN 'RESPONSAVEL' THEN 0 ELSE 1 END, oa.id ASC`
    )
    .all(osId);
}


function getExecucaoAtiva(osId) {
  if (!tableExists("os_execucoes")) return null;
  const execCols = getTableColumns("os_execucoes");
  const executorCol = execCols.includes("executor_user_id") ? "executor_user_id" : "mecanico_user_id";
  return db.prepare(`
    SELECT ex.*, u.name AS executor_nome, ua.name AS auxiliar_nome
    FROM os_execucoes ex
    LEFT JOIN users u ON u.id = ex.${executorCol}
    LEFT JOIN users ua ON ua.id = ex.auxiliar_user_id
    WHERE ex.os_id = ? AND ex.finalizado_em IS NULL
    ORDER BY ex.id DESC
    LIMIT 1
  `).get(Number(osId));
}

function isOcupado(userId) {
  return isUserOcupado(userId);
}

function getDisponiveis(turnoUsers, funcao, { considerarOcupacao = true } = {}) {
  return (turnoUsers || [])
    .filter((u) => {
      if (!funcao) return true;
      return String(u.funcao || "").toLowerCase() === String(funcao || "").toLowerCase();
    })
    .filter((u) => (considerarOcupacao ? !isOcupado(u.id) : true));
}

function getParesAtivosDisponiveis(turnoUsers) {
  if (!tableExists("os_pares_equipes")) return [];
  const userIdsTurno = new Set((turnoUsers || []).map((u) => Number(u.id)));
  const pares = db.prepare(`
    SELECT p.mecanico_user_id, p.auxiliar_user_id, m.name AS mecanico_nome, a.name AS auxiliar_nome
    FROM os_pares_equipes p
    JOIN users m ON m.id = p.mecanico_user_id
    JOIN users a ON a.id = p.auxiliar_user_id
    WHERE IFNULL(p.ativo,1) = 1
    ORDER BY m.name ASC
  `).all();

  return pares.filter((p) =>
    userIdsTurno.has(Number(p.mecanico_user_id))
    && userIdsTurno.has(Number(p.auxiliar_user_id))
    && !isOcupado(p.mecanico_user_id)
    && !isOcupado(p.auxiliar_user_id)
  );
}

function pickNextMecanicoRoundRobin(listaMecanicosDisponiveis) {
  const ordenados = [...(listaMecanicosDisponiveis || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  if (!ordenados.length) return null;
  const ultimoMecanicoId = Number(getConfig("ultimo_mecanico_id") || 0) || null;
  const idx = ultimoMecanicoId ? ordenados.findIndex((m) => Number(m.id) === ultimoMecanicoId) : -1;
  const escolhido = idx >= 0 ? (ordenados[idx + 1] || ordenados[0]) : ordenados[0];
  setConfig("ultimo_mecanico_id", Number(escolhido.id));
  return escolhido;
}

function createExecucao(osId, executorUserId, auxiliarUserId, alocadoPorUserId, observacao = null, turnoAlocacao = null) {
  const cols = tableExists("os_execucoes") ? getTableColumns("os_execucoes") : [];
  const executorCol = cols.includes("executor_user_id") ? "executor_user_id" : "mecanico_user_id";
  const hasAux = cols.includes("auxiliar_user_id");
  const hasAlocadoPor = cols.includes("alocado_por");
  const hasObs = cols.includes("observacao");
  const hasTurno = cols.includes("turno_alocacao");
  const fields = ["os_id", executorCol, "iniciado_em"];
  const placeholders = ["?", "?", "datetime('now')"];
  const args = [Number(osId), Number(executorUserId)];

  if (hasAux) {
    fields.push("auxiliar_user_id");
    placeholders.push("?");
    args.push(auxiliarUserId ? Number(auxiliarUserId) : null);
  }
  if (hasAlocadoPor) {
    fields.push("alocado_por");
    placeholders.push("?");
    args.push(alocadoPorUserId ? Number(alocadoPorUserId) : null);
  }
  if (hasObs) {
    fields.push("observacao");
    placeholders.push("?");
    args.push(observacao || null);
  }
  if (hasTurno) {
    fields.push("turno_alocacao");
    placeholders.push("?");
    args.push(turnoAlocacao || null);
  }

  db.prepare(`INSERT INTO os_execucoes (${fields.join(",")}) VALUES (${placeholders.join(",")})`).run(...args);
}

function prioritizeMecanicos(mecanicosDisponiveis = []) {
  const prioridade = ["Diogo", "Salviano", "Rodolfo", "Fábio"];
  const normalized = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const pos = (nome) => {
    const idx = prioridade.findIndex((ref) => normalized(nome).includes(normalized(ref)));
    return idx < 0 ? 99 : idx;
  };
  return [...mecanicosDisponiveis].sort((a, b) => {
    const pa = pos(a.name);
    const pb = pos(b.name);
    if (pa !== pb) return pa - pb;
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });
}


function listUsuariosEquipe() {
  if (!tableExists("colaboradores")) return [];
  return db.prepare(`
    SELECT id, nome, user_id, funcao
    FROM colaboradores
    WHERE IFNULL(ativo,1)=1
    ORDER BY nome ASC
  `).all().map((c) => ({
    id: Number(c.id),
    name: c.nome,
    user_id: c.user_id ? Number(c.user_id) : null,
    funcao: String(normalizeColaboradorFuncao(c.funcao || "")).toLowerCase(),
  }));
}

function getOSById(id) {
  const osCols = getOSColumns();
  const hasExecColab = osCols.includes("executor_colaborador_id");
  const hasAuxColab = osCols.includes("auxiliar_colaborador_id");

  const os = db.prepare(`
    SELECT o.*,
           ce.nome AS executor_nome,
           ca.nome AS auxiliar_nome,
           ue.name AS executor_user_nome,
           ua.name AS auxiliar_user_nome
    FROM os o
    LEFT JOIN colaboradores ce ON ce.id = ${hasExecColab ? "o.executor_colaborador_id" : "NULL"}
    LEFT JOIN colaboradores ca ON ca.id = ${hasAuxColab ? "o.auxiliar_colaborador_id" : "NULL"}
    LEFT JOIN users ue ON ue.id = o.mecanico_user_id
    LEFT JOIN users ua ON ua.id = o.auxiliar_user_id
    WHERE o.id = ?
  `).get(Number(id));

  if (!os) return null;

  const executorNome = os.executor_nome || os.executor_user_nome || null;
  const auxiliarNome = os.auxiliar_nome || os.auxiliar_user_nome || null;

  return {
    ...os,
    executor_nome: executorNome,
    mecanico_nome: executorNome,
    auxiliar_nome: auxiliarNome,
    fotos_abertura: listAnexos(id, "ABERTURA"),
    fotos_fechamento: listAnexos(id, "FECHAMENTO"),
    pecas_utilizadas: listPecasUtilizadas(id),
    alocacoes_equipe: listAlocacoesEquipe(id),
    execucao_ativa: getExecucaoAtiva(id),
  };
}

function getConfig(chave) {
  if (!tableExists("config_sistema")) return null;
  return db.prepare(`SELECT valor FROM config_sistema WHERE chave = ?`).get(chave)?.valor || null;
}

function setConfig(chave, valor) {
  if (!tableExists("config_sistema")) return;
  db.prepare(`
    INSERT INTO config_sistema (chave, valor)
    VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(chave, valor == null ? null : String(valor));
}

function rotateByLastId(disponiveis, lastId) {
  if (!disponiveis.length || !lastId) return disponiveis;
  const idx = disponiveis.findIndex((m) => Number(m.id) === Number(lastId));
  if (idx < 0) return disponiveis;
  return disponiveis.slice(idx + 1).concat(disponiveis.slice(0, idx + 1));
}

function pickDisponivelPorOrdem(disponiveis, configKey, prioridades = []) {
  const prioridadeNormalizada = (prioridades || []).map((nome) => String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase());

  const getPrioridade = (nome) => {
    const n = String(nome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const idx = prioridadeNormalizada.findIndex((p) => n.includes(p));
    return idx < 0 ? 999 : idx;
  };

  const ordenados = [...(disponiveis || [])].sort((a, b) => {
    const pa = getPrioridade(a.nome);
    const pb = getPrioridade(b.nome);
    if (pa !== pb) return pa - pb;
    return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
  });
  if (!ordenados.length) return null;

  const ultimoId = Number(getConfig(configKey) || 0) || null;
  const fila = rotateByLastId(ordenados, ultimoId);
  const escolhido = fila[0] || null;
  if (escolhido?.id) setConfig(configKey, Number(escolhido.id));
  return escolhido;
}

function getUserNameById(userId) {
  if (!userId || !tableExists("users")) return null;
  return db.prepare(`SELECT name FROM users WHERE id = ?`).get(Number(userId))?.name || null;
}

function getSemanaAtualEscala() {
  if (!tableExists("escala_semanas")) return null;
  return db.prepare(`
    SELECT id, semana_numero, data_inicio, data_fim
    FROM escala_semanas
    WHERE date('now','localtime') BETWEEN data_inicio AND data_fim
    ORDER BY id DESC
    LIMIT 1
  `).get() || null;
}

function getSemanaAtual() {
  return getSemanaAtualEscala();
}

function getTurnoAgora() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const h = Number(partMap.hour || 0);
  const m = Number(partMap.minute || 0);
  const min = (h * 60) + m;
  return (min >= (19 * 60) || min < (6 * 60)) ? "NOITE" : "DIA";
}

function getColaboradoresTurnoAtual(turno) {
  const semana = getSemanaAtualEscala();
  if (!semana?.id || !tableExists("escala_alocacoes") || !tableExists("colaboradores")) return [];

  const turnoNormalizado = String(turno || "").toUpperCase() === "NOITE" ? "NOITE" : "DIA";
  const tipos = turnoNormalizado === "NOITE" ? ["plantao", "noturno"] : ["diurno", "apoio"];
  const placeholders = tipos.map(() => "?").join(",");

  return db.prepare(`
    SELECT c.id AS colaborador_id,
           c.user_id,
           c.nome,
           c.funcao,
           a.tipo_turno,
           a.id AS alocacao_id
    FROM escala_alocacoes a
    JOIN colaboradores c ON c.id = a.colaborador_id
    WHERE a.semana_id = ?
      AND a.tipo_turno IN (${placeholders})
      AND IFNULL(c.ativo,1)=1
    ORDER BY CASE LOWER(a.tipo_turno)
              WHEN 'plantao' THEN 0
              WHEN 'noturno' THEN 1
              WHEN 'diurno' THEN 0
              WHEN 'apoio' THEN 1
              ELSE 9 END,
             a.id ASC,
             c.nome ASC
  `).all(Number(semana.id), ...tipos).map((row) => ({
    colaborador_id: Number(row.colaborador_id),
    id: Number(row.colaborador_id),
    user_id: row.user_id ? Number(row.user_id) : null,
    nome: row.nome,
    funcao: normalizeColaboradorFuncao(row.funcao),
    tipo_turno: String(row.tipo_turno || "").toLowerCase(),
    alocacao_id: Number(row.alocacao_id),
  }));
}

function getPlantonista(semanaId) {
  if (!semanaId || !tableExists("escala_alocacoes") || !tableExists("colaboradores")) return null;

  return db.prepare(`
    SELECT c.id, c.nome, c.user_id, c.funcao, a.tipo_turno, a.id AS alocacao_id
    FROM escala_alocacoes a
    JOIN colaboradores c ON c.id = a.colaborador_id
    WHERE a.semana_id = ?
      AND a.tipo_turno IN ('plantao', 'noturno')
      AND IFNULL(c.ativo,1) = 1
    ORDER BY CASE LOWER(a.tipo_turno)
              WHEN 'plantao' THEN 0
              WHEN 'noturno' THEN 1
              ELSE 9 END,
             a.id ASC,
             c.nome ASC
  `).all(Number(semanaId)).find((row) => normalizeColaboradorFuncao(row.funcao) === "MECANICO") || null;
}

function getMecanicosDiurno() {
  return getColaboradoresTurnoAtual("DIA").filter((c) => c.tipo_turno === "diurno" && normalizeColaboradorFuncao(c.funcao) === "MECANICO");
}

function getApoioDiurno() {
  return getColaboradoresTurnoAtual("DIA").filter((c) => c.tipo_turno === "apoio" && ["APOIO", "AUXILIAR"].includes(normalizeColaboradorFuncao(c.funcao)));
}

function getEscalados(semanaId, tipoTurno, funcoes = []) {
  if (!semanaId || !tableExists("escala_alocacoes") || !tableExists("colaboradores")) return [];

  const rows = db.prepare(`
    SELECT c.id, c.nome, c.user_id, c.funcao
    FROM escala_alocacoes a
    JOIN colaboradores c ON c.id = a.colaborador_id
    WHERE a.semana_id = ?
      AND a.tipo_turno = ?
      AND IFNULL(c.ativo,1) = 1
    ORDER BY c.nome ASC
  `).all(Number(semanaId), String(tipoTurno || ""));

  return rows.filter((row) => {
    if (!funcoes.length) return true;
    return funcoes.includes(normalizeColaboradorFuncao(row.funcao));
  });
}

function listarOcupados() {
  if (!tableExists("os") || !tableExists("colaboradores")) return new Set();

  const ativos = ["ABERTA", "AGUARDANDO_EQUIPE", "ANDAMENTO", "PAUSADA"];
  const placeholders = ativos.map(() => "?").join(",");
  const cols = getOSColumns();
  const hasExecColab = cols.includes("executor_colaborador_id");
  const hasAuxColab = cols.includes("auxiliar_colaborador_id");
  const hasExecUser = cols.includes("mecanico_user_id");
  const hasAuxUser = cols.includes("auxiliar_user_id");

  const rows = db.prepare(`
    SELECT id,
           ${hasExecColab ? "executor_colaborador_id" : "NULL"} AS executor_colaborador_id,
           ${hasAuxColab ? "auxiliar_colaborador_id" : "NULL"} AS auxiliar_colaborador_id,
           ${hasExecUser ? "mecanico_user_id" : "NULL"} AS mecanico_user_id,
           ${hasAuxUser ? "auxiliar_user_id" : "NULL"} AS auxiliar_user_id
    FROM os
    WHERE UPPER(COALESCE(status,'')) IN (${placeholders})
  `).all(...ativos);

  const userToColab = db.prepare(`SELECT id FROM colaboradores WHERE user_id = ? LIMIT 1`);
  const ocupados = new Set();
  for (const row of rows) {
    if (row.executor_colaborador_id) ocupados.add(Number(row.executor_colaborador_id));
    if (row.auxiliar_colaborador_id) ocupados.add(Number(row.auxiliar_colaborador_id));

    if (row.mecanico_user_id && !row.executor_colaborador_id) {
      const c = userToColab.get(Number(row.mecanico_user_id));
      if (c?.id) ocupados.add(Number(c.id));
    }
    if (row.auxiliar_user_id && !row.auxiliar_colaborador_id) {
      const c = userToColab.get(Number(row.auxiliar_user_id));
      if (c?.id) ocupados.add(Number(c.id));
    }
  }
  return ocupados;
}

function isColaboradorOcupado(colaboradorId) {
  if (!colaboradorId || !tableExists("os")) return false;
  const cols = getOSColumns();
  if (!cols.includes("executor_colaborador_id") || !cols.includes("auxiliar_colaborador_id")) return false;

  const row = db.prepare(`
    SELECT 1
    FROM os
    WHERE UPPER(COALESCE(status,'')) IN ('ABERTA','AGUARDANDO_EQUIPE','ANDAMENTO','PAUSADA')
      AND (executor_colaborador_id = ? OR auxiliar_colaborador_id = ?)
    LIMIT 1
  `).get(Number(colaboradorId), Number(colaboradorId));
  return !!row;
}

function isColaboradorDisponivel(colaboradorId) {
  const id = Number(colaboradorId || 0);
  if (!id) return false;
  const turnoAtual = getTurnoAtual();
  const escalados = getColaboradoresTurnoAtual(turnoAtual);
  const estaEscalado = escalados.some((c) => Number(c.id) === id);
  if (!estaEscalado) return false;
  return !isColaboradorOcupado(id);
}

function persistirAlocacaoOS(osId, executor, auxiliar, turno, modo = "AUTO") {
  const cols = getOSColumns();


  db.transaction(() => {
    if (tableExists("os_execucoes")) {
      db.prepare(`UPDATE os_execucoes SET finalizado_em = datetime('now') WHERE os_id = ? AND finalizado_em IS NULL`).run(Number(osId));
      if (executor?.user_id) {
        createExecucao(Number(osId), Number(executor.user_id), auxiliar?.user_id ? Number(auxiliar.user_id) : null, null, null, turno);
      }
    }

    const updates = ["status='ABERTA'"];
    const args = [];

    if (cols.includes("executor_colaborador_id")) {
      updates.push("executor_colaborador_id = ?");
      args.push(executor?.id ? Number(executor.id) : null);
    }
    if (cols.includes("auxiliar_colaborador_id")) {
      updates.push("auxiliar_colaborador_id = ?");
      args.push(auxiliar?.id ? Number(auxiliar.id) : null);
    }
    if (cols.includes("mecanico_user_id")) {
      updates.push("mecanico_user_id = ?");
      args.push(executor?.user_id ? Number(executor.user_id) : null);
    }
    if (cols.includes("auxiliar_user_id")) {
      updates.push("auxiliar_user_id = ?");
      args.push(auxiliar?.user_id ? Number(auxiliar.user_id) : null);
    }
    if (cols.includes("turno_alocado")) {
      updates.push("turno_alocado = ?");
      args.push(turno);
    }
    if (cols.includes("alocado_em")) {
      updates.push("alocado_em = datetime('now')");
    }
    if (cols.includes("alocacao_modo")) {
      updates.push("alocacao_modo = ?");
      args.push(String(modo || "AUTO").toUpperCase() === "MANUAL" ? "MANUAL" : "AUTO");
    }

    args.push(Number(osId));
    db.prepare(`UPDATE os SET ${updates.join(", ")} WHERE id = ?`).run(...args);
  })();
}

function marcarAguardandoEquipe(osId, turno, aviso) {
  const cols = getOSColumns();
  const updates = ["status = 'AGUARDANDO_EQUIPE'"];
  if (cols.includes("executor_colaborador_id")) updates.push("executor_colaborador_id = NULL");
  if (cols.includes("auxiliar_colaborador_id")) updates.push("auxiliar_colaborador_id = NULL");
  if (cols.includes("mecanico_user_id")) updates.push("mecanico_user_id = NULL");
  if (cols.includes("auxiliar_user_id")) updates.push("auxiliar_user_id = NULL");
  if (cols.includes("turno_alocado")) updates.push("turno_alocado = ?");
  if (cols.includes("alocado_em")) updates.push("alocado_em = datetime('now')");
  if (cols.includes("alocacao_modo")) updates.push("alocacao_modo = 'AUTO'");

  const args = [];
  if (cols.includes("turno_alocado")) args.push(turno);
  args.push(Number(osId));
  db.prepare(`UPDATE os SET ${updates.join(", ")} WHERE id = ?`).run(...args);

  return { aguardando: true, aviso, turno };
}

function autoAlocarOS(osId, { force = false } = {}) {
  const cols = getOSColumns();
  const os = db.prepare(`
    SELECT id,
           ${cols.includes("grau") ? "grau" : "'MEDIA' AS grau"},
           ${cols.includes("status") ? "status" : "NULL AS status"},
           ${cols.includes("executor_colaborador_id") ? "executor_colaborador_id" : "NULL AS executor_colaborador_id"},
           ${cols.includes("alocacao_modo") ? "alocacao_modo" : "NULL AS alocacao_modo"}
    FROM os
    WHERE id = ?
  `).get(Number(osId));

  if (!os) throw new Error("OS não encontrada.");
  if (os.executor_colaborador_id && !force) {
    if (cols.includes("alocacao_modo") && !["AUTO", "MANUAL"].includes(String(os.alocacao_modo || "").toUpperCase())) {
      db.prepare(`UPDATE os SET alocacao_modo = 'AUTO' WHERE id = ?`).run(Number(osId));
    }
    return { aguardando: false, aviso: "OS já possui executor alocado." };
  }

  const turno = getTurnoAtual();

  if (turno === "NOITE") {
    const plantonista = getPlantonistaNoite();
    if (plantonista?.id && isColaboradorDisponivel(plantonista.id)) {
      persistirAlocacaoOS(Number(osId), plantonista, null, "NOITE", "AUTO");
      return { aguardando: false, turno: "NOITE", executor: plantonista, auxiliar: null };
    }
    return marcarAguardandoEquipe(Number(osId), "NOITE", "Sem executor disponível no turno: OS aguardando alocação.");
  }

  const grau = normalizeGrau(os.grau);
  const apoioDisponivel = getApoioDiurno().filter((c) => isColaboradorDisponivel(c.id));
  const mecanicosDisponiveis = getMecanicosDiurno().filter((c) => isColaboradorDisponivel(c.id));

  if (grau === "BAIXA") {
    const executor = apoioDisponivel[0]
      || mecanicosDisponiveis[0]
      || null;
    if (!executor) return marcarAguardandoEquipe(Number(osId), "DIA", "Sem executor disponível no turno: OS aguardando alocação.");
    persistirAlocacaoOS(Number(osId), executor, null, "DIA", "AUTO");
    return { aguardando: false, turno: "DIA", executor, auxiliar: null };
  }

  const executor = mecanicosDisponiveis[0] || null;
  if (!executor) return marcarAguardandoEquipe(Number(osId), "DIA", "Sem executor disponível no turno: OS aguardando alocação.");

  const auxiliar = apoioDisponivel[0] || null;
  persistirAlocacaoOS(Number(osId), executor, auxiliar, "DIA", "AUTO");
  return { aguardando: false, turno: "DIA", executor, auxiliar };
}

function autoAssignOS(osId, _alocadoPorUserId = null, opts = {}) {
  return autoAlocarOS(osId, opts || {});
}

function autoAssignEquipe(osId, alocadoPorUserId, opts = {}) {
  return autoAssignOS(osId, alocadoPorUserId, opts);
}

function syncOpenOSWithCurrentShift() {
  const pendentes = db.prepare(`
    SELECT id
    FROM os
    WHERE UPPER(COALESCE(status, '')) IN ('ABERTA', 'AGUARDANDO_EQUIPE')
    ORDER BY id ASC
  `).all();

  let alocadas = 0;
  for (const os of pendentes) {
    const result = autoAssignOS(Number(os.id));
    if (!result?.aguardando) alocadas += 1;
  }

  return { turnoAtual: getTurnoAgora(), devolvidasParaFila: 0, alocadas };
}

function setEquipeManual(osId, { executor_colaborador_id, auxiliar_colaborador_id, mecanico_user_id, auxiliar_user_id }, userId) {
  const os = db.prepare(`SELECT id, status FROM os WHERE id = ?`).get(Number(osId));
  if (!os) throw new Error("OS não encontrada.");
  const status = String(os.status || "").toUpperCase();
  if (["FECHADA", "CANCELADA"].includes(status)) throw new Error("OS fechada/cancelada não permite reatribuição.");

  let executorId = Number(executor_colaborador_id || 0);
  let auxiliarId = Number(auxiliar_colaborador_id || 0) || null;

  if (!executorId && mecanico_user_id) {
    executorId = Number(db.prepare(`SELECT id FROM colaboradores WHERE user_id = ? LIMIT 1`).get(Number(mecanico_user_id))?.id || 0);
  }
  if (!auxiliarId && auxiliar_user_id) {
    auxiliarId = Number(db.prepare(`SELECT id FROM colaboradores WHERE user_id = ? LIMIT 1`).get(Number(auxiliar_user_id))?.id || 0) || null;
  }

  if (!executorId) throw new Error("Executor é obrigatório.");

  const executor = db.prepare(`SELECT id, nome, user_id, funcao FROM colaboradores WHERE id = ?`).get(executorId);
  if (!executor?.id) throw new Error("Executor inválido.");

  let auxiliar = null;
  if (auxiliarId) {
    auxiliar = db.prepare(`SELECT id, nome, user_id, funcao FROM colaboradores WHERE id = ?`).get(auxiliarId);
    if (!auxiliar?.id) throw new Error("Auxiliar inválido.");
  }

  const turno = getTurnoAgora();
  persistirAlocacaoOS(Number(osId), executor, auxiliar, turno, "MANUAL");
}

function setupPairsIfEmpty() {
  if (!tableExists("equipe_pares") || !tableExists("colaboradores")) return;
  const total = db.prepare(`SELECT COUNT(*) AS total FROM equipe_pares`).get()?.total || 0;
  if (Number(total) > 0) return;

  const pares = [["Diogo", "Emanuel"], ["Salviano", "Luís"], ["Rodolfo", "Júnior"], ["Fábio", "Léo"]];
  const findLike = db.prepare(`SELECT id FROM colaboradores WHERE nome LIKE ? COLLATE NOCASE ORDER BY id LIMIT 1`);
  const insert = db.prepare(`INSERT OR IGNORE INTO equipe_pares (mecanico_colaborador_id, auxiliar_colaborador_id, ativo, ordem) VALUES (?, ?, 1, ?)`);

  for (const [idx, [mec, aux]] of pares.entries()) {
    const m = findLike.get(`%${mec}%`);
    const a = findLike.get(`%${aux}%`);
    if (m?.id && a?.id) insert.run(Number(m.id), Number(a.id), idx + 1);
  }
}

function autoAssign(osId, alocadoPorUserId = null) {
  const result = autoAssignOS(osId, alocadoPorUserId);
  if (!result) return { equipe: [], avisos: [] };
  if (result.aguardando) return { equipe: [], avisos: [result.aviso] };
  return { equipe: listAlocacoesEquipe(Number(osId)), avisos: result.aviso ? [result.aviso] : [] };
}

function listOS() {
  const cols = getOSColumns();

  const grauColumn = resolveGrauColumn(cols);
  const grauExpr = grauColumn
    ? grauColumn
    : (cols.includes("prioridade") ? "prioridade" : "NULL");
  const openedExpr = cols.includes("opened_at")
    ? "opened_at"
    : (cols.includes("created_at") ? "created_at" : "NULL");
  const startedExpr = cols.includes("started_at")
    ? "started_at"
    : (cols.includes("data_inicio") ? "data_inicio" : "NULL");
  const closedExpr = cols.includes("closed_at")
    ? "closed_at"
    : (cols.includes("data_conclusao") ? "data_conclusao" : "NULL");

  return db
    .prepare(
      `SELECT o.id,
              o.equipamento,
              o.tipo,
              o.status,
              ${grauExpr} AS grau,
              ${openedExpr} AS opened_at,
              ${startedExpr} AS started_at,
              ${closedExpr} AS closed_at,
              COALESCE(u.name, u.email, '-') AS solicitante,
              m.name AS mecanico_nome,
              a.name AS auxiliar_nome
       FROM os o
       LEFT JOIN users u ON u.id = o.opened_by
       LEFT JOIN users m ON m.id = o.mecanico_user_id
       LEFT JOIN users a ON a.id = o.auxiliar_user_id
       ORDER BY o.id DESC
       LIMIT 300`
    )
    .all();
}

function emitOSEvents(osId, eventHint) {
  const payload = alertsService.buildEventoFromOS(osId);
  if (!payload) return;

  if (eventHint === "create") alertsHub.publish("os_criada", payload);
  alertsHub.publish("os_atualizada", payload);

  if (String(payload.prioridade || "").toUpperCase() === "EMERGENCIAL") {
    alertsHub.publish("nova_os_emergencial", payload);
  }

  if (eventHint === "status") {
    alertsHub.publish("os_status_alterado", payload);
    const st = String(payload.status || "").toUpperCase();
    if (st === "ANDAMENTO" || st === "EM_ANDAMENTO") alertsHub.publish("os_em_andamento", payload);
  }
}

function syncInspecaoFromOS(osId) {
  if (!inspecaoService?.syncFromOS) return;
  console.log("[INSPECAO_SYNC] syncFromOS disparado", { osId });
  try {
    const result = inspecaoService.syncFromOS(osId);
    if (result && result.synced === false) {
      if (result.reason === "os_or_data_missing") {
        console.warn("[INSPECAO_SYNC] syncFromOS sem data válida", { osId, reason: result.reason });
        return;
      }
      console.warn(`⚠️ [inspecao] syncFromOS não sincronizou OS #${osId}: ${result.reason || "motivo não informado"}`);
      return;
    }
    console.log("[INSPECAO_SYNC] syncFromOS concluído", { osId, result });
  } catch (err) {
    console.error("[INSPECAO_SYNC][ERROR]", err);
  }
}

function buscarHistoricoEquipamento(equipamentoId) {
  if (!equipamentoId) return [];
  return db
    .prepare(
      `SELECT id, descricao, status, tipo, opened_at, closed_at
       FROM os
       WHERE equipamento_id = ?
       ORDER BY id DESC
       LIMIT 8`
    )
    .all(Number(equipamentoId));
}

function buscarNaoConformidadesRelacionadas(equipamentoId, sintoma) {
  if (!equipamentoId || !sintoma) return [];
  const cols = getOSColumns();
  if (!cols.includes("sintoma_principal")) return [];

  return db
    .prepare(
      `SELECT id, sintoma_principal, severidade, descricao, opened_at
       FROM os
       WHERE equipamento_id = ?
         AND UPPER(COALESCE(sintoma_principal,'')) = UPPER(?)
       ORDER BY id DESC
       LIMIT 8`
    )
    .all(Number(equipamentoId), String(sintoma));
}

function buscarOSRecentesSemelhantes(equipamentoId) {
  if (!equipamentoId) return [];
  return db
    .prepare(
      `SELECT id, descricao, resumo_tecnico, causa_diagnostico, status, opened_at
       FROM os
       WHERE equipamento_id = ?
       ORDER BY id DESC
       LIMIT 5`
    )
    .all(Number(equipamentoId));
}

function buscarPreventivasRelacionadas(equipamentoId) {
  if (!equipamentoId) return [];
  try {
    return db
      .prepare(
        `SELECT id, descricao, status, data_programada
         FROM preventivas
         WHERE equipamento_id = ?
         ORDER BY id DESC
         LIMIT 5`
      )
      .all(Number(equipamentoId));
  } catch (_e) {
    return [];
  }
}

async function createOS({
  equipamento_id,
  equipamento_manual,
  descricao,
  resumo_tecnico,
  causa_diagnostico,
  data_inicio,
  data_fim,
  tipo,
  opened_by,
  grau,
  setor_id,
  sintoma_principal,
  severidade,
  observacao_curta,
  equipamento_parado,
  vazamento,
  aquecimento,
  ruido_anormal,
  vibracao,
  odor_anormal,
  baixa_performance,
  travamento,
}) {
  const desc = String(descricao || "").trim();
  if (!desc) throw new Error("Descrição obrigatória.");

  const openedBy = Number(opened_by || 0);
  if (!openedBy) throw new Error("Usuário logado obrigatório para abrir OS.");

  let equipId = equipamento_id ? Number(equipamento_id) : null;
  let equipManual = String(equipamento_manual || "").trim() || null;
  let equipamentoFinal = equipManual || "";

  if (equipId) {
    const eq = db.prepare(`SELECT nome FROM equipamentos WHERE id = ?`).get(equipId);
    if (eq?.nome) {
      equipamentoFinal = eq.nome;
      equipManual = null;
    } else {
      equipId = null;
    }
  }

  if (!equipamentoFinal) throw new Error("Informe um equipamento cadastrado ou manual.");

  const tipoOS = normalizeTipoOS(tipo);
  const grauOS = normalizeGrau(grau);
  const score = classifyOSPriority({ descricao: desc, tipo: tipoOS, equipamento_id: equipId });

  const contexto = {
    equipamento: equipId
      ? db.prepare(`SELECT id, nome, codigo, tipo, categoria, setor_id FROM equipamentos WHERE id = ?`).get(equipId)
      : null,
    historico_equipamento: buscarHistoricoEquipamento(equipId),
    nao_conformidades_relacionadas: buscarNaoConformidadesRelacionadas(equipId, sintoma_principal),
    os_recentes_semelhantes: buscarOSRecentesSemelhantes(equipId),
    preventivas_relacionadas: buscarPreventivasRelacionadas(equipId),
  };

  const aberturaIA = await osIAService.gerarAberturaAutomaticaDaOS({
    usuario_id: openedBy,
    nao_conformidade: {
      equipamento_id: equipId,
      setor_id: setor_id ? Number(setor_id) : null,
      sintoma_principal: String(sintoma_principal || "").trim() || null,
      severidade: normalizeGrau(severidade || grauOS),
      observacao_curta: String(observacao_curta || "").trim() || null,
      flags: {
        equipamento_parado: !!equipamento_parado,
        vazamento: !!vazamento,
        aquecimento: !!aquecimento,
        ruido_anormal: !!ruido_anormal,
        vibracao: !!vibracao,
        odor_anormal: !!odor_anormal,
        baixa_performance: !!baixa_performance,
        travamento: !!travamento,
      },
    },
    contexto,
  });

  const cols = getOSColumns();
  const fields = ["equipamento", "descricao", "tipo", "status", "opened_by"];
  const values = [equipamentoFinal, desc, tipoOS, "ABERTA", openedBy];

  if (cols.includes("equipamento_id")) {
    fields.push("equipamento_id");
    values.push(equipId);
  }
  if (cols.includes("equipamento_manual")) {
    fields.push("equipamento_manual");
    values.push(equipManual);
  }

  if (cols.includes("resumo_tecnico")) {
    fields.push("resumo_tecnico");
    values.push(String(resumo_tecnico || aberturaIA.descricao_tecnica_os || "").trim() || null);
  } else if (cols.includes("acao_executada")) {
    fields.push("acao_executada");
    values.push(String(resumo_tecnico || aberturaIA.descricao_tecnica_os || "").trim() || null);
  }

  if (cols.includes("causa_diagnostico")) {
    fields.push("causa_diagnostico");
    values.push(String(causa_diagnostico || aberturaIA.causa_provavel || "").trim() || null);
  } else if (cols.includes("diagnostico")) {
    fields.push("diagnostico");
    values.push(String(causa_diagnostico || aberturaIA.causa_provavel || "").trim() || null);
  }

  if (cols.includes("data_inicio")) {
    fields.push("data_inicio");
    values.push(String(data_inicio || "").trim() || null);
  }
  if (cols.includes("data_fim")) {
    fields.push("data_fim");
    values.push(String(data_fim || "").trim() || null);
  }

  const grauColumn = resolveGrauColumn(cols);
  if (grauColumn) {
    fields.push(grauColumn);
    values.push(grauOS);
  }

  if (cols.includes("prioridade")) {
    fields.push("prioridade");
    values.push(aberturaIA.prioridade_sugerida || score.prioridade || "MEDIA");
  }
  if (cols.includes("categoria_sugerida")) {
    fields.push("categoria_sugerida");
    values.push(score.categoria_sugerida || null);
  }
  if (cols.includes("alertar_imediatamente")) {
    fields.push("alertar_imediatamente");
    values.push(score.alertar_imediatamente ? 1 : 0);
  }
  const mapCols = {
    setor_id,
    sintoma_principal,
    severidade: normalizeGrau(severidade || grauOS),
    nc_observacao_curta: observacao_curta,
    equipamento_parado: equipamento_parado ? 1 : 0,
    vazamento: vazamento ? 1 : 0,
    aquecimento: aquecimento ? 1 : 0,
    ruido_anormal: ruido_anormal ? 1 : 0,
    vibracao: vibracao ? 1 : 0,
    odor_anormal: odor_anormal ? 1 : 0,
    baixa_performance: baixa_performance ? 1 : 0,
    travamento: travamento ? 1 : 0,
    ai_diagnostico_inicial: aberturaIA.diagnostico_inicial,
    ai_causa_provavel: aberturaIA.causa_provavel,
    ai_risco_operacional: aberturaIA.risco_operacional,
    ai_servico_sugerido: aberturaIA.servico_sugerido,
    ai_prioridade_sugerida: aberturaIA.prioridade_sugerida,
    ai_observacao_seguranca: aberturaIA.observacao_seguranca,
    ai_descricao_tecnica_os: aberturaIA.descricao_tecnica_os,
  };

  for (const [col, value] of Object.entries(mapCols)) {
    if (!cols.includes(col)) continue;
    fields.push(col);
    values.push(value ?? null);
  }
  const stmt = db.prepare(
    `INSERT INTO os (${fields.join(",")})
     VALUES (${fields.map(() => "?").join(",")})`
  );

  const info = stmt.run(...values);
  const osId = Number(info.lastInsertRowid);

  osIAService.registrarLogIA({
    usuarioId: openedBy,
    osId,
    naoConformidadeId: osId,
    tipo: "ABERTURA_NC",
    entrada: {
      equipamento_id: equipId,
      sintoma_principal,
      severidade,
      observacao_curta,
    },
    resposta: aberturaIA,
    status: "OK",
  });

  setupPairsIfEmpty();

  emitOSEvents(osId, "create");
  syncInspecaoFromOS(osId);

  pushService
    .sendPushToAll({
      title: "Nova Ordem de Serviço",
      body: `OS #${osId} - ${equipamentoFinal}`,
      url: `/os/${osId}`,
    })
    .catch(() => {});

  return osId;
}

function addFotosAberturaFechamento({ osId, files = [], tipo, userId }) {
  if (!osId) return;
  const t = String(tipo || "").toUpperCase();
  if (!["ABERTURA", "FECHAMENTO"].includes(t)) return;

  const table = resolveAnexosTable();
  if (!table) return;

  const tx = db.transaction(() => {
    if (table === "os_anexos") {
      const insert = db.prepare(
        `INSERT INTO os_anexos (os_id, tipo, path, legenda, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      );

      for (const f of files || []) {
        const pathPublic = f.pathPublic || f.path || null;
        if (!pathPublic) continue;
        insert.run(osId, t, pathPublic, null, userId || null);
      }
      return;
    }

    const anexosCols = getTableColumns("anexos");
    const hasUploadedBy = anexosCols.includes("uploaded_by");

    const insertLegacy = hasUploadedBy
      ? db.prepare(
          `INSERT INTO anexos (owner_type, owner_id, filename, filepath, uploaded_by, uploaded_at)
           VALUES ('os', ?, ?, ?, ?, datetime('now'))`
        )
      : db.prepare(
          `INSERT INTO anexos (owner_type, owner_id, filename, filepath, uploaded_at)
           VALUES ('os', ?, ?, ?, datetime('now'))`
        );

    for (const f of files || []) {
      const pathPublic = f.pathPublic || f.path || null;
      if (!pathPublic) continue;
      const filename = `${t.toLowerCase()}-${f.originalname || 'foto'}`;

      if (hasUploadedBy) insertLegacy.run(osId, filename, pathPublic, userId || null);
      else insertLegacy.run(osId, filename, pathPublic);
    }
  });
  tx();
}

function iniciarOS(id, userId) {
  const os = getOSById(id);
  if (!os) throw new Error("OS não encontrada.");

  const cols = getOSColumns();
  const sets = ["status = 'ANDAMENTO'"];
  const args = [];

  if (cols.includes("started_at")) {
    sets.push("started_at = COALESCE(started_at, datetime('now'))");
  }
  if (cols.includes("started_by")) {
    sets.push("started_by = COALESCE(started_by, ?)");
    args.push(userId || null);
  }
  if (cols.includes("data_inicio")) {
    sets.push("data_inicio = COALESCE(data_inicio, datetime('now'))");
  }

  args.push(id);
  db.prepare(`UPDATE os SET ${sets.join(", ")} WHERE id = ?`).run(...args);

  emitOSEvents(id, "status");
  pushService
    .sendPushToAll({
      title: "OS em andamento",
      body: `OS #${id} entrou em andamento.`,
      url: `/os/${id}`,
    })
    .catch(() => {});
  if (inspecaoService?.syncFromOS) {
    try {
      inspecaoService.syncFromOS(id);
    } catch (_e) {}
  }
}

function pausarOS(id) {
  const os = getOSById(id);
  if (!os) throw new Error("OS não encontrada.");

  db.prepare(`UPDATE os SET status = 'PAUSADA' WHERE id = ?`).run(id);
  emitOSEvents(id, "status");
  if (inspecaoService?.syncFromOS) {
    try {
      inspecaoService.syncFromOS(id);
    } catch (_e) {}
  }
}

async function concluirOS(id, { closedBy, diagnostico, acaoExecutada, pecas, dataFim, fechamentoPayload = {} }) {
  const os = getOSById(id);
  if (!os) throw new Error("OS não encontrada.");
  console.log("[OS_CLOSE] fechando OS:", {
    osId: id,
    status_atual: os.status,
    tipo: os.tipo,
    data_inicio: os.data_inicio || os.opened_at || null,
    data_fim_atual: os.data_fim || os.data_conclusao || os.closed_at || null,
  });

  const cols = getOSColumns();

  const fechamentoIA = await osIAService.gerarFechamentoAutomaticoOS({
    usuario_id: closedBy || null,
    os_id: id,
    nao_conformidade_id: id,
    os_inicial: {
      id: os.id,
      descricao: os.descricao,
      resumo_tecnico: os.resumo_tecnico || null,
      causa_diagnostico: os.causa_diagnostico || null,
      equipamento: os.equipamento,
      equipamento_id: os.equipamento_id || null,
      sintoma_principal: os.sintoma_principal || null,
      severidade: os.severidade || null,
    },
    fechamento: fechamentoPayload,
  });

  const diag = String(diagnostico || fechamentoIA.acao_corretiva_realizada || "").trim() || null;
  const acao = String(acaoExecutada || fechamentoIA.descricao_servico_executado || "").trim() || null;

  const tx = db.transaction(() => {
    const sets = ["status = 'FECHADA'", "closed_at = datetime('now')", "closed_by = ?"];
    const args = [closedBy || null];

    if (cols.includes("data_conclusao")) sets.push("data_conclusao = COALESCE(data_conclusao, datetime('now'))");
    if (cols.includes("diagnostico")) {
      sets.push("diagnostico = ?");
      args.push(diag);
    }
    if (cols.includes("causa_diagnostico")) {
      sets.push("causa_diagnostico = COALESCE(?, causa_diagnostico)");
      args.push(diag);
    }
    if (cols.includes("acao_executada")) {
      sets.push("acao_executada = COALESCE(?, acao_executada)");
      args.push(acao);
    }
    if (cols.includes("resumo_tecnico")) {
      sets.push("resumo_tecnico = COALESCE(?, resumo_tecnico)");
      args.push(acao);
    }
    if (cols.includes("data_fim")) {
      sets.push("data_fim = COALESCE(?, data_fim)");
      args.push(String(dataFim || "").trim() || null);
    }

    const fechamentoCols = {
      ai_descricao_servico_executado: fechamentoIA.descricao_servico_executado,
      ai_acao_corretiva_realizada: fechamentoIA.acao_corretiva_realizada,
      ai_recomendacao_reincidencia: fechamentoIA.recomendacao_para_evitar_reincidencia,
      ai_observacao_final_tecnica: fechamentoIA.observacao_final_tecnica,
      acoes_executadas_json: JSON.stringify(fechamentoPayload.acoes_executadas || []),
      pecas_utilizadas_json: JSON.stringify((fechamentoPayload.pecas_utilizadas || []).filter((p) => p && p.peca_descricao)),
      teste_operacional_realizado: fechamentoPayload.teste_operacional_realizado ? 1 : 0,
      falha_eliminada: fechamentoPayload.falha_eliminada ? 1 : 0,
      requer_monitoramento: fechamentoPayload.requer_monitoramento ? 1 : 0,
      tipo_acao_fechamento: fechamentoPayload.tipo_acao || null,
      observacao_curta_fechamento: fechamentoPayload.observacao_curta || null,
    };

    for (const [col, value] of Object.entries(fechamentoCols)) {
      if (!cols.includes(col)) continue;
      sets.push(`${col} = ?`);
      args.push(value);
    }

    args.push(id);
    db.prepare(`UPDATE os SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    if (tableExists("os_execucoes")) {
      db.prepare(`UPDATE os_execucoes SET finalizado_em = datetime('now') WHERE os_id = ? AND finalizado_em IS NULL`).run(id);
    }

    if (Array.isArray(pecas) && pecas.length) {
      const ins = db.prepare(
        `INSERT INTO os_pecas_utilizadas (os_id, peca_descricao, quantidade, created_at)
         VALUES (?, ?, ?, datetime('now'))`
      );
      for (const p of pecas) {
        const d = String(p.peca_descricao || "").trim();
        if (!d) continue;
        const q = Number(p.quantidade || 1);
        ins.run(id, d, q);
      }
    }
  });

  tx();
  emitOSEvents(id, "status");
  pushService
    .sendPushToAll({
      title: "OS finalizada",
      body: `OS #${id} foi finalizada.`,
      url: `/os/${id}`,
    })
    .catch(() => {});
  let syncResult = null;
  if (inspecaoService?.syncFromClosedOS) {
    try {
      console.log("[INSPECAO_SYNC] chamando syncFromClosedOS:", id);
      syncResult = inspecaoService.syncFromClosedOS(id);
      console.log("[INSPECAO_SYNC] syncFromClosedOS retorno", { osId: id, syncResult });
    } catch (err) {
      console.error("[INSPECAO_SYNC][ERROR]", err);
    }
  } else if (inspecaoService?.syncFromOS) {
    try {
      console.log("[INSPECAO_SYNC] fallback syncFromOS disparado", { osId: id });
      syncResult = inspecaoService.syncFromOS(id);
      console.log("[INSPECAO_SYNC] fallback syncFromOS retorno", { osId: id, syncResult });
    } catch (err) {
      console.error("[INSPECAO_SYNC][ERROR]", err);
    }
  }
  osIAService.registrarLogIA({
    usuarioId: closedBy || null,
    osId: id,
    naoConformidadeId: id,
    tipo: "FECHAMENTO_OS",
    entrada: fechamentoPayload,
    resposta: fechamentoIA,
    status: "OK",
  });

  return syncResult;
}


function liberarEquipeQuandoFechar(osId) {
  return !!db.prepare(`SELECT id FROM os WHERE id = ?`).get(Number(osId));
}

function updateStatus(id, status) {
  const st = String(status || "").trim().toUpperCase();
  if (!st) return;

  db.prepare(`UPDATE os SET status = ? WHERE id = ?`).run(st, id);
  emitOSEvents(id, "status");

  if (st === "ANDAMENTO" || st === "EM_ANDAMENTO") {
    pushService
      .sendPushToAll({
        title: "OS em andamento",
        body: `OS #${id} entrou em andamento.`,
        url: `/os/${id}`,
      })
      .catch(() => {});
  }

  if (["FECHADA", "FINALIZADA", "CONCLUIDA", "CONCLUÍDA", "CANCELADA"].includes(st)) {
    liberarEquipeQuandoFechar(id);
    pushService
      .sendPushToAll({
        title: "OS finalizada",
        body: `OS #${id} foi finalizada.`,
        url: `/os/${id}`,
      })
      .catch(() => {});
  }

  if (inspecaoService?.syncFromOS) {
    try {
      inspecaoService.syncFromOS(id);
    } catch (_e) {}
  }
}

module.exports = {
  listOS,
  listEquipamentosAtivos,
  listTipoOptions,
  listGrauOptions,
  listUsuariosEquipe,
  createOS,
  addFotosAberturaFechamento,
  getOSById,
  iniciarOS,
  pausarOS,
  concluirOS,
  updateStatus,
  getTurnoAtual,
  getTurnoAgora,
  getEscalaSemanaAtual,
  getSemanaAtual,
  getSemanaAtualEscala,
  getPessoasDoTurnoAtual,
  getColaboradoresTurnoAtual,
  isUserOcupado,
  isColaboradorOcupado,
  isColaboradorDisponivel,
  getPlantonistaNoite,
  getMecanicosDiurno,
  getApoioDiurno,
  getPlantonista,
  listarOcupados,
  autoAlocarOS,
  autoAssignOS,
  autoAssign,
  autoAssignEquipe,
  syncOpenOSWithCurrentShift,
  setEquipeManual,
  getExecucaoAtiva,
  setupPairsIfEmpty,
  liberarEquipeQuandoFechar,
};
