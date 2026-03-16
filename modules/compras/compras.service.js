const fs = require('fs');
const path = require('path');
const db = require('../../database/db');

const STATUS = Object.freeze({
  ABERTA: 'ABERTA',
  EM_COTACAO: 'EM_COTACAO',
  COMPRADA: 'COMPRADA',
  EM_RECEBIMENTO: 'EM_RECEBIMENTO',
  RECEBIDA_PARCIAL: 'RECEBIDA_PARCIAL',
  RECEBIDA_TOTAL: 'RECEBIDA_TOTAL',
  FECHADA: 'FECHADA',
  REABERTA: 'REABERTA',
});

const STATUS_COMPRAS = [STATUS.ABERTA, STATUS.EM_COTACAO, STATUS.COMPRADA];

function normalizeStatus(status) {
  return Object.values(STATUS).includes(status) ? status : '';
}

function ensureComprasAnexosTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS compras_anexos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referencia_tipo TEXT NOT NULL DEFAULT 'SOLICITACAO',
      referencia_id INTEGER NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'COTACAO',
      original_name TEXT,
      filename TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      uploaded_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_compras_anexos_ref ON compras_anexos (referencia_tipo, referencia_id);
  `);
}
ensureComprasAnexosTable();

function getPDFKit() {
  try { return require('pdfkit'); } catch { return null; }
}

function tableExists(name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function columnExists(table, col) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some((c) => c.name === col);
  } catch {
    return false;
  }
}

function resolveUsersTable() {
  if (tableExists('usuarios')) {
    const nameCol = columnExists('usuarios', 'nome') ? 'nome' : 'name';
    const roleCol = columnExists('usuarios', 'role') ? 'role' : (columnExists('usuarios', 'perfil') ? 'perfil' : null);
    return { table: 'usuarios', nameCol, roleCol };
  }
  const roleCol = columnExists('users', 'role') ? 'role' : null;
  return { table: 'users', nameCol: 'name', roleCol };
}

function buildSolicitacaoItensSelect() {
  const hasItemNome = columnExists('solicitacao_itens', 'item_nome');
  const hasItemDescricao = columnExists('solicitacao_itens', 'item_descricao');
  const hasQtdSolicitada = columnExists('solicitacao_itens', 'qtd_solicitada');
  const hasEstoqueItemId = columnExists('solicitacao_itens', 'estoque_item_id');

  const itemNomeExpr = hasItemNome
    ? "COALESCE(si.item_nome, ei.nome)"
    : "COALESCE(si.descricao, ei.nome)";
  const itemDescExpr = hasItemDescricao
    ? "COALESCE(si.item_descricao, si.descricao)"
    : 'si.descricao';
  const qtdExpr = hasQtdSolicitada
    ? "COALESCE(si.qtd_solicitada, si.quantidade, 0)"
    : 'COALESCE(si.quantidade, 0)';
  const itemJoinExpr = hasEstoqueItemId
    ? 'COALESCE(si.estoque_item_id, si.item_id)'
    : 'si.item_id';

  return {
    itemNomeExpr,
    itemDescExpr,
    qtdExpr,
    itemJoinExpr,
  };
}

function listSolicitacoesPorStatus(filters = {}) {
  const usersRef = resolveUsersTable();
  const hasFornecedorCol = columnExists('solicitacoes', 'fornecedor');
  const hasFornecedorIdCol = columnExists('solicitacoes', 'fornecedor_id');
  const hasFornecedoresTable = tableExists('fornecedores');
  const where = [];
  const params = [];
  const status = normalizeStatus(filters.status);
  if (status) { where.push('s.status = ?'); params.push(status); }
  if (filters.query) {
    const fornecedorExpr = hasFornecedorCol ? "COALESCE(s.fornecedor, '')" : "''";
    where.push(`(LOWER(s.numero) LIKE ? OR LOWER(s.titulo) LIKE ? OR LOWER(${fornecedorExpr}) LIKE ? OR LOWER(COALESCE(f.nome, '')) LIKE ?)`);
    const q = `%${String(filters.query).trim().toLowerCase()}%`;
    params.push(q, q, q, q);
  }
  if (filters.startDate) { where.push('date(s.created_at) >= date(?)'); params.push(filters.startDate); }
  if (filters.endDate) { where.push('date(s.created_at) <= date(?)'); params.push(filters.endDate); }

  return db.prepare(`
    SELECT s.*, u.${usersRef.nameCol} AS solicitante_nome, ${hasFornecedorIdCol && hasFornecedoresTable ? 'f.nome' : 'NULL'} AS fornecedor_nome
    FROM solicitacoes s
    JOIN ${usersRef.table} u ON u.id = s.solicitante_user_id
    ${hasFornecedorIdCol && hasFornecedoresTable ? 'LEFT JOIN fornecedores f ON f.id = s.fornecedor_id' : ''}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY s.id DESC
  `).all(...params);
}

function getResumoSolicitacoes() {
  const rows = db.prepare('SELECT status, COUNT(*) AS total FROM solicitacoes GROUP BY status').all();
  const totals = Object.fromEntries(STATUS_COMPRAS.map((status) => [status, 0]));
  rows.forEach((row) => { if (row.status in totals) totals[row.status] = row.total; });
  return totals;
}

function listFornecedoresAtivos() {
  if (!tableExists('fornecedores')) return [];
  return db.prepare('SELECT id, nome, cnpj, cidade FROM fornecedores WHERE ativo = 1 ORDER BY nome ASC').all();
}

function listCotacoes(solicitacaoId) {
  if (!tableExists('compras_cotacoes')) return [];
  if (!tableExists('fornecedores')) {
    return db.prepare(`
      SELECT c.*, NULL AS fornecedor_cadastro_nome, NULL AS cnpj
      FROM compras_cotacoes c
      WHERE c.solicitacao_id = ?
      ORDER BY c.id DESC
    `).all(solicitacaoId);
  }
  return db.prepare(`
    SELECT c.*, f.nome AS fornecedor_cadastro_nome, f.cnpj
    FROM compras_cotacoes c
    LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
    WHERE c.solicitacao_id = ?
    ORDER BY c.id DESC
  `).all(solicitacaoId);
}

function listAnexosSolicitacao(solicitacaoId) {
  if (!tableExists('anexos')) return [];
  const usersRef = resolveUsersTable();

  const hasOwnerType = columnExists('anexos', 'owner_type');
  const hasOwnerId = columnExists('anexos', 'owner_id');

  const baseSelect = `
    SELECT a.*, u.${usersRef.nameCol} AS uploaded_by_nome
    FROM anexos a
    LEFT JOIN ${usersRef.table} u ON u.id = a.uploaded_by
  `;

  if (hasOwnerType && hasOwnerId) {
    if (columnExists('anexos', 'referencia_tipo') && columnExists('anexos', 'referencia_id')) {
      return db.prepare(`
        ${baseSelect}
        WHERE (a.referencia_tipo='SOLICITACAO' AND a.referencia_id=?)
           OR (a.owner_type='SOLICITACAO' AND a.owner_id=?)
        ORDER BY a.id DESC
      `).all(solicitacaoId, solicitacaoId);
    }

    return db.prepare(`
      ${baseSelect}
      WHERE (a.owner_type='SOLICITACAO' AND a.owner_id=?)
      ORDER BY a.id DESC
    `).all(solicitacaoId);
  }

  if (!columnExists('anexos', 'referencia_tipo') || !columnExists('anexos', 'referencia_id')) return [];

  return db.prepare(`
    ${baseSelect}
    WHERE (a.referencia_tipo='SOLICITACAO' AND a.referencia_id=?)
    ORDER BY a.id DESC
  `).all(solicitacaoId);
}

function getCotacaoSelecionada(solicitacaoId) {
  if (!tableExists('compras_cotacoes')) return null;
  if (!tableExists('fornecedores')) {
    return db.prepare(`
      SELECT c.*, NULL AS fornecedor_cadastro_nome
      FROM compras_cotacoes c
      WHERE c.solicitacao_id = ? AND c.selecionada = 1
      ORDER BY c.id DESC LIMIT 1
    `).get(solicitacaoId);
  }
  return db.prepare(`
    SELECT c.*, f.nome AS fornecedor_cadastro_nome
    FROM compras_cotacoes c
    LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
    WHERE c.solicitacao_id = ? AND c.selecionada = 1
    ORDER BY c.id DESC LIMIT 1
  `).get(solicitacaoId);
}

function getHistoricoPrecos(solicitacaoId) {
  if (!tableExists('historico_precos')) return [];
  if (!tableExists('fornecedores')) {
    return db.prepare(`
      SELECT hp.*, NULL AS fornecedor_cadastro_nome
      FROM historico_precos hp
      WHERE hp.solicitacao_id = ?
      ORDER BY datetime(COALESCE(hp.data_compra, hp.rowid)) DESC
      LIMIT 5
    `).all(solicitacaoId);
  }
  return db.prepare(`
    SELECT hp.*, f.nome AS fornecedor_cadastro_nome
    FROM historico_precos hp
    LEFT JOIN fornecedores f ON f.id = hp.fornecedor_id
    WHERE hp.solicitacao_id = ?
    ORDER BY datetime(COALESCE(hp.data_compra, hp.rowid)) DESC
    LIMIT 5
  `).all(solicitacaoId);
}

function getSolicitacaoDetalhe(id) {
  const usersRef = resolveUsersTable();
  const solicitanteRoleSelect = usersRef.roleCol ? `u.${usersRef.roleCol}` : 'NULL';
  const hasEquipamentoIdCol = columnExists('solicitacoes', 'equipamento_id');
  const hasFornecedorIdCol = columnExists('solicitacoes', 'fornecedor_id');
  const hasEquipamentosTable = tableExists('equipamentos');
  const hasFornecedoresTable = tableExists('fornecedores');
  const sol = db.prepare(`
    SELECT s.*, u.${usersRef.nameCol} AS solicitante_nome, ${solicitanteRoleSelect} AS solicitante_role,
           ${hasEquipamentoIdCol && hasEquipamentosTable ? 'e.nome' : 'NULL'} AS equipamento_nome,
           ${hasFornecedorIdCol && hasFornecedoresTable ? 'f.nome' : 'NULL'} AS fornecedor_nome
    FROM solicitacoes s
    JOIN ${usersRef.table} u ON u.id = s.solicitante_user_id
    ${hasEquipamentoIdCol && hasEquipamentosTable ? 'LEFT JOIN equipamentos e ON e.id = s.equipamento_id' : ''}
    ${hasFornecedorIdCol && hasFornecedoresTable ? 'LEFT JOIN fornecedores f ON f.id = s.fornecedor_id' : ''}
    WHERE s.id = ?
  `).get(id);
  if (!sol) return null;

  const itensSelect = buildSolicitacaoItensSelect();

  const itens = db.prepare(`
    SELECT si.*, ${itensSelect.itemNomeExpr} AS item_nome, ${itensSelect.itemDescExpr} AS item_descricao,
           ${itensSelect.qtdExpr} AS qtd_solicitada
    FROM solicitacao_itens si
    LEFT JOIN estoque_itens ei ON ei.id = ${itensSelect.itemJoinExpr}
    WHERE si.solicitacao_id = ?
    ORDER BY si.id
  `).all(id);

  let cotacoes = [];
  let anexos = [];
  let historicoPrecos = [];
  let cotacaoSelecionada = null;

  try { cotacoes = listCotacoes(id); } catch (_e) { cotacoes = []; }
  try { anexos = listAnexosSolicitacao(id); } catch (_e) { anexos = []; }
  try { historicoPrecos = getHistoricoPrecos(id); } catch (_e) { historicoPrecos = []; }
  try { cotacaoSelecionada = getCotacaoSelecionada(id); } catch (_e) { cotacaoSelecionada = null; }

  return { ...sol, itens, cotacoes, anexos, historicoPrecos, cotacaoSelecionada };
}

function assumirSolicitacao(id, userId) {
  const cur = getSolicitacaoDetalhe(id);
  if (!cur || cur.status !== STATUS.ABERTA) throw new Error('Somente solicitações ABERTAS podem ser assumidas.');
  db.prepare("UPDATE solicitacoes SET status=?, compras_user_id=?, cotacao_inicio_em=datetime('now'), updated_at=datetime('now') WHERE id=?")
    .run(STATUS.EM_COTACAO, userId, id);
}

function iniciarCotacaoViaPdf(id, userId) {
  const cur = getSolicitacaoDetalhe(id);
  if (!cur) throw new Error('Solicitação não encontrada.');
  if (cur.status === STATUS.ABERTA) {
    db.prepare("UPDATE solicitacoes SET status=?, compras_user_id=?, cotacao_inicio_em=datetime('now'), updated_at=datetime('now') WHERE id=?")
      .run(STATUS.EM_COTACAO, userId, id);
  }
}

function createCotacao(solicitacaoId, dados = {}) {
  const fornecedorId = dados.fornecedor_id ? Number(dados.fornecedor_id) : null;
  const fornecedor = fornecedorId ? db.prepare('SELECT id, nome FROM fornecedores WHERE id = ?').get(fornecedorId) : null;
  db.prepare(`
    INSERT INTO compras_cotacoes (solicitacao_id, fornecedor_id, fornecedor_nome, valor_total, prazo_entrega, observacao, selecionada, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
  `).run(solicitacaoId, fornecedor?.id || null, fornecedor?.nome || (dados.fornecedor_nome || null), dados.valor_total ? Number(dados.valor_total) : null, dados.prazo_entrega || null, dados.observacao || null);
}

function selecionarCotacao(solicitacaoId, cotacaoId) {
  return db.transaction(() => {
    const cotacao = db.prepare('SELECT * FROM compras_cotacoes WHERE id = ? AND solicitacao_id = ?').get(cotacaoId, solicitacaoId);
    if (!cotacao) throw new Error('Cotação não encontrada para a solicitação.');
    db.prepare('UPDATE compras_cotacoes SET selecionada = 0 WHERE solicitacao_id = ?').run(solicitacaoId);
    db.prepare('UPDATE compras_cotacoes SET selecionada = 1 WHERE id = ?').run(cotacaoId);
  })();
}

function atualizarDados(id, dados) {
  const fornecedorId = dados.fornecedor_id ? Number(dados.fornecedor_id) : null;
  const fornecedorSelecionado = fornecedorId ? db.prepare('SELECT id, nome FROM fornecedores WHERE id = ?').get(fornecedorId) : null;
  db.prepare(`UPDATE solicitacoes SET fornecedor=?, fornecedor_id=?, previsao_entrega=?, observacoes_compras=?, valor_total=?, updated_at=datetime('now') WHERE id=?`)
    .run(fornecedorSelecionado?.nome || dados.fornecedor || null, fornecedorSelecionado?.id || null, dados.previsao_entrega || null, dados.observacoes_compras || null, dados.valor_total ? Number(dados.valor_total) : null, id);
}

function marcarComprada(id, userId, dados = {}) {
  const cur = getSolicitacaoDetalhe(id);
  if (!cur || cur.status !== STATUS.EM_COTACAO) throw new Error('Somente EM_COTACAO pode virar COMPRADA.');
  db.prepare(`UPDATE solicitacoes SET status=?, compras_user_id=?, comprada_em=datetime('now'), fornecedor=?, fornecedor_id=?, previsao_entrega=?, observacoes_compras=?, valor_total=?, updated_at=datetime('now') WHERE id=?`)
    .run(STATUS.COMPRADA, userId, dados.fornecedor || cur.fornecedor || null, dados.fornecedor_id ? Number(dados.fornecedor_id) : (cur.fornecedor_id || null), dados.previsao_entrega || cur.previsao_entrega || null, dados.observacoes_compras || cur.observacoes_compras || null, dados.valor_total ? Number(dados.valor_total) : cur.valor_total || null, id);
  return getSolicitacaoDetalhe(id);
}

function salvarAnexo({ solicitacaoId, file, tipo = 'COTACAO', uploadedBy = null }) {
  if (!solicitacaoId) throw new Error('Solicitação inválida para anexo.');
  if (!file || !file.filename) throw new Error('Arquivo inválido.');
  const info = db.prepare(`
    INSERT INTO compras_anexos (referencia_tipo, referencia_id, tipo, original_name, filename, mimetype, size, uploaded_by)
    VALUES ('SOLICITACAO', ?, ?, ?, ?, ?, ?, ?)
  `).run(solicitacaoId, tipo || 'COTACAO', file.originalname || file.filename, file.filename, file.mimetype || null, Number(file.size || 0), uploadedBy || null);
  return getAnexoById(info.lastInsertRowid);
}

function getAnexoById(anexoId) { return db.prepare('SELECT * FROM compras_anexos WHERE id = ?').get(anexoId); }
function deleteAnexo(anexoId) { db.prepare('DELETE FROM compras_anexos WHERE id = ?').run(anexoId); }
const listarAnexos = listAnexosSolicitacao;
const getAnexo = getAnexoById;
const deletarAnexo = deleteAnexo;

function gerarPdf(solicitacao, res) {
  const PDFDocument = getPDFKit();
  if (!PDFDocument) {
    const err = new Error('PDF indisponível: pdfkit não carregou');
    err.code = 'PDFKIT_NOT_AVAILABLE';
    throw err;
  }

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=solicitacao_${solicitacao.numero}.pdf`);
  doc.pipe(res);

  const logoPath = ['public/IMG/logopdf_campo_do_gado.png.png', 'public/img/logo_menu_256.png', 'public/img/logo.png'].map((p) => path.join(process.cwd(), p)).find((p) => fs.existsSync(p));
  if (logoPath) doc.image(logoPath, 40, 30, { width: 60 });

  doc.fillColor('#166534').fontSize(16).text('RECICLAGEM CAMPO DO GADO', 120, 35);
  doc.fillColor('#15803d').fontSize(11).text('MANUTENÇÃO INDUSTRIAL', 120, 55);
  doc.fillColor('#111827').fontSize(13).text('SOLICITAÇÃO DE MATERIAL / COTAÇÃO', 40, 95);
  doc.fontSize(10).text(`Número: ${solicitacao.numero || `#${solicitacao.id}`}`, 40, 115).text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 260, 115);

  let y = 145;
  const linha = (k, v) => {
    doc.font('Helvetica-Bold').text(`${k}:`, 40, y, { continued: true });
    doc.font('Helvetica').text(` ${v || '-'}`);
    y += 16;
  };

  linha('Solicitante', solicitacao.solicitante_nome);
  linha('Setor', solicitacao.setor_origem);
  linha('Prioridade', solicitacao.prioridade);
  linha('Equipamento', solicitacao.equipamento_nome);
  linha('Descrição', solicitacao.descricao);

  y += 8;
  doc.rect(40, y, 515, 20).strokeColor('#e5e7eb').stroke();
  doc.fontSize(9).font('Helvetica-Bold').text('Item', 44, y + 6).text('Descrição', 170, y + 6).text('Unidade', 360, y + 6).text('Qtde Solicitada', 420, y + 6);
  y += 22;

  doc.font('Helvetica');
  for (const it of solicitacao.itens || []) {
    doc.rect(40, y, 515, 22).strokeColor('#e5e7eb').stroke();
    doc.text(it.item_nome || '-', 44, y + 6, { width: 120 }).text(it.item_descricao || '-', 170, y + 6, { width: 180 }).text(it.unidade || 'UN', 360, y + 6, { width: 50 }).text(String(it.qtd_solicitada || 0), 420, y + 6, { width: 75 });
    y += 22;
  }

  doc.end();
}

module.exports = {
  STATUS,
  STATUS_COMPRAS,
  listSolicitacoesPorStatus,
  getResumoSolicitacoes,
  getSolicitacaoDetalhe,
  listFornecedoresAtivos,
  assumirSolicitacao,
  iniciarCotacaoViaPdf,
  createCotacao,
  selecionarCotacao,
  atualizarDados,
  marcarComprada,
  salvarAnexo,
  listarAnexos,
  getAnexo,
  deletarAnexo,
  getAnexoById,
  deleteAnexo,
  gerarPdf,
};
