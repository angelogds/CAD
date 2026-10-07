const db = require('../../database/db');
const { normalizeRole } = require('../../config/rbac');
const inspecaoService = require('./ferramental.inspecao.service');

const MANAGER_ROLES = new Set(['ADMIN','ENCARREGADO_MANUTENCAO','MANUTENCAO_SUPERVISOR']);
const APP_TZ = process.env.TZ || 'America/Sao_Paulo';

function int(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function wallTimeEpoch(value) {
  const raw = clean(value, 40).replace('T',' ');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return NaN;
  const [, y,m,d,h,min,sec='00'] = match;
  const desiredUtc = Date.UTC(Number(y),Number(m)-1,Number(d),Number(h),Number(min),Number(sec));
  let guess = desiredUtc;
  for (let i = 0; i < 2; i += 1) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TZ,
      year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
    }).formatToParts(new Date(guess)).filter((p) => p.type !== 'literal').map((p) => [p.type,p.value]));
    const zoneAsUtc = Date.UTC(
      Number(parts.year),Number(parts.month)-1,Number(parts.day),
      Number(parts.hour),Number(parts.minute),Number(parts.second)
    );
    const offset = zoneAsUtc - guess;
    guess = desiredUtc - offset;
  }
  return guess;
}

function isOverdueValue(value) {
  if (!value) return false;
  const epoch = wallTimeEpoch(value);
  return Number.isFinite(epoch) && epoch < Date.now();
}

function assertSchema() {
  const names = ['ferramental_usos','ferramental_inventario_scan_sessoes','ferramental_inventario_scan_itens'];
  for (const name of names) {
    const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if (!row) throw new Error('A estrutura operacional do Ferramental V2 ainda não foi migrada.');
  }
}

