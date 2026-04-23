// modules/dashboard/dashboard.service.js
const db = require("../../database/db");
const { normalizeRole } = require("../../config/rbac");

let escalaService = null;
let preventivasService = null;
try {
  escalaService = require("../escala/escala.service");
} catch (e) {
  console.warn("⚠️ escala.service não carregou:", e.message);
}
try {
  preventivasService = require("../preventivas/preventivas.service");
} catch (e) {
  console.warn("⚠️ preventivas.service não carregou:", e.message);
}

// não derruba o dashboard se faltar tabela
function safeGet(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    const msg = e?.message || "";
    if (msg.includes("no such table")) {
      console.warn("⚠️ [dashboard] tabela ausente:", msg);
      return fallback;
    }
    console.warn("⚠️ [dashboard] erro:", msg);
    return fallback;
  }
}

function tableExists(name) {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
    return !!row;
  } catch (_e) {
    return false;
  }
}

function getUsersNameColumn() {
  return resolveUsuariosSource()?.nameCol || null;
}

function resolveUsuariosSource() {
  const candidates = ["users", "usuarios"];
  for (const table of candidates) {
    if (!tableExists(table)) continue;
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => String(c.name || ""));
      const idCol = cols.includes("id") ? "id" : null;
      const nameCol = cols.includes("name") ? "name" : (cols.includes("nome") ? "nome" : null);
      if (idCol && nameCol) return { table, idCol, nameCol };
    } catch (_e) {}
  }
  return null;
}


function resolveOSGrauExpression() {
  const cols = safeGet(() => db.prepare('PRAGMA table_info(os)').all(), []);
  const names = new Set(cols.map((c) => c.name));
  if (names.has('grau')) return "COALESCE(o.grau,'-')";
  if (names.has('grau_dificuldade')) return "COALESCE(o.grau_dificuldade,'-')";
  if (names.has('nivel_grau')) return "COALESCE(o.nivel_grau,'-')";
  // TODO: quando o campo oficial de grau da OS existir em produção, usar ele aqui.
  return "COALESCE(o.prioridade,'MEDIA')";
}

/* ===============================
   CARDS PRINCIPAIS
=================================*/
function getCards() {
  const os = safeGet(() => {
    return (
      db
        .prepare(
          `
        SELECT COUNT(*) AS total
        FROM os
        WHERE status IN ('ABERTA','ANDAMENTO','PAUSADA')
      `
        )
        .get()?.total || 0
    );
  }, 0);

  const motoresEmpresa = safeGet(() => {
    return (
      db
        .prepare(
          `
        SELECT COUNT(*) AS total
        FROM motores
        WHERE status IN ('EM_USO','RESERVA','RETORNOU')
      `
        )
        .get()?.total || 0
    );
  }, 0);

  const motoresFora = safeGet(() => {
    return (
      db
        .prepare(
          `
        SELECT COUNT(*) AS total
        FROM motores
        WHERE status = 'ENVIADO_REBOB'
      `
        )
        .get()?.total || 0
    );
  }, 0);

  const equipamentosResumo = safeGet(() => {
    const row = db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) AS ativos,
          SUM(CASE WHEN ativo = 0 THEN 1 ELSE 0 END) AS inativos
        FROM equipamentos
      `
      )
      .get();

    return {
      ativos: Number(row?.ativos || 0),
      inativos: Number(row?.inativos || 0),
    };
  }, { ativos: 0, inativos: 0 });

  const osCriticasCount = safeGet(() => {
    const grauExpr = resolveOSGrauExpression();
    const row = db.prepare(`
      SELECT COUNT(*) AS total
      FROM os o
      WHERE UPPER(COALESCE(o.status,'')) IN ('ABERTA','ANDAMENTO','PAUSADA')
        AND UPPER(${grauExpr}) IN ('CRITICO','CRÍTICO','ALTO','EMERGENCIAL')
    `).get();
    return Number(row?.total || 0);
  }, 0);

  return {
    os_abertas: os,
    os_criticas: osCriticasCount,
    motores_empresa: motoresEmpresa,
    motores_conserto: motoresFora,
    equipamentos_ativos: equipamentosResumo.ativos,
    equipamentos_inativos: equipamentosResumo.inativos,
    equipamentos_parados_manutencao: equipamentosResumo.inativos,
  };
}

function getMotoresResumoDashboard() {
  return safeGet(() => {
    const resumo = db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN status = 'EM_USO' THEN 1 ELSE 0 END) AS em_funcionamento,
          SUM(CASE WHEN status IN ('RESERVA', 'RETORNOU') THEN 1 ELSE 0 END) AS em_estoque,
          SUM(CASE WHEN status = 'ENVIADO_REBOB' THEN 1 ELSE 0 END) AS em_conserto
        FROM motores
      `
      )
      .get();

    const emConserto = db
      .prepare(
        `
        SELECT
          id,
          COALESCE(codigo, '-') AS codigo,
          descricao,
          data_saida,
          CAST(julianday('now') - julianday(data_saida) AS INTEGER) AS dias_conserto
        FROM motores
        WHERE status = 'ENVIADO_REBOB'
        ORDER BY datetime(data_saida) ASC
      `
      )
      .all();

    return {
      em_funcionamento: Number(resumo?.em_funcionamento || 0),
      em_estoque: Number(resumo?.em_estoque || 0),
      em_conserto: Number(resumo?.em_conserto || 0),
      itens_em_conserto: emConserto,
    };
  }, {
    em_funcionamento: 0,
    em_estoque: 0,
    em_conserto: 0,
    itens_em_conserto: [],
  });
}


