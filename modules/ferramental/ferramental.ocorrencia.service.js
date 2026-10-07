const db = require('../../database/db');
const aceiteService = require('./ferramental.aceite.service');

function int(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function assertSchema() {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ferramental_ocorrencias'").get();
  if (!row) throw new Error('A estrutura de ocorrências do Ferramental V1.3 ainda não foi migrada.');
}

function nextCode() {
  const rows = db.prepare("SELECT codigo FROM ferramental_ocorrencias WHERE codigo LIKE 'OCO-FER-%'").all();
  let max = 0;
  for (const row of rows) {
    const n = Number(String(row.codigo || '').replace('OCO-FER-', ''));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `OCO-FER-${String(max + 1).padStart(4, '0')}`;
}

function activeCustody(toolId) {
  return db.prepare(`
    SELECT c.*, e.codigo AS equipe_codigo, e.nome AS equipe_nome,
           ac.numero AS compartimento_numero, ar.codigo AS armario_codigo
    FROM ferramental_custodias c
    JOIN ferramental_equipes e ON e.id=c.equipe_id
    JOIN ferramental_armario_compartimentos ac ON ac.id=c.compartimento_id
    JOIN ferramental_armarios ar ON ar.id=ac.armario_id
    WHERE c.ferramenta_id=? AND c.ativo=1
    LIMIT 1
  `).get(int(toolId)) || null;
}

function userBelongsToTeam(userId, teamId) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM ferramental_equipe_membros
    WHERE equipe_id=? AND user_id=?
    LIMIT 1
  `).get(int(teamId), int(userId)));
}

function getById(occurrenceId) {
  assertSchema();
  const id = int(occurrenceId);
  if (!id) return null;
  return db.prepare(`
    SELECT o.*,
           f.codigo_interno, f.descricao AS ferramenta_descricao, f.status AS ferramenta_status,
           f.condicao AS ferramenta_condicao, f.numero_serie, f.patrimonio,
           opener.name AS aberta_por_nome,
           resolver.name AS resolvido_por_nome,
           e.codigo AS equipe_codigo, e.nome AS equipe_nome
    FROM ferramental_ocorrencias o
    JOIN ferramental_itens f ON f.id=o.ferramenta_id
    JOIN users opener ON opener.id=o.aberta_por_user_id
    LEFT JOIN users resolver ON resolver.id=o.resolvido_por_user_id
    LEFT JOIN ferramental_equipes e ON e.id=o.equipe_id
    WHERE o.id=?
    LIMIT 1
  `).get(id) || null;
}

function createOwnOccurrence(userId, toolId, data = {}) {
  assertSchema();
  const uid = int(userId);
  const tid = int(toolId);
  const allowed = new Set(['DEVOLUCAO','MANUTENCAO','DANO','EXTRAVIO','OUTRO']);
  const type = clean(data.tipo, 30).toUpperCase();
  const description = clean(data.descricao, 1000);
  if (!uid || !tid || !allowed.has(type)) throw new Error('Tipo de ocorrência inválido.');
  if (!description) throw new Error('Descreva o motivo da ocorrência.');

  const tool = db.prepare('SELECT * FROM ferramental_itens WHERE id=? AND ativo=1 LIMIT 1').get(tid);
  if (!tool) throw new Error('Ferramenta não encontrada.');
  if (String(tool.status) === 'BAIXADA') throw new Error('Ferramenta baixada não aceita nova ocorrência operacional.');
  const custody = activeCustody(tid);
  if (!custody || !userBelongsToTeam(uid, custody.equipe_id)) {
    throw new Error('Você só pode abrir ocorrência para ferramenta sob sua responsabilidade atual.');
  }

  const existing = db.prepare(`
    SELECT codigo
    FROM ferramental_ocorrencias
    WHERE ferramenta_id=? AND status IN ('ABERTA','EM_ANALISE','EM_ACOMPANHAMENTO')
    LIMIT 1
  `).get(tid);
  if (existing) throw new Error(`Já existe a ocorrência ${existing.codigo} em andamento para esta ferramenta.`);

  return db.transaction(() => {
    const code = nextCode();
    const result = db.prepare(`
      INSERT INTO ferramental_ocorrencias (
        codigo,ferramenta_id,custodia_id,equipe_id,aberta_por_user_id,
        tipo,origem,status,descricao,status_ferramenta_abertura,condicao_abertura
      ) VALUES (?,?,?,?,?,?,'MEU_PORTAL','ABERTA',?,?,?)
    `).run(
      code,
      tid,
      custody.id,
      custody.equipe_id,
      uid,
      type,
      description,
      tool.status,
      tool.condicao
    );

    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,custodia_id,tipo,equipe_id,actor_user_id,observacao
      ) VALUES (?,?,?,?,?,?)
    `).run(tid, custody.id, 'OCORRENCIA_ABERTA', custody.equipe_id, uid, `${code} • ${type} • ${description}`);

    return Number(result.lastInsertRowid);
  })();
}

