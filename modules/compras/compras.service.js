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

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 0, left: 0, right: 0, bottom: 0 },
    bufferPages: true,
    autoFirstPage: true,
  });
  res.setHeader('Content-Type', 'application/pdf');
  const numeroArquivo = pdfValue(solicitacao.numero, solicitacao.id || 'sem-numero').replace(/[^a-z0-9_-]+/gi, '_');
  res.setHeader('Content-Disposition', `attachment; filename=solicitacao_${numeroArquivo}.pdf`);
  doc.pipe(res);

  const COLORS = {
    green: '#16A34A',
    greenDark: '#166534',
    greenHeader: '#159947',
    greenBand: '#16A34A',
    greenSoft: '#E7F4EC',
    yellow: '#FFF8D8',
    yellowBorder: '#E4BE47',
    red: '#8B1E1E',
    text: '#374151',
    muted: '#6B7280',
    border: '#DDE5DE',
    row: '#F8FBF9',
    white: '#FFFFFF',
  };
  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;
  const LEFT = 40;
  const RIGHT = PAGE_W - 40;
  const WIDTH = RIGHT - LEFT;
  const FOOTER_Y = PAGE_H - 42;
  const CONTENT_BOTTOM = PAGE_H - 70;
  const logoPath = getSolicitacaoPdfLogoPath();
  const issuedAt = solicitacao.created_at || solicitacao.data_emissao || new Date();
  const numeroSolicitacao = pdfValue(solicitacao.numero, `#${solicitacao.id || 'sem-id'}`);
  const statusLabel = pdfValue(solicitacao.status).replaceAll('_', ' ');
  const prioridade = pdfValue(solicitacao.prioridade, 'MÉDIA').toUpperCase();
  const isUrgent = ['URGENTE', 'ALTA', 'CRITICA', 'CRÍTICA'].includes(prioridade);
  const osContext = getSolicitacaoOsContext(solicitacao.os_id);
  const equipamentoNome = pdfOptional(solicitacao.equipamento_nome)
    || pdfOptional(osContext?.equipamento_resolvido)
    || pdfOptional(osContext?.equipamento_manual)
    || pdfOptional(osContext?.equipamento)
    || pdfOptional(solicitacao.destino_uso);
  let y = 0;

  const formatDate = (value, withTime = false) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return pdfOptional(value);
    return withTime
      ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : date.toLocaleDateString('pt-BR');
  };

  const getByLabel = (labels = []) => {
    const rawDescricao = pdfOptional(solicitacao.descricao || solicitacao.motivo);
    const lines = rawDescricao.split('\n').map((line) => sanitizePdfText(line)).filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (!match) continue;
      const key = match[1].trim().toLowerCase();
      if (labels.includes(key)) return match[2].trim();
    }
    return '';
  };

  const drawHeader = () => {
    doc.save();
    doc.rect(0, 0, PAGE_W, 78).fill(COLORS.greenHeader);
    doc.rect(0, 78, PAGE_W, 10).fill(COLORS.greenDark);
    if (logoPath) {
      try {
        doc.image(logoPath, LEFT + 8, 9, { fit: [70, 58], align: 'center', valign: 'center' });
      } catch (error) {
        console.error('[compras.gerarPdf] Logo não pôde ser renderizado', { logoPath, message: error.message });
        doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7).text('CAMPO\nDO GADO', LEFT + 10, 28, { width: 64, align: 'center' });
      }
    } else {
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7).text('CAMPO\nDO GADO', LEFT + 10, 28, { width: 64, align: 'center' });
    }
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(14)
      .text('RECICLAGEM CAMPO DO GADO', LEFT + 100, 22, { width: 270, lineBreak: false });
    doc.font('Helvetica').fontSize(8.5)
      .text('Solicitação de material | Manutenção Campo do Gado', LEFT + 100, 43, { width: 280, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.5)
      .text('SETOR DE COMPRAS', RIGHT - 155, 22, { width: 155, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(7.8)
      .text(`Data: ${formatDate(issuedAt)}`, RIGHT - 155, 43, { width: 155, align: 'right', lineBreak: false });
    doc.restore();
    y = 116;
  };

  const drawFooter = (pageNumber, totalPages) => {
    doc.save();
    doc.strokeColor(COLORS.border).lineWidth(0.8).moveTo(LEFT, FOOTER_Y - 9).lineTo(RIGHT, FOOTER_Y - 9).stroke();
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.2)
      .text('Manutenção Campo do Gado - Documento para controle interno e compra de materiais.', LEFT, FOOTER_Y, { width: WIDTH * 0.7, lineBreak: false });
    doc.text(`Página ${pageNumber} de ${totalPages}`, LEFT + WIDTH * 0.7, FOOTER_Y, { width: WIDTH * 0.3, align: 'right', lineBreak: false });
    doc.restore();
  };

  const addPage = () => {
    doc.addPage();
    drawHeader();
  };

  const ensureSpace = (height) => {
    if (y + height <= CONTENT_BOTTOM) return;
    addPage();
  };

  const sectionBand = (title) => {
    ensureSpace(28);
    doc.rect(LEFT, y, WIDTH, 24).fill(COLORS.greenBand);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9.5).text(title, LEFT + 12, y + 7, { width: WIDTH - 24, lineBreak: false });
    y += 32;
  };

  const drawTextBlock = (text, { fill = COLORS.white, stroke = COLORS.border, fontSize = 8.5, padding = 8 } = {}) => {
    const safeText = pdfValue(text, PDF_PENDING);
    const boxHeight = Math.max(30, doc.heightOfString(safeText, { width: WIDTH - (padding * 2), align: 'justify' }) + (padding * 2));
    ensureSpace(boxHeight + 8);
    doc.rect(LEFT, y, WIDTH, boxHeight).fillAndStroke(fill, stroke);
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(fontSize).text(safeText, LEFT + padding, y + padding - 1, {
      width: WIDTH - (padding * 2),
      align: 'justify',
    });
    y += boxHeight + 12;
  };

  const drawTitle = () => {
    doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').fontSize(18)
      .text('SOLICITAÇÃO DE MATERIAL / COMPRA', LEFT, 108, { width: WIDTH, align: 'center', lineBreak: false });
    doc.fillColor(isUrgent ? COLORS.red : COLORS.muted).font('Helvetica-Bold').fontSize(9.5)
      .text(
        isUrgent ? 'Urgência para continuidade dos serviços' : 'Documento para controle interno e compra de materiais.',
        LEFT,
        132,
        { width: WIDTH, align: 'center', lineBreak: false },
      );
    y = 156;
  };

  const drawIdentificationTable = () => {
    const rows = [
      ['Empresa / Unidade', 'Reciclagem Campo do Gado', 'Setor solicitante', pdfValue(solicitacao.setor_origem, 'Manutenção')],
      ['Destinatário', pdfValue(solicitacao.setor_destino || solicitacao.destino_uso, 'Setor de Compras'), 'Responsável compras', pdfValue(solicitacao.compras_nome, 'Sr. Ubiratam')],
      ['Responsável pela manutenção', pdfValue(solicitacao.responsavel_manutencao || solicitacao.almox_nome, 'Ângelo Gomes da Silva'), 'Data', formatDate(issuedAt)],
      ['Aplicação / Equipamento / Local', equipamentoNome || PDF_FALLBACK, 'Prioridade', prioridade],
      ['Solicitação nº', numeroSolicitacao, 'OS vinculada', solicitacao.os_id ? `OS ${solicitacao.os_id}` : PDF_FALLBACK],
      ['Status', statusLabel, 'Solicitante', pdfValue(solicitacao.solicitante_nome, PDF_PENDING)],
    ];
    const col = [LEFT, LEFT + 116, LEFT + 262, LEFT + 365, RIGHT];
    const rowHeights = rows.map((row) => Math.max(
      24,
      doc.heightOfString(row[1], { width: col[2] - col[1] - 10 }) + 11,
      doc.heightOfString(row[3], { width: col[4] - col[3] - 10 }) + 11,
    ));
    const tableHeight = rowHeights.reduce((sum, h) => sum + h, 0);
    ensureSpace(tableHeight + 14);
    rows.forEach((row, rowIndex) => {
      const rowY = y;
      const h = rowHeights[rowIndex];
      doc.rect(col[0], rowY, col[1] - col[0], h).fillAndStroke(COLORS.greenSoft, COLORS.border);
      doc.rect(col[1], rowY, col[2] - col[1], h).fillAndStroke(COLORS.white, COLORS.border);
      doc.rect(col[2], rowY, col[3] - col[2], h).fillAndStroke(COLORS.greenSoft, COLORS.border);
      doc.rect(col[3], rowY, col[4] - col[3], h).fillAndStroke(COLORS.white, COLORS.border);
      doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').fontSize(7.6)
        .text(row[0], col[0] + 6, rowY + 7, { width: col[1] - col[0] - 12 });
      doc.text(row[2], col[2] + 6, rowY + 7, { width: col[3] - col[2] - 12 });
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(7.8)
        .text(row[1], col[1] + 6, rowY + 7, { width: col[2] - col[1] - 12 });
      doc.text(row[3], col[3] + 6, rowY + 7, { width: col[4] - col[3] - 12 });
      y += h;
    });
    y += 14;
  };

  const buildFinalidade = () => {
    const motivoOs = pdfOptional(getByLabel(['motivo da solicitação', 'motivo da solicitacao', 'descrição da os', 'descricao da os']) || osContext?.descricao);
    if (motivoOs) return motivoOs;
    const destino = equipamentoNome ? ` no equipamento/local ${equipamentoNome}` : ' no equipamento/local informado';
    const osText = solicitacao.os_id ? ` vinculados à OS ${solicitacao.os_id}` : '';
    return `Solicita-se a aquisição/liberação dos materiais relacionados abaixo, necessários para execução da manutenção${destino}${osText}. O objetivo é agilizar a correção da falha, reduzir o tempo de parada e garantir a continuidade operacional.`;
  };

  const buildJustificativa = () => {
    const problema = pdfOptional(osContext?.descricao || getByLabel(['problema encontrado', 'problema identificado', 'problema', 'descrição da os', 'descricao da os']));
    const motivo = pdfOptional(getByLabel(['motivo da paralisação', 'motivo da paralisacao', 'motivo da solicitação', 'motivo da solicitacao', 'motivo']) || solicitacao.motivo);
    const justificativa = pdfOptional(getByLabel(['justificativa técnica', 'justificativa tecnica']) || osContext?.diagnostico || osContext?.resumo_tecnico || osContext?.causa_diagnostico);
    const acao = pdfOptional(getByLabel(['ação necessária', 'acao necessaria']) || osContext?.acao_executada || osContext?.acao_corretiva || osContext?.acao_preventiva);
    const parts = [];
    if (problema) parts.push(`Problema encontrado: ${problema}`);
    if (motivo) parts.push(`Motivo da solicitação: ${motivo}`);
    if (acao) parts.push(`Ação necessária: ${acao}`);
    if (justificativa) parts.push(`Justificativa técnica: ${justificativa}`);
    parts.push('Impacto operacional: a falta dos materiais pode atrasar a manutenção, prolongar a indisponibilidade do equipamento/local e comprometer a continuidade operacional. Necessidade da compra: liberar itens disponíveis e adquirir imediatamente os itens faltantes para concluir o serviço com segurança e padrão adequado.');
    return parts.join('\n\n');
  };

  const drawMaterialsTable = () => {
    sectionBand('2. LISTA DE MATERIAIS, FERRAMENTAS E APOIO SOLICITADO');
    const col = [LEFT, LEFT + 34, LEFT + 72, LEFT + 112, RIGHT];
    const drawTableHeader = () => {
      doc.rect(LEFT, y, WIDTH, 20).fill(COLORS.greenDark);
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7.8);
      ['Item', 'Qtd.', 'Unid.', 'Descrição do material / serviço e aplicação'].forEach((h, i) => {
        doc.text(h, col[i] + 5, y + 6, { width: col[i + 1] - col[i] - 10, lineBreak: false });
      });
      y += 20;
    };
    drawTableHeader();
    const materiais = Array.isArray(solicitacao.itens) ? solicitacao.itens : [];
    if (!materiais.length) {
      doc.rect(LEFT, y, WIDTH, 24).fillAndStroke(COLORS.row, COLORS.border);
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text('Nenhum item informado.', LEFT + 8, y + 8, { width: WIDTH - 16, lineBreak: false });
      y += 32;
      return;
    }
    materiais.forEach((it, index) => {
      const descBase = pdfValue(it.item_nome || it.descricao || it.item_descricao, PDF_PENDING);
      const obsText = pdfOptional(it.item_descricao || it.observacao_item);
      const descText = obsText && obsText !== descBase ? `${descBase}. Aplicação/observação: ${obsText}` : descBase;
      const rowH = Math.max(21, doc.heightOfString(descText, { width: col[4] - col[3] - 10 }) + 11);
      if (y + rowH > CONTENT_BOTTOM) {
        addPage();
        sectionBand('2. LISTA DE MATERIAIS, FERRAMENTAS E APOIO SOLICITADO (continuação)');
        drawTableHeader();
      }
      doc.rect(LEFT, y, WIDTH, rowH).fillAndStroke(index % 2 ? COLORS.row : COLORS.white, COLORS.border);
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(7.7);
      doc.text(String(index + 1).padStart(2, '0'), col[0] + 5, y + 6, { width: col[1] - col[0] - 10, lineBreak: false });
      doc.text(String(it.qtd_solicitada ?? it.quantidade ?? 0), col[1] + 5, y + 6, { width: col[2] - col[1] - 10, lineBreak: false });
      doc.text(pdfValue(it.unidade, 'UN'), col[2] + 5, y + 6, { width: col[3] - col[2] - 10, lineBreak: false });
      doc.text(descText, col[3] + 5, y + 6, { width: col[4] - col[3] - 10 });
      y += rowH;
    });
    y += 12;
  };

  const drawObservation = () => {
    const text = isUrgent
      ? 'Observação: solicitação urgente para retorno da operação. Priorizar a liberação dos itens disponíveis e a compra imediata dos itens faltantes, evitando atraso na manutenção.'
      : 'Observação: priorizar a liberação dos itens disponíveis e a compra dos itens faltantes, evitando atraso na manutenção e no retorno operacional do equipamento.';
    drawTextBlock(text, { fill: COLORS.yellow, stroke: COLORS.yellowBorder, fontSize: 8 });
  };

  const getStatusHistory = () => {
    const history = [
      [solicitacao.created_at, 'Solicitação aberta', solicitacao.solicitante_nome],
      [solicitacao.cotacao_inicio_em, 'Entrou em cotação', solicitacao.compras_nome],
      [solicitacao.comprada_em, 'Compra registrada', solicitacao.compras_nome],
      [solicitacao.recebida_em, 'Recebimento registrado', solicitacao.almox_nome],
      [solicitacao.fechada_em, 'Solicitação fechada', solicitacao.almox_nome],
    ].filter(([value]) => hasUsefulPdfText(value));

    if (tableExists('solicitacao_logs')) {
      try {
        const createdCol = columnExists('solicitacao_logs', 'created_at') ? 'created_at' : (columnExists('solicitacao_logs', 'data') ? 'data' : 'NULL');
        const acaoCol = columnExists('solicitacao_logs', 'acao') ? 'acao' : (columnExists('solicitacao_logs', 'status_novo') ? 'status_novo' : 'NULL');
        const userJoin = tableExists('users') && columnExists('solicitacao_logs', 'user_id') ? 'LEFT JOIN users u ON u.id = l.user_id' : '';
        const userSelect = userJoin ? 'u.name' : 'NULL';
        const logRows = db.prepare(`
          SELECT ${createdCol} AS data_evento, ${acaoCol} AS evento, ${userSelect} AS responsavel
          FROM solicitacao_logs l
          ${userJoin}
          WHERE l.solicitacao_id = ?
          ORDER BY datetime(COALESCE(${createdCol}, 'now')) ASC
          LIMIT 8
        `).all(solicitacao.id);
        logRows.forEach((row) => {
          if (hasUsefulPdfText(row.data_evento) || hasUsefulPdfText(row.evento)) {
            history.push([row.data_evento, pdfValue(row.evento, 'Atualização de status'), row.responsavel]);
          }
        });
      } catch (_e) {}
    }
    return history;
  };

  const drawHistory = () => {
    const history = getStatusHistory();
    if (!history.length) return;
    sectionBand('4. HISTÓRICO DE STATUS');
    const col = [LEFT, LEFT + 90, LEFT + 345, RIGHT];
    const headerH = 18;
    ensureSpace(headerH + 20);
    doc.rect(LEFT, y, WIDTH, headerH).fill(COLORS.greenDark);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7.6);
    ['Data', 'Evento', 'Responsável'].forEach((h, i) => doc.text(h, col[i] + 5, y + 5, { width: col[i + 1] - col[i] - 10, lineBreak: false }));
    y += headerH;
    history.slice(0, 8).forEach(([date, event, user], index) => {
      const rowH = 18;
      ensureSpace(rowH + 8);
      doc.rect(LEFT, y, WIDTH, rowH).fillAndStroke(index % 2 ? COLORS.row : COLORS.white, COLORS.border);
      doc.fillColor(COLORS.text).font('Helvetica').fontSize(7.4);
      doc.text(formatDate(date, true) || '-', col[0] + 5, y + 5, { width: col[1] - col[0] - 10, lineBreak: false });
      doc.text(pdfValue(event, 'Atualização'), col[1] + 5, y + 5, { width: col[2] - col[1] - 10, lineBreak: false });
      doc.text(pdfValue(user, '-'), col[2] + 5, y + 5, { width: col[3] - col[2] - 10, lineBreak: false });
      y += rowH;
    });
    y += 12;
  };

  const drawSignatures = () => {
    ensureSpace(86);
    const headerH = 21;
    const bodyH = 42;
    const footerH = 18;
    const half = WIDTH / 2;
    doc.rect(LEFT, y, WIDTH, headerH).fillAndStroke(COLORS.greenSoft, COLORS.border);
    const tableTop = y;
    doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').fontSize(7.8)
      .text('Solicitante / Manutenção', LEFT + 7, y + 7, { width: half - 14, lineBreak: false })
      .text('Compras / Almoxarifado / Recebimento', LEFT + half + 7, y + 7, { width: half - 14, lineBreak: false });
    y += headerH;
    doc.rect(LEFT, y, WIDTH, bodyH).fillAndStroke(COLORS.white, COLORS.border);
    y += bodyH;
    doc.rect(LEFT, y, WIDTH, footerH).fillAndStroke(COLORS.white, COLORS.border);
    doc.moveTo(LEFT + half, tableTop).lineTo(LEFT + half, tableTop + headerH + bodyH + footerH).strokeColor(COLORS.border).stroke();
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.4)
      .text(pdfValue(solicitacao.solicitante_nome || solicitacao.responsavel_manutencao, 'Responsável Manutenção'), LEFT + 7, y + 5, { width: half - 14, lineBreak: false })
      .text(pdfValue(solicitacao.compras_nome, 'Responsável de Compras'), LEFT + half + 7, y + 5, { width: half - 14, lineBreak: false });
    y += footerH + 8;
  };

  const drawAttachmentPages = () => {
    const imageAnexos = (Array.isArray(solicitacao.anexos) ? solicitacao.anexos : []).filter((a) => String(a.mimetype || '').startsWith('image/'));
    if (!imageAnexos.length) return;
    addPage();
    doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').fontSize(18).text('ANEXOS FOTOGRÁFICOS', LEFT, 112, { width: WIDTH, align: 'center', lineBreak: false });
    doc.fillColor(COLORS.red).font('Helvetica-Bold').fontSize(9.5)
      .text('Registro visual dos pontos de intervenção vinculados à solicitação.', LEFT, 137, { width: WIDTH, align: 'center' });
    y = 168;
    sectionBand('5. REGISTROS DO LOCAL');
    imageAnexos.forEach((anexo, idx) => {
      ensureSpace(226);
      const fullPath = resolveAnexoPath(anexo);
      doc.rect(LEFT, y, WIDTH, 208).fillAndStroke(COLORS.white, COLORS.border);
      if (!fullPath) {
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Imagem não localizada no servidor.', LEFT + 12, y + 88, { width: WIDTH - 24, align: 'center' });
      } else {
        try {
          doc.image(fullPath, LEFT + 18, y + 14, { fit: [WIDTH - 36, 160], align: 'center', valign: 'center' });
        } catch (error) {
          console.error('[compras.gerarPdf] Imagem não pôde ser renderizada', { anexoId: anexo.id, fullPath, message: error.message });
          doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Imagem não localizada no servidor.', LEFT + 12, y + 88, { width: WIDTH - 24, align: 'center' });
        }
      }
      doc.fillColor(COLORS.greenDark).font('Helvetica-Bold').fontSize(8)
        .text(`Foto ${idx + 1} - ${pdfValue(anexo.original_name, 'Registro fotográfico do local de aplicação.')}`, LEFT + 18, y + 180, { width: WIDTH - 36, align: 'center' });
      y += 224;
    });
  };

  drawHeader();
  drawTitle();
  drawIdentificationTable();
  sectionBand('1. FINALIDADE DA SOLICITAÇÃO');
  drawTextBlock(buildFinalidade(), { fill: COLORS.white, stroke: COLORS.white, fontSize: 8.6, padding: 0 });
  drawMaterialsTable();
  drawObservation();
  sectionBand('3. JUSTIFICATIVA TÉCNICA E OPERACIONAL');
  drawTextBlock(buildJustificativa(), { fill: COLORS.yellow, stroke: COLORS.yellowBorder, fontSize: 8.1 });
  drawHistory();
  drawSignatures();
  drawAttachmentPages();

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
