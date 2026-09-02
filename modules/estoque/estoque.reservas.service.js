const db = require('../../database/db');

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch { return false; }
}
function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; }
}
function normalizeQr(value) {
  let code = String(value || '').trim();
  if (!code) return '';
  if (/^CGCOL:/i.test(code)) code = code.replace(/^CGCOL:/i, '');
  try {
    if (/^https?:\/\//i.test(code)) {
      const parsed = new URL(code);
      code = parsed.searchParams.get('token') || parsed.pathname.split('/').filter(Boolean).pop() || '';
    }
  } catch (_error) {}
  return code.trim();
}
function itemNameExpr(alias = 'si') {
  const parts = [];
  if (hasColumn('solicitacao_itens', 'item_nome')) parts.push(`${alias}.item_nome`);
  if (hasColumn('solicitacao_itens', 'item_descricao')) parts.push(`${alias}.item_descricao`);
  if (hasColumn('solicitacao_itens', 'descricao')) parts.push(`${alias}.descricao`);
  parts.push(`'Item #' || ${alias}.id`);
  return `COALESCE(${parts.join(',')})`;
}

function getColaboradorByQr(codigo) {
  const token = normalizeQr(codigo);
  if (!token || !tableExists('colaboradores') || !hasColumn('colaboradores', 'qr_token')) return null;
  const deletedFilter = hasColumn('colaboradores', 'deleted_at') ? 'AND deleted_at IS NULL' : '';
  return db.prepare(`
    SELECT id,nome,apelido,funcao,setor,status,foto_url,user_id,qr_emitido_em
    FROM colaboradores
    WHERE qr_token=? AND COALESCE(qr_ativo,0)=1 ${deletedFilter}
      AND UPPER(COALESCE(status,'ATIVO'))='ATIVO'
  `).get(token) || null;
}

function dashboard() {
  if (!tableExists('estoque_reservas')) return { reservado: 0, retirado: 0, solicitacoes: 0, prontas: 0 };
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(MAX(quantidade_reservada-quantidade_retirada,0)),0) reservado,
      COALESCE(SUM(quantidade_retirada),0) retirado,
      COUNT(DISTINCT solicitacao_id) solicitacoes,
      COUNT(DISTINCT CASE WHEN quantidade_reservada>quantidade_retirada THEN solicitacao_id END) prontas
    FROM estoque_reservas
    WHERE status<>'CANCELADA'
  `).get();
  return {
    reservado: Number(row?.reservado || 0),
    retirado: Number(row?.retirado || 0),
    solicitacoes: Number(row?.solicitacoes || 0),
    prontas: Number(row?.prontas || 0),
  };
}

function resumoPorItem() {
  if (!tableExists('estoque_reservas')) return new Map();
  const rows = db.prepare(`
    SELECT estoque_item_id,
      COALESCE(SUM(MAX(quantidade_reservada-quantidade_retirada,0)),0) reservado
    FROM estoque_reservas
    WHERE status<>'CANCELADA'
    GROUP BY estoque_item_id
  `).all();
  return new Map(rows.map((r) => [Number(r.estoque_item_id), Number(r.reservado || 0)]));
}

function listReservas(options = {}) {
  if (!tableExists('estoque_reservas')) return [];
  const q = String(options.q || '').trim();
  const params = [];
  let where = "WHERE r.status<>'CANCELADA'";
  if (options.solicitacao_id) { where += ' AND r.solicitacao_id=?'; params.push(Number(options.solicitacao_id)); }
  if (q) {
    where += ` AND (LOWER(COALESCE(s.numero,'')) LIKE ? OR LOWER(COALESCE(s.titulo,'')) LIKE ? OR LOWER(${itemNameExpr('si')}) LIKE ? OR LOWER(COALESCE(e.nome,'')) LIKE ?)`;
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like, like, like);
  }
  return db.prepare(`
    SELECT r.*,s.numero,s.titulo,s.setor_origem,s.prioridade,s.solicitante_user_id,
      u.name solicitante_nome,${itemNameExpr('si')} item_nome,si.unidade,
      ei.nome estoque_item_nome,COALESCE(ei.saldo_atual,0) saldo_fisico,
      o.id os_numero,e.nome equipamento_nome,
      MAX(r.quantidade_reservada-r.quantidade_retirada,0) quantidade_disponivel
    FROM estoque_reservas r
    JOIN solicitacoes s ON s.id=r.solicitacao_id
    JOIN solicitacao_itens si ON si.id=r.solicitacao_item_id
    JOIN estoque_itens ei ON ei.id=r.estoque_item_id
    LEFT JOIN users u ON u.id=s.solicitante_user_id
    LEFT JOIN os o ON o.id=r.os_id
    LEFT JOIN equipamentos e ON e.id=r.equipamento_id
    ${where}
    ORDER BY s.id DESC,r.id ASC
  `).all(...params);
}

function groupBySolicitacao(rows) {
  const groups = new Map();
  for (const row of rows) {
    const id = Number(row.solicitacao_id);
    if (!groups.has(id)) {
      groups.set(id, {
        solicitacao_id: id,
        numero: row.numero || `#${id}`,
        titulo: row.titulo || 'Solicitação de materiais',
        setor_origem: row.setor_origem || '-',
        prioridade: row.prioridade || 'MEDIA',
        solicitante_nome: row.solicitante_nome || '-',
        os_numero: row.os_numero || null,
        equipamento_nome: row.equipamento_nome || null,
        total_reservado: 0,
        total_retirado: 0,
        total_disponivel: 0,
        itens: [],
      });
    }
    const group = groups.get(id);
    group.itens.push(row);
    group.total_reservado += Number(row.quantidade_reservada || 0);
    group.total_retirado += Number(row.quantidade_retirada || 0);
    group.total_disponivel += Number(row.quantidade_disponivel || 0);
  }
  return [...groups.values()];
}

