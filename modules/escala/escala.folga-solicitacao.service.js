const db = require('../../database/db');
const escala = require('./escala.service');
const { normalizeRole, canAccessModule } = require('../../config/rbac');
const dateBr = require('../../utils/data-hora-br');

const MINUTOS_DIA_FOLGA = 480;
const STATUS_PENDENTE = 'PENDENTE_APROVACAO';

function tableExists(tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
  return Boolean(row);
}

function userId(user = {}) {
  return Number(user.id || user.user_id || 0) || null;
}

function assertManage(user) {
  if (!canAccessModule(normalizeRole(user?.role), 'escala_manage')) {
    throw new Error('Perfil sem permissão para aprovar ou reprovar solicitação de folga.');
  }
}

function getSolicitacao(id) {
  if (!tableExists('escala_folga_solicitacoes')) return null;
  return db.prepare(`
    SELECT s.*, c.nome AS colaborador_nome, c.funcao, u.name AS decidido_por_nome
    FROM escala_folga_solicitacoes s
    JOIN colaboradores c ON c.id = s.colaborador_id
    LEFT JOIN users u ON u.id = s.decidido_por
    WHERE s.id = ?
    LIMIT 1
  `).get(Number(id));
}

function listarSolicitacoes({ colaborador_id = null, status = null, limit = 200 } = {}) {
  if (!tableExists('escala_folga_solicitacoes')) return [];
  const params = [];
  let where = '1=1';
  if (colaborador_id) { where += ' AND s.colaborador_id = ?'; params.push(Number(colaborador_id)); }
  if (status) { where += ' AND s.status = ?'; params.push(String(status)); }
  const max = Math.min(Math.max(Number(limit) || 200, 1), 500);
  params.push(max);
  return db.prepare(`
    SELECT s.*, c.nome AS colaborador_nome, c.funcao, u.name AS decidido_por_nome
    FROM escala_folga_solicitacoes s
    JOIN colaboradores c ON c.id = s.colaborador_id
    LEFT JOIN users u ON u.id = s.decidido_por
    WHERE ${where}
    ORDER BY CASE WHEN s.status='${STATUS_PENDENTE}' THEN 0 ELSE 1 END,
             s.data_folga ASC, s.id DESC
    LIMIT ?
  `).all(...params).map((row) => {
    const saldo = escala.calcularSaldoBancoHoras(row.colaborador_id).minutos;
    return {
      ...row,
      saldo_atual_minutos: saldo,
      saldo_previsto_minutos: saldo - Number(row.minutos_solicitados || MINUTOS_DIA_FOLGA),
    };
  });
}

function conflitoProgramadoNaData(dataISO) {
  if (!tableExists('escala_folgas_programadas')) return null;
  return db.prepare(`
    SELECT f.id, f.colaborador_id, f.status, f.tipo_lancamento, c.nome AS colaborador_nome
    FROM escala_folgas_programadas f
    JOIN colaboradores c ON c.id = f.colaborador_id
    WHERE f.status <> 'CANCELADA'
      AND f.data_folga <= ?
      AND COALESCE(f.data_fim, f.data_folga) >= ?
    ORDER BY f.id DESC
    LIMIT 1
  `).get(dataISO, dataISO);
}

function conflitoAusenciaLegacy(dataISO) {
  if (!tableExists('escala_ausencias')) return null;
  return db.prepare(`
    SELECT a.id, a.colaborador_id, c.nome AS colaborador_nome
    FROM escala_ausencias a
    JOIN colaboradores c ON c.id = a.colaborador_id
    WHERE a.data_inicio <= ? AND a.data_fim >= ?
    ORDER BY a.id DESC
    LIMIT 1
  `).get(dataISO, dataISO);
}