function normalizeFuncaoColaborador(funcao) {
  const raw = String(funcao || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  if (raw.includes('mecan')) return 'mecanico';
  if (raw.includes('operacional') || raw.includes('apoio')) return 'operacional';
  if (raw.includes('auxiliar')) return 'auxiliar';
  return raw;
}

function normalizePessoaNome(nome = "") {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// Regra operacional acordada com a manutenção:
// nomes abaixo sempre entram no ranking do perfil correspondente,
// mesmo que role/função cadastral esteja diferente.
const NOMES_FIXOS_MECANICOS = new Set(["rodolfo", "diogo", "salviano", "fabio"]);
const NOMES_FIXOS_APOIO = new Set(["emanuel", "manuel", "junior", "luiz", "luis"]);
const NOMES_EXCLUIDOS_RANKING = new Set(["angelo"]);

function matchNomeReferencia(nome = "", referencias = new Set()) {
  const nomeNorm = normalizePessoaNome(nome);
  if (!nomeNorm) return false;
  if (referencias.has(nomeNorm)) return true;
  const tokens = nomeNorm.split(/\s+/).filter(Boolean);
  return tokens.some((token) => referencias.has(token));
}

function classifyColaboradorPerfil({ name = "", role = "", funcao = "" } = {}) {
  if (matchNomeReferencia(name, NOMES_EXCLUIDOS_RANKING)) return null;
  if (matchNomeReferencia(name, NOMES_FIXOS_MECANICOS)) return "mecanico";
  if (matchNomeReferencia(name, NOMES_FIXOS_APOIO)) return "apoio";

  const roleNorm = normalizeRole(role || "");
  const funcaoNorm = normalizeFuncaoColaborador(funcao || "");
  const isMecanico = roleNorm === "MECANICO" || funcaoNorm === "mecanico";
  const isApoio = ["auxiliar", "operacional"].includes(funcaoNorm);
  if (isMecanico) return "mecanico";
  if (isApoio) return "apoio";
  return null;
}

function getUserIdsNomesFixosAtivos() {
  if (!tableExists("users")) return [];

  const userRows = db.prepare(`
    SELECT id, name
    FROM users
    WHERE IFNULL(ativo, 1) = 1
  `).all();

  const ids = new Set();
  userRows.forEach((row) => {
    const userId = Number(row?.id || 0);
    if (!userId) return;
    if (matchNomeReferencia(row?.name || "", NOMES_FIXOS_MECANICOS) || matchNomeReferencia(row?.name || "", NOMES_FIXOS_APOIO)) {
      ids.add(userId);
    }
  });

  if (tableExists("colaboradores")) {
    const colabRows = db.prepare(`
      SELECT DISTINCT user_id, nome
      FROM colaboradores
      WHERE user_id IS NOT NULL
        AND IFNULL(ativo, 1) = 1
    `).all();
    colabRows.forEach((row) => {
      const userId = Number(row?.user_id || 0);
      if (!userId) return;
      if (matchNomeReferencia(row?.nome || "", NOMES_FIXOS_MECANICOS) || matchNomeReferencia(row?.nome || "", NOMES_FIXOS_APOIO)) {
        ids.add(userId);
      }
    });
  }

  return Array.from(ids);
}

function topComObrigatorios(items = [], limite = 5, nomesObrigatorios = new Set()) {
  const top = items.slice(0, limite);
  if (!nomesObrigatorios?.size) return top;

  const existentes = new Set(top.map((item) => Number(item.user_id || 0)).filter(Boolean));
  items.forEach((item) => {
    const userId = Number(item?.user_id || 0);
    if (!userId || existentes.has(userId)) return;
    if (matchNomeReferencia(item?.nome || "", nomesObrigatorios)) {
      top.push(item);
      existentes.add(userId);
    }
  });
  return top;
}

function getPerfilPorEscalaSemana(userIds = [], dataRef = "") {
  const ids = Array.from(new Set((userIds || []).map((id) => Number(id || 0)).filter(Boolean)));
  if (!ids.length) return new Map();
  if (!tableExists("escala_semanas") || !tableExists("escala_alocacoes") || !tableExists("colaboradores") || !tableExists("users")) {
    return new Map();
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT DISTINCT
      u.id AS user_id,
      lower(COALESCE(a.tipo_turno, '')) AS tipo_turno
    FROM escala_semanas s
    JOIN escala_alocacoes a ON a.semana_id = s.id
    JOIN colaboradores c ON c.id = a.colaborador_id
    JOIN users u ON u.id = c.user_id
    WHERE ? BETWEEN s.data_inicio AND s.data_fim
      AND u.id IN (${placeholders})
      AND IFNULL(c.ativo, 1) = 1
      AND IFNULL(u.ativo, 1) = 1
  `).all(dataRef, ...ids);

  const perfilMap = new Map();
  rows.forEach((row) => {
    const userId = Number(row.user_id || 0);
    if (!userId) return;
    const tipoTurno = String(row.tipo_turno || "").toLowerCase();
    const perfil = tipoTurno === "apoio" ? "apoio" : "mecanico";
    if (!perfilMap.has(userId)) {
      perfilMap.set(userId, perfil);
    }
  });
  return perfilMap;
}

function pesoCriticidade(value) {
  const nivel = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (["CRITICA", "CRITICO", "EMERGENCIAL"].includes(nivel)) return 3;
  if (["ALTA", "ALTO"].includes(nivel)) return 2;
  if (["MEDIA", "MEDIO"].includes(nivel)) return 1;
  if (["BAIXA", "BAIXO"].includes(nivel)) return 0.5;
  return 1;
}

function getMecanicosRankingSemana() {
  return safeGet(() => {
    const hasUsers = tableExists("users");
    if (!hasUsers || !tableExists("os")) {
      return {
        semana: { inicio: null, fim: null },
        metaMensal: 100,
        pesosCriticidade: { BAIXA: 0.5, MEDIA: 1, ALTA: 2, CRITICA: 3 },
        items: [],
        destaqueSemana: null,
        sugestaoFolgaMes: null,
      };
    }

    const rangeSemana = db.prepare(`
      SELECT
        date('now', 'localtime', '-' || ((strftime('%w', 'now', 'localtime') + 6) % 7) || ' days') AS inicio,
        date('now', 'localtime', '+' || (6 - ((strftime('%w', 'now', 'localtime') + 6) % 7)) || ' days') AS fim
    `).get() || {};
    const inicioSemana = String(rangeSemana.inicio || "");
    const fimSemana = String(rangeSemana.fim || "");

    const osSemana = db.prepare(`
      SELECT
        o.id,
        COALESCE(NULLIF(o.grau, ''), NULLIF(o.prioridade, ''), 'MEDIA') AS criticidade,
        o.mecanico_user_id,
        o.auxiliar_user_id,
        o.responsavel_user_id,
        o.closed_by
      FROM os o
      WHERE UPPER(COALESCE(o.status, '')) IN ('FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CONCLUÍDA')
        AND date(COALESCE(o.data_fim, o.data_conclusao, o.closed_at, o.opened_at), 'localtime') BETWEEN ? AND ?
    `).all(inicioSemana, fimSemana);

    const mapa = new Map();
    const ensure = (id) => {
      const userId = Number(id || 0);
      if (!userId) return null;
      if (!mapa.has(userId)) {
        mapa.set(userId, {
          user_id: userId,
          score: 0,
          os_total: 0,
          os_criticas: 0,
          os_altas: 0,
          os_medias: 0,
          os_baixas: 0,
        });
      }
      return mapa.get(userId);
    };

    osSemana.forEach((os) => {
      const participantes = Array.from(
        new Set(
          [os.mecanico_user_id, os.auxiliar_user_id, os.responsavel_user_id, os.closed_by]
            .map((id) => Number(id || 0))
            .filter(Boolean)
        )
      );
      if (!participantes.length) return;

      const peso = pesoCriticidade(os.criticidade);
      const pontosPorParticipante = Number((peso / participantes.length).toFixed(2));

      participantes.forEach((userId) => {
        const card = ensure(userId);
        card.os_total += 1;
        card.score += pontosPorParticipante;

        if (peso >= 3) card.os_criticas += 1;
        else if (peso >= 2) card.os_altas += 1;
        else if (peso >= 1) card.os_medias += 1;
        else card.os_baixas += 1;
      });
    });

    const userIdsFixos = getUserIdsNomesFixosAtivos();
    userIdsFixos.forEach((id) => ensure(id));

    const userIds = Array.from(mapa.keys());
    if (!userIds.length) {
      return {
        semana: { inicio: inicioSemana, fim: fimSemana },
        metaMensal: 100,
        pesosCriticidade: { BAIXA: 0.5, MEDIA: 1, ALTA: 2, CRITICA: 3 },
        items: [],
        destaqueSemana: null,
        sugestaoFolgaMes: null,
      };
    }

    const placeholders = userIds.map(() => "?").join(",");
    const users = db.prepare(`
      SELECT id, name, role, funcao, photo_path
      FROM users
      WHERE id IN (${placeholders})
        AND ativo = 1
    `).all(...userIds);
    const usersMap = new Map(users.map((u) => [Number(u.id), u]));
    const perfilEscalaMap = getPerfilPorEscalaSemana(userIds, inicioSemana);

    const itemsByPerfil = userIds
      .map((id) => {
        const raw = mapa.get(id);
        const user = usersMap.get(Number(id));
        if (!user) return null;
        if (matchNomeReferencia(user.name || "", NOMES_EXCLUIDOS_RANKING)) return null;
        const perfil = perfilEscalaMap.get(Number(id)) || classifyColaboradorPerfil(user);
        if (!perfil) return null;
        return {
          ...raw,
          perfil,
          nome: user.name || `Colaborador #${id}`,
          photo_path: user.photo_path || null,
          role: normalizeRole(user.role || ""),
          funcao: user.funcao || "MECANICO",
        };
      })
      .filter(Boolean)
      .reduce((acc, item) => {
        if (!acc[item.perfil]) acc[item.perfil] = [];
        acc[item.perfil].push(item);
        return acc;
      }, { mecanico: [], apoio: [] });

    const ordenarRanking = (items = []) =>
      items
        .sort((a, b) => b.score - a.score || b.os_criticas - a.os_criticas || b.os_total - a.os_total || a.nome.localeCompare(b.nome, "pt-BR"))
        .map((item, index) => ({ ...item, posicao: index + 1 }));

    const itemsMecanicos = ordenarRanking(itemsByPerfil.mecanico || []);
    const itemsApoio = ordenarRanking(itemsByPerfil.apoio || []);
    const destaqueSemana = itemsMecanicos[0] || null;

    return {
      semana: { inicio: inicioSemana, fim: fimSemana },
      metaMensal: 100,
      pesosCriticidade: {
        BAIXA: 0.5,
        MEDIA: 1,
        ALTA: 2,
        CRITICA: 3,
      },
      items: topComObrigatorios(itemsMecanicos, 5, NOMES_FIXOS_MECANICOS),
      itemsMecanicos: topComObrigatorios(itemsMecanicos, 5, NOMES_FIXOS_MECANICOS),
      itemsApoio: topComObrigatorios(itemsApoio, 5, NOMES_FIXOS_APOIO),
      destaqueSemana,
      sugestaoFolgaMes: null,
    };
  }, {
    semana: { inicio: null, fim: null },
    metaMensal: 100,
    pesosCriticidade: { BAIXA: 0.5, MEDIA: 1, ALTA: 2, CRITICA: 3 },
    items: [],
    destaqueSemana: null,
    sugestaoFolgaMes: null,
  });
}

