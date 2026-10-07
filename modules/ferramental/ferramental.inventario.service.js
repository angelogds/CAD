const db = require('../../database/db');

function int(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clean(value, max = 800) {
  return String(value || '').trim().slice(0, max);
}

function assertSchema() {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ferramental_inventarios'").get();
  if (!row) throw new Error('A estrutura de conferência do Ferramental V1.2 ainda não foi migrada.');
}

function nextCode() {
  const rows = db.prepare("SELECT codigo FROM ferramental_inventarios WHERE codigo LIKE 'CONF-%'").all();
  let max = 0;
  for (const row of rows) {
    const n = Number(String(row.codigo || '').replace('CONF-', ''));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `CONF-${String(max + 1).padStart(4, '0')}`;
}

function createInventory(data, actorUserId) {
  assertSchema();
  const teamId = int(data.equipe_id);
  if (!teamId) throw new Error('Selecione a equipe para iniciar a conferência.');

  const team = db.prepare('SELECT id, codigo, nome FROM ferramental_equipes WHERE id=? AND ativo=1').get(teamId);
  if (!team) throw new Error('Equipe de ferramental não encontrada.');

  const custodies = db.prepare(`
    SELECT c.id AS custodia_id, c.ferramenta_id
    FROM ferramental_custodias c
    JOIN ferramental_itens f ON f.id=c.ferramenta_id AND f.ativo=1
    WHERE c.equipe_id=? AND c.ativo=1
    ORDER BY f.descricao COLLATE NOCASE
  `).all(teamId);
  if (!custodies.length) throw new Error('Esta equipe ainda não possui ferramentas em custódia.');

  const members = db.prepare(`
    SELECT user_id
    FROM ferramental_equipe_membros
    WHERE equipe_id=?
    ORDER BY ordem
  `).all(teamId);
  if (!members.length) throw new Error('A equipe não possui responsáveis ativos.');

  const code = nextCode();
  const title = clean(data.titulo, 140) || `Conferência ${team.codigo} - ${team.nome}`;
  const due = clean(data.data_limite, 20) || null;
  const note = clean(data.observacao, 800) || null;

  return db.transaction(() => {
    const existing = db.prepare(`
      SELECT id FROM ferramental_inventarios
      WHERE equipe_id=? AND status='ABERTO'
      LIMIT 1
    `).get(teamId);
    if (existing) throw new Error('Já existe uma conferência aberta para esta equipe.');

    const result = db.prepare(`
      INSERT INTO ferramental_inventarios
        (codigo,equipe_id,titulo,status,data_limite,observacao,created_by)
      VALUES (?,?,?,'ABERTO',?,?,?)
    `).run(code, teamId, title, due, note, int(actorUserId));

    const insert = db.prepare(`
      INSERT INTO ferramental_inventario_itens
        (inventario_id,custodia_id,ferramenta_id,user_id,situacao)
      VALUES (?,?,?,?, 'PENDENTE')
    `);
    for (const custody of custodies) {
      for (const member of members) {
        insert.run(result.lastInsertRowid, custody.custodia_id, custody.ferramenta_id, member.user_id);
      }
    }

    return Number(result.lastInsertRowid);
  })();
}

function listDashboard() {
  assertSchema();
  const inventories = db.prepare(`
    SELECT i.*, e.codigo AS equipe_codigo, e.nome AS equipe_nome,
      COUNT(ii.id) AS total_itens,
      SUM(CASE WHEN ii.situacao='PENDENTE' THEN 1 ELSE 0 END) AS pendentes,
      SUM(CASE WHEN ii.situacao<>'PENDENTE' THEN 1 ELSE 0 END) AS conferidos,
      SUM(CASE WHEN ii.situacao IN ('DANIFICADO','NAO_LOCALIZADO') THEN 1 ELSE 0 END) AS divergencias
    FROM ferramental_inventarios i
    JOIN ferramental_equipes e ON e.id=i.equipe_id
    LEFT JOIN ferramental_inventario_itens ii ON ii.inventario_id=i.id
    GROUP BY i.id
    ORDER BY CASE i.status WHEN 'ABERTO' THEN 0 ELSE 1 END, i.created_at DESC
    LIMIT 30
  `).all();

  const resumo = db.prepare(`
    SELECT
      SUM(CASE WHEN status='ABERTO' THEN 1 ELSE 0 END) AS abertos,
      SUM(CASE WHEN status='CONCLUIDO' THEN 1 ELSE 0 END) AS concluidos
    FROM ferramental_inventarios
  `).get() || {};

  const divergencias = db.prepare(`
    SELECT ii.id, ii.situacao, ii.observacao, ii.conferido_em,
           i.codigo AS inventario_codigo, u.name AS usuario_nome,
           f.codigo_interno, f.descricao
    FROM ferramental_inventario_itens ii
    JOIN ferramental_inventarios i ON i.id=ii.inventario_id
    JOIN ferramental_itens f ON f.id=ii.ferramenta_id
    JOIN users u ON u.id=ii.user_id
    WHERE ii.situacao IN ('DANIFICADO','NAO_LOCALIZADO')
    ORDER BY ii.conferido_em DESC
    LIMIT 30
  `).all();

  return { inventories, resumo, divergencias };
}

function listOwn(userId) {
  assertSchema();
  const uid = int(userId);
  if (!uid) return [];
  return db.prepare(`
    SELECT ii.*, i.codigo AS inventario_codigo, i.titulo, i.data_limite,
           i.status AS inventario_status, i.observacao AS inventario_observacao,
           f.codigo_interno, f.descricao, f.condicao, f.numero_serie, f.patrimonio,
           c.equipe_id, ac.numero AS compartimento_numero,
           ar.codigo AS armario_codigo, au.name AS armario_responsavel
    FROM ferramental_inventario_itens ii
    JOIN ferramental_inventarios i ON i.id=ii.inventario_id
    JOIN ferramental_itens f ON f.id=ii.ferramenta_id
    JOIN ferramental_custodias c ON c.id=ii.custodia_id
    JOIN ferramental_armario_compartimentos ac ON ac.id=c.compartimento_id
    JOIN ferramental_armarios ar ON ar.id=ac.armario_id
    JOIN users au ON au.id=ar.owner_user_id
    WHERE ii.user_id=? AND i.status='ABERTO'
    ORDER BY i.created_at, f.descricao COLLATE NOCASE
  `).all(uid);
}

function completeIfReady(inventoryId) {
  const pending = db.prepare(`
    SELECT COUNT(*) AS total
    FROM ferramental_inventario_itens
    WHERE inventario_id=? AND situacao='PENDENTE'
  `).get(inventoryId)?.total || 0;
  if (!pending) {
    db.prepare(`
      UPDATE ferramental_inventarios
      SET status='CONCLUIDO', completed_at=datetime('now')
      WHERE id=? AND status='ABERTO'
    `).run(inventoryId);
  }
}

function submitItem(userId, itemId, data = {}) {
  assertSchema();
  const uid = int(userId);
  const iid = int(itemId);
  const allowed = new Set(['CONFIRMADO','DANIFICADO','NAO_LOCALIZADO','EM_MANUTENCAO']);
  const situation = String(data.situacao || '').trim().toUpperCase();
  if (!uid || !iid || !allowed.has(situation)) throw new Error('Situação de conferência inválida.');

  const row = db.prepare(`
    SELECT ii.*, i.status AS inventario_status, c.ativo AS custodia_ativa, c.equipe_id
    FROM ferramental_inventario_itens ii
    JOIN ferramental_inventarios i ON i.id=ii.inventario_id
    JOIN ferramental_custodias c ON c.id=ii.custodia_id
    WHERE ii.id=? AND ii.user_id=?
    LIMIT 1
  `).get(iid, uid);
  if (!row) throw new Error('Item de conferência não encontrado.');
  if (row.inventario_status !== 'ABERTO') throw new Error('Esta conferência já foi encerrada.');
  if (!Number(row.custodia_ativa || 0)) throw new Error('A custódia desta ferramenta não está mais ativa.');

  const note = clean(data.observacao, 800) || null;
  return db.transaction(() => {
    db.prepare(`
      UPDATE ferramental_inventario_itens
      SET situacao=?, observacao=?, conferido_em=datetime('now'), updated_at=datetime('now')
      WHERE id=?
    `).run(situation, note, iid);

    db.prepare(`
      INSERT INTO ferramental_movimentacoes
        (ferramenta_id,custodia_id,tipo,equipe_id,actor_user_id,observacao)
      VALUES (?,?,?,?,?,?)
    `).run(
      row.ferramenta_id,
      row.custodia_id,
      situation === 'CONFIRMADO' ? 'CONFERENCIA_INVENTARIO' : 'DIVERGENCIA_INVENTARIO',
      row.equipe_id,
      uid,
      note || `Conferência periódica: ${situation}`
    );

    completeIfReady(row.inventario_id);
    return row.inventario_id;
  })();
}

module.exports = {
  createInventory,
  listDashboard,
  listOwn,
  submitItem,
};
