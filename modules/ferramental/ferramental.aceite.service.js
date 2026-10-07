const db = require('../../database/db');

function int(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clean(value, max = 800) {
  return String(value || '').trim().slice(0, max);
}

function assertSchema() {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ferramental_aceites'").get();
  if (!row) throw new Error('A estrutura de aceite do Ferramental V1.1 ainda não foi migrada.');
}

function createPendingForCustody(custodiaId, equipeId) {
  assertSchema();
  const cid = int(custodiaId);
  const eid = int(equipeId);
  if (!cid || !eid) throw new Error('Custódia ou grupo inválido para gerar aceite.');
  db.prepare(`
    INSERT OR IGNORE INTO ferramental_aceites (custodia_id, user_id, status)
    SELECT ?, user_id, 'PENDENTE'
    FROM ferramental_equipe_membros
    WHERE equipe_id=?
  `).run(cid, eid);
}

function cancelPendingForCustody(custodiaId) {
  assertSchema();
  const cid = int(custodiaId);
  if (!cid) return;
  db.prepare(`
    UPDATE ferramental_aceites
    SET status='CANCELADO', updated_at=datetime('now')
    WHERE custodia_id=? AND status='PENDENTE'
  `).run(cid);
}

function listOwnAcceptances(userId) {
  assertSchema();
  const uid = int(userId);
  if (!uid) return [];
  return db.prepare(`
    SELECT
      a.*,
      c.ferramenta_id,
      c.equipe_id,
      c.compartimento_id,
      c.ativo AS custodia_ativa,
      c.data_inicio,
      f.codigo_interno,
      f.descricao,
      f.condicao,
      f.numero_serie,
      f.patrimonio,
      e.codigo AS equipe_codigo,
      e.nome AS equipe_nome,
      ac.numero AS compartimento_numero,
      ar.codigo AS armario_codigo,
      au.name AS armario_responsavel
    FROM ferramental_aceites a
    JOIN ferramental_custodias c ON c.id=a.custodia_id
    JOIN ferramental_itens f ON f.id=c.ferramenta_id
    JOIN ferramental_equipes e ON e.id=c.equipe_id
    JOIN ferramental_armario_compartimentos ac ON ac.id=c.compartimento_id
    JOIN ferramental_armarios ar ON ar.id=ac.armario_id
    JOIN users au ON au.id=ar.owner_user_id
    WHERE a.user_id=?
      AND c.ativo=1
      AND f.ativo=1
    ORDER BY
      CASE a.status WHEN 'PENDENTE' THEN 0 WHEN 'RECUSADO' THEN 1 ELSE 2 END,
      f.descricao COLLATE NOCASE
  `).all(uid);
}

function getOwnAcceptance(userId, custodiaId) {
  assertSchema();
  const uid = int(userId);
  const cid = int(custodiaId);
  if (!uid || !cid) return null;
  return db.prepare(`
    SELECT a.*, c.ferramenta_id, c.equipe_id, c.ativo AS custodia_ativa,
           f.codigo_interno, f.descricao
    FROM ferramental_aceites a
    JOIN ferramental_custodias c ON c.id=a.custodia_id
    JOIN ferramental_itens f ON f.id=c.ferramenta_id
    WHERE a.user_id=? AND a.custodia_id=?
    LIMIT 1
  `).get(uid, cid) || null;
}

function confirmAcceptance(userId, custodiaId, data = {}) {
  assertSchema();
  const uid = int(userId);
  const cid = int(custodiaId);
  if (!uid || !cid) throw new Error('Aceite inválido.');

  const row = getOwnAcceptance(uid, cid);
  if (!row || Number(row.custodia_ativa || 0) !== 1) {
    throw new Error('Esta responsabilidade não está mais ativa.');
  }
  if (row.status === 'ACEITO') throw new Error('Este recebimento já foi confirmado.');
  if (row.status !== 'PENDENTE') throw new Error('Este aceite não está disponível para confirmação.');
  if (!data.selfie_path || !data.assinatura_path) {
    throw new Error('Selfie e assinatura são obrigatórias para confirmar o recebimento.');
  }
  if (!data.termo_aceito) {
    throw new Error('Confirme a declaração de responsabilidade antes de concluir.');
  }

  return db.transaction(() => {
    const result = db.prepare(`
      UPDATE ferramental_aceites
      SET status='ACEITO',
          selfie_path=?,
          assinatura_path=?,
          observacao=?,
          aceite_termo_versao='V1.1',
          confirmado_em=datetime('now'),
          ip_origem=?,
          user_agent=?,
          updated_at=datetime('now')
      WHERE id=? AND status='PENDENTE'
    `).run(
      data.selfie_path,
      data.assinatura_path,
      clean(data.observacao, 800) || null,
      clean(data.ip_origem, 120) || null,
      clean(data.user_agent, 500) || null,
      row.id
    );
    if (!result.changes) throw new Error('O aceite foi atualizado por outra operação. Recarregue a página.');

    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,custodia_id,tipo,equipe_id,actor_user_id,observacao
      ) VALUES (?,?,?,?,?,?)
    `).run(
      row.ferramenta_id,
      cid,
      'ACEITE_RESPONSABILIDADE',
      row.equipe_id,
      uid,
      clean(data.observacao, 800) || 'Recebimento confirmado no Meu Portal com selfie e assinatura.'
    );

    return row.id;
  })();
}

function rejectAcceptance(userId, custodiaId, motivo, meta = {}) {
  assertSchema();
  const uid = int(userId);
  const cid = int(custodiaId);
  const reason = clean(motivo, 800);
  if (!reason) throw new Error('Informe o motivo da divergência.');

  const row = getOwnAcceptance(uid, cid);
  if (!row || Number(row.custodia_ativa || 0) !== 1) throw new Error('Esta responsabilidade não está mais ativa.');
  if (row.status !== 'PENDENTE') throw new Error('Este aceite não está mais pendente.');

  return db.transaction(() => {
    db.prepare(`
      UPDATE ferramental_aceites
      SET status='RECUSADO', observacao=?, recusado_em=datetime('now'),
          tratamento_status='PENDENTE',
          ip_origem=?, user_agent=?, updated_at=datetime('now')
      WHERE id=? AND status='PENDENTE'
    `).run(reason, clean(meta.ip_origem,120)||null, clean(meta.user_agent,500)||null, row.id);

    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,custodia_id,tipo,equipe_id,actor_user_id,observacao
      ) VALUES (?,?,?,?,?,?)
    `).run(row.ferramenta_id, cid, 'DIVERGENCIA_RECEBIMENTO', row.equipe_id, uid, reason);
    return row.id;
  })();
}

