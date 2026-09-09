const crypto = require('crypto');
const db = require('../../database/db');
const { ROLE, normalizeRole } = require('../../config/rbac');

const APPROVAL = Object.freeze({
  NONE: 'NAO_SOLICITADA',
  PENDING: 'PENDENTE',
  APPROVED: 'APROVADA',
  REJECTED: 'REPROVADA',
  EXPIRED: 'EXPIRADA',
});

const BLOCKED_FOR_APPROVAL = new Set([
  'COMPRADA',
  'EM_RECEBIMENTO',
  'RECEBIDA_PARCIAL',
  'RECEBIDA_TOTAL',
  'SEPARADA_PARA_RETIRADA',
  'ENTREGUE_SOLICITANTE',
  'FECHADA',
  'CANCELADA',
]);

function tableExists(name) {
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); } catch (_error) { return false; }
}

function tableColumns(name) {
  try { return new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((row) => row.name)); } catch (_error) { return new Set(); }
}

function requireApprovalSchema() {
  const cols = tableColumns('solicitacoes');
  const required = ['diretor_aprovador_user_id', 'aprovacao_compra_status', 'aprovacao_valor_cotado_centavos', 'aprovacao_cotacao_assinatura'];
  if (!required.every((column) => cols.has(column))) {
    const error = new Error('Estrutura de aprovação da Diretoria indisponível. Execute as migrations do sistema.');
    error.code = 'APROVACAO_SCHEMA_INDISPONIVEL';
    throw error;
  }
}

function getUser(id) {
  const userId = Number(id || 0);
  if (!userId || !tableExists('users')) return null;
  const cols = tableColumns('users');
  const nameExpr = cols.has('name') ? 'name' : (cols.has('nome') ? 'nome AS name' : "'' AS name");
  const roleExpr = cols.has('role') ? 'role' : (cols.has('perfil') ? 'perfil AS role' : "'' AS role");
  const activeExpr = cols.has('ativo') ? 'ativo' : '1 AS ativo';
  return db.prepare(`SELECT id, ${nameExpr}, ${roleExpr}, ${activeExpr} FROM users WHERE id=?`).get(userId) || null;
}

function isDirector(user) {
  return Boolean(user) && normalizeRole(user.role) === ROLE.DIRETORIA;
}

function listDirectors() {
  if (!tableExists('users')) return [];
  const cols = tableColumns('users');
  const nameExpr = cols.has('name') ? 'name' : (cols.has('nome') ? 'nome AS name' : "'' AS name");
  const roleExpr = cols.has('role') ? 'role' : (cols.has('perfil') ? 'perfil AS role' : "'' AS role");
  const activeExpr = cols.has('ativo') ? 'COALESCE(ativo,1)' : '1';
  return db.prepare(`SELECT id, ${nameExpr}, ${roleExpr} FROM users WHERE ${activeExpr}=1 ORDER BY ${cols.has('name') ? 'name' : (cols.has('nome') ? 'nome' : 'id')}`).all()
    .filter((user) => normalizeRole(user.role) === ROLE.DIRETORIA);
}

function getSolicitation(id) {
  return db.prepare('SELECT * FROM solicitacoes WHERE id=?').get(Number(id || 0)) || null;
}

function stableNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Number(number.toFixed(6)) : 0;
}