function conflitoSolicitacaoNaData(dataISO, ignoreSolicitacaoId = null) {
  if (!tableExists('escala_folga_solicitacoes')) return null;
  const params = [dataISO];
  let ignore = '';
  if (ignoreSolicitacaoId) { ignore = ' AND s.id <> ?'; params.push(Number(ignoreSolicitacaoId)); }
  return db.prepare(`
    SELECT s.id, s.colaborador_id, c.nome AS colaborador_nome
    FROM escala_folga_solicitacoes s
    JOIN colaboradores c ON c.id = s.colaborador_id
    WHERE s.data_folga = ?
      AND s.status = '${STATUS_PENDENTE}'
      ${ignore}
    LIMIT 1
  `).get(...params);
}

function assertDataFolgaDisponivel(dataISO, { ignoreSolicitacaoId = null } = {}) {
  if (!dateBr.isValidISODate(dataISO)) throw new Error('Informe uma data válida para a folga.');
  if (dataISO < dateBr.todayISO()) throw new Error('Não é possível solicitar folga em data passada.');
  if (dateBr.isMondayISO(dataISO)) throw new Error('Segunda-feira não está disponível para folga pelo Banco de Horas.');

  const programado = conflitoProgramadoNaData(dataISO);
  if (programado) throw new Error(`A data já possui afastamento de ${programado.colaborador_nome}. Escolha outro dia.`);

  const legacy = conflitoAusenciaLegacy(dataISO);
  if (legacy) throw new Error(`A data já possui ausência de ${legacy.colaborador_nome}. Escolha outro dia.`);

  const pendente = conflitoSolicitacaoNaData(dataISO, ignoreSolicitacaoId);
  if (pendente) throw new Error(`A data já está reservada por solicitação de ${pendente.colaborador_nome}. Escolha outro dia.`);
  return true;
}

function solicitarFolga({ user, data_folga, motivo = '' }) {
  if (!tableExists('escala_folga_solicitacoes')) throw new Error('Atualização do Banco de Horas ainda não foi aplicada.');
  const colaborador = escala.buscarColaboradorDoUsuario(userId(user));
  if (!colaborador?.id) throw new Error('Seu usuário ainda não está vinculado a um colaborador ativo.');

  const existente = db.prepare(`
    SELECT id FROM escala_folga_solicitacoes
    WHERE colaborador_id=? AND status='${STATUS_PENDENTE}'
    LIMIT 1
  `).get(Number(colaborador.id));
  if (existente) throw new Error('Você já possui uma solicitação de folga aguardando aprovação.');

  const dataISO = String(data_folga || '').slice(0, 10);
  assertDataFolgaDisponivel(dataISO);
  const saldo = escala.calcularSaldoBancoHoras(colaborador.id).minutos;
  if (saldo < MINUTOS_DIA_FOLGA) throw new Error('Saldo insuficiente. É necessário possuir pelo menos 8h00 no Banco de Horas.');

  try {
    const info = db.prepare(`
      INSERT INTO escala_folga_solicitacoes
        (user_id, colaborador_id, data_folga, minutos_solicitados, motivo, status, solicitado_em)
      VALUES (?, ?, ?, ?, ?, '${STATUS_PENDENTE}', datetime('now'))
    `).run(userId(user), Number(colaborador.id), dataISO, MINUTOS_DIA_FOLGA, String(motivo || '').trim() || null);
    return Number(info.lastInsertRowid);
  } catch (error) {
    if (/UNIQUE constraint failed|uidx_escala_folga_solic_data_pendente/i.test(String(error?.message || ''))) {
      throw new Error('Esta data acabou de ser reservada por outro colaborador. Escolha outro dia.');
    }
    throw error;
  }
}

function cancelarSolicitacao(id, user) {
  const colaborador = escala.buscarColaboradorDoUsuario(userId(user));
  const solicitacao = getSolicitacao(id);
  if (!solicitacao) throw new Error('Solicitação de folga não encontrada.');
  if (!colaborador || Number(solicitacao.colaborador_id) !== Number(colaborador.id)) {
    throw new Error('Você só pode cancelar a própria solicitação de folga.');
  }
  if (solicitacao.status !== STATUS_PENDENTE) throw new Error('Somente solicitações pendentes podem ser canceladas pelo colaborador.');
  db.prepare(`UPDATE escala_folga_solicitacoes SET status='CANCELADA', decidido_em=datetime('now'), observacao_decisao='Cancelada pelo colaborador' WHERE id=?`).run(Number(id));
}

