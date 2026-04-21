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

function getEscalaPainelSemana() {
  return safeGet(() => {
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
        WHERE NOT (x.data_fim < ? OR x.data_inicio > ?)
        ORDER BY c.nome ASC
      `
      )
      .all(semana.data_inicio, semana.data_fim), []);

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

    const noturnoResponsavel = alocacoes.find((a) => a.tipo_turno === "plantao" && String(a.funcao || "").toLowerCase() === "mecanico")
      || alocacoes.find((a) => a.tipo_turno === "noturno" && String(a.funcao || "").toLowerCase() === "mecanico")
      || null;

    return {
      ...semana,
      diurno_mecanicos: alocacoes.filter((a) => a.tipo_turno === "diurno" && String(a.funcao || "").toLowerCase() === "mecanico"),
      apoio_operacional: alocacoes.filter((a) => a.tipo_turno === "apoio"),
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
    const hasExecColab = osCols.includes("executor_colaborador_id");
    const hasAuxColab = osCols.includes("auxiliar_colaborador_id");
    const orderCol = osCols.includes("abertura")
      ? "o.abertura"
      : osCols.includes("opened_at")
      ? "o.opened_at"
      : osCols.includes("created_at")
      ? "o.created_at"
      : "o.id";

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

    const itens = db
      .prepare(
        `
          SELECT o.id,
                 COALESCE(e.nome, o.equipamento_manual, o.equipamento) AS equipamento,
                 o.tipo,
                 o.status,
                 COALESCE(o.abertura, o.opened_at, o.created_at) AS abertura,
                 o.opened_at,
                 o.closed_at,
                 COALESCE(o.prioridade,'MEDIA') AS prioridade,
                 ${grauExpr} AS grau,
                 COALESCE(e.setor,'-') AS setor,
                 COALESCE(u.name,'-') AS solicitante,
                 COALESCE(ce.nome, '') AS executor_nome,
                 COALESCE(ca.nome, '') AS auxiliar_nome
          FROM os o
          LEFT JOIN equipamentos e ON e.id = o.equipamento_id
          LEFT JOIN users u ON u.id = o.opened_by
          LEFT JOIN colaboradores ce ON ce.id = ${hasExecColab ? "o.executor_colaborador_id" : "NULL"}
          LEFT JOIN colaboradores ca ON ca.id = ${hasAuxColab ? "o.auxiliar_colaborador_id" : "NULL"}
          WHERE UPPER(COALESCE(o.status,'')) IN ('ABERTA','AGUARDANDO_EQUIPE','ANDAMENTO','EM_ANDAMENTO','PAUSADA')
          ORDER BY datetime(${orderCol}) DESC
          LIMIT ?
        `
      )
      .all(tamanho)
      .map((item) => {
        const nomes = [item.executor_nome, item.auxiliar_nome].map((x) => String(x || "").trim()).filter(Boolean);
        return {
          ...item,
          responsavel_exibicao: nomes.length ? nomes.join(", ") : "-",
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
  iniciarPreventiva,
  finalizarPreventiva,
  getPreventivasEmAndamentoEquipe,
};