function createPcmOccurrence(actorUserId, toolId, data = {}) {
  assertSchema();
  const actor = int(actorUserId);
  const tid = int(toolId);
  const allowed = new Set(['DEVOLUCAO','MANUTENCAO','DANO','EXTRAVIO','BAIXA','OUTRO']);
  const type = clean(data.tipo, 30).toUpperCase();
  const description = clean(data.descricao, 1000);
  if (!actor || !tid || !allowed.has(type)) throw new Error('Tipo de ocorrência inválido.');
  if (!description) throw new Error('Descreva o motivo da ocorrência.');

  const tool = db.prepare('SELECT * FROM ferramental_itens WHERE id=? AND ativo=1 LIMIT 1').get(tid);
  if (!tool) throw new Error('Ferramenta não encontrada.');
  if (String(tool.status) === 'BAIXADA') throw new Error('Ferramenta baixada não aceita nova ocorrência operacional.');
  const custody = activeCustody(tid);
  const existing = db.prepare(`
    SELECT codigo FROM ferramental_ocorrencias
    WHERE ferramenta_id=? AND status IN ('ABERTA','EM_ANALISE','EM_ACOMPANHAMENTO')
    LIMIT 1
  `).get(tid);
  if (existing) throw new Error(`Já existe a ocorrência ${existing.codigo} em andamento para esta ferramenta.`);

  return db.transaction(() => {
    const code = nextCode();
    const result = db.prepare(`
      INSERT INTO ferramental_ocorrencias (
        codigo,ferramenta_id,custodia_id,equipe_id,aberta_por_user_id,
        tipo,origem,status,descricao,status_ferramenta_abertura,condicao_abertura
      ) VALUES (?,?,?,?,?,?,'PCM','ABERTA',?,?,?)
    `).run(
      code,
      tid,
      custody?.id || null,
      custody?.equipe_id || null,
      actor,
      type,
      description,
      tool.status,
      tool.condicao
    );

    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,custodia_id,tipo,equipe_id,actor_user_id,observacao
      ) VALUES (?,?,?,?,?,?)
    `).run(tid, custody?.id || null, 'OCORRENCIA_ABERTA_PCM', custody?.equipe_id || null, actor, `${code} • ${type} • ${description}`);

    return Number(result.lastInsertRowid);
  })();
}

function settlePendingInventories(custodyId, situation, note) {
  const cid = int(custodyId);
  if (!cid) return;
  const rows = db.prepare(`
    SELECT DISTINCT inventario_id
    FROM ferramental_inventario_itens
    WHERE custodia_id=? AND situacao='PENDENTE'
  `).all(cid);

  db.prepare(`
    UPDATE ferramental_inventario_itens
    SET situacao=?,
        observacao=CASE
          WHEN observacao IS NULL OR trim(observacao)='' THEN ?
          ELSE observacao || ' • ' || ?
        END,
        conferido_em=COALESCE(conferido_em, datetime('now')),
        updated_at=datetime('now')
    WHERE custodia_id=? AND situacao='PENDENTE'
  `).run(situation, note, note, cid);

  for (const row of rows) {
    const pending = db.prepare(`
      SELECT COUNT(*) AS total
      FROM ferramental_inventario_itens
      WHERE inventario_id=? AND situacao='PENDENTE'
    `).get(row.inventario_id)?.total || 0;
    if (!pending) {
      db.prepare(`
        UPDATE ferramental_inventarios
        SET status='CONCLUIDO', completed_at=COALESCE(completed_at, datetime('now'))
        WHERE id=? AND status='ABERTO'
      `).run(row.inventario_id);
    }
  }
}

function closeActiveCustody(toolId, actorUserId, movementType, targetStatus, note, inventorySituation) {
  const tid = int(toolId);
  const actor = int(actorUserId);
  const custody = activeCustody(tid);
  if (!custody) return null;

  aceiteService.cancelPendingForCustody(custody.id);
  settlePendingInventories(custody.id, inventorySituation || 'CONFIRMADO', note);

  db.prepare(`
    UPDATE ferramental_custodias
    SET ativo=0, data_fim=datetime('now')
    WHERE id=?
  `).run(custody.id);

  db.prepare(`
    UPDATE ferramental_itens
    SET status=?, updated_at=datetime('now')
    WHERE id=?
  `).run(targetStatus, tid);

  db.prepare(`
    INSERT INTO ferramental_movimentacoes (
      ferramenta_id,custodia_id,tipo,origem_descricao,destino_descricao,
      equipe_id,compartimento_id,actor_user_id,observacao
    ) VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    tid,
    custody.id,
    movementType,
    `${custody.equipe_nome} • ${custody.armario_codigo} / Compartimento ${custody.compartimento_numero}`,
    targetStatus,
    custody.equipe_id,
    custody.compartimento_id,
    actor,
    note
  );
  return custody;
}