function getEscalaPainelSemana() {
  return safeGet(() => {
    const hoje = db.prepare(`SELECT date('now', 'localtime') AS hoje`).get()?.hoje;
    const semana = db
      .prepare(
        `
        SELECT id, semana_numero, data_inicio, data_fim
        FROM escala_semanas
        WHERE date('now', 'localtime') BETWEEN data_inicio AND data_fim
        LIMIT 1
      `
      )
      .get();

    if (!semana) return null;

    const alocacoes = db
      .prepare(
        `
        SELECT
          c.id AS colaborador_id,
          c.nome,
          COALESCE(NULLIF(c.funcao, ''), '-') AS funcao,
          a.tipo_turno
        FROM escala_alocacoes a
        JOIN colaboradores c ON c.id = a.colaborador_id
        WHERE a.semana_id = ?
        ORDER BY
          CASE a.tipo_turno
            WHEN 'diurno' THEN 1
            WHEN 'apoio' THEN 2
            WHEN 'noturno' THEN 3
            WHEN 'folga' THEN 4
            ELSE 5
          END,
          c.nome ASC
      `
      )
      .all(semana.id);

    const ausencias = safeGet(() => db
      .prepare(
        `
        SELECT
          c.id AS colaborador_id,
          c.nome,
          UPPER(COALESCE(x.tipo, '-')) AS tipo,
          x.data_inicio,
          x.data_fim
        FROM escala_ausencias x
        JOIN colaboradores c ON c.id = x.colaborador_id
        WHERE ? BETWEEN x.data_inicio AND x.data_fim
        ORDER BY c.nome ASC
      `
      )
      .all(hoje || semana.data_inicio), []);

    const colaboradoresAusentes = new Set(ausencias.map((a) => Number(a.colaborador_id)).filter(Boolean));
    const alocacoesDisponiveis = alocacoes.filter((a) => !colaboradoresAusentes.has(Number(a.colaborador_id)));

    const folgasTurno = alocacoes
      .filter((a) => a.tipo_turno === "folga")
      .map((a) => ({
        colaborador_id: a.colaborador_id,
        nome: a.nome,
        tipo: "FOLGA",
        data_inicio: semana.data_inicio,
        data_fim: semana.data_fim,
      }));

    const folgasAfastamentosMap = new Map();
    [...folgasTurno, ...ausencias].forEach((item) => {
      if (!item?.colaborador_id) return;
      const key = String(item.colaborador_id);
      const atual = folgasAfastamentosMap.get(key);
      if (!atual || String(item.tipo || '').toUpperCase() === 'ATESTADO') {
        folgasAfastamentosMap.set(key, {
          colaborador_id: item.colaborador_id,
          nome: item.nome,
          tipo: String(item.tipo || '-').toUpperCase(),
          data_inicio: item.data_inicio || semana.data_inicio,
          data_fim: item.data_fim || semana.data_fim,
        });
      }
    });

    const noturnoResponsavel = alocacoesDisponiveis.find((a) => a.tipo_turno === "plantao" && String(a.funcao || "").toLowerCase() === "mecanico")
      || alocacoesDisponiveis.find((a) => a.tipo_turno === "noturno" && String(a.funcao || "").toLowerCase() === "mecanico")
      || null;

    return {
      ...semana,
      diurno_mecanicos: alocacoesDisponiveis.filter((a) => a.tipo_turno === "diurno" && String(a.funcao || "").toLowerCase() === "mecanico"),
      apoio_operacional: alocacoesDisponiveis.filter((a) => a.tipo_turno === "apoio"),
      noturno: noturnoResponsavel ? [noturnoResponsavel] : [],
      folgas_afastamentos: Array.from(folgasAfastamentosMap.values()),
    };
  }, null);
}