function listSolicitacoes(options = {}) {
  return groupBySolicitacao(listReservas(options));
}

function getReserva(id) {
  if (!tableExists('estoque_reservas')) return null;
  return db.prepare('SELECT * FROM estoque_reservas WHERE id=?').get(Number(id)) || null;
}

function insertMovimento(data) {
  const cols = ['tipo', 'item_id', 'quantidade'];
  const vals = [data.tipo, data.item_id, data.quantidade];
  const optional = [
    ['origem', data.origem], ['os_id', data.os_id], ['equipamento_id', data.equipamento_id],
    ['solicitacao_id', data.solicitacao_id], ['solicitacao_item_id', data.solicitacao_item_id],
    ['usuario_id', data.usuario_id], ['saldo_anterior', data.saldo_anterior], ['saldo_posterior', data.saldo_posterior],
    ['observacao', data.observacao], ['reserva_id', data.reserva_id],
    ['retirado_por_colaborador_id', data.retirado_por_colaborador_id], ['entregue_por_user_id', data.entregue_por_user_id],
    ['identificacao_origem', data.identificacao_origem],
  ];
  for (const [column, value] of optional) {
    if (hasColumn('estoque_movimentos', column)) { cols.push(column); vals.push(value ?? null); }
  }
  return Number(db.prepare(`INSERT INTO estoque_movimentos (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals).lastInsertRowid);
}

function retirarReserva({ reservaId, quantidade, qrCode, entreguePorUserId, observacao }) {
  const qtd = Number(quantidade || 0);
  if (!(qtd > 0)) throw new Error('Quantidade inválida para retirada.');
  const colaborador = getColaboradorByQr(qrCode);
  if (!colaborador) throw new Error('Cartão/QR do colaborador inválido, inativo ou revogado.');

  return db.transaction(() => {
    const reserva = db.prepare(`
      SELECT r.*,s.numero,si.unidade,${itemNameExpr('si')} item_nome,
        COALESCE(ei.saldo_atual,0) saldo_fisico
      FROM estoque_reservas r
      JOIN solicitacoes s ON s.id=r.solicitacao_id
      JOIN solicitacao_itens si ON si.id=r.solicitacao_item_id
      JOIN estoque_itens ei ON ei.id=r.estoque_item_id
      WHERE r.id=? AND r.status<>'CANCELADA'
    `).get(Number(reservaId));
    if (!reserva) throw new Error('Reserva não encontrada.');

    const disponivelReserva = Math.max(Number(reserva.quantidade_reservada || 0) - Number(reserva.quantidade_retirada || 0), 0);
    if (!(disponivelReserva > 0)) throw new Error('Esta reserva já foi retirada integralmente.');
    if (qtd > disponivelReserva) throw new Error(`Quantidade acima da reserva disponível. Máximo: ${disponivelReserva}.`);
    if (qtd > Number(reserva.saldo_fisico || 0)) throw new Error('Saldo físico insuficiente no estoque.');

    const retiradaNova = Number(reserva.quantidade_retirada || 0) + qtd;
    const status = retiradaNova >= Number(reserva.quantidade_reservada || 0) ? 'RETIRADA' : 'PARCIAL';
    const reservaUpdate = db.prepare(`
      UPDATE estoque_reservas
      SET quantidade_retirada=?,status=?,updated_at=datetime('now')
      WHERE id=? AND quantidade_retirada=?
    `).run(retiradaNova, status, reserva.id, Number(reserva.quantidade_retirada || 0));
    if (!reservaUpdate.changes) throw new Error('Reserva alterada por outro usuário. Atualize a página e tente novamente.');

    const anterior = Number(reserva.saldo_fisico || 0);
    const posterior = anterior - qtd;
    const stockUpdate = db.prepare(`
      UPDATE estoque_itens SET saldo_atual=?,updated_at=datetime('now')
      WHERE id=? AND COALESCE(saldo_atual,0)=?
    `).run(posterior, reserva.estoque_item_id, anterior);
    if (!stockUpdate.changes) throw new Error('Saldo foi alterado por outro usuário. Atualize e tente novamente.');

    const movimentoId = insertMovimento({
      tipo: 'SAIDA_REQUISICAO_INTERNA',
      item_id: reserva.estoque_item_id,
      quantidade: qtd,
      origem: 'SOLICITACAO',
      os_id: reserva.os_id || null,
      equipamento_id: reserva.equipamento_id || null,
      solicitacao_id: reserva.solicitacao_id,
      solicitacao_item_id: reserva.solicitacao_item_id,
      usuario_id: entreguePorUserId || null,
      saldo_anterior: anterior,
      saldo_posterior: posterior,
      observacao: observacao || `Retirada ${reserva.numero || `#${reserva.solicitacao_id}`} por ${colaborador.nome}`,
      reserva_id: reserva.id,
      retirado_por_colaborador_id: colaborador.id,
      entregue_por_user_id: entreguePorUserId || null,
      identificacao_origem: 'QR_COLABORADOR',
    });

    return { reservaId: reserva.id, movimentoId, colaborador, quantidade: qtd, saldoPosterior: posterior, status };
  })();
}

module.exports = {
  normalizeQr,
  getColaboradorByQr,
  dashboard,
  resumoPorItem,
  listReservas,
  listSolicitacoes,
  getReserva,
  retirarReserva,
};
