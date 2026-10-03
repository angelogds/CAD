const db = require('../../database/db');
const { normalizeRole } = require('../../config/rbac');
const { SETORES, normalizeSetorCorporativo } = require('./compras-setores');

function isCoordenadorReciclagem(req) {
  return normalizeRole(req.session?.user?.role || req.session?.user?.perfil || '') === 'COORDENADOR_RECICLAGEM';
}

function deny(res, status, message) {
  return res.status(status).send(message);
}

function getSolicitacao(id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  return db.prepare('SELECT id, setor_origem FROM solicitacoes WHERE id = ?').get(numericId) || null;
}

function isSolicitacaoReciclagem(solicitacao) {
  if (!solicitacao) return false;
  const setor = normalizeSetorCorporativo(solicitacao.setor_origem);
  // Compatibilidade com registros legados sem setor: historicamente pertencem ao
  // fluxo de Manutenção/Reciclagem, a mesma regra do acompanhamento gerencial.
  return !setor || setor === SETORES.RECICLAGEM;
}

function assertSolicitacao(req, res, solicitacaoId) {
  const solicitacao = getSolicitacao(solicitacaoId);
  if (!solicitacao) {
    deny(res, 404, 'Solicitação não encontrada.');
    return null;
  }
  if (!isSolicitacaoReciclagem(solicitacao)) {
    deny(res, 403, '403 - O Coordenador da Reciclagem só pode acessar registros da Reciclagem.');
    return null;
  }
  req.comprasScopeSolicitacao = solicitacao;
  return solicitacao;
}

function requireSolicitacaoScope(req, res, next) {
  if (!isCoordenadorReciclagem(req)) return next();
  if (!assertSolicitacao(req, res, req.params.id)) return undefined;
  return next();
}

function requireItemScope(req, res, next) {
  if (!isCoordenadorReciclagem(req)) return next();

  const itemId = Number(req.params.itemId);
  const solicitacaoId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(solicitacaoId) || solicitacaoId <= 0) {
    return deny(res, 404, 'Item não encontrado.');
  }

  const item = db.prepare('SELECT id, solicitacao_id FROM solicitacao_itens WHERE id = ?').get(itemId);
  if (!item) return deny(res, 404, 'Item não encontrado.');
  if (Number(item.solicitacao_id) !== solicitacaoId) {
    return deny(res, 403, '403 - Item não pertence à solicitação informada.');
  }
  if (!assertSolicitacao(req, res, solicitacaoId)) return undefined;

  req.comprasScopeItem = item;
  return next();
}

function requireCotacaoScope(req, res, next) {
  if (!isCoordenadorReciclagem(req)) return next();

  const cotacaoId = Number(req.params.cotacaoId);
  const solicitacaoId = Number(req.params.id);
  if (!Number.isInteger(cotacaoId) || cotacaoId <= 0 || !Number.isInteger(solicitacaoId) || solicitacaoId <= 0) {
    return deny(res, 404, 'Cotação não encontrada.');
  }

  const cotacao = db.prepare('SELECT id, solicitacao_id FROM compras_cotacoes WHERE id = ?').get(cotacaoId);
  if (!cotacao) return deny(res, 404, 'Cotação não encontrada.');
  if (Number(cotacao.solicitacao_id) !== solicitacaoId) {
    return deny(res, 403, '403 - Cotação não pertence à solicitação informada.');
  }
  if (!assertSolicitacao(req, res, solicitacaoId)) return undefined;

  req.comprasScopeCotacao = cotacao;
  return next();
}

function requireAnexoScope(req, res, next) {
  if (!isCoordenadorReciclagem(req)) return next();

  const anexoId = Number(req.params.anexoId);
  if (!Number.isInteger(anexoId) || anexoId <= 0) return deny(res, 404, 'Anexo não encontrado.');

  const anexo = db.prepare('SELECT id, referencia_tipo, referencia_id FROM compras_anexos WHERE id = ?').get(anexoId);
  if (!anexo) return deny(res, 404, 'Anexo não encontrado.');
  if (String(anexo.referencia_tipo || '').toUpperCase() !== 'SOLICITACAO') {
    return deny(res, 403, '403 - Anexo fora do escopo permitido.');
  }
  if (!assertSolicitacao(req, res, anexo.referencia_id)) return undefined;

  req.comprasScopeAnexo = anexo;
  return next();
}

function bodyIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => Number(item)).filter((id) => Number.isInteger(id) && id > 0);
}

function requireBodyItemsScope(req, res, next) {
  if (!isCoordenadorReciclagem(req)) return next();

  const solicitacaoId = Number(req.params.id);
  if (!assertSolicitacao(req, res, solicitacaoId)) return undefined;

  const ids = [...new Set([
    ...bodyIds(req.body?.item_id),
    ...bodyIds(req.body?.comprar),
    ...bodyIds(req.body?.cotado),
  ])];

  if (!ids.length) return next();

  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, solicitacao_id FROM solicitacao_itens WHERE id IN (${placeholders})`
  ).all(...ids);

  if (rows.length !== ids.length || rows.some((row) => Number(row.solicitacao_id) !== solicitacaoId)) {
    return deny(res, 403, '403 - Um ou mais itens enviados não pertencem à solicitação da Reciclagem.');
  }

  return next();
}

module.exports = {
  isCoordenadorReciclagem,
  isSolicitacaoReciclagem,
  requireSolicitacaoScope,
  requireItemScope,
  requireCotacaoScope,
  requireAnexoScope,
  requireBodyItemsScope,
};