function resolveDivergence(aceiteId, actorUserId, observacao) {
  assertSchema();
  const id = int(aceiteId);
  const actor = int(actorUserId);
  const note = clean(observacao, 800);
  if (!id || !actor) throw new Error('Tratamento de divergência inválido.');
  if (!note) throw new Error('Informe como a divergência foi tratada.');

  const row = getAcceptanceById(id);
  if (!row) throw new Error('Aceite não encontrado.');
  if (row.status !== 'RECUSADO') throw new Error('Este aceite não possui divergência pendente.');

  return db.transaction(() => {
    db.prepare(`
      UPDATE ferramental_aceites
      SET status='PENDENTE',
          tratamento_status='RESOLVIDO_REABERTO',
          tratado_por_user_id=?,
          tratado_em=datetime('now'),
          tratamento_observacao=?,
          confirmado_em=NULL,
          updated_at=datetime('now')
      WHERE id=?
    `).run(actor, note, id);

    db.prepare(`
      INSERT INTO ferramental_movimentacoes
        (ferramenta_id,custodia_id,tipo,equipe_id,actor_user_id,observacao)
      VALUES (?,?,?,?,?,?)
    `).run(
      row.ferramenta_id,
      row.custodia_id,
      'TRATAMENTO_DIVERGENCIA',
      row.equipe_id,
      actor,
      note
    );

    return id;
  })();
}

