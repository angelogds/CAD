const db = require("../../database/db");
const { classificarLocalizacao, STATUS_LOCALIZACAO } = require("./escala.geo");
const { getAgoraSaoPauloParts, getTurnoOperacionalAgora, getTiposTurnoEscala } = require("../../utils/turno-operacional");


function tableExists(tableName) {
  try {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
    return !!row;
  } catch (_e) {
    return false;
  }
}


function sqlColumnOrNull(table, candidates, alias, tableAlias = '') {
  if (!tableExists(table)) return `NULL AS ${alias}`;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const found = candidates.find((name) => cols.includes(name));
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return found ? `${prefix}${found} AS ${alias}` : `NULL AS ${alias}`;
}

function normalizarNome(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function isColaboradorDemo(colaborador = {}) {
  const nome = normalizarNome(colaborador.nome || colaborador.name || '');
  return Boolean(
    nome.includes('demo') ||
    nome.includes('teste') ||
    nome.includes('colaborador demo') ||
    Number(colaborador.is_demo || 0) === 1
  );
}

function isColaboradorAtivo(row = {}) {
  const status = normalizarNome(row.status || 'ativo');
  if (Number(row.ativo ?? 1) !== 1) return false;
  if (row.deleted_at) return false;
  if (row.excluido !== undefined && Number(row.excluido || 0) === 1) return false;
  if (row.is_active !== undefined && Number(row.is_active ?? 1) !== 1) return false;
  if (row.visivel !== undefined && Number(row.visivel ?? 1) !== 1) return false;
  return !['inativo', 'desligado', 'excluido', 'apagado', 'removido'].includes(status);
}

function colaboradorNomeOficial(row = {}) {
  const nome = String(row.nome || '').trim();
  const norm = normalizarNome(nome);
  if (norm === 'luiz' || norm === 'luis') return 'Luiz';
  return nome;
}

function initials(nome) {
  return String(nome || 'M')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'M';
}

function getNowSaoPauloParts() {
  const now = getAgoraSaoPauloParts();
  return {
    dateISO: now.dateISO,
    hour: now.hour,
    minute: now.minute,
  };
}

function isoToday() {
  return getNowSaoPauloParts().dateISO;
}

function turnoLabel(tipo_turno) {
  if (tipo_turno === "noturno") return "Noite";
  if (tipo_turno === "diurno") return "Dia";
  if (tipo_turno === "apoio") return "Dia";
  if (tipo_turno === "folga") return "Folga";
  if (tipo_turno === "plantao") return "Plantão";
  return String(tipo_turno || "-");
}

function normalizeTurno(turno) {
  const t = String(turno || "").trim().toLowerCase();
  if (t === "noite" || t === "noturno") return "noturno";
  if (t === "dia" || t === "diurno") return "diurno";
  if (t === "apoio") return "diurno";
  if (t === "plantao" || t === "plantão") return "plantao";
  if (t === "folga") return "folga";
  return "";
}

function normalizeFuncao(funcao) {
  const f = String(funcao || "").trim().toLowerCase();
  if (["mecânico", "mecanico", "mecanico industrial", "mecânico industrial", "auxiliar", "ajudante", "operacional", "apoio", "apoio operacional", "auxiliar de mecanico", "auxiliar de mecânico"].includes(f)) return "mecanico";
  return "mecanico";
}

function roleToFuncao(role) {
  const r = String(role || "").trim().toUpperCase();
  if (r === "MECANICO") return "MECANICO";
  return "MECANICO";
}

function currentTurno() {
  return getTurnoOperacionalAgora() === "NOITE" ? "noturno" : "diurno";
}

function getTurnoAtual() {
  return currentTurno() === "noturno" ? "NOITE" : "DIA";
}

function funcaoLabel(funcao) {
  if (funcao === "mecanico") return "Mecânico Industrial";
  return "Mecânico Industrial";
}


function normalizarDataFormulario(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const dia = br[1].padStart(2, "0");
    const mes = br[2].padStart(2, "0");
    return `${br[3]}-${mes}-${dia}`;
  }
  return raw.slice(0, 10);
}

function toDateOnly(value) {
  return normalizarDataFormulario(value);
}

function normalizeTipoAusencia(tipo) {
  const raw = String(tipo || "").trim().toUpperCase();
  if (raw === "FOLGA_MEIO_PERIODO") return "FOLGA_MEIO_PERIODO";
  if (raw === "FOLGA") return "FOLGA";
  if (raw === "ATESTADO") return "ATESTADO";
  if (raw === "FERIAS") return "FERIAS";
  return "";
}

function getColaboradorIdsAusentesNoDia(dateISO) {
  const dia = toDateOnly(dateISO) || isoToday();
  const ids = new Set();

  if (tableExists("escala_ausencias")) {
    const rowsAus = db.prepare(`
      SELECT DISTINCT colaborador_id
      FROM escala_ausencias
      WHERE ? BETWEEN data_inicio AND data_fim
    `).all(dia);
    rowsAus.forEach((row) => {
      if (row?.colaborador_id) ids.add(Number(row.colaborador_id));
    });
  }

  if (tableExists("escala_concessoes")) {
    const rowsCon = db.prepare(`
      SELECT DISTINCT colaborador_id
      FROM escala_concessoes
      WHERE ? BETWEEN inicio AND fim
    `).all(dia);
    rowsCon.forEach((row) => {
      if (row?.colaborador_id) ids.add(Number(row.colaborador_id));
    });
  }

  return ids;
}

function parseTimeToMinutes(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map((v) => Number(v));
  if (!Number.isInteger(h) || !Number.isInteger(m)) return NaN;
  return (h * 60) + m;
}