function nextCode(table, prefix) {
  const rows = db.prepare(`SELECT codigo FROM ${table} WHERE codigo LIKE ?`).all(`${prefix}%`);
  let max = 0;
  for (const row of rows) {
    const n = Number(String(row.codigo || '').replace(prefix, ''));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

function getUser(userId) {
  return db.prepare(`
    SELECT id,name,role,COALESCE(ativo,1) AS ativo,deleted_at
    FROM users WHERE id=? LIMIT 1
  `).get(int(userId)) || null;
}

function getTool(toolId) {
  return db.prepare(`
    SELECT f.*,
           c.id AS custodia_id,c.equipe_id,
           e.codigo AS equipe_codigo,e.nome AS equipe_nome,
           ac.numero AS compartimento_numero,
           ar.codigo AS armario_codigo, au.name AS armario_responsavel
    FROM ferramental_itens f
    LEFT JOIN ferramental_custodias c ON c.ferramenta_id=f.id AND c.ativo=1
    LEFT JOIN ferramental_equipes e ON e.id=c.equipe_id
    LEFT JOIN ferramental_armario_compartimentos ac ON ac.id=c.compartimento_id
    LEFT JOIN ferramental_armarios ar ON ar.id=ac.armario_id
    LEFT JOIN users au ON au.id=ar.owner_user_id
    WHERE f.id=? AND f.ativo=1
    LIMIT 1
  `).get(int(toolId)) || null;
}

function getToolByToken(token) {
  const row = db.prepare('SELECT id FROM ferramental_itens WHERE qr_token=? AND ativo=1 LIMIT 1')
    .get(clean(token, 100));
  return row ? getTool(row.id) : null;
}

function activeUse(toolId) {
  assertSchema();
  const row = db.prepare(`
    SELECT u.*, borrower.name AS retirado_por_nome, registrar.name AS registrado_por_nome,
           returner.name AS devolvido_por_nome
    FROM ferramental_usos u
    JOIN users borrower ON borrower.id=u.retirado_por_user_id
    LEFT JOIN users registrar ON registrar.id=u.registrado_por_user_id
    LEFT JOIN users returner ON returner.id=u.devolvido_por_user_id
    WHERE u.ferramenta_id=? AND u.status='EM_USO'
    LIMIT 1
  `).get(int(toolId)) || null;
  return row ? { ...row, atrasado: isOverdueValue(row.previsao_devolucao) } : null;
}

function isManager(user) {
  return MANAGER_ROLES.has(normalizeRole(user?.role));
}

function teamMembership(userId, teamId) {
  if (!int(userId) || !int(teamId)) return false;
  return Boolean(db.prepare(`
    SELECT 1 FROM ferramental_equipe_membros
    WHERE equipe_id=? AND user_id=?
    LIMIT 1
  `).get(int(teamId), int(userId)));
}

function assertCanUse(userId, tool) {
  const user = getUser(userId);
  if (!user || Number(user.ativo || 0) !== 1 || user.deleted_at) throw new Error('Usuário ativo não encontrado.');
  if (isManager(user)) return user;
  if (!tool.custodia_id || !teamMembership(user.id, tool.equipe_id)) {
    throw new Error('A retirada por QR é permitida apenas aos responsáveis atuais da ferramenta.');
  }
  return user;
}

function parseDue(value) {
  const raw = clean(value, 40);
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw.replace('T',' ') : raw;
  const epoch = wallTimeEpoch(normalized);
  if (!Number.isFinite(epoch)) throw new Error('Previsão de devolução inválida.');
  if (epoch <= Date.now()) throw new Error('A previsão de devolução precisa ser futura.');
  return normalized.slice(0,19);
}

function checkout(toolId, userId, data = {}, meta = {}) {
  assertSchema();
  const tid = int(toolId);
  const uid = int(userId);
  if (!tid || !uid) throw new Error('Ferramenta ou usuário inválido.');
  const tool = getTool(tid);
  if (!tool) throw new Error('Ferramenta não encontrada.');
  if (tool.status === 'BAIXADA') throw new Error('Ferramenta baixada não pode ser retirada.');
  if (tool.status === 'EM_MANUTENCAO' || tool.status === 'DANIFICADA' || tool.status === 'EXTRAVIADA') {
    throw new Error('A ferramenta não está liberada para uso operacional.');
  }
  inspecaoService.assertToolUnblocked(tid);
  const inspection = inspecaoService.toolInspectionStatus(tid);
  if (inspection.situation === 'VENCIDA') {
    throw new Error('A inspeção de segurança está vencida. Regularize a inspeção antes da retirada.');
  }
  const user = assertCanUse(uid, tool);
  const current = activeUse(tid);
  if (current) throw new Error(`${tool.codigo_interno} já está em uso por ${current.retirado_por_nome}.`);

  const due = parseDue(data.previsao_devolucao);
  const origin = ['QR','PCM','MEU_PORTAL'].includes(String(meta.origem || '').toUpperCase())
    ? String(meta.origem).toUpperCase()
    : 'QR';
  const code = nextCode('ferramental_usos','USO-FER-');

  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO ferramental_usos (
        codigo,ferramenta_id,custodia_id,retirado_por_user_id,registrado_por_user_id,
        origem,status,previsao_devolucao,local_uso,condicao_saida,observacao_saida
      ) VALUES (?,?,?,?,?,?,'EM_USO',?,?,?,?)
    `).run(
      code,
      tid,
      tool.custodia_id || null,
      user.id,
      int(meta.registrado_por_user_id) || user.id,
      origin,
      due,
      clean(data.local_uso, 160) || null,
      tool.condicao || null,
      clean(data.observacao, 800) || null
    );

    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,custodia_id,tipo,equipe_id,actor_user_id,
        origem_descricao,destino_descricao,observacao
      ) VALUES (?,?,?,?,?,?,?,?)
    `).run(
      tid,
      tool.custodia_id || null,
      'RETIRADA_USO_QR',
      tool.equipe_id || null,
      user.id,
      tool.armario_codigo ? `${tool.armario_codigo} / C${tool.compartimento_numero}` : 'Guarda PCM',
      clean(data.local_uso, 160) || 'Uso operacional',
      `${code}${due ? ' • previsão ' + due : ''}${data.observacao ? ' • ' + clean(data.observacao, 500) : ''}`
    );

    return Number(result.lastInsertRowid);
  })();
}

