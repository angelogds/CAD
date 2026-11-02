const db = require('../../database/db');
const { normalizeRole } = require('../../config/rbac');

const APPROVAL_KEY = 'compras_diretoria_aprovacao_obrigatoria';

function isApprovalRequired() {
  try {
    const row = db.prepare('SELECT valor FROM config_sistema WHERE chave=?').get(APPROVAL_KEY);
    // Só o valor explicitamente desativado dispensa a aprovação. Ausência de
    // configuração/migration ou falha de leitura preserva a proteção anterior.
    return row?.valor !== '0';
  } catch (_error) {
    return true;
  }
}

function getHistory() {
  return db.prepare(`SELECT h.*, u.name alterado_por_nome
    FROM config_sistema_historico h
    LEFT JOIN users u ON u.id=h.alterado_por_user_id
    WHERE h.chave=? ORDER BY h.id DESC LIMIT 20`).all(APPROVAL_KEY);
}

function setApprovalRequired({ perfil, obrigatoria, user }) {
  if (normalizeRole(user?.role) !== 'ADMIN') throw new Error('Somente ADMIN pode configurar o acompanhamento por perfil.');
  if (perfil !== 'DIRETORIA') throw new Error('Perfil não disponível para esta configuração.');
  if (!['0', '1'].includes(obrigatoria)) throw new Error('Selecione ativar ou desativar o acompanhamento da Diretoria.');
  return db.transaction(() => {
    const previous = db.prepare('SELECT valor FROM config_sistema WHERE chave=?').get(APPROVAL_KEY);
    if (previous?.valor === obrigatoria) return isApprovalRequired();
    db.prepare(`INSERT INTO config_sistema (chave, valor) VALUES (?, ?)
      ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor`).run(APPROVAL_KEY, obrigatoria);
    db.prepare(`INSERT INTO config_sistema_historico
      (chave, valor_anterior, valor_novo, alterado_por_user_id) VALUES (?, ?, ?, ?)`)
      .run(APPROVAL_KEY, previous?.valor ?? null, obrigatoria, Number(user.id));
    return isApprovalRequired();
  })();
}

module.exports = { isApprovalRequired, getHistory, setApprovalRequired };