function calculateCompensacao(horaInicio, horaFim) {
  const start = parseTimeToMinutes(horaInicio);
  const end = parseTimeToMinutes(horaFim);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Horário inválido para compensação.");
  }

  const minutos = end - start;
  let concessao = "SEM_DIREITO";
  if (minutos >= 240 && minutos < 480) concessao = "MEIA";
  if (minutos >= 480) concessao = "INTEIRA";

  return { minutos, concessao };
}
function eachDateInclusive(start, end, cb) {
  const cursor = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  while (cursor <= endDate) {
    cb(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function findSemanaByDate(dateISO) {
  return db.prepare(`
    SELECT id, data_inicio, data_fim
    FROM escala_semanas
    WHERE ? BETWEEN data_inicio AND data_fim
    LIMIT 1
  `).get(dateISO);
}

function getPublicacoes() {
  try {
    return db.prepare(`
      SELECT id, titulo, created_at
      FROM escala_publicacoes
      ORDER BY created_at DESC
      LIMIT 50
    `).all();
  } catch (_e) {
    return [];
  }
}

function getSemanaPorData(dateISO) {
  const d = (dateISO || isoToday()).slice(0, 10);

  const semana = db.prepare(`
    SELECT id, semana_numero, data_inicio, data_fim, COALESCE(origem,'GERADA') AS origem, COALESCE(ajuste_manual,0) AS ajuste_manual, observacao, status
    FROM escala_semanas
    WHERE ? BETWEEN data_inicio AND data_fim
    LIMIT 1
  `).get(d);

  if (!semana) return null;

  const linhas = getLinhasSemanaComStatus(semana.id, d);

  return {
    ...semana,
    linhas,
  };
}

function getLinhasSemanaComStatus(semanaId, dateRef) {
  const semana = db.prepare(`
    SELECT id, data_inicio, data_fim
    FROM escala_semanas
    WHERE id=?
  `).get(semanaId);

  if (!semana) return [];

  const alocs = db.prepare(`
    SELECT a.id AS alocacao_id, a.tipo_turno, a.observacao,
           c.id AS colaborador_id, c.nome, c.funcao
    FROM escala_alocacoes a
    JOIN colaboradores c ON c.id = a.colaborador_id
    WHERE a.semana_id = ?
    ORDER BY
      CASE a.tipo_turno
        WHEN 'noturno' THEN 1
        WHEN 'diurno' THEN 2
        WHEN 'apoio' THEN 3
        WHEN 'plantao' THEN 4
        WHEN 'folga' THEN 5
        ELSE 9
      END,
      c.nome ASC
  `).all(semanaId);

  const ausencias = db.prepare(`
    SELECT x.colaborador_id, upper(x.tipo) AS tipo, x.data_inicio AS inicio, x.data_fim AS fim
    FROM escala_ausencias x
    WHERE NOT (x.data_fim < ? OR x.data_inicio > ?)
  `).all(semana.data_inicio, semana.data_fim);

  const concessoes = tableExists("escala_concessoes")
    ? db.prepare(`
      SELECT c.colaborador_id, c.tipo, c.inicio, c.fim
      FROM escala_concessoes c
      WHERE NOT (c.fim < ? OR c.inicio > ?)
    `).all(semana.data_inicio, semana.data_fim)
    : [];

  const mapAus = new Map();
  for (const a of [...ausencias, ...concessoes]) {
    if (!mapAus.has(a.colaborador_id)) mapAus.set(a.colaborador_id, a);
  }

  const diaFiltro = toDateOnly(dateRef || semana.data_inicio);
  const ausentesNoDia = getColaboradorIdsAusentesNoDia(diaFiltro);

  return alocs
    .filter((a) => !ausentesNoDia.has(Number(a.colaborador_id)))
    .map((a) => {
    const aus = mapAus.get(a.colaborador_id);
    const statusLabel = aus
      ? `${String(aus.tipo || '').toUpperCase()} (${aus.inicio} a ${aus.fim})`
      : "Trabalhando";

    return {
      alocacao_id: a.alocacao_id,
      colaborador_id: a.colaborador_id,
      nome: a.nome,
      tipo_turno: a.tipo_turno,
      turnoLabel: turnoLabel(a.tipo_turno),
      setor: "Manutenção",
      funcao: normalizeFuncao(a.funcao) || "mecanico",
      funcaoLabel: funcaoLabel(normalizeFuncao(a.funcao) || "mecanico"),
      statusLabel,
      observacao: a.observacao || "",
    };
  });
}

function getSemanaById(id) {
  const semana = db.prepare(`
    SELECT id, semana_numero, data_inicio, data_fim, COALESCE(origem,'GERADA') AS origem, COALESCE(ajuste_manual,0) AS ajuste_manual, observacao, status
    FROM escala_semanas
    WHERE id=?
  `).get(id);

  if (!semana) return null;

  const alocacoes = db.prepare(`
    SELECT a.id, a.tipo_turno, a.observacao,
           c.nome, c.id AS colaborador_id
    FROM escala_alocacoes a
    JOIN colaboradores c ON c.id = a.colaborador_id
    WHERE a.semana_id = ?
    ORDER BY c.nome
  `).all(id);

  return { ...semana, alocacoes };
}


function removerAlocacao(alocacaoId) {
  const info = db.prepare(`DELETE FROM escala_alocacoes WHERE id=?`).run(Number(alocacaoId));
  return info.changes > 0;
}

function atualizarTurno(alocacaoId, tipo_turno) {
  db.prepare(`
    UPDATE escala_alocacoes
    SET tipo_turno=?
    WHERE id=?
  `).run(tipo_turno, alocacaoId);
}

function listarEscalaCompleta({ dataInicio, dataFim } = {}) {
  const inicio = toDateOnly(dataInicio);
  const fim = toDateOnly(dataFim);
  const params = [];
  let where = "1=1";
  if (inicio) { where += " AND s.data_fim >= ?"; params.push(inicio); }
  if (fim) { where += " AND s.data_inicio <= ?"; params.push(fim); }

  const semanas = db.prepare(`
    SELECT s.id, s.semana_numero, s.data_inicio, s.data_fim, COALESCE(s.ajuste_manual,0) AS ajuste_manual, s.observacao,
           COALESCE(s.origem,'GERADA') AS origem, s.rodizio_config_id, s.semana_indice, COALESCE(s.status,'ATIVA') AS status
    FROM escala_semanas s
    WHERE ${where}
    ORDER BY s.data_inicio ASC, s.semana_numero ASC
  `).all(...params);

  return semanas.map((s) => {
    const alocs = db.prepare(`
      SELECT a.tipo_turno, c.nome
      FROM escala_alocacoes a
      JOIN colaboradores c ON c.id = a.colaborador_id
      WHERE a.semana_id=?
    `).all(s.id);

    const times = { noturno: [], diurno: [] };
    for (const a of alocs) {
      const turno = a.tipo_turno === "apoio" ? "diurno" : a.tipo_turno;
      if (times[turno]) times[turno].push(a.nome);
    }

    return { ...s, times };
  });
}

function getEscalaCompletaComTimes(filtros = {}) {
  return listarEscalaCompleta({ dataInicio: filtros.dataInicio || filtros.data_inicio, dataFim: filtros.dataFim || filtros.data_fim });
}

function buscarDadosPdfEscalaCompleta(filtros = {}) {
  return listarEscalaCompleta({ dataInicio: filtros.dataInicio || filtros.data_inicio || filtros.start || filtros.inicio, dataFim: filtros.dataFim || filtros.data_fim || filtros.end || filtros.fim });
}

function ensureColaborador(nome, funcao = "mecanico") {
  const n = String(nome || "").trim();
  if (!n) return null;

  const f = normalizeFuncao(funcao) || "mecanico";

  const row = db.prepare(`SELECT id, funcao FROM colaboradores WHERE lower(nome)=lower(?) LIMIT 1`).get(n);
  if (row?.id) {
    if (row.funcao !== f) {
      db.prepare(`UPDATE colaboradores SET funcao=? WHERE id=?`).run(f, row.id);
    }
    return row.id;
  }

  const info = db.prepare(`
    INSERT INTO colaboradores (nome, funcao, ativo)
    VALUES (?, ?, 1)
  `).run(n, f);

  return Number(info.lastInsertRowid);
}

function upsertAlocacaoSemana(semanaId, colabId, tipo_turno) {
  const existente = db.prepare(`
    SELECT id, tipo_turno
    FROM escala_alocacoes
    WHERE semana_id=? AND colaborador_id=?
    ORDER BY id ASC
    LIMIT 1
  `).get(semanaId, colabId);

  if (!existente?.id) {
    db.prepare(`
      INSERT INTO escala_alocacoes (semana_id, tipo_turno, colaborador_id, observacao)
      VALUES (?, ?, ?, ?)
    `).run(semanaId, tipo_turno, colabId, "Manutenção");
    return "inserted";
  }

  if (existente.tipo_turno !== tipo_turno) {
    db.prepare(`UPDATE escala_alocacoes SET tipo_turno=?, observacao=? WHERE id=?`)
      .run(tipo_turno, "Manutenção", existente.id);
    return "updated";
  }

  db.prepare(`UPDATE escala_alocacoes SET observacao=? WHERE id=?`).run("Manutenção", existente.id);
  return "ignored";
}

function adicionarRapidoPeriodo({ inicio, fim, nome, tipo_turno, funcao }) {
  const dataInicio = toDateOnly(inicio);
  const dataFim = toDateOnly(fim);

  if (!dataInicio || !dataFim) throw new Error("Preencha início e fim.");
  if (dataInicio > dataFim) throw new Error("Data final não pode ser menor que data inicial.");

  const colabId = ensureColaborador(nome, funcao);
  if (!colabId) throw new Error("Colaborador inválido.");

  db.prepare(`
    INSERT INTO escala_entries (colaborador_id, funcao, turno, inicio, fim)
    VALUES (?, ?, ?, ?, ?)
  `).run(colabId, normalizeFuncao(funcao) || "mecanico", normalizeTurno(tipo_turno), dataInicio, dataFim);

  const semanasAfetadas = new Set();
  let diasSemSemana = 0;

  eachDateInclusive(dataInicio, dataFim, (dia) => {
    const semana = findSemanaByDate(dia);
    if (!semana?.id) {
      diasSemSemana += 1;
      return;
    }
    semanasAfetadas.add(semana.id);
  });

  let inserted = 0;
  let updated = 0;
  let ignored = 0;

  for (const semanaId of semanasAfetadas) {
    const resultado = upsertAlocacaoSemana(semanaId, colabId, tipo_turno);
    if (resultado === "inserted") inserted += 1;
    else if (resultado === "updated") updated += 1;
    else ignored += 1;
  }

  return {
    inserted,
    updated,
    ignored,
    semanasAfetadas: semanasAfetadas.size,
    diasSemSemana,
    inicio: dataInicio,
    fim: dataFim,
  };
}

function lancarAusencia({
  nome,
  tipo,
  inicio,
  fim,
  motivo,
  dataServico,
  horaInicio,
  horaFim,
  equipamento,
  descricaoServico,
  funcao,
  geolocalizacao = {},
}) {
  const colabId = ensureColaborador(nome, funcao || "mecanico");
  if (!colabId) throw new Error("Colaborador inválido.");

  const tipoUpper = normalizeTipoAusencia(tipo);
  if (!tipoUpper) throw new Error("Tipo de ausência inválido.");
  const inicioIso = toDateOnly(inicio);
  const fimIso = toDateOnly(fim);

  if (!inicioIso || !fimIso || inicioIso > fimIso) {
    throw new Error("Período inválido para concessão.");
  }

  let concessao = "NAO_APLICA";
  let refCompensacaoId = null;

  const tipoConcessao = tipoUpper === "FOLGA_MEIO_PERIODO" ? "FOLGA" : tipoUpper;

  if (tipoConcessao === "FOLGA" && dataServico && horaInicio && horaFim) {
    const calculo = calculateCompensacao(horaInicio, horaFim);
    concessao = calculo.concessao === "SEM_DIREITO" ? "MEIA" : calculo.concessao;

    const inicioGeo = classificarLocalizacao({
      latitude: geolocalizacao.latitudeInicio,
      longitude: geolocalizacao.longitudeInicio,
      status: geolocalizacao.statusLocalizacaoInicio,
    });
    const fimGeo = classificarLocalizacao({
      latitude: geolocalizacao.latitudeFim,
      longitude: geolocalizacao.longitudeFim,
      status: geolocalizacao.statusLocalizacaoFim,
    });
    const alertaLocalizacao = [inicioGeo.status, fimGeo.status].includes(STATUS_LOCALIZACAO.FORA_DA_AREA) ? 1 : 0;

    const info = db.prepare(`
      INSERT INTO escala_compensacoes (
        colaborador_id, funcao, data_servico, hora_inicio, hora_fim,
        minutos_total, concessao_sugerida, equipamento, descricao_servico,
        latitude_inicio, longitude_inicio, precisao_inicio, status_localizacao_inicio, distancia_inicio_metros,
        latitude_fim, longitude_fim, precisao_fim, status_localizacao_fim, distancia_fim_metros,
        justificativa_sem_localizacao, alerta_localizacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      colabId,
      normalizeFuncao(funcao) || "mecanico",
      toDateOnly(dataServico),
      horaInicio,
      horaFim,
      calculo.minutos,
      calculo.concessao,
      equipamento || null,
      descricaoServico || null,
      geolocalizacao.latitudeInicio || null,
      geolocalizacao.longitudeInicio || null,
      geolocalizacao.precisaoInicio || null,
      inicioGeo.status,
      inicioGeo.distanciaMetros,
      geolocalizacao.latitudeFim || null,
      geolocalizacao.longitudeFim || null,
      geolocalizacao.precisaoFim || null,
      fimGeo.status,
      fimGeo.distanciaMetros,
      geolocalizacao.justificativaSemLocalizacao || null,
      alertaLocalizacao,
    );

    refCompensacaoId = Number(info.lastInsertRowid);
  } else if (tipoUpper === "FOLGA_MEIO_PERIODO") {
    concessao = "MEIA";
  } else if (tipoConcessao === "FOLGA") {
    concessao = "INTEIRA";
  }

  db.prepare(`
    INSERT INTO escala_concessoes (colaborador_id, tipo, inicio, fim, concessao, motivo, ref_compensacao_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(colabId, tipoConcessao, inicioIso, fimIso, concessao, motivo || null, refCompensacaoId);

  if (tipoConcessao !== "FERIAS") {
    const tipoLegacy = tipoConcessao === "ATESTADO" ? "atestado" : "folga";
    db.prepare(`
      INSERT INTO escala_ausencias (colaborador_id, tipo, data_inicio, data_fim, motivo)
      VALUES (?, ?, ?, ?, ?)
    `).run(colabId, tipoLegacy, inicioIso, fimIso, motivo || null);
  }
}

function listarAusencias({ dateISO, limit = 200 } = {}) {
  const dateRef = toDateOnly(dateISO || isoToday());
  const maxRows = Math.min(Math.max(Number(limit) || 200, 1), 500);

  const concessoes = tableExists("escala_concessoes")
    ? db.prepare(`
      SELECT ec.id,
             ec.colaborador_id,
             c.nome,
             c.funcao,
             UPPER(COALESCE(ec.tipo, '-')) AS tipo,
             UPPER(COALESCE(ec.concessao, '-')) AS concessao,
             ec.inicio,
             ec.fim,
             ec.motivo
      FROM escala_concessoes ec
      JOIN colaboradores c ON c.id = ec.colaborador_id
      ORDER BY ec.inicio DESC, ec.id DESC
      LIMIT ?
    `).all(maxRows)
    : [];

  return concessoes.map((row) => ({
    id: Number(row.id),
    colaborador_id: Number(row.colaborador_id),
    nome: row.nome,
    funcaoLabel: funcaoLabel(normalizeFuncao(row.funcao) || row.funcao),
    tipo: row.tipo === "FOLGA" && row.concessao === "MEIA" ? "FOLGA_MEIO_PERIODO" : row.tipo,
    inicio: row.inicio,
    fim: row.fim,
    motivo: row.motivo || "",
    ativoNoDia: dateRef >= row.inicio && dateRef <= row.fim,
  }));
}

function atualizarAusencia({ id, tipo, inicio, fim, motivo }) {
  const ausenciaId = Number(id);
  if (!ausenciaId) throw new Error("Registro de ausência inválido.");

  const tipoUpper = normalizeTipoAusencia(tipo);
  if (!["FOLGA", "FOLGA_MEIO_PERIODO", "ATESTADO", "FERIAS"].includes(tipoUpper)) {
    throw new Error("Tipo de ausência inválido.");
  }
  const tipoConcessao = tipoUpper === "FOLGA_MEIO_PERIODO" ? "FOLGA" : tipoUpper;

  const inicioIso = toDateOnly(inicio);
  const fimIso = toDateOnly(fim);
  if (!inicioIso || !fimIso || inicioIso > fimIso) {
    throw new Error("Período inválido para ausência.");
  }

  const row = tableExists("escala_concessoes")
    ? db.prepare(`SELECT id, colaborador_id FROM escala_concessoes WHERE id = ? LIMIT 1`).get(ausenciaId)
    : null;
  if (!row?.id) throw new Error("Registro de ausência não encontrado.");

  const rowAtual = db.prepare(`
    SELECT id, colaborador_id, inicio, fim
    FROM escala_concessoes
    WHERE id = ?
    LIMIT 1
  `).get(ausenciaId);

  db.prepare(`
    UPDATE escala_concessoes
    SET tipo = ?, concessao = ?, inicio = ?, fim = ?, motivo = ?
    WHERE id = ?
  `).run(
    tipoConcessao,
    tipoUpper === "FOLGA_MEIO_PERIODO" ? "MEIA" : (tipoConcessao === "FOLGA" ? "INTEIRA" : "NAO_APLICA"),
    inicioIso,
    fimIso,
    motivo || null,
    ausenciaId,
  );

  if (tableExists("escala_ausencias")) {
    const antigos = db.prepare(`
      SELECT id
      FROM escala_ausencias
      WHERE colaborador_id = ?
        AND data_inicio = ?
        AND data_fim = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(Number(row.colaborador_id), rowAtual?.inicio || inicioIso, rowAtual?.fim || fimIso);

    if (tipoConcessao === "FERIAS") {
      if (antigos?.id) {
        db.prepare(`DELETE FROM escala_ausencias WHERE id = ?`).run(Number(antigos.id));
      }
    } else {
      const legacyTipo = tipoConcessao === "ATESTADO" ? "atestado" : "folga";
      if (antigos?.id) {
        db.prepare(`
          UPDATE escala_ausencias
          SET tipo = ?, data_inicio = ?, data_fim = ?, motivo = ?
          WHERE id = ?
        `).run(legacyTipo, inicioIso, fimIso, motivo || null, Number(antigos.id));
      } else {
        db.prepare(`
          INSERT INTO escala_ausencias (colaborador_id, tipo, data_inicio, data_fim, motivo)
          VALUES (?, ?, ?, ?, ?)
        `).run(Number(row.colaborador_id), legacyTipo, inicioIso, fimIso, motivo || null);
      }
    }
  }
}

function removerAusencia(id) {
  const ausenciaId = Number(id);
  if (!ausenciaId) throw new Error("Registro de ausência inválido.");

  if (!tableExists("escala_concessoes")) return false;

  const row = db.prepare(`
    SELECT id, colaborador_id, tipo, inicio, fim, ref_compensacao_id
    FROM escala_concessoes
    WHERE id = ?
    LIMIT 1
  `).get(ausenciaId);

  if (!row?.id) return false;

  const transaction = db.transaction(() => {
    if (tableExists("escala_ausencias") && row.tipo !== "FERIAS") {
      db.prepare(`
        DELETE FROM escala_ausencias
        WHERE id = (
          SELECT id
          FROM escala_ausencias
          WHERE colaborador_id = ?
            AND data_inicio = ?
            AND data_fim = ?
          ORDER BY id DESC
          LIMIT 1
        )
      `).run(Number(row.colaborador_id), row.inicio, row.fim);
    }

    db.prepare(`DELETE FROM escala_concessoes WHERE id = ?`).run(ausenciaId);

    if (row.ref_compensacao_id && tableExists("escala_compensacoes")) {
      const usos = db.prepare(`
        SELECT COUNT(*) AS total
        FROM escala_concessoes
        WHERE ref_compensacao_id = ?
      `).get(Number(row.ref_compensacao_id));

      if (Number(usos?.total || 0) === 0) {
        db.prepare(`DELETE FROM escala_compensacoes WHERE id = ?`).run(Number(row.ref_compensacao_id));
      }
    }
  });

  transaction();
  return true;
}


function getSemanasNoPeriodo(start, end) {
  return db.prepare(`
    SELECT id, semana_numero, data_inicio, data_fim, COALESCE(origem,'GERADA') AS origem, COALESCE(ajuste_manual,0) AS ajuste_manual, observacao, status
    FROM escala_semanas
    WHERE NOT (data_fim < ? OR data_inicio > ?)
    ORDER BY data_inicio ASC
  `).all(start, end);
}

function getLinhasPeriodo(start, end) {
  const semanas = getSemanasNoPeriodo(start, end);
  const linhas = [];

  for (const semana of semanas) {
    const semanaLinhas = getLinhasSemanaComStatus(semana.id);

    for (const l of semanaLinhas) {
      linhas.push({
        data_inicio: semana.data_inicio,
        data_fim: semana.data_fim,
        nome: l.nome,
        turnoLabel: l.turnoLabel,
        funcaoLabel: l.funcaoLabel,
        statusLabel: l.statusLabel,
        observacao: l.observacao,
      });
    }
  }

  linhas.sort((a, b) => {
    if (a.data_inicio !== b.data_inicio) return a.data_inicio.localeCompare(b.data_inicio);
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  return linhas;
}

function getEscalaSemanalPdfData() {
  const semanas = db.prepare(`
    SELECT s.id, s.semana_numero, s.data_inicio, s.data_fim
    FROM escala_semanas s
    ORDER BY s.data_inicio ASC
  `).all();

  return semanas.map((s) => {
    const linhas = db.prepare(`
      SELECT a.tipo_turno, c.nome, c.funcao
      FROM escala_alocacoes a
      JOIN colaboradores c ON c.id = a.colaborador_id
      WHERE a.semana_id = ?
      ORDER BY c.nome ASC
    `).all(s.id);

    const montarGrupo = () => ({ mecanico: [] });
    const grupos = { noturno: montarGrupo(), diurno: montarGrupo() };

    linhas.forEach((l) => {
      const turno = l.tipo_turno === "apoio" ? "diurno" : l.tipo_turno;
      if (!grupos[turno]) return;
      const key = "mecanico";
      if (!grupos[turno][key].includes(l.nome)) {
        grupos[turno][key].push(l.nome);
      }
    });

    return {
      semana: s.semana_numero,
      data_inicio: s.data_inicio,
      data_fim: s.data_fim,
      noturno: grupos.noturno,
      diurno: grupos.diurno,
      ajuste_manual: Number(s.ajuste_manual || 0),
      observacao: s.observacao || '',
    };
  });
}

function getPeriodoCompensacaoData(start, end) {
  const inicio = toDateOnly(start);
  const fim = toDateOnly(end);
  const usePeriodo = Boolean(inicio && fim);

  if (!tableExists("escala_compensacoes") || !tableExists("escala_concessoes")) {
    return {
      periodoTexto: usePeriodo ? `${inicio} até ${fim}` : 'Todos os registros cadastrados',
      baseServicos: [],
      apuracao: [],
      registros: [],
      descricoes: [],
    };
  }

  const baseQuery = `
    SELECT cp.id, cp.data_servico, cp.hora_inicio, cp.hora_fim, cp.equipamento, cp.descricao_servico,
           cp.minutos_total, cp.concessao_sugerida,
           cp.status_localizacao_inicio, cp.status_localizacao_fim, cp.precisao_inicio, cp.precisao_fim,
           cp.distancia_inicio_metros, cp.distancia_fim_metros, cp.justificativa_sem_localizacao, cp.alerta_localizacao,
           c.nome AS colaborador, c.funcao
    FROM escala_compensacoes cp
    JOIN colaboradores c ON c.id = cp.colaborador_id
    ${usePeriodo ? 'WHERE cp.data_servico BETWEEN ? AND ?' : ''}
    ORDER BY cp.data_servico ASC, c.nome ASC
  `;

  const baseServicos = db.prepare(baseQuery)
    .all(...(usePeriodo ? [inicio, fim] : []))
    .map((row) => ({
      id: row.id,
      data: row.data_servico,
      colaborador: row.colaborador,
      funcao: funcaoLabel(normalizeFuncao(row.funcao) || row.funcao),
      horaInicio: row.hora_inicio,
      horaFim: row.hora_fim,
      equipamento: row.equipamento || '-',
      descricaoServico: row.descricao_servico || '-',
      minutosTotal: row.minutos_total,
      concessaoSugerida: row.concessao_sugerida,
      statusLocalizacaoInicio: row.status_localizacao_inicio || '',
      statusLocalizacaoFim: row.status_localizacao_fim || '',
      precisaoInicio: row.precisao_inicio,
      precisaoFim: row.precisao_fim,
      distanciaInicioMetros: row.distancia_inicio_metros,
      distanciaFimMetros: row.distancia_fim_metros,
      justificativaSemLocalizacao: row.justificativa_sem_localizacao || '',
      alertaLocalizacao: Number(row.alerta_localizacao || 0),
    }));

  const apuracaoMap = new Map();
  for (const item of baseServicos) {
    const atual = apuracaoMap.get(item.colaborador) || {
      colaborador: item.colaborador,
      totalMinutos: 0,
      totalInteiras: 0,
      totalMeias: 0,
      saldo: 0,
    };
    atual.totalMinutos += item.minutosTotal;
    if (item.concessaoSugerida === 'INTEIRA') atual.totalInteiras += 1;
    if (item.concessaoSugerida === 'MEIA') atual.totalMeias += 1;
    atual.saldo = atual.totalInteiras + (atual.totalMeias * 0.5);
    apuracaoMap.set(item.colaborador, atual);
  }

  const apuracao = Array.from(apuracaoMap.values())
    .sort((a, b) => a.colaborador.localeCompare(b.colaborador, 'pt-BR'));

  const concessoesQuery = `
    SELECT ec.inicio, ec.fim, ec.tipo, ec.concessao, ec.motivo,
           c.nome AS colaborador, c.funcao,
           cp.data_servico, cp.hora_inicio, cp.hora_fim, cp.equipamento, cp.descricao_servico,
           cp.status_localizacao_inicio, cp.status_localizacao_fim, cp.precisao_inicio, cp.precisao_fim,
           cp.distancia_inicio_metros, cp.distancia_fim_metros, cp.justificativa_sem_localizacao, cp.alerta_localizacao
    FROM escala_concessoes ec
    JOIN colaboradores c ON c.id = ec.colaborador_id
    LEFT JOIN escala_compensacoes cp ON cp.id = ec.ref_compensacao_id
    ${usePeriodo ? 'WHERE NOT (ec.fim < ? OR ec.inicio > ?)' : ''}
    ORDER BY ec.inicio ASC, c.nome ASC
  `;

  const concessoes = db.prepare(concessoesQuery).all(...(usePeriodo ? [inicio, fim] : []));

  const registros = concessoes.map((item) => ({
    colaborador: item.colaborador,
    funcao: funcaoLabel(normalizeFuncao(item.funcao) || item.funcao),
    tipo: item.tipo,
    inicio: item.inicio,
    fim: item.fim,
    concessao: item.concessao,
    motivo: item.motivo || '',
    dataServico: item.data_servico || '',
    horaInicio: item.hora_inicio || '',
    horaFim: item.hora_fim || '',
    equipamentoSetor: item.equipamento || '',
    descricaoServico: item.descricao_servico || '',
    statusLocalizacaoInicio: item.status_localizacao_inicio || '',
    statusLocalizacaoFim: item.status_localizacao_fim || '',
    precisaoInicio: item.precisao_inicio,
    precisaoFim: item.precisao_fim,
    distanciaInicioMetros: item.distancia_inicio_metros,
    distanciaFimMetros: item.distancia_fim_metros,
    justificativaSemLocalizacao: item.justificativa_sem_localizacao || '',
    alertaLocalizacao: Number(item.alerta_localizacao || 0),
  }));

  const descricoes = baseServicos
    .filter((item) => item.descricaoServico && item.descricaoServico !== '-')
    .map((item) => `${item.data} — ${item.colaborador}: ${item.descricaoServico}`);

  return {
    periodoTexto: usePeriodo ? `${inicio} até ${fim}` : 'Todos os registros cadastrados',
    baseServicos,
    apuracao,
    registros,
    descricoes,
  };
}


function getUsersDoTurnoAtual({ prefer = "auto" } = {}) {
  const hoje = isoToday();
  const semana = db.prepare(`
    SELECT id
    FROM escala_semanas
    WHERE ? BETWEEN data_inicio AND data_fim
    LIMIT 1
  `).get(hoje);

  if (!semana?.id) return [];

  const turnoAuto = getTurnoOperacionalAgora() === "NOITE" ? "noturno" : "diurno";
  const pref = String(prefer || "auto").toLowerCase();
  const turno = pref === "auto" ? turnoAuto : normalizeTurno(pref);

  const rows = db.prepare(`
    SELECT DISTINCT u.id, u.name, c.id AS colaborador_id, c.funcao, a.tipo_turno
    FROM escala_alocacoes a
    JOIN colaboradores c ON c.id = a.colaborador_id
    JOIN users u ON u.id = c.user_id
    WHERE a.semana_id = ?
      AND a.tipo_turno IN ('diurno','noturno','apoio','plantao')
      AND IFNULL(c.ativo,1) = 1
      AND c.user_id IS NOT NULL
      AND IFNULL(u.ativo,1) = 1
  `).all(semana.id);

  const turnoPermitido = new Set(
    turno === "noturno"
      ? getTiposTurnoEscala("NOITE")
      : [...getTiposTurnoEscala("DIA"), "plantao"]
  );

  const ausentesHoje = getColaboradorIdsAusentesNoDia(hoje);

  return rows
    .filter((r) => turnoPermitido.has(String(r.tipo_turno || "").toLowerCase()))
    .filter((r) => !ausentesHoje.has(Number(r.colaborador_id)))
    .map((r) => ({
      id: Number(r.id),
      name: r.name,
      funcao: normalizeFuncao(r.funcao) || "operacional",
    }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
}

function getPlantonistaDoDia(turno = "NOITE") {
  const turnoAlvo = String(turno || "").toUpperCase() === "NOITE" ? "NOITE" : "DIA";
  const usersNoTurno = getUsersDoTurno(turnoAlvo);
  const plantonista = usersNoTurno.find((u) => String(u.tipo_turno || "").toLowerCase() === "plantao"
    && String(u.funcao || "").toLowerCase() === "mecanico");
  if (plantonista?.id) return Number(plantonista.id);

  if (turnoAlvo === "NOITE") {
    const mecanicoNoturno = usersNoTurno.find((u) => String(u.funcao || "").toLowerCase() === "mecanico");
    return mecanicoNoturno?.id ? Number(mecanicoNoturno.id) : null;
  }

  const mecanicoDia = usersNoTurno.find((u) => String(u.funcao || "").toLowerCase() === "mecanico");
  return mecanicoDia?.id ? Number(mecanicoDia.id) : null;
}

function getPlantonistaNoturno() {
  return getPlantonistaDoDia("NOITE");
}

function getUsersDoTurno(turno) {
  const hoje = isoToday();
  const turnoNorm = String(turno || "").toUpperCase() === "NOITE" ? "noturno" : "diurno";
  const semana = db.prepare(`
    SELECT id
    FROM escala_semanas
    WHERE ? BETWEEN data_inicio AND data_fim
    LIMIT 1
  `).get(hoje);

  if (!semana?.id) return [];

  const colaboradoresCols = tableExists("colaboradores")
    ? db.prepare("PRAGMA table_info(colaboradores)").all().map((c) => c.name)
    : [];
  const hasEhReserva = colaboradoresCols.includes("eh_reserva");

  const rows = db.prepare(`
    SELECT DISTINCT u.id,
           u.name,
           c.id AS colaborador_id,
           lower(COALESCE(NULLIF(c.funcao,''), 'auxiliar')) AS funcao,
           IFNULL(${hasEhReserva ? "c.eh_reserva" : "0"}, 0) AS eh_reserva,
           a.tipo_turno
    FROM escala_alocacoes a
    JOIN colaboradores c ON c.id = a.colaborador_id
    JOIN users u ON u.id = c.user_id
    WHERE a.semana_id = ?
      AND IFNULL(c.ativo,1) = 1
      AND IFNULL(u.ativo,1) = 1
      AND a.tipo_turno IN ('diurno','noturno','apoio','plantao')
  `).all(semana.id);

  const permitidos = new Set(
    turnoNorm === "noturno"
      ? ["noturno", "plantao"]
      : ["diurno", "apoio", "plantao"]
  );

  const ausentesHoje = getColaboradorIdsAusentesNoDia(hoje);

  return rows
    .filter((r) => permitidos.has(String(r.tipo_turno || "").toLowerCase()))
    .filter((r) => !ausentesHoje.has(Number(r.colaborador_id)))
    .map((r) => ({
      id: Number(r.id),
      user_id: Number(r.id),
      name: r.name,
      nome: r.name,
      funcao: normalizeFuncao(r.funcao) || r.funcao,
      eh_reserva: Number(r.eh_reserva || 0),
      tipo_turno: String(r.tipo_turno || "").toLowerCase(),
    }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
}

function getDisponiveisAgora() {
  const turnoAtual = currentTurno();
  const hoje = isoToday();
  const usersCols = tableExists("users") ? db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name) : [];

  const hasUserFuncao = usersCols.includes("funcao");
  const hasUserAtivo = usersCols.includes("ativo");
  const hasUserTurno = usersCols.includes("turno");

  const escalaConfiavel = tableExists("escala_semanas") && tableExists("escala_alocacoes") && tableExists("colaboradores");
  if (escalaConfiavel) {
    const rows = db.prepare(`
      SELECT DISTINCT u.id,
             COALESCE(u.name, c.nome) AS name,
             c.id AS colaborador_id,
             UPPER(COALESCE(NULLIF(${hasUserFuncao ? "u.funcao" : "''"}, ''),
               CASE
                 WHEN lower(c.funcao)='mecanico' THEN 'MECANICO'
                 WHEN lower(c.funcao)='operacional' THEN 'MONTADOR'
                 ELSE 'AUXILIAR'
               END,
               'AUXILIAR')) AS funcao,
             1 AS disponivel_agora
      FROM escala_semanas s
      JOIN escala_alocacoes a ON a.semana_id = s.id
      JOIN colaboradores c ON c.id = a.colaborador_id AND IFNULL(c.ativo, 1) = 1
      JOIN users u ON u.id = c.user_id
      WHERE ? BETWEEN s.data_inicio AND s.data_fim
        AND a.tipo_turno IN (?, 'apoio', 'plantao')
        ${hasUserAtivo ? "AND IFNULL(u.ativo, 1) = 1" : ""}
      ORDER BY name ASC
    `).all(hoje, turnoAtual);

    const ausentesHoje = getColaboradorIdsAusentesNoDia(hoje);
    const rowsAtivos = rows.filter((row) => !ausentesHoje.has(Number(row.colaborador_id)));
    if (rowsAtivos.length) return rowsAtivos;
  }

  if (hasUserTurno) {
    return db.prepare(`
      SELECT id,
             name,
             UPPER(COALESCE(NULLIF(${hasUserFuncao ? "funcao" : "''"}, ''), CASE WHEN role = 'MECANICO' THEN 'MECANICO' ELSE 'AUXILIAR' END)) AS funcao,
             1 AS disponivel_agora
      FROM users
      WHERE ${hasUserAtivo ? "IFNULL(ativo,1)=1" : "1=1"}
        AND lower(COALESCE(turno, '')) IN (?, 'apoio')
      ORDER BY name ASC
    `).all(turnoAtual);
  }

  return db.prepare(`
    SELECT id,
           name,
           UPPER(COALESCE(NULLIF(${hasUserFuncao ? "funcao" : "''"}, ''), ?)) AS funcao,
           1 AS disponivel_agora
    FROM users
    WHERE ${hasUserAtivo ? "IFNULL(ativo,1)=1" : "1=1"}
    ORDER BY name ASC
  `).all(roleToFuncao(null));
}

function getMecanicosDoTurnoAtual() {
  return (getDisponiveisAgora() || []).filter((p) => String(p.funcao || '').toUpperCase() === 'MECANICO');
}

function getAuxiliaresDoTurnoAtual() {
  return [];
}


module.exports = {
  getPublicacoes,
  getSemanaPorData,
  getSemanaById,
  atualizarTurno,
  removerAlocacao,
  getEscalaCompletaComTimes,
  listarEscalaCompleta,
  buscarDadosPdfEscalaCompleta,
  normalizarDataFormulario,
  adicionarRapidoPeriodo,
  lancarAusencia,
  getLinhasSemanaComStatus,
  getSemanasNoPeriodo,
  getLinhasPeriodo,
  getEscalaSemanalPdfData,
  getPeriodoCompensacaoData,
  getTurnoAtual,
  getPlantonistaDoDia,
  getPlantonistaNoturno,
  getUsersDoTurno,
  getUsersDoTurnoAtual,
  getDisponiveisAgora,
  getMecanicosDoTurnoAtual,
  getAuxiliaresDoTurnoAtual,
  listarAusencias,
  atualizarAusencia,
  removerAusencia,
  getColaboradorIdsAusentesNoDia,
  normalizeTurno,
  normalizeFuncao,
};

// ===== Banco de Horas da Manutenção =====
const MINUTOS_DIA_FOLGA = 480;

function hasColumn(table, column) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column); } catch (_e) { return false; }
}

function userIdFrom(user) { return Number(user?.id || user?.user_id || 0) || null; }
function userRole(user) { return String(user?.role || user?.perfil || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s-]+/g, '_'); }
function isMecanicoText(value) {
  const norm = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return norm.includes('MECANICO');
}
function isColaboradorMecanico(colaborador = {}) {
  return isMecanicoText(colaborador.funcao) || isMecanicoText(colaborador.cargo) || isMecanicoText(colaborador.perfil) || isMecanicoText(colaborador.role);
}
function isMecanicoUser(user = {}) { return userRole(user) === 'MECANICO' || isMecanicoText(user.funcao) || isMecanicoText(user.cargo) || isMecanicoText(user.perfil); }
function isAdminUser(user) { return userRole(user) === 'ADMIN'; }
function canManageBancoHoras(user) { return ['ADMIN','ENCARREGADO_MANUTENCAO','MANUTENCAO_SUPERVISOR','SUPERVISOR_MANUTENCAO'].includes(userRole(user)); }
function canReadBancoHoras(user) { return canManageBancoHoras(user) || ['RH','DIRETORIA'].includes(userRole(user)); }
function minutosToHoras(minutos) { const m = Math.abs(Number(minutos)||0); const sign = Number(minutos)<0 ? '-' : ''; return `${sign}${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`; }
function saldoResumo(minutos) { return { minutos, horas: minutosToHoras(minutos), diasFolga: Math.floor(minutos / MINUTOS_DIA_FOLGA), diasFolgaDecimal: Math.round((minutos / MINUTOS_DIA_FOLGA) * 100) / 100 }; }

function getAusenciaPrioritaria(colaboradorId, inicio, fim, hoje) {
  if (!tableExists('escala_ausencias')) return null;
  const rows = db.prepare(`
    SELECT tipo, data_inicio, data_fim, motivo
    FROM escala_ausencias
    WHERE colaborador_id = ?
      AND NOT (data_fim < ? OR data_inicio > ?)
    ORDER BY
      CASE upper(tipo)
        WHEN 'FERIAS' THEN 1
        WHEN 'FÉRIAS' THEN 1
        WHEN 'ATESTADO' THEN 2
        WHEN 'FOLGA' THEN 3
        WHEN 'FOLGA_MEIO_PERIODO' THEN 3
        WHEN 'FALTA' THEN 4
        ELSE 9
      END,
      CASE WHEN ? BETWEEN data_inicio AND data_fim THEN 0 ELSE 1 END
    LIMIT 1
  `).all(colaboradorId, inicio, fim, hoje);
  return rows[0] || null;
}

function statusAusenciaLabel(ausencia) {
  const tipo = normalizarNome(ausencia?.tipo || '');
  if (tipo === 'ferias') return 'Férias';
  if (tipo === 'atestado') return 'Atestado';
  if (tipo.includes('folga')) return 'Folga';
  if (tipo === 'falta') return 'Falta';
  return ausencia ? 'Ausente' : '';
}

function listarColaboradoresDaEscalaDaSemana({ dateISO = isoToday(), colaboradorId = null } = {}) {
  if (!tableExists('escala_semanas') || !tableExists('escala_alocacoes') || !tableExists('colaboradores')) return [];

  const cFoto = sqlColumnOrNull('colaboradores', ['foto_path', 'avatar_path', 'imagem', 'foto_url', 'foto'], 'foto_colaborador', 'c');
  const uAvatar = sqlColumnOrNull('users', ['avatar', 'foto', 'foto_path', 'avatar_path', 'imagem'], 'foto_usuario', 'u');
  const cCols = db.prepare('PRAGMA table_info(colaboradores)').all().map((c) => c.name);
  const uCols = tableExists('users') ? db.prepare('PRAGMA table_info(users)').all().map((c) => c.name) : [];
  const joinUser = cCols.includes('user_id') && tableExists('users') ? 'LEFT JOIN users u ON u.id = c.user_id' : 'LEFT JOIN (SELECT NULL AS id) u ON 1=0';
  const userAtivoWhere = uCols.includes('ativo') ? 'AND IFNULL(u.ativo, 1) = 1' : '';
  const whereOwn = colaboradorId ? 'AND c.id = ?' : '';
  const params = colaboradorId ? [dateISO, colaboradorId] : [dateISO];

  return db.prepare(`
    SELECT a.id AS alocacao_id,
           a.tipo_turno,
           a.observacao AS escala_observacao,
           s.id AS semana_id,
           s.data_inicio,
           s.data_fim,
           c.id,
           c.nome,
           c.funcao,
           ${cCols.includes('ativo') ? 'c.ativo' : '1 AS ativo'},
           ${cCols.includes('status') ? 'c.status' : "'ATIVO' AS status"},
           ${cCols.includes('deleted_at') ? 'c.deleted_at' : 'NULL AS deleted_at'},
           ${cCols.includes('excluido') ? 'c.excluido' : '0 AS excluido'},
           ${cCols.includes('is_active') ? 'c.is_active' : '1 AS is_active'},
           ${cCols.includes('visivel') ? 'c.visivel' : '1 AS visivel'},
           ${cCols.includes('is_demo') ? 'c.is_demo' : '0 AS is_demo'},
           ${cCols.includes('user_id') ? 'c.user_id' : 'NULL AS user_id'},
           ${cFoto},
           ${uAvatar}
    FROM escala_semanas s
    JOIN escala_alocacoes a ON a.semana_id = s.id
    JOIN colaboradores c ON c.id = a.colaborador_id
    ${joinUser}
    WHERE ? BETWEEN s.data_inicio AND s.data_fim
      ${whereOwn}
      ${userAtivoWhere}
    ORDER BY c.id ASC, length(COALESCE(c.nome, '')) DESC, a.id ASC
  `).all(...params);
}

function deduplicarColaboradoresEscala(rows = []) {
  const byKey = new Map();
  for (const row of rows) {
    if (!isColaboradorAtivo(row) || isColaboradorDemo(row)) continue;
    const nomeNorm = normalizarNome(row.nome);
    const key = row.id ? `id:${row.id}` : `nome:${nomeNorm}`;
    const current = byKey.get(key);
    const score = (row.id ? 1000 : 0) + (row.semana_id ? 100 : 0) + (isColaboradorAtivo(row) ? 50 : 0) + (row.foto_colaborador || row.foto_usuario ? 20 : 0) + String(row.nome || '').length;
    if (!current || score > current.__score) byKey.set(key, { ...row, __score: score });
  }
  return [...byKey.values()].map(({ __score, ...row }) => row);
}

function listarPainelEscala({ user = null, canViewAll = false, colaboradorId = null } = {}) {
  const hoje = isoToday();
  const ownColaboradorId = canViewAll ? null : (colaboradorId || buscarColaboradorDoUsuario(userIdFrom(user))?.id || null);
  if (!canViewAll && !ownColaboradorId) {
    return { pendentes: 0, colaboradores: [] };
  }

  const pendentes = tableExists('escala_horas_extras') ? db.prepare("SELECT COUNT(*) AS total FROM escala_horas_extras WHERE status='PENDENTE_APROVACAO'").get().total : 0;
  const rows = deduplicarColaboradoresEscala(listarColaboradoresDaEscalaDaSemana({ dateISO: hoje, colaboradorId: ownColaboradorId }));

  const cards = rows.map((c) => {
    const emAndamento = buscarHoraExtraEmAndamento(c.id);
    const ausencia = getAusenciaPrioritaria(c.id, c.data_inicio, c.data_fim, hoje);
    const saldo = calcularSaldoBancoHoras(c.id);
    const extras = listarHorasExtras({ colaborador_id: c.id });
    const horasExtrasMesMinutos = extras.filter((h) => String(h.data_servico || '').slice(0, 7) === hoje.slice(0, 7) && h.status === 'APROVADO').reduce((sum, h) => sum + Number(h.total_minutos || 0), 0);
    const ultima = extras[0];
    const statusAusencia = statusAusenciaLabel(ausencia);
    return {
      ...c,
      nome: colaboradorNomeOficial(c),
      foto_path: c.foto_colaborador || c.foto_usuario || null,
      iniciais: initials(c.nome),
      funcaoLabel: funcaoLabel(normalizeFuncao(c.funcao)),
      saldo,
      turnoAtual: turnoLabel(c.tipo_turno),
      statusAtual: emAndamento ? 'Hora extra em andamento' : (statusAusencia || (c.tipo_turno === 'folga' ? 'Folga' : 'Trabalhando')),
      horaExtraEmAndamento: Boolean(emAndamento),
      ultimaHoraExtra: ultima ? `OS ${ultima.os_id || 'sem OS'}${ultima.equipamento_nome ? ' — ' + ultima.equipamento_nome : ''}` : '',
      horasExtrasMes: minutosToHoras(horasExtrasMesMinutos || 0),
      horasExtrasMesMinutos,
      ausenciasJustificadas: ausencia ? 1 : 0,
    };
  }).sort((a,b) => {
    if (Number(b.horaExtraEmAndamento) !== Number(a.horaExtraEmAndamento)) return Number(b.horaExtraEmAndamento) - Number(a.horaExtraEmAndamento);
    return String(a.nome||'').localeCompare(String(b.nome||''), 'pt-BR');
  });
  return { pendentes, colaboradores: cards };
}

function listarColaboradoresManutencao() {
  const cols = tableExists('colaboradores') ? db.prepare('PRAGMA table_info(colaboradores)').all().map(c=>c.name) : [];
  if (!cols.length) return [];
  const statusCol = cols.includes('status') ? "AND lower(COALESCE(status,'ativo')) NOT IN ('inativo','desligado','excluido','apagado','removido')" : '';
  const fotoExpr = cols.includes('foto_path') ? 'foto_path' : (cols.includes('foto') ? 'foto AS foto_path' : 'NULL AS foto_path');
  const deletedCol = cols.includes('deleted_at') ? 'AND deleted_at IS NULL' : '';
  const excluidoCol = cols.includes('excluido') ? 'AND IFNULL(excluido,0)=0' : '';
  const demoCol = cols.includes('is_demo') ? 'AND IFNULL(is_demo,0)=0' : '';
  const foraEscalaCol = cols.includes('fora_escala') ? 'AND IFNULL(fora_escala,0)=0' : '';
  const rows = db.prepare(`SELECT * FROM colaboradores WHERE IFNULL(ativo,1)=1 ${statusCol} ${deletedCol} ${excluidoCol} ${demoCol} ${foraEscalaCol} AND lower(nome) NOT LIKE '%demo%' AND lower(nome) NOT LIKE '%teste%' ORDER BY nome`).all();
  const dedup = deduplicarColaboradoresEscala(rows);
  return dedup.map((row) => ({ ...row, foto_path: row.foto_path || row.foto || null, user_id: cols.includes('user_id') ? row.user_id : null }));
}

function buscarColaboradorDoUsuario(userId) {
  if (!userId || !tableExists('colaboradores')) return null;
  const cols = db.prepare('PRAGMA table_info(colaboradores)').all().map((c) => c.name);
  const activeFilter = "IFNULL(ativo,1)=1";
  if (cols.includes('user_id')) {
    const row = db.prepare(`SELECT * FROM colaboradores WHERE user_id=? AND ${activeFilter} LIMIT 1`).get(userId);
    if (row) return row;
  }

  if (!tableExists('users')) return null;
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const nameExpr = userCols.includes('name') ? 'name' : (userCols.includes('nome') ? 'nome' : null);
  if (!nameExpr || !cols.includes('nome')) return null;
  const user = db.prepare(`SELECT id, ${nameExpr} AS nome FROM users WHERE id=? LIMIT 1`).get(userId);
  const nome = String(user?.nome || '').trim();
  if (!nome) return null;
  return db.prepare(`
    SELECT * FROM colaboradores
    WHERE ${activeFilter}
      AND lower(trim(nome)) = lower(trim(?))
    LIMIT 1
  `).get(nome) || null;
}

function listarColaboradoresMecanicosHoraExtra() {
  return listarColaboradoresManutencao().filter(isColaboradorMecanico);
}

function listarOsDisponiveisParaHoraExtra() {
  if (!tableExists('os')) return [];
  return db.prepare(`
    SELECT o.id, o.equipamento_id, o.equipamento, o.descricao, o.status, e.nome AS equipamento_nome, e.setor
    FROM os o
    LEFT JOIN equipamentos e ON e.id = o.equipamento_id
    WHERE upper(COALESCE(o.status,'')) NOT IN ('CONCLUIDA','CONCLUÍDA','CANCELADA','FECHADA')
    ORDER BY o.id DESC LIMIT 200
  `).all();
}

function buscarHoraExtraEmAndamento(colaboradorId) {
  if (!tableExists('escala_horas_extras')) return null;
  return db.prepare("SELECT * FROM escala_horas_extras WHERE colaborador_id=? AND status='EM_ANDAMENTO' LIMIT 1").get(colaboradorId);
}

function getHoraExtra(id) { return db.prepare('SELECT * FROM escala_horas_extras WHERE id=?').get(id); }
function buscarHoraExtraPorId(id) { return getHoraExtra(id); }
function filePath(file) { return file ? `/uploads/escala-horas/${file.filename}` : null; }

function iniciarHoraExtra(dados) {
  const colaboradorId = Number(dados.colaborador_id); if (!colaboradorId) throw new Error('Colaborador obrigatório.');
  // Bloqueio correto: somente o próprio colaborador não pode ter dois lançamentos ativos.
  // Não consultar/bloquear por OS: a mesma OS pode ter vários mecânicos simultâneos.
  if (buscarHoraExtraEmAndamento(colaboradorId)) throw new Error('Você já possui uma hora extra em andamento. Finalize o lançamento atual antes de iniciar outro.');
  const descricao = String(dados.descricao_servico||'').trim();
  const osId = Number(dados.os_id || 0) || null;
  if (!osId && !descricao) throw new Error('Informe uma OS ou descreva o serviço realizado.');
  const os = osId ? db.prepare('SELECT id, equipamento_id FROM os WHERE id=?').get(osId) : null;
  if (osId && !os) throw new Error('OS selecionada não foi encontrada ou não está disponível para hora extra.');
  const now = new Date(); const iso = now.toISOString();
  const info = db.prepare(`INSERT INTO escala_horas_extras (user_id,colaborador_id,os_id,equipamento_id,data_servico,inicio_extra,descricao_servico,foto_inicio_path,latitude_inicio,longitude_inicio,precisao_inicio,status,criado_em,atualizado_em)
    VALUES (@user_id,@colaborador_id,@os_id,@equipamento_id,@data_servico,@inicio_extra,@descricao_servico,@foto_inicio_path,@latitude_inicio,@longitude_inicio,@precisao_inicio,'EM_ANDAMENTO',datetime('now'),datetime('now'))`).run({
    user_id: dados.user_id || null, colaborador_id: colaboradorId, os_id: osId, equipamento_id: os?.equipamento_id || null, data_servico: iso.slice(0,10), inicio_extra: iso, descricao_servico: descricao, foto_inicio_path: dados.foto_inicio_path || null,
    latitude_inicio: dados.latitude_inicio || null, longitude_inicio: dados.longitude_inicio || null, precisao_inicio: dados.precisao_inicio || null,
  });
  return info.lastInsertRowid;
}

function finalizarHoraExtra(id, dados) {
  const he = getHoraExtra(id); if (!he) throw new Error('Registro não encontrado.');
  if (he.status !== 'EM_ANDAMENTO') throw new Error('Somente horas extras em andamento podem ser finalizadas.');
  const fim = new Date(); const inicio = new Date(he.inicio_extra); const minutos = Math.round((fim - inicio)/60000);
  if (minutos <= 0) throw new Error('Total de minutos precisa ser maior que zero.');
  db.prepare(`UPDATE escala_horas_extras SET fim_extra=?, total_minutos=?, foto_fim_path=?, latitude_fim=?, longitude_fim=?, precisao_fim=?, status='PENDENTE_APROVACAO', atualizado_em=datetime('now') WHERE id=?`).run(fim.toISOString(), minutos, dados.foto_fim_path || null, dados.latitude_fim || null, dados.longitude_fim || null, dados.precisao_fim || null, id);
}

function listarHorasExtrasPendentes() { return listarHorasExtras({ status: 'PENDENTE_APROVACAO' }); }
function listarHorasExtrasEmAndamentoPorOs(osId) { return listarHorasExtras({ os_id: osId, status: 'EM_ANDAMENTO' }); }
function listarHorasExtras(filtros={}) {
  if (!tableExists('escala_horas_extras')) return [];
  const params=[]; let where='1=1';
  if (filtros.status) { where += ' AND he.status=?'; params.push(filtros.status); }
  if (filtros.colaborador_id) { where += ' AND he.colaborador_id=?'; params.push(filtros.colaborador_id); }
  if (filtros.os_id) { where += ' AND he.os_id=?'; params.push(filtros.os_id); }
  if (filtros.inicio) { where += ' AND he.data_servico>=?'; params.push(filtros.inicio); }
  if (filtros.fim) { where += ' AND he.data_servico<=?'; params.push(filtros.fim); }
  return db.prepare(`SELECT he.*, c.nome AS colaborador_nome, o.equipamento AS os_equipamento, o.descricao AS os_descricao, e.nome AS equipamento_nome, u.name AS aprovado_por_nome
    FROM escala_horas_extras he JOIN colaboradores c ON c.id=he.colaborador_id LEFT JOIN os o ON o.id=he.os_id LEFT JOIN equipamentos e ON e.id=he.equipamento_id LEFT JOIN users u ON u.id=he.aprovado_por
    WHERE ${where} ORDER BY he.data_servico DESC, he.id DESC LIMIT 500`).all(...params);
}

function aprovarHoraExtra(id, usuarioAprovador, observacao) {
  if (!canManageBancoHoras(usuarioAprovador)) throw new Error('Perfil sem permissão para aprovar hora extra.');
  const he = getHoraExtra(id); if (!he) throw new Error('Registro não encontrado.');
  if (he.status === 'APROVADO') throw new Error('Hora extra já aprovada.');
  if (he.status !== 'PENDENTE_APROVACAO') throw new Error('Somente registros pendentes podem ser aprovados.');
  if ((Number(he.total_minutos)||0) <= 0) throw new Error('Total inválido para crédito.');
  const tx = db.transaction(() => {
    db.prepare("UPDATE escala_horas_extras SET status='APROVADO', aprovado_por=?, aprovado_em=datetime('now'), observacao_aprovacao=?, atualizado_em=datetime('now') WHERE id=?").run(userIdFrom(usuarioAprovador), String(observacao||'').trim() || null, id);
    const exists = db.prepare("SELECT id FROM escala_banco_horas_movimentos WHERE hora_extra_id=? AND tipo='CREDITO_HORA_EXTRA'").get(id);
    if (!exists) db.prepare(`INSERT INTO escala_banco_horas_movimentos (user_id,colaborador_id,hora_extra_id,tipo,minutos,data_movimento,descricao,criado_por) VALUES (?,?,?,?,?,date('now'),?,?)`).run(he.user_id, he.colaborador_id, id, 'CREDITO_HORA_EXTRA', he.total_minutos, `Hora extra aprovada referente à OS ${he.os_id || 'sem OS'}`, userIdFrom(usuarioAprovador));
  }); tx();
}

function reprovarHoraExtra(id, usuarioResponsavel, motivo) { if (!canManageBancoHoras(usuarioResponsavel)) throw new Error('Perfil sem permissão.'); if (!String(motivo||'').trim()) throw new Error('Motivo da reprovação obrigatório.'); db.prepare("UPDATE escala_horas_extras SET status='REPROVADO', motivo_reprovacao=?, aprovado_por=?, aprovado_em=datetime('now'), atualizado_em=datetime('now') WHERE id=? AND status='PENDENTE_APROVACAO'").run(String(motivo).trim(), userIdFrom(usuarioResponsavel), id); }
function cancelarHoraExtra(id, usuarioResponsavel, motivo) { if (!canManageBancoHoras(usuarioResponsavel)) throw new Error('Perfil sem permissão.'); if (!String(motivo||'').trim()) throw new Error('Motivo do cancelamento obrigatório.'); db.prepare("UPDATE escala_horas_extras SET status='CANCELADO', motivo_cancelamento=?, atualizado_em=datetime('now') WHERE id=? AND status<>'APROVADO'").run(String(motivo).trim(), id); }
function ajustarHoraExtra(id, dados, usuarioResponsavel) { if (!canManageBancoHoras(usuarioResponsavel)) throw new Error('Perfil sem permissão.'); const just=String(dados.justificativa||dados.observacao||'').trim(); if (!just) throw new Error('Justificativa obrigatória.'); const he=getHoraExtra(id); if(!he) throw new Error('Registro não encontrado.'); const inicio=dados.inicio_extra?new Date(dados.inicio_extra):new Date(he.inicio_extra); const fim=dados.fim_extra?new Date(dados.fim_extra):new Date(he.fim_extra||new Date()); const minutos=Math.round((fim-inicio)/60000); if(minutos<=0) throw new Error('Fim não pode ser menor que início.'); db.prepare('UPDATE escala_horas_extras SET inicio_extra=?, fim_extra=?, total_minutos=?, observacao_aprovacao=?, atualizado_em=datetime(\'now\') WHERE id=?').run(inicio.toISOString(), fim.toISOString(), minutos, just, id); if(he.status==='APROVADO'){ const diff=minutos-Number(he.total_minutos||0); if(diff) db.prepare(`INSERT INTO escala_banco_horas_movimentos (user_id,colaborador_id,hora_extra_id,tipo,minutos,data_movimento,descricao,criado_por) VALUES (?,?,?,?,?,date('now'),?,?)`).run(he.user_id, he.colaborador_id, id, diff>0?'AJUSTE_CREDITO':'AJUSTE_DEBITO', Math.abs(diff), `Ajuste de hora extra: ${just}`, userIdFrom(usuarioResponsavel)); } }

function calcularSaldoBancoHoras(colaboradorId) {
  if (!tableExists('escala_banco_horas_movimentos')) return { creditos: 0, debitos: 0, ...saldoResumo(0) };
  const rows = db.prepare(`SELECT tipo, SUM(minutos) AS total FROM escala_banco_horas_movimentos WHERE colaborador_id=? GROUP BY tipo`).all(colaboradorId);
  let creditos=0, debitos=0; rows.forEach(r=>{ if(['CREDITO_HORA_EXTRA','AJUSTE_CREDITO'].includes(r.tipo)) creditos+=Number(r.total||0); else debitos+=Number(r.total||0); });
  return { creditos, debitos, ...saldoResumo(creditos-debitos) };
}
function listarBancoHoras(filtros = {}) {
  const inicioMes = new Date(); inicioMes.setUTCDate(1);
  const inicio = inicioMes.toISOString().slice(0,10);
  return listarColaboradoresManutencao()
    .filter(c => !filtros.colaborador_id || Number(c.id) === Number(filtros.colaborador_id))
    .map(c=>{
      const extras = listarHorasExtras({colaborador_id:c.id});
      const folgas = listarFolgas({colaborador_id:c.id});
      const horasExtrasMesMinutos = extras.filter(h => h.status === 'APROVADO' && String(h.data_servico||'') >= inicio).reduce((t,h)=>t+Number(h.total_minutos||0),0);
      const folgasCompensadasMinutos = folgas.filter(f => f.status !== 'CANCELADA').reduce((t,f)=>t+Number(f.minutos_descontados||0),0);
      return { ...c, funcaoLabel: funcaoLabel(normalizeFuncao(c.funcao)), saldo: calcularSaldoBancoHoras(c.id), horasExtrasMesMinutos, folgasCompensadasMinutos, ausenciasJustificadas: 0, ultimasHorasExtras: extras.slice(0,3), ultimasFolgas: folgas.slice(0,3) };
    });
}
function listarMovimentosBancoHoras(colaboradorId) { return db.prepare('SELECT * FROM escala_banco_horas_movimentos WHERE colaborador_id=? ORDER BY data_movimento DESC, id DESC').all(colaboradorId); }
function listarFolgas(filtros={}) { if (!tableExists('escala_folgas_programadas')) return []; const params=[]; let where='1=1'; if(filtros.colaborador_id){where+=' AND f.colaborador_id=?'; params.push(filtros.colaborador_id)} return db.prepare(`SELECT f.*, c.nome AS colaborador_nome, u.name AS aprovado_por_nome FROM escala_folgas_programadas f JOIN colaboradores c ON c.id=f.colaborador_id LEFT JOIN users u ON u.id=f.aprovado_por WHERE ${where} ORDER BY f.data_folga DESC, f.id DESC`).all(...params); }

function programarFolgaCompensatoria(dados) { const col=Number(dados.colaborador_id); const minutos=Number(dados.minutos_descontados); const motivo=String(dados.motivo||'').trim(); if(!col||!dados.data_folga||!minutos) throw new Error('Preencha funcionário, data e horas.'); const saldo=calcularSaldoBancoHoras(col).minutos; if(saldo<minutos && !(isAdminUser(dados.usuario)&&motivo)) throw new Error('Saldo insuficiente para programar folga. ADMIN deve informar justificativa.'); const tx=db.transaction(()=>{ const info=db.prepare(`INSERT INTO escala_folgas_programadas (user_id,colaborador_id,data_folga,minutos_descontados,motivo,status,aprovado_por,criado_em,atualizado_em) VALUES (?,?,?,?,?,'PROGRAMADA',?,datetime('now'),datetime('now'))`).run(dados.user_id||null,col,dados.data_folga,minutos,motivo||'Folga compensatória',userIdFrom(dados.usuario)); db.prepare(`INSERT INTO escala_banco_horas_movimentos (user_id,colaborador_id,folga_id,tipo,minutos,data_movimento,descricao,criado_por) VALUES (?,?,?,?,?,date('now'),?,?)`).run(dados.user_id||null,col,info.lastInsertRowid,'DEBITO_FOLGA',minutos,`Folga compensatória programada para ${dados.data_folga}`,userIdFrom(dados.usuario)); if(tableExists('escala_ausencias')) db.prepare(`INSERT INTO escala_ausencias (colaborador_id,tipo,data_inicio,data_fim,motivo,created_at) VALUES (?,'folga',?,?,?,datetime('now'))`).run(col,dados.data_folga,dados.data_folga,'Folga compensatória - Banco de Horas'); return info.lastInsertRowid; }); return tx(); }
function cancelarFolgaCompensatoria(id, usuarioResponsavel, motivo) { if(!canManageBancoHoras(usuarioResponsavel)) throw new Error('Perfil sem permissão.'); if(!String(motivo||'').trim()) throw new Error('Motivo obrigatório.'); const f=db.prepare('SELECT * FROM escala_folgas_programadas WHERE id=?').get(id); if(!f) throw new Error('Folga não encontrada.'); if(f.status==='CANCELADA') throw new Error('Folga já cancelada.'); const tx=db.transaction(()=>{ db.prepare("UPDATE escala_folgas_programadas SET status='CANCELADA', motivo=COALESCE(motivo,'') || ' | Cancelamento: ' || ?, atualizado_em=datetime('now') WHERE id=?").run(String(motivo).trim(),id); db.prepare(`INSERT INTO escala_banco_horas_movimentos (user_id,colaborador_id,folga_id,tipo,minutos,data_movimento,descricao,criado_por) VALUES (?,?,?,?,?,date('now'),?,?)`).run(f.user_id,f.colaborador_id,id,'AJUSTE_CREDITO',f.minutos_descontados,`Estorno de folga cancelada: ${motivo}`,userIdFrom(usuarioResponsavel)); }); tx(); }
function realizarFolgaCompensatoria(id, usuarioResponsavel) { if(!canManageBancoHoras(usuarioResponsavel)) throw new Error('Perfil sem permissão.'); db.prepare("UPDATE escala_folgas_programadas SET status='REALIZADA', atualizado_em=datetime('now') WHERE id=? AND status='PROGRAMADA'").run(id); }
function gerarDadosRelatorioBancoHoras(filtros={}) { return { filtros, emitidoEm: new Date().toISOString(), banco: listarBancoHoras(), horasExtras: listarHorasExtras(filtros), folgas: listarFolgas(filtros) }; }

function parseIds(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Boolean);
  return String(value || '').split(',').map((v) => Number(v.trim())).filter(Boolean);
}
function addDaysISO(dateISO, days) { const d = new Date(`${dateISO}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
function colaboradorDisponivelNoPeriodo(colaboradorId, inicio, fim) {
  const c = db.prepare(`SELECT * FROM colaboradores WHERE id=?`).get(colaboradorId);
  if (!c || !isColaboradorAtivo(c) || isColaboradorDemo(c) || Number(c.fora_escala || 0) === 1) return false;
  return buscarIndisponibilidadesNoPeriodo(colaboradorId, inicio, fim).length === 0;
}
function buscarIndisponibilidadesNoPeriodo(colaboradorId, inicio, fim) {
  const rows = [];
  if (tableExists('escala_ausencias')) rows.push(...db.prepare(`SELECT tipo, data_inicio AS inicio, data_fim AS fim, motivo FROM escala_ausencias WHERE colaborador_id=? AND NOT (data_fim < ? OR data_inicio > ?)`).all(colaboradorId, inicio, fim));
  if (tableExists('escala_concessoes')) rows.push(...db.prepare(`SELECT tipo, inicio, fim, motivo FROM escala_concessoes WHERE colaborador_id=? AND NOT (fim < ? OR inicio > ?)`).all(colaboradorId, inicio, fim));
  if (tableExists('escala_folgas_programadas')) rows.push(...db.prepare(`SELECT 'FOLGA_PROGRAMADA' AS tipo, data_folga AS inicio, data_folga AS fim, motivo FROM escala_folgas_programadas WHERE colaborador_id=? AND status <> 'CANCELADA' AND data_folga BETWEEN ? AND ?`).all(colaboradorId, inicio, fim));
  return rows;
}
function listarConfiguracoesRodizio() {
  if (!tableExists('escala_rodizio_config')) return [];
  return db.prepare(`SELECT * FROM escala_rodizio_config ORDER BY ativo DESC, data_inicio DESC, id DESC`).all();
}
function buscarRodizioAtivo() {
  if (!tableExists('escala_rodizio_config')) return null;
  const cfg = db.prepare(`SELECT * FROM escala_rodizio_config WHERE ativo=1 ORDER BY data_inicio DESC, id DESC LIMIT 1`).get();
  if (!cfg) return null;
  cfg.noturnos = db.prepare(`SELECT i.*, c.nome FROM escala_rodizio_itens i JOIN colaboradores c ON c.id=i.colaborador_id WHERE i.config_id=? AND i.ativo=1 AND UPPER(i.turno)='NOITE' ORDER BY i.posicao`).all(cfg.id);
  cfg.diurnosFixos = db.prepare(`SELECT f.*, c.nome FROM escala_diurno_fixos f JOIN colaboradores c ON c.id=f.colaborador_id WHERE f.config_id=? AND f.ativo=1 ORDER BY c.nome`).all(cfg.id);
  return cfg;
}
function salvarConfiguracaoRodizio(dados, usuario) {
  const inicio = toDateOnly(dados.data_inicio); const fim = toDateOnly(dados.data_fim) || null;
  const colaboradoresValidos = new Set(listarColaboradoresManutencao().map((c) => Number(c.id)));
  const noturnos = parseIds(dados.noturnos || dados.rodizioNoturno || dados.colaboradores_noturnos).filter((id) => colaboradoresValidos.has(Number(id)));
  const diurnos = parseIds(dados.diurnos_fixos || dados.diurnosFixos || dados.colaboradores_diurnos).filter((id) => colaboradoresValidos.has(Number(id)));
  if (!inicio || (fim && fim < inicio)) throw new Error('Período inválido do rodízio.');
  if (!noturnos.length) throw new Error('Informe ao menos um colaborador no rodízio noturno.');
  const tamanho = Math.max(1, Number(dados.tamanho_ciclo || noturnos.length));
  const tx = db.transaction(() => {
    db.prepare(`UPDATE escala_rodizio_config SET ativo=0, atualizado_em=datetime('now') WHERE ativo=1`).run();
    const info = db.prepare(`INSERT INTO escala_rodizio_config (nome,data_inicio,data_fim,tamanho_ciclo,ativo,criado_por) VALUES (?,?,?,?,1,?)`).run(String(dados.nome || 'Rodízio da Escala'), inicio, fim, tamanho, userIdFrom(usuario));
    const id = Number(info.lastInsertRowid);
    noturnos.slice(0, tamanho).forEach((cid, idx) => db.prepare(`INSERT INTO escala_rodizio_itens (config_id,posicao,colaborador_id,turno,ativo) VALUES (?,?,?,'NOITE',1)`).run(id, idx + 1, cid));
    [...new Set(diurnos)].forEach((cid) => db.prepare(`INSERT INTO escala_diurno_fixos (config_id,colaborador_id,ativo) VALUES (?,?,1)`).run(id, cid));
    return id;
  });
  return buscarRodizioAtivo(tx());
}
function getPeriodoRodizioId(inicio, fim) {
  const existente = db.prepare(`
    SELECT id FROM escala_periodos
    WHERE titulo = 'Rodízio da Escala' AND vigencia_inicio = ? AND vigencia_fim = ?
    ORDER BY id DESC LIMIT 1
  `).get(inicio, fim);
  if (existente?.id) return existente.id;
  return Number(db.prepare(`
    INSERT INTO escala_periodos (titulo, vigencia_inicio, vigencia_fim, regra_texto, intervalo_tecnico)
    VALUES ('Rodízio da Escala', ?, ?, 'Gerado pelo Editor de Rodízio da Escala', '19h-05h')
  `).run(inicio, fim).lastInsertRowid);
}

function garantirSemanasEscala(inicio, fim) {
  const periodoId = getPeriodoRodizioId(inicio, fim);
  const semanas = [];
  let cursor = inicio;
  let numero = Number(db.prepare(`SELECT COALESCE(MAX(semana_numero),0) + 1 AS n FROM escala_semanas`).get()?.n || 1);
  while (cursor <= fim) {
    const semFim = addDaysISO(cursor, 6) > fim ? fim : addDaysISO(cursor, 6);
    let row = db.prepare(`
      SELECT id, semana_numero, data_inicio, data_fim, ajuste_manual, origem, rodizio_config_id, semana_indice
      FROM escala_semanas
      WHERE data_inicio = ? AND data_fim = ?
      LIMIT 1
    `).get(cursor, semFim);
    if (!row) {
      const info = db.prepare(`INSERT INTO escala_semanas (periodo_id, semana_numero, data_inicio, data_fim) VALUES (?,?,?,?)`).run(periodoId, numero++, cursor, semFim);
      row = { id: Number(info.lastInsertRowid), semana_numero: numero - 1, data_inicio: cursor, data_fim: semFim, ajuste_manual: 0, origem: 'GERADA' };
    }
    semanas.push(row);
    cursor = addDaysISO(semFim, 1);
  }
  return semanas;
}

function semanasEntre(inicio, fim, { criar = false } = {}) {
  if (criar) return garantirSemanasEscala(inicio, fim);
  return db.prepare(`SELECT id, semana_numero, data_inicio, data_fim, ajuste_manual, origem, rodizio_config_id, semana_indice FROM escala_semanas WHERE data_fim >= ? AND data_inicio <= ? ORDER BY data_inicio`).all(inicio, fim);
}
function montarSemanaRodizio(semana, config) {
  const noturnos = config.noturnos || []; const fixos = config.diurnosFixos || [];
  const idx = (Number(semana.semana_indice || 0)) % Math.max(1, Number(config.tamanho_ciclo || noturnos.length));
  const itemNoite = noturnos[idx % noturnos.length];
  const conflitos = itemNoite ? buscarIndisponibilidadesNoPeriodo(itemNoite.colaborador_id, semana.data_inicio, semana.data_fim).map(a => `${itemNoite.nome} está em ${a.tipo}`) : ['Sem plantonista noturno configurado.'];
  const diurnos = [...fixos, ...noturnos.filter((n) => Number(n.colaborador_id) !== Number(itemNoite?.colaborador_id))]
    .filter((c, pos, arr) => arr.findIndex((x) => Number(x.colaborador_id) === Number(c.colaborador_id)) === pos)
    .filter((c) => colaboradorDisponivelNoPeriodo(c.colaborador_id, semana.data_inicio, semana.data_fim));
  return { ...semana, noturno: itemNoite || null, diurnos, conflitos, semana_indice: idx };
}
function montarConfigRodizioTemporaria(dados) {
  const colaboradores = listarColaboradoresManutencao();
  const validos = new Set(colaboradores.map((c) => Number(c.id)));
  const noturnosIds = parseIds(dados.noturnos || dados.rodizioNoturno || dados.colaboradores_noturnos).filter((id) => validos.has(Number(id)));
  const diurnosIds = parseIds(dados.diurnos_fixos || dados.diurnosFixos || dados.colaboradores_diurnos).filter((id) => validos.has(Number(id)));
  const byId = new Map(colaboradores.map(c => [Number(c.id), c]));
  return { id: null, nome: String(dados.nome || 'Prévia do Rodízio'), data_inicio: toDateOnly(dados.data_inicio), data_fim: toDateOnly(dados.data_fim) || null, tamanho_ciclo: Math.max(1, Number(dados.tamanho_ciclo || noturnosIds.length || 1)), noturnos: noturnosIds.map((id, idx) => ({ colaborador_id: id, nome: byId.get(id)?.nome || `#${id}`, posicao: idx + 1 })), diurnosFixos: diurnosIds.map((id) => ({ colaborador_id: id, nome: byId.get(id)?.nome || `#${id}` })) };
}
function gerarPreviewRodizio(dados) {
  const config = dados.config_id ? buscarRodizioAtivo() : ((dados.noturnos || dados.colaboradores_noturnos) ? montarConfigRodizioTemporaria(dados) : buscarRodizioAtivo());
  if (!config) throw new Error('Configure o rodízio antes de pré-visualizar.');
  const inicio = toDateOnly(dados.data_inicio || config.data_inicio); const fim = toDateOnly(dados.data_fim || config.data_fim) || addDaysISO(inicio, 364);
  return semanasEntre(inicio, fim, { criar: true }).map((s, i) => montarSemanaRodizio({ ...s, semana_indice: i }, config));
}
function detectarConflitosRodizio(config, periodo) { return gerarPreviewRodizio({ config_id: config?.id, data_inicio: periodo?.inicio, data_fim: periodo?.fim }).filter(s => s.conflitos.length); }
function aplicarRodizioNaEscala(dados, usuario) {
  const config = dados.config_id ? buscarRodizioAtivo() : salvarConfiguracaoRodizio(dados, usuario);
  const inicio = toDateOnly(dados.data_inicio || config.data_inicio); const fim = toDateOnly(dados.data_fim || config.data_fim) || addDaysISO(inicio, 364);
  const sobrescrever = String(dados.sobrescreverTudo || dados.sobrescrever || dados.sobrescrever_manuais || '').toLowerCase() === 'true' || dados.sobrescreverTudo === '1' || dados.sobrescrever === '1';
  const preview = semanasEntre(inicio, fim, { criar: true }).map((s, i) => montarSemanaRodizio({ ...s, semana_indice: i }, config));
  let puladas = 0, alocacoes = 0;
  const tx = db.transaction(() => {
    for (const sem of preview) {
      if (Number(sem.ajuste_manual) === 1 && !sobrescrever) { puladas++; continue; }
      db.prepare(`DELETE FROM escala_alocacoes WHERE semana_id=?`).run(sem.id);
      if (sem.noturno && colaboradorDisponivelNoPeriodo(sem.noturno.colaborador_id, sem.data_inicio, sem.data_fim)) { db.prepare(`INSERT OR IGNORE INTO escala_alocacoes (semana_id,tipo_turno,colaborador_id,observacao) VALUES (?,'noturno',?,'Rodízio da Escala')`).run(sem.id, sem.noturno.colaborador_id); alocacoes++; }
      sem.diurnos.forEach((c) => { db.prepare(`INSERT OR IGNORE INTO escala_alocacoes (semana_id,tipo_turno,colaborador_id,observacao) VALUES (?,'diurno',?,'Rodízio da Escala')`).run(sem.id, c.colaborador_id); alocacoes++; });
      db.prepare(`UPDATE escala_semanas SET origem='GERADA', ajuste_manual=0, rodizio_config_id=?, semana_indice=?, observacao=COALESCE(observacao,''), status=COALESCE(status,'ATIVA') WHERE id=?`).run(config.id, sem.semana_indice, sem.id);
    }
  }); tx(); return { semanas: preview.length, semanasGeradas: preview.length, semanasAtualizadas: preview.length - puladas, semanasPreservadasPorAjusteManual: puladas, alocacoes, puladas, conflitos: preview.flatMap(s=>s.conflitos || []), periodoInicio: inicio, periodoFim: fim };
}
function recalcularEscalaPorRodizio(configId, filtros, usuario) { return aplicarRodizioNaEscala({ ...(filtros || {}), config_id: Number(configId), sobrescreverTudo: filtros?.sobrescreverTudo || filtros?.sobrescrever }, usuario); }
function desativarRodizio(id) { if (!id) return false; return db.prepare(`UPDATE escala_rodizio_config SET ativo=0, atualizado_em=datetime('now') WHERE id=?`).run(id).changes > 0; }
function salvarSemanaManual(semanaId, dados) {
  const inicio = toDateOnly(dados.data_inicio); const fim = toDateOnly(dados.data_fim);
  const noturnoId = Number(dados.noturno_id || 0); const diurnoIds = parseIds(dados.diurnos || dados.diurnos_ids);
  const obs = String(dados.observacao || '').trim(); const status = String(dados.status || 'ATIVA').trim().toUpperCase();
  const tx = db.transaction(() => {
    if (inicio && fim && fim >= inicio) db.prepare(`UPDATE escala_semanas SET data_inicio=?, data_fim=? WHERE id=?`).run(inicio, fim, semanaId);
    db.prepare(`DELETE FROM escala_alocacoes WHERE semana_id=?`).run(semanaId);
    if (noturnoId) db.prepare(`INSERT OR IGNORE INTO escala_alocacoes (semana_id,tipo_turno,colaborador_id,observacao) VALUES (?,'noturno',?,?)`).run(semanaId, noturnoId, obs || 'Ajuste manual');
    [...new Set(diurnoIds)].filter(id => id !== noturnoId).forEach(id => db.prepare(`INSERT OR IGNORE INTO escala_alocacoes (semana_id,tipo_turno,colaborador_id,observacao) VALUES (?,'diurno',?,?)`).run(semanaId, id, obs || 'Ajuste manual'));
    db.prepare(`UPDATE escala_semanas SET origem='MANUAL', ajuste_manual=1, observacao=?, status=? WHERE id=?`).run(obs || null, status || 'ATIVA', semanaId);
  }); tx();
}

function recalcularEscalaCompleta({ quantidade = 3 } = {}) {
  const qtd = Math.min(5, Math.max(2, Number(quantidade) || 3));
  const colaboradores = listarColaboradoresManutencao();
  if (colaboradores.length === 0) throw new Error('Nenhum colaborador disponível para recalcular.');
  const semanas = db.prepare(`SELECT id, data_inicio, data_fim, COALESCE(ajuste_manual,0) AS ajuste_manual FROM escala_semanas WHERE data_fim >= ? ORDER BY data_inicio ASC`).all(isoToday());
  let idx = 0, alocacoes = 0;
  const tx = db.transaction(() => {
    for (const sem of semanas) {
      if (Number(sem.ajuste_manual) === 1 && !arguments[0]?.sobrescrever) continue;
      db.prepare(`DELETE FROM escala_alocacoes WHERE semana_id=?`).run(sem.id);
      const selecionados = []; let tentativas = 0;
      while (selecionados.length < qtd && tentativas < colaboradores.length * 2) {
        const c = colaboradores[idx % colaboradores.length]; idx += 1; tentativas += 1;
        const ausente = db.prepare(`SELECT 1 FROM escala_ausencias WHERE colaborador_id=? AND NOT (data_fim < ? OR data_inicio > ?) LIMIT 1`).get(c.id, sem.data_inicio, sem.data_fim);
        if (!ausente && !selecionados.some(s => s.id === c.id)) selecionados.push(c);
      }
      selecionados.forEach((c, i) => { db.prepare(`INSERT OR IGNORE INTO escala_alocacoes (semana_id,tipo_turno,colaborador_id,observacao) VALUES (?,?,?,?)`).run(sem.id, i === 0 ? 'noturno' : 'diurno', c.id, `Recalculado: ${qtd} colaboradores/semana`); alocacoes += 1; });
    }
  }); tx();
  return { semanas: semanas.length, alocacoes, quantidade: qtd };
}

Object.assign(module.exports, { listarConfiguracoesRodizio, buscarRodizioAtivo, normalizarDataFormulario, listarEscalaCompleta, buscarDadosPdfEscalaCompleta, salvarConfiguracaoRodizio, gerarPreviewRodizio, aplicarRodizioNaEscala, recalcularEscalaPorRodizio, montarSemanaRodizio, buscarIndisponibilidadesNoPeriodo, detectarConflitosRodizio, desativarRodizio, salvarSemanaManual, recalcularEscalaCompleta, MINUTOS_DIA_FOLGA, minutosToHoras, saldoResumo, listarPainelEscala, listarColaboradoresManutencao, listarColaboradoresMecanicosHoraExtra, isMecanicoUser, isColaboradorMecanico, listarOsDisponiveisParaHoraExtra, buscarColaboradorDoUsuario, iniciarHoraExtra, buscarHoraExtraEmAndamento, buscarHoraExtraPorId, finalizarHoraExtra, listarHorasExtrasPendentes, listarHorasExtrasEmAndamentoPorOs, listarHorasExtras, aprovarHoraExtra, reprovarHoraExtra, ajustarHoraExtra, cancelarHoraExtra, calcularSaldoBancoHoras, listarBancoHoras, listarMovimentosBancoHoras, listarFolgas, programarFolgaCompensatoria, cancelarFolgaCompensatoria, realizarFolgaCompensatoria, gerarDadosRelatorioBancoHoras, canManageBancoHoras, canReadBancoHoras, filePath });