function getOSResumoStatus() {
  return safeGet(() => {
    const rows = db
      .prepare(
        `
        SELECT status, COUNT(*) AS total
        FROM os
        GROUP BY status
      `
      )
      .all();

    const resumo = {
      abertas: 0,
      andamento: 0,
      fechadas: 0,
    };

    rows.forEach((row) => {
      const status = String(row.status || "").toUpperCase();
      const total = Number(row.total || 0);

      if (status === "ABERTA" || status === "AGUARDANDO_EQUIPE") resumo.abertas += total;
      else if (status === "ANDAMENTO" || status === "PAUSADA") resumo.andamento += total;
      else if (status === "CONCLUIDA" || status === "CANCELADA" || status === "FINALIZADA" || status === "FECHADA") {
        resumo.fechadas += total;
      }
    });

    return resumo;
  }, { abertas: 0, andamento: 0, fechadas: 0 });
}

function getOSPainel(limit = 15) {
  return safeGet(() => {
    const tamanho = Math.min(Math.max(Number(limit) || 15, 1), 50);
    const osCols = tableExists("os") ? db.prepare("PRAGMA table_info(os)").all().map((c) => c.name) : [];
    const usuariosSource = resolveUsuariosSource();
    const hasColaboradores = tableExists("colaboradores");
    const hasExecColab = osCols.includes("executor_colaborador_id");
    const hasAuxColab = osCols.includes("auxiliar_colaborador_id");
    const hasMecanicoUser = osCols.includes("mecanico_user_id");
    const hasAuxiliarUser = osCols.includes("auxiliar_user_id");
    const hasResponsavelUser = osCols.includes("responsavel_user_id");
    const hasEquipamentoManual = osCols.includes("equipamento_manual");
    const hasEquipamento = osCols.includes("equipamento");
    const hasAbertura = osCols.includes("abertura");
    const hasOpenedAt = osCols.includes("opened_at");
    const hasCreatedAt = osCols.includes("created_at");
    const hasClosedAt = osCols.includes("closed_at");
    const orderCol = hasAbertura
      ? "o.abertura"
      : hasOpenedAt
      ? "o.opened_at"
      : hasCreatedAt
      ? "o.created_at"
      : "o.id";
    const aberturaExpr = hasAbertura && hasOpenedAt && hasCreatedAt
      ? "COALESCE(o.abertura, o.opened_at, o.created_at)"
      : hasAbertura && hasOpenedAt
      ? "COALESCE(o.abertura, o.opened_at)"
      : hasAbertura && hasCreatedAt
      ? "COALESCE(o.abertura, o.created_at)"
      : hasOpenedAt && hasCreatedAt
      ? "COALESCE(o.opened_at, o.created_at)"
      : hasAbertura
      ? "o.abertura"
      : hasOpenedAt
      ? "o.opened_at"
      : hasCreatedAt
      ? "o.created_at"
      : "NULL";

    const total =
      db
        .prepare(
          `
          SELECT COUNT(*) AS total
          FROM os
          WHERE UPPER(COALESCE(status,'')) IN ('ABERTA','AGUARDANDO_EQUIPE','ANDAMENTO','EM_ANDAMENTO','PAUSADA')
        `
        )
        .get()?.total || 0;

    const grauExpr = resolveOSGrauExpression();

    const equipamentoExpr = hasEquipamentoManual && hasEquipamento
      ? "COALESCE(e.nome, o.equipamento_manual, o.equipamento, '-')"
      : hasEquipamentoManual
      ? "COALESCE(e.nome, o.equipamento_manual, '-')"
      : hasEquipamento
      ? "COALESCE(e.nome, o.equipamento, '-')"
      : "COALESCE(e.nome, '-')";

    const itens = db
      .prepare(
        `
          SELECT o.id,
                 ${equipamentoExpr} AS equipamento,
                 o.tipo,
                 o.status,
                 ${aberturaExpr} AS abertura,
                 ${hasOpenedAt ? "o.opened_at" : "NULL"} AS opened_at,
                 ${hasClosedAt ? "o.closed_at" : "NULL"} AS closed_at,
                 COALESCE(o.prioridade,'MEDIA') AS prioridade,
                 ${grauExpr} AS grau,
                 COALESCE(e.setor,'-') AS setor,
                 ${hasResponsavelUser ? "o.responsavel_user_id" : "NULL"} AS responsavel_user_id,
                 ${hasMecanicoUser ? "o.mecanico_user_id" : "NULL"} AS mecanico_user_id,
                 ${hasAuxiliarUser ? "o.auxiliar_user_id" : "NULL"} AS auxiliar_user_id,
                 ${usuariosSource ? `COALESCE(usol.${usuariosSource.nameCol},'-')` : "'-'"} AS solicitante,
                 ${hasColaboradores && hasExecColab ? "COALESCE(ce.nome, '')" : "''"} AS executor_nome,
                 ${hasColaboradores && hasAuxColab ? "COALESCE(ca.nome, '')" : "''"} AS auxiliar_nome,
                 ${usuariosSource && hasMecanicoUser ? `COALESCE(umec.${usuariosSource.nameCol}, '')` : "''"} AS mecanico_user_nome,
                 ${usuariosSource && hasAuxiliarUser ? `COALESCE(uaux.${usuariosSource.nameCol}, '')` : "''"} AS auxiliar_user_nome,
                 ${usuariosSource && hasResponsavelUser ? `COALESCE(uresp.${usuariosSource.nameCol}, '')` : "''"} AS responsavel_user_nome
          FROM os o
          LEFT JOIN equipamentos e ON e.id = o.equipamento_id
          ${usuariosSource ? `LEFT JOIN ${usuariosSource.table} usol ON usol.${usuariosSource.idCol} = o.opened_by` : ""}
          ${usuariosSource && hasMecanicoUser ? `LEFT JOIN ${usuariosSource.table} umec ON umec.${usuariosSource.idCol} = o.mecanico_user_id` : ""}
          ${usuariosSource && hasAuxiliarUser ? `LEFT JOIN ${usuariosSource.table} uaux ON uaux.${usuariosSource.idCol} = o.auxiliar_user_id` : ""}
          ${usuariosSource && hasResponsavelUser ? `LEFT JOIN ${usuariosSource.table} uresp ON uresp.${usuariosSource.idCol} = o.responsavel_user_id` : ""}
          ${hasColaboradores && hasExecColab ? "LEFT JOIN colaboradores ce ON ce.id = o.executor_colaborador_id" : ""}
          ${hasColaboradores && hasAuxColab ? "LEFT JOIN colaboradores ca ON ca.id = o.auxiliar_colaborador_id" : ""}
          WHERE UPPER(COALESCE(o.status,'')) IN ('ABERTA','AGUARDANDO_EQUIPE','ANDAMENTO','EM_ANDAMENTO','PAUSADA')
          ORDER BY datetime(${orderCol}) DESC
          LIMIT ?
        `
      )
      .all(tamanho)
      .map((item) => {
        const nomes = [
          item.executor_nome,
          item.mecanico_user_nome,
          item.auxiliar_nome,
          item.auxiliar_user_nome,
          item.responsavel_user_nome,
        ]
          .map((x) => String(x || "").trim())
          .filter(Boolean)
          .filter((nome, idx, arr) => arr.indexOf(nome) === idx);
        const prio = String(item.grau || item.prioridade || "MEDIA").toUpperCase();
        const criticidadeBaixa = ["BAIXA", "BAIXO"].includes(prio);
        const limiteResponsaveis = criticidadeBaixa ? 1 : 2;
        const nomesLimitados = nomes.slice(0, limiteResponsaveis);
        return {
          ...item,
          equipamento: item.equipamento || "-",
          responsavel_exibicao: nomesLimitados.length ? nomesLimitados.join(", ") : "-",
        };
      });

    return {
      items: itens,
      total,
      pageSize: tamanho,
    };
  }, {
    items: [],
    total: 0,
    pageSize: 15,
  });
}