function returnUse(toolId, userId, data = {}) {
  assertSchema();
  const tid = int(toolId);
  const uid = int(userId);
  const tool = getTool(tid);
  if (!tool) throw new Error('Ferramenta não encontrada.');
  const usage = activeUse(tid);
  if (!usage) throw new Error('Esta ferramenta não possui retirada operacional em aberto.');

  const user = getUser(uid);
  if (!user) throw new Error('Usuário não encontrado.');
  const allowed = isManager(user)
    || Number(usage.retirado_por_user_id) === uid
    || teamMembership(uid, tool.equipe_id);
  if (!allowed) throw new Error('Você não possui permissão para registrar esta devolução.');

  const allowedConditions = new Set(['NOVA','BOA','USADA','COM_DESGASTE','DANIFICADA']);
  const condition = clean(data.condicao_retorno, 30).toUpperCase() || tool.condicao || 'BOA';
  if (!allowedConditions.has(condition)) throw new Error('Condição de retorno inválida.');

  return db.transaction(() => {
    db.prepare(`
      UPDATE ferramental_usos
      SET status='DEVOLVIDO', devolvido_por_user_id=?, devolvido_em=datetime('now'),
          condicao_retorno=?, observacao_retorno=?, updated_at=datetime('now')
      WHERE id=? AND status='EM_USO'
    `).run(uid, condition, clean(data.observacao_retorno, 800) || null, usage.id);

    db.prepare(`
      UPDATE ferramental_itens
      SET condicao=?,
          status=CASE WHEN ?='DANIFICADA' THEN 'DANIFICADA' ELSE status END,
          updated_at=datetime('now')
      WHERE id=?
    `).run(condition, condition, tid);

    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,custodia_id,tipo,equipe_id,actor_user_id,
        origem_descricao,destino_descricao,observacao
      ) VALUES (?,?,?,?,?,?,?,?)
    `).run(
      tid,
      tool.custodia_id || usage.custodia_id || null,
      condition === 'DANIFICADA' ? 'DEVOLUCAO_USO_DANIFICADA' : 'DEVOLUCAO_USO_QR',
      tool.equipe_id || null,
      uid,
      usage.local_uso || 'Uso operacional',
      tool.armario_codigo ? `${tool.armario_codigo} / C${tool.compartimento_numero}` : 'Guarda PCM',
      `${usage.codigo} • condição: ${condition}${data.observacao_retorno ? ' • ' + clean(data.observacao_retorno,500) : ''}`
    );

    return usage.id;
  })();
}

function toolOperational(toolId, userId) {
  assertSchema();
  const tool = getTool(toolId);
  if (!tool) return null;
  const user = getUser(userId);
  const usage = activeUse(tool.id);
  const inspection = inspecaoService.toolInspectionStatus(tool.id);
  let canCheckout = false;
  let canReturn = false;
  if (user) {
    canCheckout = !usage
      && ['DISPONIVEL','EM_RESPONSABILIDADE'].includes(String(tool.status || ''))
      && !inspection.block
      && inspection.situation !== 'VENCIDA'
      && (isManager(user) || (tool.custodia_id && teamMembership(user.id, tool.equipe_id)));
    canReturn = Boolean(usage)
      && (isManager(user)
        || Number(usage.retirado_por_user_id) === Number(user.id)
        || teamMembership(user.id, tool.equipe_id));
  }
  return { tool, usage, inspection, canCheckout, canReturn };
}

function inventoryCandidates(teamId) {
  const eid = int(teamId);
  if (eid) {
    return db.prepare(`
      SELECT f.id AS ferramenta_id,c.id AS custodia_id,
             f.codigo_interno,f.descricao,
             a.codigo AS armario_codigo, ac.numero AS compartimento_numero
      FROM ferramental_custodias c
      JOIN ferramental_itens f ON f.id=c.ferramenta_id AND f.ativo=1 AND f.status<>'BAIXADA'
      JOIN ferramental_armario_compartimentos ac ON ac.id=c.compartimento_id
      JOIN ferramental_armarios a ON a.id=ac.armario_id
      WHERE c.ativo=1 AND c.equipe_id=?
      ORDER BY f.descricao COLLATE NOCASE
    `).all(eid);
  }
  return db.prepare(`
    SELECT f.id AS ferramenta_id,c.id AS custodia_id,
           f.codigo_interno,f.descricao,
           a.codigo AS armario_codigo, ac.numero AS compartimento_numero
    FROM ferramental_itens f
    LEFT JOIN ferramental_custodias c ON c.ferramenta_id=f.id AND c.ativo=1
    LEFT JOIN ferramental_armario_compartimentos ac ON ac.id=c.compartimento_id
    LEFT JOIN ferramental_armarios a ON a.id=ac.armario_id
    WHERE f.ativo=1 AND f.status<>'BAIXADA'
    ORDER BY f.descricao COLLATE NOCASE
  `).all();
}

function createScanSession(data = {}, actorUserId) {
  assertSchema();
  const actor = int(actorUserId);
  if (!actor) throw new Error('Usuário inválido.');
  const teamId = int(data.equipe_id);
  if (teamId) {
    const team = db.prepare('SELECT id,nome FROM ferramental_equipes WHERE id=? AND ativo=1 LIMIT 1').get(teamId);
    if (!team) throw new Error('Equipe não encontrada.');
  }

  const duplicate = teamId
    ? db.prepare("SELECT codigo FROM ferramental_inventario_scan_sessoes WHERE status='ABERTO' AND equipe_id=? LIMIT 1").get(teamId)
    : db.prepare("SELECT codigo FROM ferramental_inventario_scan_sessoes WHERE status='ABERTO' AND equipe_id IS NULL LIMIT 1").get();
  if (duplicate) throw new Error(`Já existe o inventário ${duplicate.codigo} aberto para este escopo.`);

  const items = inventoryCandidates(teamId);
  if (!items.length) throw new Error('Não há ferramentas ativas neste escopo para inventariar.');
  const code = nextCode('ferramental_inventario_scan_sessoes','SCAN-FER-');
  const title = clean(data.titulo, 160) || (teamId ? 'Inventário QR da equipe' : 'Inventário QR geral');

  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO ferramental_inventario_scan_sessoes (
        codigo,titulo,equipe_id,status,total_esperado,observacao,created_by
      ) VALUES (?,?,?,'ABERTO',?,?,?)
    `).run(code, title, teamId || null, items.length, clean(data.observacao,800) || null, actor);

    const insert = db.prepare(`
      INSERT INTO ferramental_inventario_scan_itens (
        sessao_id,ferramenta_id,custodia_id,esperado,status,local_esperado
      ) VALUES (?,?,?,1,'PENDENTE',?)
    `);
    for (const item of items) {
      const location = item.armario_codigo ? `${item.armario_codigo} / C${item.compartimento_numero}` : 'Sem local de guarda';
      insert.run(result.lastInsertRowid,item.ferramenta_id,item.custodia_id || null,location);
    }
    return Number(result.lastInsertRowid);
  })();
}

