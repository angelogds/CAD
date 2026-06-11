const fs = require('fs');
const path = require('path');
const db = require('../../database/db');
const osChatService = require('../os-chat/os-chat.service');

const STATUS = Object.freeze({
  ABERTA: 'ABERTA',
  EM_COTACAO: 'EM_COTACAO',
  AGUARDANDO_APROVACAO: 'AGUARDANDO_APROVACAO',
  APROVADA_DIRETORIA: 'APROVADA_DIRETORIA',
  DEVOLVIDA_REVISAO: 'DEVOLVIDA_REVISAO',
  REPROVADA: 'REPROVADA',
  COMPRADA: 'COMPRADA',
  EM_RECEBIMENTO: 'EM_RECEBIMENTO',
  RECEBIDA_PARCIAL: 'RECEBIDA_PARCIAL',
  RECEBIDA_TOTAL: 'RECEBIDA_TOTAL',
  SEPARADA_PARA_RETIRADA: 'SEPARADA_PARA_RETIRADA',
  ENTREGUE_SOLICITANTE: 'ENTREGUE_SOLICITANTE',
  FECHADA: 'FECHADA',
  REABERTA: 'REABERTA',
  CANCELADA: 'CANCELADA',
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
  const hasDescricao = columnExists('solicitacao_itens', 'descricao');
  const hasQtdSolicitada = columnExists('solicitacao_itens', 'qtd_solicitada');
  const hasQuantidade = columnExists('solicitacao_itens', 'quantidade');
  const hasEstoqueItemId = columnExists('solicitacao_itens', 'estoque_item_id');
  const hasItemId = columnExists('solicitacao_itens', 'item_id');

  const itemNomeExpr = hasItemNome && hasDescricao
    ? "COALESCE(si.item_nome, si.descricao, ei.nome)"
    : hasItemNome
      ? "COALESCE(si.item_nome, ei.nome)"
      : hasDescricao
        ? "COALESCE(si.descricao, ei.nome)"
        : "COALESCE(ei.nome, '')";
  const itemDescExpr = hasItemDescricao && hasDescricao
    ? "COALESCE(si.item_descricao, si.descricao)"
    : hasItemDescricao
      ? 'si.item_descricao'
      : hasDescricao
        ? 'si.descricao'
        : "''";
  const qtdExpr = hasQtdSolicitada && hasQuantidade
    ? "COALESCE(si.qtd_solicitada, si.quantidade, 0)"
    : hasQtdSolicitada
      ? "COALESCE(si.qtd_solicitada, 0)"
      : hasQuantidade
        ? "COALESCE(si.quantidade, 0)"
        : "0";
  const itemJoinExpr = hasEstoqueItemId && hasItemId
    ? 'COALESCE(si.estoque_item_id, si.item_id)'
    : hasEstoqueItemId
      ? 'si.estoque_item_id'
      : hasItemId
        ? 'si.item_id'
        : 'NULL';

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
    const fornecedorNomeExpr = hasFornecedorIdCol && hasFornecedoresTable ? "COALESCE(f.nome, '')" : "''";
    where.push(`(LOWER(s.numero) LIKE ? OR LOWER(s.titulo) LIKE ? OR LOWER(${fornecedorExpr}) LIKE ? OR LOWER(${fornecedorNomeExpr}) LIKE ?)`);
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
  const anexos = [];
  const usersRef = resolveUsersTable();

  if (tableExists('anexos')) {
    const hasOwnerType = columnExists('anexos', 'owner_type');
    const hasOwnerId = columnExists('anexos', 'owner_id');
    const hasReferencia = columnExists('anexos', 'referencia_tipo') && columnExists('anexos', 'referencia_id');
    const hasUploadedBy = columnExists('anexos', 'uploaded_by');
    const uploadedJoin = hasUploadedBy ? `LEFT JOIN ${usersRef.table} u ON u.id = a.uploaded_by` : `LEFT JOIN ${usersRef.table} u ON 1=0`;
    const baseSelect = `
      SELECT a.*, u.${usersRef.nameCol} AS uploaded_by_nome, 'anexos' AS origem_tabela
      FROM anexos a
      ${uploadedJoin}
    `;

    if (hasOwnerType && hasOwnerId && hasReferencia) {
      anexos.push(...db.prepare(`
        ${baseSelect}
        WHERE (a.referencia_tipo='SOLICITACAO' AND a.referencia_id=?)
           OR (a.owner_type='SOLICITACAO' AND a.owner_id=?)
        ORDER BY a.id DESC
      `).all(solicitacaoId, solicitacaoId));
    } else if (hasOwnerType && hasOwnerId) {
      anexos.push(...db.prepare(`
        ${baseSelect}
        WHERE a.owner_type='SOLICITACAO' AND a.owner_id=?
        ORDER BY a.id DESC
      `).all(solicitacaoId));
    } else if (hasReferencia) {
      anexos.push(...db.prepare(`
        ${baseSelect}
        WHERE a.referencia_tipo='SOLICITACAO' AND a.referencia_id=?
        ORDER BY a.id DESC
      `).all(solicitacaoId));
    }
  }

  if (tableExists('compras_anexos')) {
    anexos.push(...db.prepare(`
      SELECT ca.*, u.${usersRef.nameCol} AS uploaded_by_nome, 'compras_anexos' AS origem_tabela
      FROM compras_anexos ca
      LEFT JOIN ${usersRef.table} u ON u.id = ca.uploaded_by
      WHERE ca.referencia_tipo='SOLICITACAO' AND ca.referencia_id=?
      ORDER BY ca.id DESC
    `).all(solicitacaoId));
  }

  return anexos.sort((a, b) => String(b.created_at || b.uploaded_at || '').localeCompare(String(a.created_at || a.uploaded_at || '')));
}

function getCotacaoSelecionada(solicitacaoId) {
  if (!tableExists('compras_cotacoes')) return null;
  const selectedCol = columnExists('compras_cotacoes', 'selecionada') ? 'selecionada' : (columnExists('compras_cotacoes', 'escolhida') ? 'escolhida' : null);
  if (!selectedCol) return null;
  if (!tableExists('fornecedores')) {
    return db.prepare(`
      SELECT c.*, NULL AS fornecedor_cadastro_nome
      FROM compras_cotacoes c
      WHERE c.solicitacao_id = ? AND c.${selectedCol} = 1
      ORDER BY c.id DESC LIMIT 1
    `).get(solicitacaoId);
  }
  return db.prepare(`
    SELECT c.*, f.nome AS fornecedor_cadastro_nome
    FROM compras_cotacoes c
    LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
    WHERE c.solicitacao_id = ? AND c.${selectedCol} = 1
    ORDER BY c.id DESC LIMIT 1
  `).get(solicitacaoId);
}

function getHistoricoPrecos(solicitacaoId) {
  const histTable = tableExists('historico_precos') ? 'historico_precos' : (tableExists('compras_historico_preco') ? 'compras_historico_preco' : null);
  if (!histTable) return [];
  if (!tableExists('fornecedores')) {
    return db.prepare(`
      SELECT hp.*, NULL AS fornecedor_cadastro_nome
      FROM ${histTable} hp
      WHERE hp.solicitacao_id = ?
      ORDER BY datetime(COALESCE(hp.data_compra, hp.rowid)) DESC
      LIMIT 5
    `).all(solicitacaoId);
  }
  return db.prepare(`
    SELECT hp.*, f.nome AS fornecedor_cadastro_nome
    FROM ${histTable} hp
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
    if (cur.os_id) { try { osChatService.registrarMensagemSistema(cur.os_id, 'COMPRA_ATUALIZADA', `Solicitação nº ${cur.numero || id} entrou em cotação.`, { solicitacao_id: id, user_id: userId }); } catch (_e) {} }
  }
}

function createCotacao(solicitacaoId, dados = {}) {
  if (!tableExists('compras_cotacoes')) throw new Error('Tabela de cotações não está disponível. Execute as migrations.');
  const fornecedorId = dados.fornecedor_id ? Number(dados.fornecedor_id) : null;
  const fornecedor = fornecedorId && tableExists('fornecedores') ? db.prepare('SELECT id, nome FROM fornecedores WHERE id = ?').get(fornecedorId) : null;
  const cols = ['solicitacao_id'];
  const vals = [solicitacaoId];
  const add = (col, val) => { if (columnExists('compras_cotacoes', col)) { cols.push(col); vals.push(val); } };

  add('fornecedor_id', fornecedor?.id || null);
  add('fornecedor_nome', fornecedor?.nome || (dados.fornecedor_nome || null));
  add('valor_total', dados.valor_total ? Number(dados.valor_total) : 0);
  add('prazo_entrega', dados.prazo_entrega || null);
  add('prazo_entrega_dias', dados.prazo_entrega_dias || dados.prazo_entrega || null);
  add('observacao', dados.observacao || null);
  add('observacoes', dados.observacoes || dados.observacao || null);
  add('selecionada', 0);
  add('escolhida', 0);
  add('created_at', new Date().toISOString());

  db.prepare(`INSERT INTO compras_cotacoes (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
}

function selecionarCotacao(solicitacaoId, cotacaoId) {
  const selectedCol = columnExists('compras_cotacoes', 'selecionada') ? 'selecionada' : (columnExists('compras_cotacoes', 'escolhida') ? 'escolhida' : null);
  if (!selectedCol) throw new Error('Tabela de cotações sem coluna de seleção.');
  return db.transaction(() => {
    const cotacao = db.prepare('SELECT * FROM compras_cotacoes WHERE id = ? AND solicitacao_id = ?').get(cotacaoId, solicitacaoId);
    if (!cotacao) throw new Error('Cotação não encontrada para a solicitação.');
    db.prepare(`UPDATE compras_cotacoes SET ${selectedCol} = 0 WHERE solicitacao_id = ?`).run(solicitacaoId);
    db.prepare(`UPDATE compras_cotacoes SET ${selectedCol} = 1 WHERE id = ?`).run(cotacaoId);
  })();
}

function atualizarDados(id, dados) {
  const fornecedorId = dados.fornecedor_id ? Number(dados.fornecedor_id) : null;
  const fornecedorSelecionado = fornecedorId ? db.prepare('SELECT id, nome FROM fornecedores WHERE id = ?').get(fornecedorId) : null;
  const cur = getSolicitacaoDetalhe(id);
  db.prepare(`UPDATE solicitacoes SET fornecedor=?, fornecedor_id=?, previsao_entrega=?, observacoes_compras=?, valor_total=?, updated_at=datetime('now') WHERE id=?`)
    .run(fornecedorSelecionado?.nome || dados.fornecedor || null, fornecedorSelecionado?.id || null, dados.previsao_entrega || null, dados.observacoes_compras || null, dados.valor_total ? Number(dados.valor_total) : null, id);
  if (cur?.os_id && (dados.observacoes_compras || dados.previsao_entrega || dados.fornecedor || fornecedorSelecionado?.nome)) {
    try { osChatService.registrarMensagemSistema(cur.os_id, 'COMPRAS', `Compras atualizou a solicitação nº ${cur.numero || id}. ${dados.observacoes_compras || 'Dados de cotação/compra atualizados.'}`, { solicitacao_id: id }); } catch (_e) {}
  }
}

function marcarComprada(id, userId, dados = {}) {
  const cur = getSolicitacaoDetalhe(id);
  if (!cur || ![STATUS.EM_COTACAO, STATUS.APROVADA_DIRETORIA].includes(cur.status)) {
    throw new Error('Somente EM_COTACAO ou APROVADA_DIRETORIA pode virar COMPRADA.');
  }
  db.prepare(`UPDATE solicitacoes SET status=?, compras_user_id=?, comprada_em=datetime('now'), fornecedor=?, fornecedor_id=?, previsao_entrega=?, observacoes_compras=?, valor_total=?, updated_at=datetime('now') WHERE id=?`)
    .run(STATUS.COMPRADA, userId, dados.fornecedor || cur.fornecedor || null, dados.fornecedor_id ? Number(dados.fornecedor_id) : (cur.fornecedor_id || null), dados.previsao_entrega || cur.previsao_entrega || null, dados.observacoes_compras || cur.observacoes_compras || null, dados.valor_total ? Number(dados.valor_total) : cur.valor_total || null, id);
  if (cur.os_id) { try { osChatService.registrarMensagemSistema(cur.os_id, 'COMPRA_ATUALIZADA', `Solicitação nº ${cur.numero || id} marcada como comprada.`, { solicitacao_id: id, user_id: userId }); } catch (_e) {} }
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

const PDF_FALLBACK = 'Não informado';
const PDF_PENDING = 'Informação pendente de confirmação';

function sanitizePdfText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/Ð/g, '')
    .replace(/\u0000/g, '')
    .trim();
}

function hasUsefulPdfText(value) {
  const text = sanitizePdfText(value);
  return !!text && !['-', PDF_FALLBACK, PDF_PENDING].includes(text);
}

function pdfValue(value, fallback = PDF_FALLBACK) {
  const text = sanitizePdfText(value);
  return text || fallback;
}

function pdfOptional(value) {
  const text = sanitizePdfText(value);
  return hasUsefulPdfText(text) ? text : '';
}

function getSolicitacaoPdfLogoPath() {
  return [
    'public/IMG/logopdf_campo_do_gado.png.png',
    'public/img/logo_menu_256.png',
    'public/img/logo.png',
  ].map((p) => path.join(process.cwd(), p)).find((p) => fs.existsSync(p)) || null;
}

function resolveAnexoPath(anexo) {
  if (!anexo?.filename) return null;
  const storagePaths = require('../../config/storage');
  const candidate = path.isAbsolute(anexo.filename)
    ? anexo.filename
    : path.join(storagePaths.UPLOAD_DIR, anexo.filename);
  return fs.existsSync(candidate) ? candidate : null;
}

function getSolicitacaoOsContext(osId) {
  if (!osId || !tableExists('os')) return null;
  try {
    const canJoinEquipamento = tableExists('equipamentos') && columnExists('os', 'equipamento_id');
    const equipamentoParts = [];
    if (canJoinEquipamento) equipamentoParts.push('e.nome');
    if (columnExists('os', 'equipamento_manual')) equipamentoParts.push('o.equipamento_manual');
    if (columnExists('os', 'equipamento')) equipamentoParts.push('o.equipamento');
    const equipamentoExpr = equipamentoParts.length ? `COALESCE(${equipamentoParts.join(', ')})` : "''";
    const equipamentoJoin = canJoinEquipamento ? 'LEFT JOIN equipamentos e ON e.id = o.equipamento_id' : '';
    return db.prepare(`
      SELECT o.*, ${equipamentoExpr} AS equipamento_resolvido
      FROM os o
      ${equipamentoJoin}
      WHERE o.id = ?
    `).get(osId) || null;
  } catch (_e) {
    return null;
  }
}

function buildMotivoSolicitacao(solicitacao, osContext, equipamentoNome) {
  const rawDescricao = pdfOptional(solicitacao.descricao || solicitacao.motivo);
  const lines = rawDescricao.split('\n').map((line) => sanitizePdfText(line)).filter(Boolean);
  const byLabel = new Map();
  lines.forEach((line) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) return;
    byLabel.set(match[1].trim().toLowerCase(), match[2].trim());
  });

  const osNumero = solicitacao.os_id || byLabel.get('número da os') || byLabel.get('numero da os') || osContext?.id;
  const problema = pdfOptional(osContext?.descricao)
    || pdfOptional(byLabel.get('problema identificado') || byLabel.get('problema'))
    || lines.find((line) => !line.includes(':'))
    || '';
  const motivoParalisacao = pdfOptional(byLabel.get('motivo da paralisação') || byLabel.get('motivo da paralisacao') || byLabel.get('motivo'));
  const justificativa = pdfOptional(byLabel.get('justificativa técnica') || byLabel.get('justificativa tecnica') || osContext?.diagnostico || osContext?.resumo_tecnico || osContext?.causa_diagnostico);
  const acaoNecessaria = pdfOptional(byLabel.get('ação necessária') || byLabel.get('acao necessaria') || osContext?.acao_executada)
    || 'Isolar a falha, inspecionar os componentes e corrigir após diagnóstico.';

  const blocks = [];
  if (osNumero || equipamentoNome) blocks.push(`OS ${osNumero || '-'}${equipamentoNome ? ` - ${equipamentoNome}` : ''}`);
  if (problema) blocks.push(`Problema:\n${problema}`);
  if (motivoParalisacao) blocks.push(`Motivo da paralisação:\n${motivoParalisacao}`);
  if (justificativa) blocks.push(`Justificativa técnica:\n${justificativa}`);
  if (acaoNecessaria) blocks.push(`Ação necessária:\n${acaoNecessaria}`);
  return blocks.join('\n\n') || PDF_PENDING;
}