function getComprasResumoDashboard() {
  return safeGet(() => {
    const hasSolicitacoes = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='solicitacoes'").get();
    if (hasSolicitacoes) {
      const row = db.prepare(`
        SELECT
          SUM(CASE WHEN status IN ('ABERTA','EM_COTACAO') THEN 1 ELSE 0 END) AS solicitacoes_abertas,
          SUM(CASE WHEN status = 'COMPRADA' THEN 1 ELSE 0 END) AS solicitacoes_aprovadas
        FROM solicitacoes
      `).get() || {};
      return {
        solicitacoes_abertas: Number(row.solicitacoes_abertas || 0),
        solicitacoes_aprovadas: Number(row.solicitacoes_aprovadas || 0),
      };
    }

    const hasLegacy = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='solicitacoes_compra'").get();
    if (!hasLegacy) return { solicitacoes_abertas: 0, solicitacoes_aprovadas: 0 };

    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN status IN ('aberta','em_cotacao') THEN 1 ELSE 0 END) AS solicitacoes_abertas,
        SUM(CASE WHEN status IN ('aprovada','aprovada_compra','liberada') THEN 1 ELSE 0 END) AS solicitacoes_aprovadas
      FROM solicitacoes_compra
    `).get() || {};

    return {
      solicitacoes_abertas: Number(row.solicitacoes_abertas || 0),
      solicitacoes_aprovadas: Number(row.solicitacoes_aprovadas || 0),
    };
  }, { solicitacoes_abertas: 0, solicitacoes_aprovadas: 0 });
}

function getEstoqueResumoDashboard() {
  return safeGet(() => {
    const row = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM estoque_itens WHERE ativo=1) AS itens,
        (SELECT COUNT(*) FROM vw_estoque_saldo s JOIN estoque_itens i ON i.id=s.item_id WHERE i.ativo=1 AND s.saldo < COALESCE(i.estoque_min,0)) AS abaixo_minimo
    `).get() || {};

    const ultimasMov = db.prepare(`
      SELECT m.id, m.tipo, m.quantidade, m.created_at, i.nome AS item_nome
      FROM estoque_movimentos m
      JOIN estoque_itens i ON i.id = m.item_id
      ORDER BY m.id DESC
      LIMIT 5
    `).all();

    return {
      itens_ativos: Number(row.itens || 0),
      abaixo_minimo: Number(row.abaixo_minimo || 0),
      ultimas_movimentacoes: ultimasMov,
    };
  }, { itens_ativos: 0, abaixo_minimo: 0, ultimas_movimentacoes: [] });
}

function getDemandasResumoDashboard() {
  return safeGet(() => {
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN status='NOVA' THEN 1 ELSE 0 END) AS novas,
        SUM(CASE WHEN status='EM_ANDAMENTO' THEN 1 ELSE 0 END) AS em_andamento,
        SUM(CASE WHEN status='PARADA' THEN 1 ELSE 0 END) AS paradas
      FROM demandas
    `).get() || {};

    const emTrabalho = db.prepare(`
      SELECT id, titulo, prioridade
      FROM demandas
      WHERE status='EM_ANDAMENTO'
      ORDER BY id DESC
      LIMIT 5
    `).all();

    return {
      novas: Number(row.novas || 0),
      em_andamento: Number(row.em_andamento || 0),
      paradas: Number(row.paradas || 0),
      em_trabalho: emTrabalho,
    };
  }, { novas: 0, em_andamento: 0, paradas: 0, em_trabalho: [] });
}

function getHistoricoEquipamentos(limit = 8) {
  return safeGet(() => {
    return db
      .prepare(
        `
        SELECT
          COALESCE(equipamento, '-') AS equipamento,
          COUNT(*) AS total_os,
          SUM(CASE WHEN status IN ('ABERTA','ANDAMENTO','PAUSADA') THEN 1 ELSE 0 END) AS os_abertas,
          SUM(CASE WHEN UPPER(tipo) = 'CORRETIVA' THEN 1 ELSE 0 END) AS corretivas,
          SUM(CASE WHEN UPPER(tipo) = 'PREVENTIVA' THEN 1 ELSE 0 END) AS preventivas
        FROM os
        GROUP BY COALESCE(equipamento, '-')
        ORDER BY os_abertas DESC, total_os DESC, equipamento ASC
        LIMIT ?
      `
      )
      .all(Number(limit) || 8);
  }, []);
}


function getAvisosDashboard(limit = 10) {
  return safeGet(() => {
    const cols = db.prepare("PRAGMA table_info(avisos)").all();
    const hasVisibleUntil = cols.some((c) => String(c.name || "").toLowerCase() === "visible_until");

    const sql = hasVisibleUntil
      ? `
        SELECT a.id, a.titulo, a.mensagem, a.colaborador_nome, a.data_referencia, a.created_at, a.visible_until,
               COALESCE(u.name, 'Sistema') AS autor_nome
        FROM avisos a
        LEFT JOIN users u ON u.id = a.created_by
        WHERE a.visible_until IS NULL OR datetime(a.visible_until) >= datetime('now')
        ORDER BY a.id DESC
        LIMIT ?
      `
      : `
        SELECT a.id, a.titulo, a.mensagem, a.colaborador_nome, a.data_referencia, a.created_at,
               COALESCE(u.name, 'Sistema') AS autor_nome
        FROM avisos a
        LEFT JOIN users u ON u.id = a.created_by
        ORDER BY a.id DESC
        LIMIT ?
      `;

    return db.prepare(sql).all(Number(limit) || 10);
  }, []);
}

function createAviso({ titulo, mensagem, colaborador_nome, data_referencia, createdBy }) {
  return safeGet(() => {
    const info = db
      .prepare(`
        INSERT INTO avisos (titulo, mensagem, colaborador_nome, data_referencia, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      .run(titulo, mensagem, colaborador_nome || null, data_referencia || null, createdBy || null);

    return Number(info.lastInsertRowid);
  }, null);
}