function recalcSession(sessionId) {
  const id = int(sessionId);
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN esperado=1 THEN 1 ELSE 0 END) AS esperado,
      SUM(CASE WHEN status='LOCALIZADO' THEN 1 ELSE 0 END) AS localizado,
      SUM(CASE WHEN status='NAO_LOCALIZADO' THEN 1 ELSE 0 END) AS nao_localizado,
      SUM(CASE WHEN status='FORA_ESCOPO' THEN 1 ELSE 0 END) AS fora_escopo
    FROM ferramental_inventario_scan_itens
    WHERE sessao_id=?
  `).get(id) || {};
  db.prepare(`
    UPDATE ferramental_inventario_scan_sessoes
    SET total_esperado=?,total_localizado=?,total_nao_localizado=?,total_fora_escopo=?,updated_at=datetime('now')
    WHERE id=?
  `).run(
    Number(counts.esperado || 0),
    Number(counts.localizado || 0),
    Number(counts.nao_localizado || 0),
    Number(counts.fora_escopo || 0),
    id
  );
}

function getScanSession(sessionId) {
  assertSchema();
  const id = int(sessionId);
  if (!id) return null;
  const session = db.prepare(`
    SELECT s.*,e.codigo AS equipe_codigo,e.nome AS equipe_nome,u.name AS criado_por_nome
    FROM ferramental_inventario_scan_sessoes s
    LEFT JOIN ferramental_equipes e ON e.id=s.equipe_id
    LEFT JOIN users u ON u.id=s.created_by
    WHERE s.id=? LIMIT 1
  `).get(id);
  if (!session) return null;
  const items = db.prepare(`
    SELECT i.*,f.codigo_interno,f.descricao,f.qr_token,f.status AS ferramenta_status,
           reader.name AS lido_por_nome
    FROM ferramental_inventario_scan_itens i
    JOIN ferramental_itens f ON f.id=i.ferramenta_id
    LEFT JOIN users reader ON reader.id=i.lido_por_user_id
    WHERE i.sessao_id=?
    ORDER BY CASE i.status WHEN 'PENDENTE' THEN 0 WHEN 'NAO_LOCALIZADO' THEN 1 WHEN 'FORA_ESCOPO' THEN 2 ELSE 3 END,
             f.descricao COLLATE NOCASE
  `).all(id);
  return { session, items };
}

function extractToken(value) {
  const raw = clean(value, 500);
  if (!raw) return '';
  const match = raw.match(/\/ferramental\/qr\/([^/?#]+)/i);
  if (match) return decodeURIComponent(match[1]);
  return raw;
}

function scanInventory(sessionId, scannedValue, actorUserId) {
  assertSchema();
  const id = int(sessionId);
  const actor = int(actorUserId);
  const detail = getScanSession(id);
  if (!detail) throw new Error('Sessão de inventário não encontrada.');
  if (detail.session.status !== 'ABERTO') throw new Error('Este inventário já foi encerrado.');

  const token = extractToken(scannedValue);
  const tool = getToolByToken(token);
  if (!tool) throw new Error('QR Code não pertence a uma ferramenta ativa.');

  return db.transaction(() => {
    const row = db.prepare(`
      SELECT * FROM ferramental_inventario_scan_itens
      WHERE sessao_id=? AND ferramenta_id=?
      LIMIT 1
    `).get(id,tool.id);

    if (row) {
      const nextStatus = Number(row.esperado || 0) === 1 ? 'LOCALIZADO' : 'FORA_ESCOPO';
      db.prepare(`
        UPDATE ferramental_inventario_scan_itens
        SET status=?,lido_por_user_id=?,lido_em=datetime('now'),
            observacao=CASE WHEN ?='LOCALIZADO' THEN NULL ELSE observacao END
        WHERE id=?
      `).run(nextStatus,actor,nextStatus,row.id);
    } else {
      db.prepare(`
        INSERT INTO ferramental_inventario_scan_itens (
          sessao_id,ferramenta_id,custodia_id,esperado,status,local_esperado,lido_por_user_id,lido_em,observacao
        ) VALUES (?,?,?,0,'FORA_ESCOPO','Fora do escopo esperado',?,datetime('now'),'Ferramenta localizada fora do escopo deste inventário')
      `).run(id,tool.id,tool.custodia_id || null,actor);
    }

    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,custodia_id,tipo,equipe_id,actor_user_id,observacao
      ) VALUES (?,?,?,?,?,?)
    `).run(
      tool.id,
      tool.custodia_id || null,
      'INVENTARIO_QR_SCAN',
      tool.equipe_id || null,
      actor,
      `${detail.session.codigo} • leitura QR`
    );
    recalcSession(id);
    return tool;
  })();
}