function validateTransfer(teamId, compartmentId) {
  const eid = int(teamId);
  const cid = int(compartmentId);
  if (!eid || !cid) throw new Error('Selecione a equipe e o compartimento de destino.');

  const team = db.prepare('SELECT * FROM ferramental_equipes WHERE id=? AND ativo=1 LIMIT 1').get(eid);
  if (!team) throw new Error('Equipe de destino não encontrada.');
  const members = db.prepare('SELECT user_id FROM ferramental_equipe_membros WHERE equipe_id=? ORDER BY ordem').all(eid);
  if (!members.length || members.length > 2) throw new Error('A equipe de destino deve possuir um ou dois responsáveis.');

  const compartment = db.prepare(`
    SELECT c.*, a.codigo AS armario_codigo, a.owner_user_id, u.name AS armario_responsavel
    FROM ferramental_armario_compartimentos c
    JOIN ferramental_armarios a ON a.id=c.armario_id AND a.ativo=1
    JOIN users u ON u.id=a.owner_user_id
    WHERE c.id=?
    LIMIT 1
  `).get(cid);
  if (!compartment || compartment.finalidade !== 'FERRAMENTAL') {
    throw new Error('Selecione um compartimento de ferramental válido.');
  }
  const memberIds = new Set(members.map((row) => Number(row.user_id)));
  if (!memberIds.has(Number(compartment.owner_user_id))) {
    throw new Error('O armário de destino deve pertencer a um dos responsáveis da equipe.');
  }
  return { team, members, compartment };
}