/* ===============================
   PREVENTIVAS ATIVAS (DASHBOARD)
   tabelas corretas: preventiva_planos / preventiva_execucoes
=================================*/

function parseResponsavelTextoLimitado(responsavel, limit = 2) {
  const nomes = String(responsavel || "")
    .split(",")
    .map((nome) => nome.trim())
    .filter((nome) => {
      if (!nome) return false;
      const normalizado = nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return !["-", "equipe manutencao", "equipe de manutencao", "manutencao"].includes(normalizado);
    });
  return nomes.slice(0, Math.max(1, Number(limit) || 2));
}

function getPreventivasDashboard() {
  return safeGet(() => {
    if (typeof preventivasService?.sincronizarPreventivasComEscala === "function") {
      preventivasService.sincronizarPreventivasComEscala({ origem: "dashboard.getPreventivasDashboard" });
    }
    const cols = tableExists("preventiva_execucoes")
      ? db.prepare("PRAGMA table_info(preventiva_execucoes)").all().map((c) => c.name)
      : [];
    const hasResp1 = cols.includes("responsavel_1_id");
    const hasResp2 = cols.includes("responsavel_2_id");
    const usuariosSource = resolveUsuariosSource();
    const hasUsers = !!usuariosSource;
    const hasIniciadaEm = cols.includes("iniciada_em");
    const criticidadeExpr = cols.includes("criticidade")
      ? "UPPER(COALESCE(pe.criticidade, e.criticidade, 'MEDIA'))"
      : "UPPER(COALESCE(e.criticidade, 'MEDIA'))";

    const fetchRows = () => db
      .prepare(
        `
      SELECT
        pe.id,
        pe.plano_id,
        pp.equipamento_id,
        COALESCE(e.nome, pp.titulo, '-') AS equipamento_nome,
        COALESCE(e.tipo, pp.titulo, '-') AS equipamento_tipo,
        pe.data_prevista,
        UPPER(COALESCE(pe.status, 'PENDENTE')) AS status,
        pe.responsavel,
        pe.observacao,
        ${criticidadeExpr} AS criticidade,
        ${hasResp1 ? "pe.responsavel_1_id" : "NULL"} AS responsavel_1_id,
        ${hasResp2 ? "pe.responsavel_2_id" : "NULL"} AS responsavel_2_id,
        ${hasResp1 && hasUsers ? `u1.${usuariosSource.nameCol}` : "NULL"} AS responsavel_1_nome,
        ${hasResp2 && hasUsers ? `u2.${usuariosSource.nameCol}` : "NULL"} AS responsavel_2_nome,
        ${hasResp1 && tableExists("colaboradores") ? "c1.nome" : "NULL"} AS responsavel_1_colaborador_nome,
        ${hasResp2 && tableExists("colaboradores") ? "c2.nome" : "NULL"} AS responsavel_2_colaborador_nome
      FROM preventiva_execucoes pe
      JOIN preventiva_planos pp ON pp.id = pe.plano_id
      LEFT JOIN equipamentos e ON e.id = pp.equipamento_id
      ${hasResp1 && hasUsers ? `LEFT JOIN ${usuariosSource.table} u1 ON u1.${usuariosSource.idCol} = pe.responsavel_1_id` : ""}
      ${hasResp2 && hasUsers ? `LEFT JOIN ${usuariosSource.table} u2 ON u2.${usuariosSource.idCol} = pe.responsavel_2_id` : ""}
      ${hasResp1 && tableExists("colaboradores") ? "LEFT JOIN colaboradores c1 ON c1.id = pe.responsavel_1_id" : ""}
      ${hasResp2 && tableExists("colaboradores") ? "LEFT JOIN colaboradores c2 ON c2.id = pe.responsavel_2_id" : ""}
      WHERE UPPER(COALESCE(pe.status,'')) IN ('PENDENTE','ANDAMENTO','EM_ANDAMENTO')
      ORDER BY
        CASE WHEN pe.data_prevista IS NULL THEN 1 ELSE 0 END,
        pe.data_prevista ASC,
        pe.id ASC
      LIMIT 10
    `
      )
      .all();

    let rows = fetchRows();

    if (typeof preventivasService?.alocarEquipeExecucaoPreventiva === "function") {
      const idsParaReprocessar = rows
        .filter((item) => {
          const nomes = parseResponsavelTextoLimitado(item.responsavel, 10);
          const semIds = !Number(item.responsavel_1_id || 0) && !Number(item.responsavel_2_id || 0);
          return semIds || nomes.length > 2;
        })
        .map((item) => Number(item.id))
        .filter(Boolean);

      if (idsParaReprocessar.length) {
        idsParaReprocessar.forEach((id) => {
          preventivasService.alocarEquipeExecucaoPreventiva(id);
        });
        rows = fetchRows();
      }
    }

    const userIds = Array.from(new Set(rows.flatMap((item) => [item.responsavel_1_id, item.responsavel_2_id]).map((x) => Number(x)).filter(Boolean)));
    const usersMap = new Map();
    if (userIds.length && usuariosSource) {
      const placeholders = userIds.map(() => "?").join(",");
      const users = db.prepare(`
        SELECT ${usuariosSource.idCol} AS id, ${usuariosSource.nameCol} AS nome
        FROM ${usuariosSource.table}
        WHERE ${usuariosSource.idCol} IN (${placeholders})
      `).all(...userIds);
      users.forEach((u) => usersMap.set(Number(u.id), String(u.nome || "").trim()));
    }
    if (userIds.length && tableExists("colaboradores")) {
      const placeholders = userIds.map(() => "?").join(",");
      const colaboradores = db.prepare(`SELECT id, nome FROM colaboradores WHERE id IN (${placeholders})`).all(...userIds);
      colaboradores.forEach((c) => {
        if (!usersMap.has(Number(c.id))) usersMap.set(Number(c.id), String(c.nome || "").trim());
      });
    }

    const items = rows.map((item) => {
      const responsaveisIds = [
        usersMap.get(Number(item.responsavel_1_id)) || item.responsavel_1_nome || item.responsavel_1_colaborador_nome,
        usersMap.get(Number(item.responsavel_2_id)) || item.responsavel_2_nome || item.responsavel_2_colaborador_nome,
      ]
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .slice(0, 2);
      const responsavelTexto = parseResponsavelTextoLimitado(item.responsavel, 2);
      const responsaveis = responsaveisIds.length ? responsaveisIds : responsavelTexto;
      return {
        ...item,
        responsaveis,
        responsavel_exibicao: responsaveis.length ? responsaveis.join(", ") : "-",
      };
    });

    const resumoRows = db.prepare(`
      SELECT UPPER(COALESCE(status, 'PENDENTE')) AS status, COUNT(*) AS total
      FROM preventiva_execucoes
      GROUP BY UPPER(COALESCE(status, 'PENDENTE'))
    `).all();
    const resumo = { abertas: 0, andamento: 0, fechadas: 0 };
    resumoRows.forEach((r) => {
      const st = String(r.status || "");
      const t = Number(r.total || 0);
      if (["PENDENTE"].includes(st)) resumo.abertas += t;
      else if (["EM_ANDAMENTO", "ANDAMENTO"].includes(st)) resumo.andamento += t;
      else if (["EXECUTADA", "CONCLUIDA", "FINALIZADA", "CANCELADA"].includes(st)) resumo.fechadas += t;
    });

    const criticidadeLista = db.prepare(`
      SELECT UPPER(COALESCE(pe.status,'PENDENTE')) AS status,
             ${criticidadeExpr} AS criticidade
      FROM preventiva_execucoes pe
      JOIN preventiva_planos pp ON pp.id = pe.plano_id
      LEFT JOIN equipamentos e ON e.id = pp.equipamento_id
      WHERE UPPER(COALESCE(pe.status,'')) IN ('PENDENTE','ANDAMENTO','EM_ANDAMENTO')
    `).all();
    const criticidadeContagem = typeof preventivasService?.contarPreventivasPorCriticidade === "function"
      ? preventivasService.contarPreventivasPorCriticidade(criticidadeLista)
      : { baixa: 0, media: 0, alta: 0, critica: 0 };
    const criticidade = {
      BAIXA: Number(criticidadeContagem.baixa || 0),
      MEDIA: Number(criticidadeContagem.media || 0),
      ALTA: Number(criticidadeContagem.alta || 0),
      CRITICA: Number(criticidadeContagem.critica || 0),
    };

    return {
      items,
      resumo,
      criticidade,
      limite: 10,
      totalAtivas: items.length,
      hasIniciadaEm,
    };
  }, { items: [], resumo: { abertas: 0, andamento: 0, fechadas: 0 }, criticidade: { BAIXA: 0, MEDIA: 0, ALTA: 0, CRITICA: 0 }, limite: 10, totalAtivas: 0, hasIniciadaEm: false });
}

