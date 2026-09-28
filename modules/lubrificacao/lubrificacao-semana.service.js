const db = require('../../database/db');
const osService = require('../os/os.service');
const catalogo = require('./lubrificacao.catalogo.v1');

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function tableColumns(name) {
  if (!tableExists(name)) return [];
  return db.prepare(`PRAGMA table_info(${name})`).all().map((row) => row.name);
}

function localDate(refDate = null) {
  const raw = String(refDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return db.prepare("SELECT date('now','localtime') AS hoje").get()?.hoje;
}

function getWeekBounds(refDate = null) {
  const base = localDate(refDate);
  const row = db.prepare(`
    SELECT
      date(?, '-' || ((CAST(strftime('%w', ?) AS INTEGER) + 6) % 7) || ' day') AS inicio
  `).get(base, base);
  const inicio = row?.inicio || base;
  const fim = db.prepare("SELECT date(?, '+6 day') AS fim").get(inicio)?.fim || inicio;
  return { inicio, fim, referencia: base };
}

function getSemanaPorReferencia(refDate = null) {
  if (!tableExists('pcm_lubrificacao_semanas')) return null;
  const { inicio } = getWeekBounds(refDate);
  return db.prepare(`
    SELECT s.*,
           COALESCE(u.name,u.email,'Mecânico #' || s.responsavel_user_id) AS responsavel_nome
    FROM pcm_lubrificacao_semanas s
    LEFT JOIN users u ON u.id=s.responsavel_user_id
    WHERE s.semana_inicio=?
    LIMIT 1
  `).get(inicio) || null;
}

function validarMecanico(userId) {
  const id = Number(userId || 0);
  if (!id) throw new Error('Selecione o mecânico responsável pela semana.');
  const userCols = tableColumns('users');
  const activeWhere = userCols.includes('ativo') ? 'AND COALESCE(ativo,1)=1' : '';
  const user = db.prepare(`
    SELECT id,COALESCE(name,email,'Mecânico #' || id) AS nome
    FROM users
    WHERE id=?
      AND UPPER(COALESCE(role,''))='MECANICO'
      ${activeWhere}
    LIMIT 1
  `).get(id);
  if (!user) throw new Error('O responsável da semana precisa possuir perfil MECANICO e estar ativo.');

  if (tableExists('colaboradores')) {
    const colabCols = tableColumns('colaboradores');
    const activeColabWhere = colabCols.includes('ativo') ? 'AND COALESCE(ativo,1)=1' : '';
    const colaborador = db.prepare(`
      SELECT id
      FROM colaboradores
      WHERE user_id=?
        ${activeColabWhere}
      LIMIT 1
    `).get(id);
    if (!colaborador?.id) {
      throw new Error('O mecânico selecionado precisa estar vinculado a um colaborador ativo para receber as OS automáticas.');
    }
    user.colaborador_id = Number(colaborador.id);
  }

  return user;
}

function salvarResponsavelSemana({ semana_referencia, responsavel_user_id } = {}, actorUserId = null) {
  if (!tableExists('pcm_lubrificacao_semanas')) throw new Error('Estrutura semanal de lubrificação não disponível.');
  const responsavel = validarMecanico(responsavel_user_id);
  const bounds = getWeekBounds(semana_referencia);

  db.prepare(`
    INSERT INTO pcm_lubrificacao_semanas (
      semana_inicio,semana_fim,responsavel_user_id,created_by,updated_by,created_at,updated_at
    )
    VALUES (?,?,?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(semana_inicio) DO UPDATE SET
      semana_fim=excluded.semana_fim,
      responsavel_user_id=excluded.responsavel_user_id,
      updated_by=excluded.updated_by,
      updated_at=datetime('now')
  `).run(
    bounds.inicio,
    bounds.fim,
    Number(responsavel.id),
    actorUserId || null,
    actorUserId || null
  );

  const semana = getSemanaPorReferencia(bounds.inicio);
  let reatribuidas = 0;

  if (semana?.id && tableExists('pcm_lubrificacao_os_programadas') && tableExists('os')) {
    const abertas = db.prepare(`
      SELECT p.id,p.os_id
      FROM pcm_lubrificacao_os_programadas p
      JOIN os o ON o.id=p.os_id
      WHERE p.semana_id=?
        AND p.os_id IS NOT NULL
        AND UPPER(COALESCE(o.status,'')) NOT IN ('FECHADA','FINALIZADA','CONCLUIDA','CONCLUÍDA','CANCELADA')
    `).all(Number(semana.id));

    for (const item of abertas) {
      if (assignResponsavelOS(item.os_id, responsavel.id)) {
        db.prepare(`
          UPDATE pcm_lubrificacao_os_programadas
          SET responsavel_user_id=?,updated_at=datetime('now')
          WHERE id=?
        `).run(Number(responsavel.id), Number(item.id));
        reatribuidas += 1;
      }
    }
  }

  return { ...semana, reatribuidas };
}

function weekdayForDate(dateIso) {
  return Number(db.prepare("SELECT CAST(strftime('%w', ?) AS INTEGER) AS d").get(dateIso)?.d ?? -1);
}

function hasWeekday(csv, weekday) {
  const values = String(csv || '').split(',').map((v) => Number(v.trim())).filter(Number.isInteger);
  return values.includes(Number(weekday));
}

function pontosOSDoDia(dataRef = null) {
  if (!tableExists('pcm_lubrificacao_planos') || !tableExists('equipamentos')) return [];
  const data = localDate(dataRef);
  const weekday = weekdayForDate(data);
  if (weekday < 0) return [];

  const rows = db.prepare(`
    SELECT
      l.id AS plano_id,
      l.equipamento_id,
      l.ponto_lubrificacao,
      l.tipo_lubrificante_texto,
      l.quantidade,
      l.unidade,
      l.metodo_aplicacao,
      l.dias_semana_lubrificacao,
      l.familia_lubrificacao,
      e.nome AS equipamento_nome,
      COALESCE(e.setor,'') AS setor
    FROM pcm_lubrificacao_planos l
    JOIN equipamentos e ON e.id=l.equipamento_id
    WHERE COALESCE(l.ativo,1)=1
      AND COALESCE(l.validado_tecnicamente,1)=1
      AND COALESCE(l.dias_semana_lubrificacao,'')<>''
      AND (
        UPPER(COALESCE(l.familia_lubrificacao,''))='MOINHOS'
        OR (
          UPPER(COALESCE(l.familia_lubrificacao,''))='EXAUSTORES'
          AND (
            UPPER(COALESCE(e.nome,'')) LIKE '%CALDEIRA%'
            OR UPPER(COALESCE(e.setor,'')) LIKE '%CALDEIRA%'
          )
        )
      )
    ORDER BY e.nome,l.ordem_rota,l.id
  `).all();

  return rows.filter((row) => hasWeekday(row.dias_semana_lubrificacao, weekday));
}

function groupedOSDoDia(dataRef = null) {
  const groups = new Map();
  for (const row of pontosOSDoDia(dataRef)) {
    const key = Number(row.equipamento_id);
    if (!groups.has(key)) {
      groups.set(key, {
        equipamento_id: key,
        equipamento_nome: row.equipamento_nome,
        setor: row.setor,
        familia_lubrificacao: row.familia_lubrificacao,
        pontos: [],
      });
    }
    groups.get(key).pontos.push(row);
  }
  return Array.from(groups.values());
}

function buildDescricaoOS(group, data) {
  const itens = group.pontos.map((p) => {
    const qtd = p.quantidade == null ? '' : ` • ${p.quantidade} ${p.unidade || ''}`;
    return `- ${p.ponto_lubrificacao}: ${p.tipo_lubrificante_texto || 'produto conforme PCM'}${qtd} • ${p.metodo_aplicacao || 'executar conforme roteiro'}`;
  });
  return [
    `Lubrificação programada - ${group.equipamento_nome} - ${data}.`,
    'Executar os pontos abaixo pelo módulo Roteiro de Lubrificação:',
    ...itens,
    'Registrar no roteiro a quantidade utilizada, condição encontrada e qualquer anomalia.',
  ].join('\n');
}

function assignResponsavelOS(osId, responsavelUserId) {
  try {
    osService.setEquipeManual(
      Number(osId),
      { mecanico_user_id: Number(responsavelUserId) },
      null,
      { role: 'ADMIN' }
    );
    return true;
  } catch (_e) {
    const cols = tableColumns('os');
    const sets = [];
    const args = [];
    for (const col of ['mecanico_user_id','responsavel_user_id']) {
      if (!cols.includes(col)) continue;
      sets.push(`${col}=?`);
      args.push(Number(responsavelUserId));
    }
    if (sets.length) {
      args.push(Number(osId));
      db.prepare(`UPDATE os SET ${sets.join(',')} WHERE id=?`).run(...args);
      return true;
    }
    return false;
  }
}

function getOSProgramada(dataRef, equipamentoId) {
  if (!tableExists('pcm_lubrificacao_os_programadas')) return null;
  const data = localDate(dataRef);
  return db.prepare(`
    SELECT p.*,o.status AS os_status
    FROM pcm_lubrificacao_os_programadas p
    LEFT JOIN os o ON o.id=p.os_id
    WHERE p.data_programada=? AND p.equipamento_id=?
    LIMIT 1
  `).get(data, Number(equipamentoId)) || null;
}

function processarOSAutomaticas({ refDate = null, actorUserId = null, automatico = false } = {}) {
  const data = localDate(refDate);
  const semana = getSemanaPorReferencia(data);
  if (!semana?.responsavel_user_id) {
    return { ok:true, skipped:true, reason:'sem_responsavel_semana', data, geradas:0, existentes:0, equipamentos:0 };
  }

  const grupos = groupedOSDoDia(data);
  let geradas = 0;
  let existentes = 0;
  const criadas = [];

  for (const group of grupos) {
    db.prepare(`
      DELETE FROM pcm_lubrificacao_os_programadas
      WHERE data_programada=?
        AND equipamento_id=?
        AND os_id IS NULL
        AND status='PROCESSANDO'
        AND datetime(updated_at)<datetime('now','-10 minutes')
    `).run(data, Number(group.equipamento_id));

    let reservado = false;
    let createdOsId = null;
    try {
      db.prepare(`
        INSERT INTO pcm_lubrificacao_os_programadas (
          semana_id,data_programada,equipamento_id,os_id,responsavel_user_id,status,created_at,updated_at
        )
        VALUES (?,?,?,NULL,?,'PROCESSANDO',datetime('now'),datetime('now'))
      `).run(
        Number(semana.id),
        data,
        Number(group.equipamento_id),
        Number(semana.responsavel_user_id)
      );
      reservado = true;
    } catch (error) {
      if (String(error?.message || '').includes('UNIQUE')) {
        existentes += 1;
        continue;
      }
      throw error;
    }

    try {
      createdOsId = osService.createOSAutomatica({
        equipamento_id: Number(group.equipamento_id),
        descricao: buildDescricaoOS(group, data),
        tipo: 'PREVENTIVA',
        prioridade: 'MEDIA',
        opened_by: actorUserId || null,
        origem: 'LUBRIFICACAO',
        metadata: {
          origem_lubrificacao: 'ROTEIRO_SEMANAL',
          semana_id: Number(semana.id),
          semana_inicio: semana.semana_inicio,
          data_programada: data,
          responsavel_user_id: Number(semana.responsavel_user_id),
          plano_ids: group.pontos.map((p) => Number(p.plano_id)),
          roteiro_url: '/lubrificacao',
          automatico: Boolean(automatico),
        },
      });

      const atribuido = assignResponsavelOS(createdOsId, semana.responsavel_user_id);
      if (!atribuido) {
        throw new Error('Não foi possível atribuir a OS ao mecânico responsável pela semana.');
      }

      db.prepare(`
        UPDATE pcm_lubrificacao_os_programadas
        SET os_id=?,
            status='GERADA',
            updated_at=datetime('now')
        WHERE data_programada=? AND equipamento_id=?
      `).run(Number(createdOsId), data, Number(group.equipamento_id));

      // Se o roteiro já foi executado antes do scheduler criar a OS,
      // vincula as execuções existentes e sincroniza o status imediatamente.
      sincronizarStatusOSProgramada(group.equipamento_id, semana.responsavel_user_id, data);

      geradas += 1;
      criadas.push({ os_id:Number(createdOsId), equipamento_id:Number(group.equipamento_id), equipamento_nome:group.equipamento_nome });
    } catch (error) {
      if (reservado && createdOsId) {
        db.prepare(`
          UPDATE pcm_lubrificacao_os_programadas
          SET os_id=?,status='ERRO_ATRIBUICAO',updated_at=datetime('now')
          WHERE data_programada=? AND equipamento_id=?
        `).run(Number(createdOsId), data, Number(group.equipamento_id));
      } else if (reservado) {
        db.prepare(`
          DELETE FROM pcm_lubrificacao_os_programadas
          WHERE data_programada=? AND equipamento_id=? AND os_id IS NULL
        `).run(data, Number(group.equipamento_id));
      }
      throw error;
    }
  }

  return { ok:true, skipped:false, data, automatico:Boolean(automatico), geradas, existentes, equipamentos:grupos.length, criadas };
}

function sincronizarStatusOSProgramada(equipamentoId, executorUserId, dataRef = null) {
  const equipamento = Number(equipamentoId || 0);
  const executor = Number(executorUserId || 0) || null;
  if (!equipamento || !tableExists('pcm_lubrificacao_os_programadas') || !tableExists('pcm_lubrificacao_execucoes')) {
    return { vinculada:false, concluida:false, total:0, executados:0 };
  }

  const data = localDate(dataRef);
  const programada = getOSProgramada(data, equipamento);
  if (!programada?.os_id) return { vinculada:false, concluida:false, total:0, executados:0 };

  const grupo = groupedOSDoDia(data).find((item) => Number(item.equipamento_id) === equipamento);
  const planoIds = (grupo?.pontos || []).map((item) => Number(item.plano_id)).filter(Boolean);
  if (!planoIds.length) {
    return { vinculada:true, concluida:false, os_id:Number(programada.os_id), total:0, executados:0 };
  }

  const placeholders = planoIds.map(() => '?').join(',');

  // Execuções podem ter ocorrido antes da OS ser criada. Faz o vínculo retroativo
  // somente para o mesmo equipamento/data e sem sobrescrever outra OS existente.
  db.prepare(`
    UPDATE pcm_lubrificacao_execucoes
    SET os_id=?
    WHERE equipamento_id=?
      AND date(executed_at)=date(?)
      AND plano_id IN (${placeholders})
      AND os_id IS NULL
  `).run(Number(programada.os_id), equipamento, data, ...planoIds);

  const executados = Number(db.prepare(`
    SELECT COUNT(DISTINCT plano_id) AS total
    FROM pcm_lubrificacao_execucoes
    WHERE os_id=?
      AND date(executed_at)=date(?)
      AND plano_id IN (${placeholders})
  `).get(Number(programada.os_id), data, ...planoIds)?.total || 0);

  const finalStatuses = new Set(['FECHADA','FINALIZADA','CONCLUIDA','CONCLUÍDA','CANCELADA']);
  const statusAtual = String(programada.os_status || '').toUpperCase();
  const concluida = executados >= planoIds.length;

  if (concluida) {
    if (!finalStatuses.has(statusAtual)) {
      const execRows = db.prepare(`
        SELECT x.quantidade_utilizada,x.unidade,x.anomalia,x.anomalia_descricao,
               l.ponto_lubrificacao
        FROM pcm_lubrificacao_execucoes x
        JOIN pcm_lubrificacao_planos l ON l.id=x.plano_id
        WHERE x.os_id=?
          AND date(x.executed_at)=date(?)
          AND x.plano_id IN (${placeholders})
        ORDER BY l.ponto_lubrificacao
      `).all(Number(programada.os_id), data, ...planoIds);

      const resumo = [
        'Lubrificação concluída pelo Roteiro de Lubrificação.',
        ...execRows.map((row) => {
          const qtd = row.quantidade_utilizada == null ? '-' : `${row.quantidade_utilizada} ${row.unidade || ''}`;
          const anomalia = Number(row.anomalia) === 1
            ? ` | ANOMALIA: ${row.anomalia_descricao || 'registrada no roteiro'}`
            : '';
          return `- ${row.ponto_lubrificacao}: ${qtd}${anomalia}`;
        }),
      ].join('\n');

      const cols = tableColumns('os');
      const sets = [];
      const args = [];
      if (cols.includes('acao_executada')) { sets.push('acao_executada=?'); args.push(resumo); }
      if (cols.includes('resumo_tecnico')) { sets.push('resumo_tecnico=?'); args.push(resumo); }
      if (sets.length) {
        args.push(Number(programada.os_id));
        db.prepare(`UPDATE os SET ${sets.join(',')} WHERE id=?`).run(...args);
      }

      osService.updateStatus(Number(programada.os_id), 'FECHADA', executor);
    }

    db.prepare(`
      UPDATE pcm_lubrificacao_os_programadas
      SET status='CONCLUIDA',updated_at=datetime('now')
      WHERE id=?
    `).run(Number(programada.id));

    return {
      vinculada:true,
      concluida:true,
      os_id:Number(programada.os_id),
      total:planoIds.length,
      executados,
    };
  }

  if (executados > 0 && !finalStatuses.has(statusAtual) && !['ANDAMENTO','EM_ANDAMENTO'].includes(statusAtual)) {
    osService.updateStatus(Number(programada.os_id), 'ANDAMENTO', executor);
  }

  db.prepare(`
    UPDATE pcm_lubrificacao_os_programadas
    SET status=?,updated_at=datetime('now')
    WHERE id=?
  `).run(executados > 0 ? 'ANDAMENTO' : 'GERADA', Number(programada.id));

  return {
    vinculada:true,
    concluida:false,
    os_id:Number(programada.os_id),
    total:planoIds.length,
    executados,
  };
}

function getDashboardResumo(refDate = null) {
  const bounds = getWeekBounds(refDate);
  const semana = getSemanaPorReferencia(bounds.inicio);
  const hoje = localDate(refDate);

  const totalAtivos = tableExists('pcm_lubrificacao_planos')
    ? Number(db.prepare(`
        SELECT COUNT(*) AS total
        FROM pcm_lubrificacao_planos
        WHERE COALESCE(ativo,1)=1 AND COALESCE(validado_tecnicamente,1)=1
      `).get()?.total || 0)
    : 0;

  const atrasados = tableExists('pcm_lubrificacao_planos')
    ? Number(db.prepare(`
        SELECT COUNT(*) AS total
        FROM pcm_lubrificacao_planos
        WHERE COALESCE(ativo,1)=1
          AND COALESCE(validado_tecnicamente,1)=1
          AND proxima_execucao_em IS NOT NULL
          AND date(proxima_execucao_em)<date(?)
      `).get(hoje)?.total || 0)
    : 0;

  const executadosSemana = tableExists('pcm_lubrificacao_execucoes')
    ? Number(db.prepare(`
        SELECT COUNT(*) AS total
        FROM pcm_lubrificacao_execucoes
        WHERE date(executed_at) BETWEEN date(?) AND date(?)
      `).get(bounds.inicio,bounds.fim)?.total || 0)
    : 0;

  const osHoje = tableExists('pcm_lubrificacao_os_programadas')
    ? Number(db.prepare(`
        SELECT COUNT(*) AS total FROM pcm_lubrificacao_os_programadas WHERE data_programada=?
      `).get(hoje)?.total || 0)
    : 0;

  return {
    semana_inicio: bounds.inicio,
    semana_fim: bounds.fim,
    responsavel_user_id: semana?.responsavel_user_id || null,
    responsavel_nome: semana?.responsavel_nome || null,
    total_ativos: totalAtivos,
    atrasados,
    executados_semana: executadosSemana,
    os_hoje: osHoje,
    sem_responsavel: !semana?.responsavel_user_id,
  };
}

function getAcompanhamentoPCM(refDate = null) {
  const bounds = getWeekBounds(refDate);
  const semana = getSemanaPorReferencia(bounds.inicio);
  if (!tableExists('pcm_lubrificacao_planos') || !tableExists('equipamentos')) {
    return {
      ...bounds, semana, total_pontos:0, pontos_concluidos:0, pontos_pendentes:0,
      percentual:0, execucoes_semana:0, ultima_atividade:null, areas:[], equipamentos:[]
    };
  }

  const planos = db.prepare(`
    SELECT l.id AS plano_id,l.equipamento_id,l.ponto_lubrificacao,
           e.nome AS equipamento_nome,COALESCE(e.setor,'') AS setor
    FROM pcm_lubrificacao_planos l
    JOIN equipamentos e ON e.id=l.equipamento_id
    WHERE COALESCE(l.ativo,1)=1
      AND COALESCE(l.validado_tecnicamente,1)=1
    ORDER BY e.nome,l.id
  `).all();

  const execRows = tableExists('pcm_lubrificacao_execucoes')
    ? db.prepare(`
        SELECT x.plano_id,x.equipamento_id,MAX(x.executed_at) AS ultima_execucao,
               COUNT(*) AS execucoes
        FROM pcm_lubrificacao_execucoes x
        WHERE date(x.executed_at) BETWEEN date(?) AND date(?)
        GROUP BY x.plano_id,x.equipamento_id
      `).all(bounds.inicio,bounds.fim)
    : [];

  const execByPlan = new Map(execRows.map((row) => [Number(row.plano_id), row]));
  const execucoesSemana = tableExists('pcm_lubrificacao_execucoes')
    ? Number(db.prepare(`
        SELECT COUNT(*) AS total
        FROM pcm_lubrificacao_execucoes
        WHERE date(executed_at) BETWEEN date(?) AND date(?)
      `).get(bounds.inicio,bounds.fim)?.total || 0)
    : 0;

  const ultimaAtividade = tableExists('pcm_lubrificacao_execucoes')
    ? db.prepare(`
        SELECT x.executed_at,x.plano_id,x.equipamento_id,
               e.nome AS equipamento_nome,COALESCE(e.setor,'') AS setor,
               l.ponto_lubrificacao,
               COALESCE(u.name,u.email,'') AS executor_nome
        FROM pcm_lubrificacao_execucoes x
        JOIN pcm_lubrificacao_planos l ON l.id=x.plano_id
        JOIN equipamentos e ON e.id=x.equipamento_id
        LEFT JOIN users u ON u.id=x.executor_user_id
        WHERE date(x.executed_at) BETWEEN date(?) AND date(?)
        ORDER BY datetime(x.executed_at) DESC,x.id DESC
        LIMIT 1
      `).get(bounds.inicio,bounds.fim)
    : null;

  const equipamentosMap = new Map();
  for (const plano of planos) {
    const eid = Number(plano.equipamento_id);
    if (!equipamentosMap.has(eid)) {
      const area = catalogo.classificarAreaOperacional({ setor:plano.setor });
      equipamentosMap.set(eid,{
        equipamento_id:eid,
        equipamento_nome:plano.equipamento_nome,
        setor:plano.setor,
        area_operacional:area.codigo,
        area_operacional_label:area.label,
        total_pontos:0,
        pontos_concluidos:0,
        ultima_execucao:null,
      });
    }
    const item = equipamentosMap.get(eid);
    item.total_pontos += 1;
    const exec = execByPlan.get(Number(plano.plano_id));
    if (exec) {
      item.pontos_concluidos += 1;
      if (!item.ultima_execucao || String(exec.ultima_execucao) > String(item.ultima_execucao)) {
        item.ultima_execucao = exec.ultima_execucao;
      }
    }
  }

  const areaMap = new Map();
  const equipamentos = Array.from(equipamentosMap.values()).map((item) => {
    const percentual = item.total_pontos ? Math.round((item.pontos_concluidos / item.total_pontos) * 100) : 0;
    const status = percentual >= 100 ? 'CONCLUIDO' : item.pontos_concluidos > 0 ? 'ANDAMENTO' : 'PENDENTE';
    const row = { ...item, pontos_pendentes:Math.max(0,item.total_pontos-item.pontos_concluidos), percentual, status };
    if (!areaMap.has(row.area_operacional)) {
      areaMap.set(row.area_operacional,{
        codigo:row.area_operacional,label:row.area_operacional_label,
        total_pontos:0,pontos_concluidos:0,equipamentos:0
      });
    }
    const area = areaMap.get(row.area_operacional);
    area.total_pontos += row.total_pontos;
    area.pontos_concluidos += row.pontos_concluidos;
    area.equipamentos += 1;
    return row;
  });

  const order = { AREA_SUJA:1, AREA_LIMPA:2, CASA_CALDEIRA:3, OUTRAS_AREAS:4 };
  equipamentos.sort((a,b) =>
    (order[a.area_operacional] || 99) - (order[b.area_operacional] || 99)
    || (a.status === 'ANDAMENTO' ? -1 : a.status === 'PENDENTE' ? 0 : 1)
      - (b.status === 'ANDAMENTO' ? -1 : b.status === 'PENDENTE' ? 0 : 1)
    || a.equipamento_nome.localeCompare(b.equipamento_nome)
  );

  const areas = Array.from(areaMap.values()).map((area) => ({
    ...area,
    pontos_pendentes:Math.max(0,area.total_pontos-area.pontos_concluidos),
    percentual:area.total_pontos ? Math.round((area.pontos_concluidos/area.total_pontos)*100) : 0,
  })).sort((a,b) => (order[a.codigo] || 99) - (order[b.codigo] || 99));

  const concluidos = execByPlan.size;
  const total = planos.length;
  return {
    ...bounds,
    semana,
    responsavel_user_id:semana?.responsavel_user_id || null,
    responsavel_nome:semana?.responsavel_nome || null,
    total_pontos:total,
    pontos_concluidos:concluidos,
    pontos_pendentes:Math.max(0,total-concluidos),
    percentual:total ? Math.round((concluidos/total)*100) : 0,
    execucoes_semana:execucoesSemana,
    ultima_atividade:ultimaAtividade ? {
      ...ultimaAtividade,
      area_operacional:catalogo.classificarAreaOperacional({setor:ultimaAtividade.setor}).codigo,
      area_operacional_label:catalogo.classificarAreaOperacional({setor:ultimaAtividade.setor}).label,
    } : null,
    areas,
    equipamentos,
  };
}

function getRelatorioSemana(refDate = null) {
  const bounds = getWeekBounds(refDate);
  const semana = getSemanaPorReferencia(bounds.inicio);
  const execucoes = tableExists('pcm_lubrificacao_execucoes')
    ? db.prepare(`
        SELECT x.*,e.nome AS equipamento_nome,COALESCE(e.setor,'') AS setor,
               l.ponto_lubrificacao,l.tipo_lubrificante_texto,l.rota_lubrificacao,
               o.id AS os_numero
        FROM pcm_lubrificacao_execucoes x
        JOIN pcm_lubrificacao_planos l ON l.id=x.plano_id
        JOIN equipamentos e ON e.id=x.equipamento_id
        LEFT JOIN os o ON o.id=x.os_id
        WHERE date(x.executed_at) BETWEEN date(?) AND date(?)
        ORDER BY datetime(x.executed_at),e.nome,l.ponto_lubrificacao
      `).all(bounds.inicio,bounds.fim)
    : [];
  const osProgramadas = tableExists('pcm_lubrificacao_os_programadas')
    ? db.prepare(`
        SELECT p.*,e.nome AS equipamento_nome,o.status AS os_status
        FROM pcm_lubrificacao_os_programadas p
        JOIN equipamentos e ON e.id=p.equipamento_id
        LEFT JOIN os o ON o.id=p.os_id
        WHERE p.data_programada BETWEEN ? AND ?
        ORDER BY p.data_programada,e.nome
      `).all(bounds.inicio,bounds.fim)
    : [];
  return { ...bounds, semana, execucoes, osProgramadas, resumo:getDashboardResumo(bounds.inicio) };
}

module.exports = {
  getWeekBounds,
  getSemanaPorReferencia,
  salvarResponsavelSemana,
  pontosOSDoDia,
  groupedOSDoDia,
  processarOSAutomaticas,
  sincronizarStatusOSProgramada,
  getOSProgramada,
  getDashboardResumo,
  getAcompanhamentoPCM,
  getRelatorioSemana,
};