function buildSignature(items, frete, desconto) {
  const canonical = [...items]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((item) => [
      Number(item.id),
      stableNumber(item.qtd_solicitada),
      String(item.status_cotacao || '').toUpperCase(),
      Number(item.fornecedor_id || 0),
      Math.round(Number(item.valor_unitario_centavos || 0)),
    ]);
  const payload = JSON.stringify({ itens: canonical, frete: Math.round(Number(frete || 0)), desconto: Math.round(Number(desconto || 0)) });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function loadQuoteRows(solicitacaoId) {
  const cols = tableColumns('solicitacao_itens');
  if (!cols.size) return [];
  const qtdExpr = cols.has('qtd_solicitada') ? 'COALESCE(qtd_solicitada,0)' : (cols.has('quantidade') ? 'COALESCE(quantidade,0)' : '0');
  const priceExpr = cols.has('valor_unitario_centavos') ? 'valor_unitario_centavos' : '0';
  const statusCotacaoExpr = cols.has('status_cotacao') ? "UPPER(COALESCE(status_cotacao,''))" : "''";
  const statusCompraExpr = cols.has('status_compra') ? "UPPER(COALESCE(status_compra,''))" : "''";
  const supplierExpr = cols.has('fornecedor_id') ? 'fornecedor_id' : 'NULL';
  const exclusionExpr = cols.has('exclusao_status') ? "UPPER(COALESCE(exclusao_status,''))" : "''";
  return db.prepare(`
    SELECT id, ${qtdExpr} qtd_solicitada, ${priceExpr} valor_unitario_centavos,
      ${statusCotacaoExpr} status_cotacao, ${statusCompraExpr} status_compra,
      ${supplierExpr} fornecedor_id, ${exclusionExpr} exclusao_status
    FROM solicitacao_itens
    WHERE solicitacao_id=?
  `).all(Number(solicitacaoId));
}

function summarizeQuoteRows(solicitacaoId, rows, overrides = {}) {
  const active = rows.filter((item) => String(item.status_compra || '').toUpperCase() !== 'CANCELADO');
  const cotados = active.filter((item) => String(item.status_cotacao || '').toUpperCase() === 'COTADO').length;
  const allReady = active.length > 0 && active.every((item) => (
    String(item.status_cotacao || '').toUpperCase() === 'COTADO'
    && String(item.exclusao_status || '').toUpperCase() !== 'PENDENTE'
    && Number(item.fornecedor_id || 0) > 0
    && item.valor_unitario_centavos !== null
    && Number.isFinite(Number(item.valor_unitario_centavos))
  ));
  const subtotal = active.reduce((sum, item) => sum + Math.round(Number(item.qtd_solicitada || 0) * Number(item.valor_unitario_centavos || 0)), 0);
  const sol = getSolicitation(solicitacaoId) || {};
  const frete = overrides.freteCentavos == null ? Number(sol.frete_centavos || 0) : Number(overrides.freteCentavos || 0);
  const desconto = overrides.descontoCentavos == null ? Number(sol.desconto_centavos || 0) : Number(overrides.descontoCentavos || 0);
  return {
    totalCentavos: Math.max(0, subtotal + frete - desconto),
    totalItens: active.length,
    cotados,
    ready: allReady,
    signature: buildSignature(active, frete, desconto),
  };
}

function getQuoteSnapshot(solicitacaoId) {
  return summarizeQuoteRows(solicitacaoId, loadQuoteRows(solicitacaoId));
}

function parseMoneyToCents(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return Math.round(Number(fallback || 0) * 100);
  if (typeof value === 'number') return Math.round(value * 100);
  let text = String(value).trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!text) return Math.round(Number(fallback || 0) * 100);
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text);
  if (!Number.isFinite(number)) return Math.round(Number(fallback || 0) * 100);
  return Math.round(number * 100);
}

function getProspectiveQuoteSnapshot(solicitacaoId, payload = {}) {
  const rows = loadQuoteRows(solicitacaoId).map((row) => ({ ...row }));
  const ids = Array.isArray(payload.item_id) ? payload.item_id : [payload.item_id].filter(Boolean);
  const values = (name) => Array.isArray(payload[name]) ? payload[name] : [payload[name]];
  const quoted = new Set((Array.isArray(payload.cotado) ? payload.cotado : [payload.cotado]).filter(Boolean).map(Number));
  const byId = new Map(rows.map((row) => [Number(row.id), row]));

  ids.forEach((rawId, index) => {
    const row = byId.get(Number(rawId));
    if (!row) return;
    row.fornecedor_id = Number(values('fornecedor_id')[index] || 0) || null;
    row.valor_unitario_centavos = parseMoneyToCents(values('valor_unitario')[index], Number(row.valor_unitario_centavos || 0) / 100);
    row.status_cotacao = quoted.has(Number(rawId)) ? 'COTADO' : 'PENDENTE';
  });

  const sol = getSolicitation(solicitacaoId) || {};
  return summarizeQuoteRows(solicitacaoId, rows, {
    freteCentavos: parseMoneyToCents(payload.frete, Number(sol.frete_centavos || 0) / 100),
    descontoCentavos: parseMoneyToCents(payload.desconto, Number(sol.desconto_centavos || 0) / 100),
  });
}