function podeIniciarPreventiva(user, preventiva) {
  const role = normalizeRole(user?.role);
  if (!user?.id) return false;
  if (role === "ADMIN" || role === "MANUTENCAO_SUPERVISOR" || role === "SUPERVISOR_MANUTENCAO" || role === "ENCARREGADO_MANUTENCAO") return true;
  const ids = [preventiva?.responsavel_1_id, preventiva?.responsavel_2_id].map((x) => Number(x)).filter(Boolean);
  return ids.includes(Number(user.id));
}

function iniciarPreventiva(execucaoId, user) {
  return safeGet(() => {
    if (typeof preventivasService?.sincronizarPreventivasComEscala === "function") {
      preventivasService.sincronizarPreventivasComEscala({ origem: "dashboard.iniciarPreventiva" });
    }
    if (typeof preventivasService?.alocarEquipeExecucaoPreventiva === "function") {
      preventivasService.alocarEquipeExecucaoPreventiva(Number(execucaoId));
    }
    const cols = tableExists("preventiva_execucoes")
      ? db.prepare("PRAGMA table_info(preventiva_execucoes)").all().map((c) => c.name)
      : [];
    const hasIniciadaEm = cols.includes("iniciada_em");
    const hasIniciadaPor = cols.includes("iniciada_por_user_id");
    const hasResp1 = cols.includes("responsavel_1_id");
    const hasResp2 = cols.includes("responsavel_2_id");
    const preventiva = db.prepare(`
      SELECT id, status, ${hasResp1 ? "responsavel_1_id" : "NULL AS responsavel_1_id"}, ${hasResp2 ? "responsavel_2_id" : "NULL AS responsavel_2_id"}
      FROM preventiva_execucoes
      WHERE id = ?
      LIMIT 1
    `).get(Number(execucaoId));
    if (!preventiva) return { ok: false, reason: "not_found" };
    if (String(preventiva.status || "").toUpperCase() !== "PENDENTE") return { ok: false, reason: "invalid_status" };
    if (!podeIniciarPreventiva(user, preventiva)) return { ok: false, reason: "forbidden" };

    const updates = ["status = 'EM_ANDAMENTO'"];
    if (hasIniciadaEm) updates.push("iniciada_em = COALESCE(iniciada_em, datetime('now'))");
    if (hasIniciadaPor) updates.push("iniciada_por_user_id = ?");
    const args = [];
    if (hasIniciadaPor) args.push(Number(user.id));
    args.push(Number(execucaoId));
    db.prepare(`UPDATE preventiva_execucoes SET ${updates.join(", ")} WHERE id = ?`).run(...args);
    return { ok: true };
  }, { ok: false, reason: "error" });
}