function gerarPdf(solicitacao, res) {
  const PDFDocument = getPDFKit();
  if (!PDFDocument) {
    const err = new Error('PDF indisponível: pdfkit não carregou');
    err.code = 'PDFKIT_NOT_AVAILABLE';
    throw err;
  }

  const doc = new PDFDocument({ margin: 28, size: 'A4', bufferPages: true, autoFirstPage: true });
  res.setHeader('Content-Type', 'application/pdf');
  const numeroArquivo = pdfValue(solicitacao.numero, solicitacao.id || 'sem-numero').replace(/[^a-z0-9_-]+/gi, '_');
  res.setHeader('Content-Disposition', `attachment; filename=solicitacao_${numeroArquivo}.pdf`);
  doc.pipe(res);

  const COLORS = {
    green: '#16A34A',
    greenDark: '#15803D',
    greenInst: '#166534',
    greenSoft: '#E7F5EE',
    text: '#1F2937',
    muted: '#6B7280',
    border: '#D1D5DB',
    white: '#FFFFFF',
  };
  const LEFT = 28;
  const RIGHT = doc.page.width - 28;
  const WIDTH = RIGHT - LEFT;
  const CONTENT_BOTTOM = doc.page.height - 66;
  const issuedAt = new Date();
  const statusLabel = pdfValue(solicitacao.status).replaceAll('_', ' ');
  const numeroSolicitacao = pdfValue(solicitacao.numero, `#${solicitacao.id || 'sem-id'}`);
  const osContext = getSolicitacaoOsContext(solicitacao.os_id);
  const equipamentoNome = pdfOptional(solicitacao.equipamento_nome)
    || pdfOptional(osContext?.equipamento_resolvido)
    || pdfOptional(osContext?.equipamento_manual)
    || pdfOptional(osContext?.equipamento);
  const logoPath = getSolicitacaoPdfLogoPath();
  let y = 0;

  const formatDate = (value, withTime = false) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return pdfOptional(value);
    return withTime
      ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : date.toLocaleDateString('pt-BR');
  };

  const drawFooter = (pageNumber, totalPages) => {
    const lineY = doc.page.height - 43;
    doc.strokeColor(COLORS.green).lineWidth(0.7).moveTo(LEFT, lineY - 5).lineTo(RIGHT, lineY - 5).stroke();
    doc.fillColor(COLORS.greenInst).font('Helvetica').fontSize(7.5);
    doc.text('Reciclagem Campo do Gado - Manutenção Campo do Gado', LEFT, lineY, { width: WIDTH, align: 'left', lineBreak: false });
    doc.text(
      `Documento gerado automaticamente em ${formatDate(issuedAt, true)} - Página ${pageNumber} de ${totalPages}`,
      LEFT,
      lineY + 10,
      { width: WIDTH, align: 'left', lineBreak: false },
    );
  };

  const drawCompactHeader = (label = 'Continuação da solicitação') => {
    doc.fillColor(COLORS.greenInst).font('Helvetica-Bold').fontSize(8)
      .text(`${label} ${numeroSolicitacao}`, LEFT, 26, { width: WIDTH * 0.65, lineBreak: false });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
      .text(`Status: ${statusLabel}`, LEFT + WIDTH * 0.65, 26, { width: WIDTH * 0.35, align: 'right', lineBreak: false });
    doc.strokeColor(COLORS.border).lineWidth(0.5).moveTo(LEFT, 38).lineTo(RIGHT, 38).stroke();
    y = 46;
  };

  const drawTableHeader = () => {
    const col = [LEFT, LEFT + 34, LEFT + 82, LEFT + 126, LEFT + 360, RIGHT];
    doc.rect(LEFT, y, WIDTH, 18).fill(COLORS.green);
    doc.fillColor(COLORS.white).fontSize(7.4).font('Helvetica-Bold');
    ['Item', 'Qtd', 'Und', 'Descrição do material', 'Aplicação / Observação'].forEach((h, i) => {
      doc.text(h, col[i] + 4, y + 5, { width: col[i + 1] - col[i] - 8, lineBreak: false });
    });
    y += 18;
    return col;
  };

  const addPage = ({ repeatTableHeader = false } = {}) => {
    doc.addPage();
    drawCompactHeader();
    if (repeatTableHeader) return drawTableHeader();
    return null;
  };

  const ensureSpace = (height, options = {}) => {
    if (y + height <= CONTENT_BOTTOM) return options.repeatTableHeader ? options.col : null;
    return addPage(options);
  };

  doc.rect(0, 0, doc.page.width, 82).fill(COLORS.green);
  if (logoPath) {
    try {
      doc.image(logoPath, LEFT, 14, { width: 42 });
    } catch (error) {
      console.error('[compras.gerarPdf] Logo não pôde ser renderizado', { logoPath, message: error.message });
      doc.fillColor(COLORS.white).fontSize(6).font('Helvetica').text('Logo não localizado', LEFT, 34, { width: 42, align: 'center' });
    }
  } else {
    doc.fillColor(COLORS.white).fontSize(6).font('Helvetica').text('Logo não localizado', LEFT, 34, { width: 42, align: 'center' });
  }
  doc.fillColor(COLORS.white).fontSize(13).font('Helvetica-Bold').text('RECICLAGEM CAMPO DO GADO', 78, 18, { width: 260, lineBreak: false });
  doc.fontSize(9).text('MANUTENÇÃO CAMPO DO GADO', 78, 37, { width: 260, lineBreak: false });
  doc.fontSize(10).text('SOLICITAÇÃO DE MATERIAL / COMPRA', 78, 54, { width: 260, lineBreak: false });
  doc.fontSize(8.2)
    .text(`Solicitação nº ${numeroSolicitacao}`, 350, 18, { width: 210, align: 'right', lineBreak: false })
    .text(`Emissão: ${formatDate(issuedAt)}`, 350, 34, { width: 210, align: 'right', lineBreak: false })
    .text(`Status: ${statusLabel}`, 350, 50, { width: 210, align: 'right', lineBreak: false });

  y = 94;
  const infoRowsLeft = [
    ['Unidade', 'Reciclagem Campo do Gado'],
    ['Setor solicitante', pdfValue(solicitacao.setor_origem, 'Manutenção')],
    ['Solicitante', pdfValue(solicitacao.solicitante_nome, PDF_PENDING)],
    ['Responsável manutenção', pdfValue(solicitacao.responsavel_manutencao || solicitacao.almox_nome, 'Ângelo Gomes da Silva')],
    ['Destino', pdfValue(solicitacao.setor_destino || solicitacao.destino_uso, 'Setor de Compras')],
  ];
  const infoRowsRight = [
    ['Responsável compras', pdfValue(solicitacao.compras_nome, 'Sr. Ubiratam')],
    ['Prioridade', pdfValue(solicitacao.prioridade)],
    ['Equipamento / Local', equipamentoNome || PDF_FALLBACK],
    ['OS vinculada', solicitacao.os_id ? `OS ${solicitacao.os_id}` : PDF_FALLBACK],
  ].filter(([, value]) => hasUsefulPdfText(value));
  const infoHeight = Math.max(infoRowsLeft.length, infoRowsRight.length) * 14 + 14;
  doc.roundedRect(LEFT, y, WIDTH, infoHeight, 6).fillAndStroke(COLORS.greenSoft, '#A7DDBD');
  const drawInfoRows = (rows, x, startY, width) => {
    let rowY = startY;
    rows.forEach(([label, value]) => {
      doc.fillColor(COLORS.greenDark).fontSize(7.5).font('Helvetica-Bold').text(`${label}:`, x, rowY, { width: 88, continued: true });
      doc.fillColor(COLORS.text).font('Helvetica').text(` ${value}`, { width: width - 88 });
      rowY += 14;
    });
  };
  drawInfoRows(infoRowsLeft.filter(([, value]) => hasUsefulPdfText(value)), LEFT + 10, y + 8, 245);
  drawInfoRows(infoRowsRight, LEFT + 276, y + 8, 250);
  y += infoHeight + 12;

  doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').fontSize(10).text('Lista de Materiais', LEFT, y, { lineBreak: false });
  y += 14;
  let col = drawTableHeader();
  const materiais = Array.isArray(solicitacao.itens) ? solicitacao.itens : [];
  if (!materiais.length) {
    ensureSpace(22);
    doc.rect(LEFT, y, WIDTH, 22).fill(COLORS.greenSoft).stroke(COLORS.border);
    doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica').text('Nenhum item informado.', LEFT + 8, y + 7, { width: WIDTH - 16, lineBreak: false });
    y += 22;
  }
  materiais.forEach((it, index) => {
    const obsText = pdfOptional(it.item_descricao || it.observacao_item);
    const descText = pdfValue(it.item_nome || it.descricao || it.item_descricao, PDF_PENDING);
    const rowH = Math.max(
      22,
      doc.heightOfString(obsText || ' ', { width: col[5] - col[4] - 8 }) + 12,
      doc.heightOfString(descText, { width: col[4] - col[3] - 8 }) + 12,
    );
    const newCol = ensureSpace(rowH, { repeatTableHeader: true, col });
    if (newCol) col = newCol;
    doc.rect(LEFT, y, WIDTH, rowH).fill(index % 2 ? COLORS.greenSoft : COLORS.white).stroke(COLORS.border);
    doc.fillColor(COLORS.text).fontSize(7.5).font('Helvetica');
    doc.text(String(index + 1).padStart(2, '0'), col[0] + 4, y + 6, { width: col[1] - col[0] - 8 });
    doc.text(String(it.qtd_solicitada ?? it.quantidade ?? 0), col[1] + 4, y + 6, { width: col[2] - col[1] - 8 });
    doc.text(pdfValue(it.unidade, 'UN'), col[2] + 4, y + 6, { width: col[3] - col[2] - 8 });
    doc.text(descText, col[3] + 4, y + 6, { width: col[4] - col[3] - 8 });
    if (obsText) doc.text(obsText, col[4] + 4, y + 6, { width: col[5] - col[4] - 8 });
    y += rowH;
  });
  y += 8;

  const drawSection = (title, content) => {
    const safeContent = pdfOptional(content);
    if (!safeContent) return;
    const contentHeight = Math.max(28, doc.heightOfString(safeContent, { width: WIDTH - 18 }) + 12);
    const maxBoxHeight = CONTENT_BOTTOM - 66;
    ensureSpace(Math.min(14 + contentHeight + 8, maxBoxHeight));
    doc.fillColor(COLORS.green).rect(LEFT, y + 1, 3, 11).fill();
    doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').fontSize(9).text(title, LEFT + 8, y, { lineBreak: false });
    y += 14;
    if (contentHeight > maxBoxHeight) {
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(8).text(safeContent, LEFT + 2, y, { width: WIDTH - 4 });
      y = doc.y + 8;
      if (y > CONTENT_BOTTOM) addPage();
      return;
    }
    doc.roundedRect(LEFT, y, WIDTH, contentHeight, 5).fillAndStroke(COLORS.greenSoft, '#B8E7C9');
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(8).text(safeContent, LEFT + 9, y + 7, { width: WIDTH - 18 });
    y += contentHeight + 8;
  };
  drawSection('Motivo da solicitação', buildMotivoSolicitacao(solicitacao, osContext, equipamentoNome));
  drawSection('Observações', solicitacao.observacoes_compras || solicitacao.observacoes);

  const history = [
    ['Solicitação aberta', solicitacao.created_at, solicitacao.solicitante_nome],
    ['Entrou em cotação', solicitacao.cotacao_inicio_em, solicitacao.compras_nome],
    ['Comprada', solicitacao.comprada_em, solicitacao.compras_nome],
    ['Recebida', solicitacao.recebida_em, solicitacao.almox_nome],
    ['Fechada', solicitacao.fechada_em, solicitacao.almox_nome],
  ].filter(([, value]) => hasUsefulPdfText(value));
  if (history.length) {
    const histHeight = 14 + (history.length * 13) + 6;
    ensureSpace(histHeight + 6);
    doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').fontSize(9).text('Histórico de Status', LEFT, y, { lineBreak: false });
    y += 13;
    history.forEach(([label, value, user], idx) => {
      doc.rect(LEFT, y, WIDTH, 13).fill(idx % 2 ? COLORS.white : COLORS.greenSoft).stroke(COLORS.border);
      const suffix = hasUsefulPdfText(user) ? ` por ${pdfOptional(user)}` : '';
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(7.5)
        .text(`${formatDate(value)} - ${label}${suffix}`, LEFT + 6, y + 3, { width: WIDTH - 12, lineBreak: false });
      y += 13;
    });
    y += 8;
  }

  ensureSpace(86);
  doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').fontSize(9).text('Conferência e Assinaturas', LEFT, y, { lineBreak: false });
  y += 14;
  doc.roundedRect(LEFT, y, WIDTH, 24, 5).strokeColor(COLORS.border).stroke();
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.8)
    .text('Conferência do almoxarifado: (  ) Conforme   (  ) Parcial   (  ) Divergente', LEFT + 9, y + 8, { width: WIDTH - 18, lineBreak: false });
  y += 42;
  const sigWidth = (WIDTH - 28) / 3;
  [['Solicitante'], ['Responsável Manutenção'], ['Compras / Almoxarifado']].forEach(([label], idx) => {
    const x = LEFT + idx * (sigWidth + 14);
    doc.strokeColor(COLORS.border).moveTo(x, y).lineTo(x + sigWidth, y).stroke();
    doc.fillColor(COLORS.greenInst).font('Helvetica-Bold').fontSize(7.5).text(label, x, y + 5, { width: sigWidth, align: 'center', lineBreak: false });
  });
  y += 24;

  const imageAnexos = (Array.isArray(solicitacao.anexos) ? solicitacao.anexos : []).filter((a) => String(a.mimetype || '').startsWith('image/'));
  if (imageAnexos.length) {
    addPage();
    doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').fontSize(10).text('Anexos Fotográficos', LEFT, y, { lineBreak: false });
    y += 16;
    imageAnexos.forEach((anexo, idx) => {
      ensureSpace(202);
      const fullPath = resolveAnexoPath(anexo);
      doc.fillColor(COLORS.greenInst).fontSize(8).font('Helvetica-Bold')
        .text(`ANEXO ${String(idx + 1).padStart(2, '0')} — ${pdfValue(anexo.original_name, 'Imagem')}`, LEFT, y, { lineBreak: false });
      y += 12;
      doc.rect(LEFT, y, WIDTH, 176).strokeColor(COLORS.greenDark).stroke();
      if (!fullPath) {
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Imagem não localizada no servidor.', LEFT + 10, y + 78, { width: WIDTH - 20, align: 'center' });
      } else {
        try {
          doc.image(fullPath, LEFT + 4, y + 4, { fit: [WIDTH - 8, 168], align: 'center', valign: 'center' });
        } catch (error) {
          console.error('[compras.gerarPdf] Imagem não pôde ser renderizada', { anexoId: anexo.id, fullPath, message: error.message });
          doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Imagem não localizada no servidor.', LEFT + 10, y + 78, { width: WIDTH - 20, align: 'center' });
        }
      }
      y += 188;
    });
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    drawFooter(i + 1, range.count);
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
  getSolicitacaoPdfLogoPath,
  gerarPdf,
};