function transferTool(occurrence, actorUserId, data, note) {
  const target = validateTransfer(data.equipe_id, data.compartimento_id);
  const current = activeCustody(occurrence.ferramenta_id);
  if (current) {
    aceiteService.cancelPendingForCustody(current.id);
    settlePendingInventories(current.id, 'CONFIRMADO', `Encerrado por transferência PCM • ${note}`);
    db.prepare("UPDATE ferramental_custodias SET ativo=0, data_fim=datetime('now') WHERE id=?").run(current.id);
  }

  const result = db.prepare(`
    INSERT INTO ferramental_custodias (
      ferramenta_id,equipe_id,compartimento_id,entregue_por_user_id,observacao
    ) VALUES (?,?,?,?,?)
  `).run(
    occurrence.ferramenta_id,
    target.team.id,
    target.compartment.id,
    int(actorUserId),
    note
  );
  aceiteService.createPendingForCustody(result.lastInsertRowid, target.team.id);

  db.prepare("UPDATE ferramental_itens SET status='EM_RESPONSABILIDADE', updated_at=datetime('now') WHERE id=?")
    .run(occurrence.ferramenta_id);

  db.prepare(`
    INSERT INTO ferramental_movimentacoes (
      ferramenta_id,custodia_id,tipo,origem_descricao,destino_descricao,
      equipe_id,compartimento_id,actor_user_id,observacao
    ) VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    occurrence.ferramenta_id,
    result.lastInsertRowid,
    'TRANSFERENCIA_PCM',
    current ? `${current.equipe_nome} • ${current.armario_codigo} / Compartimento ${current.compartimento_numero}` : 'Sem custódia ativa',
    `${target.team.nome} • ${target.compartment.armario_codigo} / Compartimento ${target.compartment.numero}`,
    target.team.id,
    target.compartment.id,
    int(actorUserId),
    note
  );
}

function resolveOccurrence(occurrenceId, actorUserId, data = {}) {
  assertSchema();
  const id = int(occurrenceId);
  const actor = int(actorUserId);
  const action = clean(data.acao, 50).toUpperCase();
  const note = clean(data.resolucao, 1000);
  if (!id || !actor) throw new Error('Ocorrência inválida.');
  if (!note) throw new Error('Descreva a decisão ou serviço realizado pelo PCM.');

  const occurrence = getById(id);
  if (!occurrence) throw new Error('Ocorrência não encontrada.');
  if (!['ABERTA','EM_ANALISE','EM_ACOMPANHAMENTO'].includes(occurrence.status)) {
    throw new Error('Esta ocorrência já foi encerrada.');
  }

  const allowedInitial = new Set([
    'SEM_ACAO','DEVOLVER_DISPONIVEL','ENVIAR_MANUTENCAO',
    'MARCAR_DANIFICADA','MARCAR_EXTRAVIADA','TRANSFERIR','BAIXAR','CANCELAR'
  ]);
  const allowedFollowup = new Set(['RETORNAR_DISPONIVEL','MARCAR_DANIFICADA','BAIXAR']);
  const allowed = occurrence.status === 'EM_ACOMPANHAMENTO' ? allowedFollowup : allowedInitial;
  if (!allowed.has(action)) throw new Error('Ação de tratamento inválida para o estado atual da ocorrência.');

  return db.transaction(() => {
    let nextStatus = 'RESOLVIDA';
    if (action === 'DEVOLVER_DISPONIVEL') {
      closeActiveCustody(occurrence.ferramenta_id, actor, 'DEVOLUCAO_PCM', 'DISPONIVEL', note, 'CONFIRMADO');
      db.prepare("UPDATE ferramental_itens SET status='DISPONIVEL', updated_at=datetime('now') WHERE id=?")
        .run(occurrence.ferramenta_id);
    } else if (action === 'ENVIAR_MANUTENCAO') {
      closeActiveCustody(occurrence.ferramenta_id, actor, 'ENVIO_MANUTENCAO', 'EM_MANUTENCAO', note, 'EM_MANUTENCAO');
      db.prepare("UPDATE ferramental_itens SET status='EM_MANUTENCAO', updated_at=datetime('now') WHERE id=?")
        .run(occurrence.ferramenta_id);
      nextStatus = 'EM_ACOMPANHAMENTO';
    } else if (action === 'MARCAR_DANIFICADA') {
      closeActiveCustody(occurrence.ferramenta_id, actor, 'FERRAMENTA_DANIFICADA', 'DANIFICADA', note, 'DANIFICADO');
      db.prepare("UPDATE ferramental_itens SET status='DANIFICADA', condicao='DANIFICADA', updated_at=datetime('now') WHERE id=?")
        .run(occurrence.ferramenta_id);
    } else if (action === 'MARCAR_EXTRAVIADA') {
      closeActiveCustody(occurrence.ferramenta_id, actor, 'FERRAMENTA_EXTRAVIADA', 'EXTRAVIADA', note, 'NAO_LOCALIZADO');
      db.prepare("UPDATE ferramental_itens SET status='EXTRAVIADA', updated_at=datetime('now') WHERE id=?")
        .run(occurrence.ferramenta_id);
    } else if (action === 'TRANSFERIR') {
      transferTool(occurrence, actor, data, note);
    } else if (action === 'BAIXAR') {
      closeActiveCustody(occurrence.ferramenta_id, actor, 'BAIXA_FERRAMENTA', 'BAIXADA', note, 'CONFIRMADO');
      db.prepare("UPDATE ferramental_itens SET status='BAIXADA', updated_at=datetime('now') WHERE id=?")
        .run(occurrence.ferramenta_id);
    } else if (action === 'RETORNAR_DISPONIVEL') {
      const allowedConditions = new Set(['NOVA','BOA','USADA','COM_DESGASTE','DANIFICADA']);
      const returnCondition = clean(data.condicao_retorno, 30).toUpperCase();
      if (returnCondition && !allowedConditions.has(returnCondition)) {
        throw new Error('Condição de retorno inválida.');
      }
      db.prepare(`
        UPDATE ferramental_itens
        SET status='DISPONIVEL',
            condicao=CASE WHEN ?<>'' THEN ? ELSE condicao END,
            updated_at=datetime('now')
        WHERE id=?
      `).run(returnCondition, returnCondition, occurrence.ferramenta_id);
      db.prepare(`
        INSERT INTO ferramental_movimentacoes (
          ferramenta_id,tipo,actor_user_id,observacao,destino_descricao
        ) VALUES (?,?,?,?,?)
      `).run(
        occurrence.ferramenta_id,
        'RETORNO_MANUTENCAO',
        actor,
        returnCondition ? `${note} • Condição de retorno: ${returnCondition}` : note,
        'Disponível / PCM'
      );
    } else if (action === 'CANCELAR') {
      nextStatus = 'CANCELADA';
    } else if (action === 'SEM_ACAO') {
      // Mantém a situação física e encerra apenas a ocorrência.
    }

    db.prepare(`
      UPDATE ferramental_ocorrencias
      SET status=?,
          acao_pcm=?,
          resolucao=CASE
            WHEN resolucao IS NULL OR trim(resolucao)='' THEN ?
            ELSE resolucao || ' • ' || ?
          END,
          resolvido_por_user_id=?,
          resolved_at=CASE WHEN ? IN ('RESOLVIDA','CANCELADA') THEN datetime('now') ELSE NULL END,
          updated_at=datetime('now')
      WHERE id=?
    `).run(nextStatus, action, note, note, actor, nextStatus, id);

    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,custodia_id,tipo,equipe_id,actor_user_id,observacao
      ) VALUES (?,?,?,?,?,?)
    `).run(
      occurrence.ferramenta_id,
      occurrence.custodia_id,
      nextStatus === 'EM_ACOMPANHAMENTO' ? 'OCORRENCIA_EM_ACOMPANHAMENTO' : 'OCORRENCIA_TRATADA',
      occurrence.equipe_id,
      actor,
      `${occurrence.codigo} • ${action} • ${note}`
    );

    return id;
  })();
}