function closeScanSession(sessionId, actorUserId) {
  assertSchema();
  const id = int(sessionId);
  const actor = int(actorUserId);
  const detail = getScanSession(id);
  if (!detail) throw new Error('Sessão de inventário não encontrada.');
  if (detail.session.status !== 'ABERTO') throw new Error('Este inventário já foi encerrado.');

  return db.transaction(() => {
    db.prepare(`
      UPDATE ferramental_inventario_scan_itens
      SET status='NAO_LOCALIZADO',
          observacao=COALESCE(observacao,'Não localizado no fechamento do inventário')
      WHERE sessao_id=? AND esperado=1 AND status='PENDENTE'
    `).run(id);
    recalcSession(id);
    db.prepare(`
      UPDATE ferramental_inventario_scan_sessoes
      SET status='CONCLUIDO',closed_at=datetime('now'),updated_at=datetime('now')
      WHERE id=?
    `).run(id);
    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,tipo,actor_user_id,observacao
      )
      SELECT i.ferramenta_id,'INVENTARIO_QR_NAO_LOCALIZADO',?,?
      FROM ferramental_inventario_scan_itens i
      WHERE i.sessao_id=? AND i.status='NAO_LOCALIZADO'
    `).run(actor,`${detail.session.codigo} • não localizado no inventário QR`,id);
    return id;
  })();
}

function listScanSessions(limit = 30) {
  assertSchema();
  return db.prepare(`
    SELECT s.*,e.codigo AS equipe_codigo,e.nome AS equipe_nome,u.name AS criado_por_nome
    FROM ferramental_inventario_scan_sessoes s
    LEFT JOIN ferramental_equipes e ON e.id=s.equipe_id
    LEFT JOIN users u ON u.id=s.created_by
    ORDER BY CASE s.status WHEN 'ABERTO' THEN 0 ELSE 1 END,s.opened_at DESC
    LIMIT ?
  `).all(Number(limit) || 30);
}

function ownUsage(userId) {
  assertSchema();
  const uid = int(userId);
  return db.prepare(`
    SELECT u.*,f.codigo_interno,f.descricao,f.qr_token,
           c.equipe_id,a.codigo AS armario_codigo,ac.numero AS compartimento_numero
    FROM ferramental_usos u
    JOIN ferramental_itens f ON f.id=u.ferramenta_id
    LEFT JOIN ferramental_custodias c ON c.id=u.custodia_id
    LEFT JOIN ferramental_armario_compartimentos ac ON ac.id=c.compartimento_id
    LEFT JOIN ferramental_armarios a ON a.id=ac.armario_id
    WHERE u.retirado_por_user_id=?
    ORDER BY CASE u.status WHEN 'EM_USO' THEN 0 ELSE 1 END,u.retirada_em DESC
    LIMIT 40
  `).all(uid).map((row) => ({ ...row, atrasado: row.status === 'EM_USO' && isOverdueValue(row.previsao_devolucao) }));
}

function dashboard() {
  assertSchema();
  const active = db.prepare(`
    SELECT u.*,f.codigo_interno,f.descricao,f.qr_token,borrower.name AS retirado_por_nome
    FROM ferramental_usos u
    JOIN ferramental_itens f ON f.id=u.ferramenta_id
    JOIN users borrower ON borrower.id=u.retirado_por_user_id
    WHERE u.status='EM_USO'
    ORDER BY u.retirada_em
  `).all()
    .map((row) => ({ ...row, atrasado: isOverdueValue(row.previsao_devolucao) }))
    .sort((a,b) => Number(b.atrasado) - Number(a.atrasado) || String(a.retirada_em).localeCompare(String(b.retirada_em)));

  const overdue = active.filter((row) => row.atrasado);
  const scanSessions = listScanSessions(20);
  const missing = db.prepare(`
    SELECT i.*,s.codigo AS sessao_codigo,f.codigo_interno,f.descricao
    FROM ferramental_inventario_scan_itens i
    JOIN ferramental_inventario_scan_sessoes s ON s.id=i.sessao_id
    JOIN ferramental_itens f ON f.id=i.ferramenta_id
    WHERE i.status='NAO_LOCALIZADO'
    ORDER BY s.closed_at DESC
    LIMIT 30
  `).all();

  const topUsers = db.prepare(`
    SELECT u.name,COUNT(*) AS total
    FROM ferramental_usos x
    JOIN users u ON u.id=x.retirado_por_user_id
    WHERE datetime(x.retirada_em)>=datetime('now','-30 days')
    GROUP BY x.retirado_por_user_id,u.name
    ORDER BY total DESC,u.name
    LIMIT 8
  `).all();

  const topTools = db.prepare(`
    SELECT f.codigo_interno,f.descricao,COUNT(*) AS total
    FROM ferramental_usos x
    JOIN ferramental_itens f ON f.id=x.ferramenta_id
    WHERE datetime(x.retirada_em)>=datetime('now','-30 days')
    GROUP BY x.ferramenta_id,f.codigo_interno,f.descricao
    ORDER BY total DESC,f.descricao
    LIMIT 8
  `).all();

  const returnsWithDamage = db.prepare(`
    SELECT COUNT(*) AS total
    FROM ferramental_usos
    WHERE status='DEVOLVIDO' AND condicao_retorno='DANIFICADA'
      AND datetime(devolvido_em)>=datetime('now','-30 days')
  `).get()?.total || 0;

  return {
    active,
    overdue,
    scanSessions,
    missing,
    topUsers,
    topTools,
    resumo: {
      emUso: active.length,
      atrasados: overdue.length,
      inventariosAbertos: scanSessions.filter((s) => s.status === 'ABERTO').length,
      naoLocalizados: missing.length,
      devolucoesDanificadas30d: Number(returnsWithDamage || 0),
    },
  };
}

module.exports = {
  checkout,
  returnUse,
  activeUse,
  toolOperational,
  createScanSession,
  getScanSession,
  scanInventory,
  closeScanSession,
  listScanSessions,
  ownUsage,
  dashboard,
  extractToken,
};