function getAcceptanceById(aceiteId) {
  assertSchema();
  const id = int(aceiteId);
  if (!id) return null;
  return db.prepare(`
    SELECT a.*, c.ferramenta_id, c.equipe_id, c.ativo AS custodia_ativa,
           f.codigo_interno, f.descricao, u.name AS usuario_nome
    FROM ferramental_aceites a
    JOIN ferramental_custodias c ON c.id=a.custodia_id
    JOIN ferramental_itens f ON f.id=c.ferramenta_id
    JOIN users u ON u.id=a.user_id
    WHERE a.id=?
    LIMIT 1
  `).get(id) || null;
}

function teamAcceptances(teamId) {
  assertSchema();
  const eid = int(teamId);
  if (!eid) return [];
  return db.prepare(`
    SELECT a.*, u.name AS usuario_nome, c.ferramenta_id,
           f.codigo_interno, f.descricao
    FROM ferramental_aceites a
    JOIN ferramental_custodias c ON c.id=a.custodia_id
    JOIN ferramental_itens f ON f.id=c.ferramenta_id
    JOIN users u ON u.id=a.user_id
    WHERE c.equipe_id=? AND c.ativo=1
    ORDER BY f.descricao COLLATE NOCASE, u.name COLLATE NOCASE
  `).all(eid);
}

function dashboard() {
  assertSchema();
  const resumo = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN a.status='PENDENTE' THEN 1 ELSE 0 END) AS pendentes,
      SUM(CASE WHEN a.status='ACEITO' THEN 1 ELSE 0 END) AS aceitos,
      SUM(CASE WHEN a.status='RECUSADO' THEN 1 ELSE 0 END) AS recusados
    FROM ferramental_aceites a
    JOIN ferramental_custodias c ON c.id=a.custodia_id
    WHERE c.ativo=1
  `).get() || {};

  const porCustodia = db.prepare(`
    SELECT c.id AS custodia_id,
           COUNT(a.id) AS total,
           SUM(CASE WHEN a.status='ACEITO' THEN 1 ELSE 0 END) AS aceitos,
           SUM(CASE WHEN a.status='PENDENTE' THEN 1 ELSE 0 END) AS pendentes,
           SUM(CASE WHEN a.status='RECUSADO' THEN 1 ELSE 0 END) AS recusados
    FROM ferramental_custodias c
    LEFT JOIN ferramental_aceites a ON a.custodia_id=c.id
    WHERE c.ativo=1
    GROUP BY c.id
  `).all();

  const recentes = db.prepare(`
    SELECT a.id, a.custodia_id, a.user_id, a.status, a.confirmado_em, a.recusado_em,
           a.observacao, a.tratamento_status, a.tratado_em, a.tratamento_observacao,
           u.name AS usuario_nome, f.codigo_interno, f.descricao
    FROM ferramental_aceites a
    JOIN ferramental_custodias c ON c.id=a.custodia_id
    JOIN ferramental_itens f ON f.id=c.ferramenta_id
    JOIN users u ON u.id=a.user_id
    WHERE c.ativo=1
    ORDER BY
      CASE a.status WHEN 'RECUSADO' THEN 0 WHEN 'PENDENTE' THEN 1 ELSE 2 END,
      COALESCE(a.confirmado_em, a.recusado_em, a.created_at) DESC
    LIMIT 30
  `).all();

  return { resumo, porCustodia, recentes };
}

module.exports = {
  createPendingForCustody,
  cancelPendingForCustody,
  listOwnAcceptances,
  getOwnAcceptance,
  confirmAcceptance,
  rejectAcceptance,
  resolveDivergence,
  getAcceptanceById,
  teamAcceptances,
  dashboard,
};