function finalizarPreventiva(execucaoId, user) {
  return safeGet(() => {
    if (typeof preventivasService?.sincronizarPreventivasComEscala === "function") {
      preventivasService.sincronizarPreventivasComEscala({ origem: "dashboard.finalizarPreventiva" });
    }
    const cols = tableExists("preventiva_execucoes")
      ? db.prepare("PRAGMA table_info(preventiva_execucoes)").all().map((c) => c.name)
      : [];
    const hasResp1 = cols.includes("responsavel_1_id");
    const hasResp2 = cols.includes("responsavel_2_id");
    const hasFinalizadaEm = cols.includes("finalizada_em");
    const hasFinalizadaPor = cols.includes("finalizada_por_user_id");
    const hasDuracao = cols.includes("duracao_minutos");
    const preventiva = db.prepare(`
      SELECT id, status, iniciada_em,
             ${hasResp1 ? "responsavel_1_id" : "NULL AS responsavel_1_id"},
             ${hasResp2 ? "responsavel_2_id" : "NULL AS responsavel_2_id"}
      FROM preventiva_execucoes
      WHERE id = ?
      LIMIT 1
    `).get(Number(execucaoId));
    if (!preventiva) return { ok: false, reason: "not_found" };
    if (!["EM_ANDAMENTO", "ANDAMENTO"].includes(String(preventiva.status || "").toUpperCase())) return { ok: false, reason: "invalid_status" };
    if (!podeIniciarPreventiva(user, preventiva)) return { ok: false, reason: "forbidden" };

    const updates = ["status = 'FINALIZADA'", "data_executada = date('now')"];
    const args = [];
    if (hasFinalizadaEm) updates.push("finalizada_em = COALESCE(finalizada_em, datetime('now'))");
    if (hasFinalizadaPor) {
      updates.push("finalizada_por_user_id = ?");
      args.push(Number(user.id));
    }
    if (hasDuracao) {
      updates.push("duracao_minutos = CASE WHEN iniciada_em IS NULL THEN duracao_minutos ELSE CAST((julianday(datetime('now')) - julianday(iniciada_em)) * 24 * 60 AS INTEGER) END");
    }
    args.push(Number(execucaoId));
    db.prepare(`UPDATE preventiva_execucoes SET ${updates.join(", ")} WHERE id = ?`).run(...args);
    return { ok: true };
  }, { ok: false, reason: "error" });
}

function getPreventivasEmAndamentoEquipe(limit = 10) {
  return safeGet(() => {
    const cols = tableExists("preventiva_execucoes")
      ? db.prepare("PRAGMA table_info(preventiva_execucoes)").all().map((c) => c.name)
      : [];
    const hasResp1 = cols.includes("responsavel_1_id");
    const hasResp2 = cols.includes("responsavel_2_id");
    return db.prepare(`
      SELECT pe.id,
             COALESCE(e.nome, pp.titulo, '-') AS equipamento,
             pe.status,
             pe.responsavel,
             ${hasResp1 ? "u1.name" : "NULL"} AS resp1,
             ${hasResp2 ? "u2.name" : "NULL"} AS resp2
      FROM preventiva_execucoes pe
      JOIN preventiva_planos pp ON pp.id = pe.plano_id
      LEFT JOIN equipamentos e ON e.id = pp.equipamento_id
      ${hasResp1 ? "LEFT JOIN users u1 ON u1.id = pe.responsavel_1_id" : ""}
      ${hasResp2 ? "LEFT JOIN users u2 ON u2.id = pe.responsavel_2_id" : ""}
      WHERE UPPER(COALESCE(pe.status,'')) IN ('EM_ANDAMENTO','ANDAMENTO')
      ORDER BY COALESCE(pe.iniciada_em, pe.created_at) DESC, pe.id DESC
      LIMIT ?
    `).all(Number(limit) || 10).map((r) => ({
      ...r,
      equipe: [r.resp1, r.resp2].filter(Boolean).join(" • ") || parseResponsavelTextoLimitado(r.responsavel, 2).join(" • ") || "-",
    }));
  }, []);
}

/* ===============================
   ESCALA
   retorna no formato que a view espera:
   { turno_dia: "NOMES", turno_noite: "NOMES" }
=================================*/
function getEscalaSemana() {
  // tenta o método existente (seja qual for o nome)
  const raw = safeGet(() => {
    if (!escalaService) return null;

    if (typeof escalaService.getPlantaoAgora === "function") {
      return escalaService.getPlantaoAgora();
    }
    if (typeof escalaService.getSemanaAtualDashboard === "function") {
      return escalaService.getSemanaAtualDashboard();
    }
    return null;
  }, null);

  if (!raw) return null;

  // normaliza vários formatos possíveis
  // 1) já veio como strings
  if (raw.turno_dia || raw.turno_noite) {
    return {
      turno_dia: raw.turno_dia || "-",
      turno_noite: raw.turno_noite || "-",
    };
  }

  // 2) veio com arrays (dia/noite)
  if (Array.isArray(raw.dia) || Array.isArray(raw.noite)) {
    return {
      turno_dia: Array.isArray(raw.dia) && raw.dia.length ? raw.dia.join(", ") : "-",
      turno_noite: Array.isArray(raw.noite) && raw.noite.length ? raw.noite.join(", ") : "-",
    };
  }

  // 3) veio com campos diferentes (plantao, etc.)
  return {
    turno_dia: raw.dia || raw.turnoDia || raw.diurno || "-",
    turno_noite: raw.noite || raw.turnoNoite || raw.noturno || "-",
  };
}


function getOSEmAndamento() {
  return safeGet(() => {
    const osCols = tableExists("os") ? db.prepare("PRAGMA table_info(os)").all().map((c) => c.name) : [];
    const hasExecColab = osCols.includes("executor_colaborador_id");
    const hasAuxColab = osCols.includes("auxiliar_colaborador_id");
    const orderCol = osCols.includes("abertura")
      ? "o.abertura"
      : osCols.includes("opened_at")
      ? "o.opened_at"
      : osCols.includes("created_at")
      ? "o.created_at"
      : "o.id";

    const rows = db.prepare(`
      SELECT o.id,
             COALESCE(e.nome, o.equipamento_manual, o.equipamento, '-') AS equipamento,
             o.status,
             COALESCE(ce.nome, 'Não atribuído') AS executor_nome,
             COALESCE(ca.nome, '') AS auxiliar_nome
      FROM os o
      LEFT JOIN equipamentos e ON e.id = o.equipamento_id
      LEFT JOIN colaboradores ce ON ce.id = ${hasExecColab ? "o.executor_colaborador_id" : "NULL"}
      LEFT JOIN colaboradores ca ON ca.id = ${hasAuxColab ? "o.auxiliar_colaborador_id" : "NULL"}
      WHERE ${hasExecColab ? "o.executor_colaborador_id IS NOT NULL" : "1=1"}
        AND UPPER(COALESCE(o.status,'')) IN ('ABERTA','ANDAMENTO','EM_ANDAMENTO')
      ORDER BY datetime(${orderCol}) DESC
      LIMIT 10
    `).all();

    return rows.map((o) => ({
      ...o,
      equipe: o.auxiliar_nome ? `${o.executor_nome} + ${o.auxiliar_nome}` : o.executor_nome,
    }));
  }, []);
}

module.exports = {
  getCards,
  getMotoresResumoDashboard,
  getOSResumoStatus,
  getOSPainel,
  getOSEmAndamento,
  getHistoricoEquipamentos,
  getComprasResumoDashboard,
  getEstoqueResumoDashboard,
  getDemandasResumoDashboard,
  getAvisosDashboard,
  createAviso,
  getPreventivasDashboard,
  getEscalaSemana,
  getEscalaPainelSemana,
  getMecanicosRankingSemana,
  iniciarPreventiva,
  finalizarPreventiva,
  getPreventivasEmAndamentoEquipe,
};