function listOwn(userId) {
  assertSchema();
  const uid = int(userId);
  if (!uid) return [];
  return db.prepare(`
    SELECT DISTINCT o.*, f.codigo_interno, f.descricao AS ferramenta_descricao,
           opener.name AS aberta_por_nome, resolver.name AS resolvido_por_nome
    FROM ferramental_ocorrencias o
    JOIN ferramental_itens f ON f.id=o.ferramenta_id
    LEFT JOIN users opener ON opener.id=o.aberta_por_user_id
    LEFT JOIN users resolver ON resolver.id=o.resolvido_por_user_id
    LEFT JOIN ferramental_equipe_membros m ON m.equipe_id=o.equipe_id
    WHERE (o.aberta_por_user_id=? OR m.user_id=?)
    ORDER BY
      CASE o.status WHEN 'ABERTA' THEN 0 WHEN 'EM_ANALISE' THEN 1 WHEN 'EM_ACOMPANHAMENTO' THEN 2 ELSE 3 END,
      o.created_at DESC
    LIMIT 50
  `).all(uid, uid);
}

function dashboard() {
  assertSchema();
  const resumo = db.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('ABERTA','EM_ANALISE') THEN 1 ELSE 0 END) AS pendentes,
      SUM(CASE WHEN status='EM_ACOMPANHAMENTO' THEN 1 ELSE 0 END) AS acompanhamento,
      SUM(CASE WHEN status='RESOLVIDA' THEN 1 ELSE 0 END) AS resolvidas,
      SUM(CASE WHEN tipo='EXTRAVIO' AND status IN ('ABERTA','EM_ANALISE','EM_ACOMPANHAMENTO') THEN 1 ELSE 0 END) AS extravios_abertos
    FROM ferramental_ocorrencias
  `).get() || {};

  const abertas = db.prepare(`
    SELECT o.*, f.codigo_interno, f.descricao AS ferramenta_descricao,
           f.status AS ferramenta_status, f.condicao AS ferramenta_condicao,
           opener.name AS aberta_por_nome, resolver.name AS resolvido_por_nome,
           e.codigo AS equipe_codigo, e.nome AS equipe_nome
    FROM ferramental_ocorrencias o
    JOIN ferramental_itens f ON f.id=o.ferramenta_id
    JOIN users opener ON opener.id=o.aberta_por_user_id
    LEFT JOIN users resolver ON resolver.id=o.resolvido_por_user_id
    LEFT JOIN ferramental_equipes e ON e.id=o.equipe_id
    WHERE o.status IN ('ABERTA','EM_ANALISE','EM_ACOMPANHAMENTO')
    ORDER BY
      CASE o.tipo WHEN 'EXTRAVIO' THEN 0 WHEN 'DANO' THEN 1 WHEN 'MANUTENCAO' THEN 2 ELSE 3 END,
      o.created_at ASC
  `).all();

  const recentes = db.prepare(`
    SELECT o.*, f.codigo_interno, f.descricao AS ferramenta_descricao,
           opener.name AS aberta_por_nome, resolver.name AS resolvido_por_nome
    FROM ferramental_ocorrencias o
    JOIN ferramental_itens f ON f.id=o.ferramenta_id
    JOIN users opener ON opener.id=o.aberta_por_user_id
    LEFT JOIN users resolver ON resolver.id=o.resolvido_por_user_id
    ORDER BY o.created_at DESC
    LIMIT 30
  `).all();

  return { resumo, abertas, recentes };
}

function history(toolId) {
  assertSchema();
  const tid = int(toolId);
  if (!tid) return { movimentacoes: [], ocorrencias: [] };

  const movements = db.prepare(`
    SELECT m.*, u.name AS actor_nome, e.codigo AS equipe_codigo, e.nome AS equipe_nome
    FROM ferramental_movimentacoes m
    LEFT JOIN users u ON u.id=m.actor_user_id
    LEFT JOIN ferramental_equipes e ON e.id=m.equipe_id
    WHERE m.ferramenta_id=?
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 150
  `).all(tid);

  const occurrences = db.prepare(`
    SELECT o.*, opener.name AS aberta_por_nome, resolver.name AS resolvido_por_nome
    FROM ferramental_ocorrencias o
    JOIN users opener ON opener.id=o.aberta_por_user_id
    LEFT JOIN users resolver ON resolver.id=o.resolvido_por_user_id
    WHERE o.ferramenta_id=?
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT 100
  `).all(tid);

  return { movimentacoes: movements, ocorrencias: occurrences };
}

module.exports = {
  getById,
  createOwnOccurrence,
  createPcmOccurrence,
  resolveOccurrence,
  listOwn,
  dashboard,
  history,
  settlePendingInventories,
};