function recordHistory({ solicitacaoId, acao, diretorUserId = null, executadoPorUserId = null, valorCotadoCentavos = null, quoteSignature = null, metodo = null, observacao = null, evidenciaAnexoId = null }) {
  if (!tableExists('compras_aprovacoes_historico')) return;
  db.prepare(`
    INSERT INTO compras_aprovacoes_historico
      (solicitacao_id, acao, diretor_user_id, executado_por_user_id, valor_cotado_centavos, cotacao_assinatura, metodo, observacao, evidencia_anexo_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(solicitacaoId),
    acao,
    diretorUserId ? Number(diretorUserId) : null,
    executadoPorUserId ? Number(executadoPorUserId) : null,
    valorCotadoCentavos == null ? null : Number(valorCotadoCentavos),
    quoteSignature || null,
    metodo || null,
    observacao || null,
    evidenciaAnexoId ? Number(evidenciaAnexoId) : null,
  );
}

function getHistory(solicitacaoId) {
  if (!tableExists('compras_aprovacoes_historico')) return [];
  return db.prepare(`
    SELECT h.*,
      d.name AS diretor_nome,
      u.name AS executado_por_nome
    FROM compras_aprovacoes_historico h
    LEFT JOIN users d ON d.id=h.diretor_user_id
    LEFT JOIN users u ON u.id=h.executado_por_user_id
    WHERE h.solicitacao_id=?
    ORDER BY h.id DESC
  `).all(Number(solicitacaoId));
}

function listManualEvidence(solicitacaoId) {
  if (!tableExists('compras_anexos')) return [];
  const cols = tableColumns('compras_anexos');
  if (!cols.has('referencia_id') || !cols.has('tipo')) return [];
  return db.prepare(`
    SELECT * FROM compras_anexos
    WHERE referencia_tipo='SOLICITACAO' AND referencia_id=?
      AND UPPER(COALESCE(tipo,''))='APROVACAO_DIRETORIA'
    ORDER BY id DESC
  `).all(Number(solicitacaoId));
}

function getContext(solicitacaoId) {
  requireApprovalSchema();
  const sol = db.prepare(`
    SELECT s.*,
      d.name AS diretor_aprovador_nome,
      req.name AS aprovacao_solicitada_por_nome,
      ap.name AS aprovacao_por_nome,
      rp.name AS reprovada_por_nome,
      man.name AS aprovacao_manual_registrada_por_nome
    FROM solicitacoes s
    LEFT JOIN users d ON d.id=s.diretor_aprovador_user_id
    LEFT JOIN users req ON req.id=s.aprovacao_compra_solicitada_por
    LEFT JOIN users ap ON ap.id=s.aprovacao_compra_por
    LEFT JOIN users rp ON rp.id=s.aprovacao_compra_reprovada_por
    LEFT JOIN users man ON man.id=s.aprovacao_manual_registrada_por
    WHERE s.id=?
  `).get(Number(solicitacaoId));
  if (!sol) return null;

  const quote = getQuoteSnapshot(solicitacaoId);
  const approvalStatus = String(sol.aprovacao_compra_status || APPROVAL.NONE).toUpperCase();
  const approvedSignature = String(sol.aprovacao_cotacao_assinatura || '');
  const stale = [APPROVAL.PENDING, APPROVAL.APPROVED].includes(approvalStatus)
    && (!approvedSignature || approvedSignature !== quote.signature);
  return {
    ...sol,
    approvalStatus,
    quote,
    stale,
    historico: getHistory(solicitacaoId),
    evidenciasManuais: listManualEvidence(solicitacaoId),
  };
}

function assertReadyForApproval(solicitacaoId) {
  requireApprovalSchema();
  const sol = getSolicitation(solicitacaoId);
  if (!sol) throw new Error('Solicitação não encontrada.');
  if (BLOCKED_FOR_APPROVAL.has(String(sol.status || '').toUpperCase())) {
    throw new Error('A solicitação já avançou para compra/recebimento e não pode iniciar uma nova aprovação.');
  }
  const quote = getQuoteSnapshot(solicitacaoId);
  if (!quote.ready) {
    throw new Error('Finalize a cotação de todos os itens ativos, com fornecedor e valor, antes de enviar para aprovação da Diretoria.');
  }
  return { sol, quote };
}

function requestApproval(solicitacaoId, directorId, requestedByUserId) {
  const director = getUser(directorId);
  if (!director || !isDirector(director) || Number(director.ativo ?? 1) === 0) {
    throw new Error('Selecione um usuário ativo com perfil DIRETORIA para aprovar esta compra.');
  }
  const { quote } = assertReadyForApproval(solicitacaoId);

  return db.transaction(() => {
    db.prepare(`
      UPDATE solicitacoes SET
        diretor_aprovador_user_id=?,
        aprovacao_compra_status=?,
        aprovacao_compra_solicitada_em=datetime('now'),
        aprovacao_compra_solicitada_por=?,
        aprovacao_compra_em=NULL,
        aprovacao_compra_por=NULL,
        aprovacao_compra_metodo=NULL,
        aprovacao_compra_observacao=NULL,
        aprovacao_compra_reprovada_em=NULL,
        aprovacao_compra_reprovada_por=NULL,
        aprovacao_compra_reprovacao_motivo=NULL,
        aprovacao_valor_cotado_centavos=?,
        aprovacao_cotacao_assinatura=?,
        aprovacao_manual_registrada_por=NULL,
        aprovacao_evidencia_anexo_id=NULL,
        updated_at=datetime('now')
      WHERE id=?
    `).run(Number(director.id), APPROVAL.PENDING, Number(requestedByUserId || 0) || null, quote.totalCentavos, quote.signature, Number(solicitacaoId));
    recordHistory({
      solicitacaoId,
      acao: 'ENVIADA_PARA_APROVACAO',
      diretorUserId: director.id,
      executadoPorUserId: requestedByUserId,
      valorCotadoCentavos: quote.totalCentavos,
      quoteSignature: quote.signature,
      metodo: 'SISTEMA',
      observacao: `Cotação enviada para aprovação de ${director.name || 'Diretoria'}.`,
    });
    return getContext(solicitacaoId);
  })();
}

function assertAssignedDirector(context, sessionUser) {
  if (!context) throw new Error('Solicitação não encontrada.');
  const role = normalizeRole(sessionUser?.role);
  if (role !== ROLE.DIRETORIA) {
    const error = new Error('Somente o perfil DIRETORIA responsável por esta solicitação pode registrar a aprovação digital.');
    error.code = 'APROVACAO_EXCLUSIVA_DIRETORIA';
    throw error;
  }
  if (Number(sessionUser?.id || 0) !== Number(context.diretor_aprovador_user_id || 0)) {
    const error = new Error('Esta solicitação está atribuída a outro diretor responsável.');
    error.code = 'APROVACAO_DIRETOR_DIVERGENTE';
    throw error;
  }
}

function approve(solicitacaoId, sessionUser, observation = '') {
  const context = getContext(solicitacaoId);
  assertAssignedDirector(context, sessionUser);
  if (context.approvalStatus !== APPROVAL.PENDING) throw new Error('Esta solicitação não está aguardando aprovação da Diretoria.');
  if (context.stale) throw new Error('A cotação foi alterada após o envio para aprovação. Solicite uma nova aprovação com os valores atualizados.');
  if (!context.quote.ready) throw new Error('A cotação não está completa para aprovação.');

  return db.transaction(() => {
    db.prepare(`
      UPDATE solicitacoes SET
        aprovacao_compra_status=?,
        aprovacao_compra_em=datetime('now'),
        aprovacao_compra_por=?,
        aprovacao_compra_metodo='SISTEMA',
        aprovacao_compra_observacao=?,
        aprovacao_compra_reprovada_em=NULL,
        aprovacao_compra_reprovada_por=NULL,
        aprovacao_compra_reprovacao_motivo=NULL,
        updated_at=datetime('now')
      WHERE id=?
    `).run(APPROVAL.APPROVED, Number(sessionUser.id), String(observation || '').trim() || null, Number(solicitacaoId));
    recordHistory({
      solicitacaoId,
      acao: 'APROVADA',
      diretorUserId: sessionUser.id,
      executadoPorUserId: sessionUser.id,
      valorCotadoCentavos: context.quote.totalCentavos,
      quoteSignature: context.quote.signature,
      metodo: 'SISTEMA',
      observacao: String(observation || '').trim() || 'Compra aprovada digitalmente pela Diretoria.',
    });
    return getContext(solicitacaoId);
  })();
}

function reject(solicitacaoId, sessionUser, reason) {
  const context = getContext(solicitacaoId);
  assertAssignedDirector(context, sessionUser);
  if (context.approvalStatus !== APPROVAL.PENDING) throw new Error('Esta solicitação não está aguardando decisão da Diretoria.');
  const motivo = String(reason || '').trim();
  if (motivo.length < 5) throw new Error('Informe o motivo da reprovação para manter a rastreabilidade.');

  return db.transaction(() => {
    db.prepare(`
      UPDATE solicitacoes SET
        aprovacao_compra_status=?,
        aprovacao_compra_reprovada_em=datetime('now'),
        aprovacao_compra_reprovada_por=?,
        aprovacao_compra_reprovacao_motivo=?,
        aprovacao_compra_em=NULL,
        aprovacao_compra_por=NULL,
        aprovacao_compra_metodo=NULL,
        updated_at=datetime('now')
      WHERE id=?
    `).run(APPROVAL.REJECTED, Number(sessionUser.id), motivo, Number(solicitacaoId));
    recordHistory({
      solicitacaoId,
      acao: 'REPROVADA',
      diretorUserId: sessionUser.id,
      executadoPorUserId: sessionUser.id,
      valorCotadoCentavos: context.quote.totalCentavos,
      quoteSignature: context.quote.signature,
      metodo: 'SISTEMA',
      observacao: motivo,
    });
    return getContext(solicitacaoId);
  })();
}

function registerManual(solicitacaoId, { directorId, evidenceAttachmentId, observation, recordedByUserId }) {
  const director = getUser(directorId);
  if (!director || !isDirector(director) || Number(director.ativo ?? 1) === 0) {
    throw new Error('Selecione o diretor que assinou a liberação manual.');
  }
  const evidenceId = Number(evidenceAttachmentId || 0);
  const evidence = listManualEvidence(solicitacaoId).find((row) => Number(row.id) === evidenceId);
  if (!evidence) throw new Error('Anexe primeiro o documento assinado com o tipo APROVAÇÃO DIRETORIA.');
  const { quote } = assertReadyForApproval(solicitacaoId);

  return db.transaction(() => {
    db.prepare(`
      UPDATE solicitacoes SET
        diretor_aprovador_user_id=?,
        aprovacao_compra_status=?,
        aprovacao_compra_solicitada_em=COALESCE(aprovacao_compra_solicitada_em,datetime('now')),
        aprovacao_compra_solicitada_por=COALESCE(aprovacao_compra_solicitada_por,?),
        aprovacao_compra_em=datetime('now'),
        aprovacao_compra_por=?,
        aprovacao_compra_metodo='MANUAL',
        aprovacao_compra_observacao=?,
        aprovacao_compra_reprovada_em=NULL,
        aprovacao_compra_reprovada_por=NULL,
        aprovacao_compra_reprovacao_motivo=NULL,
        aprovacao_valor_cotado_centavos=?,
        aprovacao_cotacao_assinatura=?,
        aprovacao_manual_registrada_por=?,
        aprovacao_evidencia_anexo_id=?,
        updated_at=datetime('now')
      WHERE id=?
    `).run(
      Number(director.id), APPROVAL.APPROVED, Number(recordedByUserId || 0) || null, Number(director.id),
      String(observation || '').trim() || 'Aprovação manual registrada a partir de documento assinado.',
      quote.totalCentavos, quote.signature, Number(recordedByUserId || 0) || null, evidenceId, Number(solicitacaoId),
    );
    recordHistory({
      solicitacaoId,
      acao: 'APROVADA_MANUAL',
      diretorUserId: director.id,
      executadoPorUserId: recordedByUserId,
      valorCotadoCentavos: quote.totalCentavos,
      quoteSignature: quote.signature,
      metodo: 'MANUAL',
      observacao: String(observation || '').trim() || 'Documento assinado pela Diretoria registrado no sistema.',
      evidenciaAnexoId: evidenceId,
    });
    return getContext(solicitacaoId);
  })();
}

function invalidateIfQuoteChanged(solicitacaoId, userId = null) {
  const context = getContext(solicitacaoId);
  if (!context || ![APPROVAL.PENDING, APPROVAL.APPROVED].includes(context.approvalStatus) || !context.stale) return context;
  db.prepare("UPDATE solicitacoes SET aprovacao_compra_status=?, updated_at=datetime('now') WHERE id=?")
    .run(APPROVAL.EXPIRED, Number(solicitacaoId));
  recordHistory({
    solicitacaoId,
    acao: 'INVALIDADA_POR_ALTERACAO_DA_COTACAO',
    diretorUserId: context.diretor_aprovador_user_id,
    executadoPorUserId: userId,
    valorCotadoCentavos: context.quote.totalCentavos,
    quoteSignature: context.quote.signature,
    metodo: context.aprovacao_compra_metodo || 'SISTEMA',
    observacao: 'Os valores, fornecedores, itens ou ajustes da cotação mudaram após o envio/aprovação. Uma nova aprovação é obrigatória.',
  });
  return getContext(solicitacaoId);
}

function assertCompraAprovada(solicitacaoId) {
  const context = invalidateIfQuoteChanged(solicitacaoId);
  if (!context) throw new Error('Solicitação não encontrada.');
  if (context.approvalStatus !== APPROVAL.APPROVED) {
    const error = new Error('A compra ainda não foi liberada pela Diretoria. Finalize a cotação e obtenha a aprovação antes de marcar itens como comprados.');
    error.code = 'COMPRA_AGUARDANDO_APROVACAO_DIRETORIA';
    throw error;
  }
  if (context.stale) {
    const error = new Error('A aprovação ficou inválida porque a cotação foi alterada. Envie novamente para a Diretoria.');
    error.code = 'APROVACAO_COTACAO_DESATUALIZADA';
    throw error;
  }
  return context;
}

function assertPayloadMatchesApprovedQuote(solicitacaoId, payload = {}) {
  const context = assertCompraAprovada(solicitacaoId);
  const prospective = getProspectiveQuoteSnapshot(solicitacaoId, payload);
  if (!prospective.ready || prospective.signature !== String(context.aprovacao_cotacao_assinatura || '')) {
    const error = new Error('Os dados enviados para compra diferem da cotação aprovada pela Diretoria. Salve a nova cotação e envie novamente para aprovação.');
    error.code = 'COMPRA_DIVERGE_DA_COTACAO_APROVADA';
    throw error;
  }
  return context;
}

function canCurrentDirectorDecide(context, sessionUser) {
  return Boolean(context)
    && context.approvalStatus === APPROVAL.PENDING
    && normalizeRole(sessionUser?.role) === ROLE.DIRETORIA
    && Number(sessionUser?.id || 0) === Number(context.diretor_aprovador_user_id || 0)
    && !context.stale;
}

module.exports = {
  APPROVAL,
  listDirectors,
  getQuoteSnapshot,
  getProspectiveQuoteSnapshot,
  getContext,
  getHistory,
  listManualEvidence,
  requestApproval,
  approve,
  reject,
  registerManual,
  invalidateIfQuoteChanged,
  assertCompraAprovada,
  assertPayloadMatchesApprovedQuote,
  canCurrentDirectorDecide,
  isDirector,
};