function aprovarSolicitacao(id, user, observacao = '') {
  assertManage(user);
  const solicitacao = getSolicitacao(id);
  if (!solicitacao) throw new Error('Solicitação de folga não encontrada.');
  if (solicitacao.status !== STATUS_PENDENTE) throw new Error('Esta solicitação já foi analisada.');

  assertDataFolgaDisponivel(solicitacao.data_folga, { ignoreSolicitacaoId: solicitacao.id });
  const saldo = escala.calcularSaldoBancoHoras(solicitacao.colaborador_id).minutos;
  if (saldo < MINUTOS_DIA_FOLGA) throw new Error('O colaborador não possui mais saldo suficiente para esta folga.');

  return db.transaction(() => {
    const folgaId = escala.programarFolgaCompensatoria({
      user_id: solicitacao.user_id,
      colaborador_id: solicitacao.colaborador_id,
      tipo_lancamento: 'FOLGA_COMPENSATORIA',
      data_folga: solicitacao.data_folga,
      data_fim: solicitacao.data_folga,
      minutos_descontados: MINUTOS_DIA_FOLGA,
      motivo: solicitacao.motivo || 'Folga solicitada pelo colaborador via Banco de Horas',
      usuario: user,
    });
    db.prepare(`
      UPDATE escala_folga_solicitacoes
      SET status='APROVADA', folga_id=?, decidido_por=?, decidido_em=datetime('now'), observacao_decisao=?
      WHERE id=? AND status='${STATUS_PENDENTE}'
    `).run(Number(folgaId), userId(user), String(observacao || '').trim() || null, Number(id));
    return folgaId;
  })();
}

function reprovarSolicitacao(id, user, motivo) {
  assertManage(user);
  const justificativa = String(motivo || '').trim();
  if (!justificativa) throw new Error('Informe o motivo da reprovação.');
  const solicitacao = getSolicitacao(id);
  if (!solicitacao) throw new Error('Solicitação de folga não encontrada.');
  if (solicitacao.status !== STATUS_PENDENTE) throw new Error('Esta solicitação já foi analisada.');
  db.prepare(`
    UPDATE escala_folga_solicitacoes
    SET status='REPROVADA', decidido_por=?, decidido_em=datetime('now'), observacao_decisao=?
    WHERE id=? AND status='${STATUS_PENDENTE}'
  `).run(userId(user), justificativa, Number(id));
}

function eachDateInclusive(start, end, fn) {
  let cursor = start;
  while (cursor <= end) {
    fn(cursor);
    const [year, month, day] = cursor.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1, 12));
    cursor = next.toISOString().slice(0, 10);
  }
}

function validarProgramacaoManual(dados = {}) {
  const tipo = String(dados.tipo_lancamento || dados.tipo || '').trim().toUpperCase();
  if (!['FOLGA_COMPENSATORIA', 'FOLGA_MANUAL'].includes(tipo)) return true;
  const inicio = String(dados.data_folga || dados.data_inicio || '').slice(0, 10);
  const fim = String(dados.data_fim || inicio).slice(0, 10);
  if (!dateBr.isValidISODate(inicio) || !dateBr.isValidISODate(fim) || fim < inicio) throw new Error('Período de folga inválido.');
  eachDateInclusive(inicio, fim, (data) => assertDataFolgaDisponivel(data));
  return true;
}

module.exports = {
  MINUTOS_DIA_FOLGA,
  STATUS_PENDENTE,
  getSolicitacao,
  listarSolicitacoes,
  assertDataFolgaDisponivel,
  solicitarFolga,
  cancelarSolicitacao,
  aprovarSolicitacao,
  reprovarSolicitacao,
  validarProgramacaoManual,
};
