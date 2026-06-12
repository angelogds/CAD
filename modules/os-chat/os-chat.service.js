const db = require('../../database/db');
const { normalizeRole } = require('../../config/rbac');

function tableExists(name) { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); }
function columnExists(table, col) { try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col); } catch (_e) { return false; } }
function normText(v) { return String(v || '').trim(); }
function nowSql() { return "datetime('now','localtime')"; }
function userName(user) { return normText(user?.name || user?.email || 'Sistema') || 'Sistema'; }
function perfilFromUser(user) { return normalizeRole(user?.role || 'SISTEMA') || 'SISTEMA'; }
function tipoFromRole(role) {
  const r = normalizeRole(role || '');
  if (r === 'INSPECAO_QUALIDADE') return 'INSPECAO';
  if (r === 'COMPRAS') return 'COMPRAS';
  if (r === 'ALMOXARIFADO') return 'ALMOXARIFADO';
  if (['MECANICO','MANUTENCAO_SUPERVISOR','ENCARREGADO_MANUTENCAO'].includes(r)) return 'MANUTENCAO';
  return 'MENSAGEM';
}
const ACTIVE_OS_STATUSES = ['ABERTA','ANDAMENTO','EM_ANDAMENTO','PAUSADA','AGUARDANDO_MATERIAL','AGUARDANDO_COMPRAS','AGUARDANDO_INSPECAO','AGUARDANDO_MANUTENCAO','PENDENTE'];
const CLOSED_OS_STATUSES = ['FECHADA','FECHADO','CONCLUIDA','CONCLUÍDA','FINALIZADA','FINALIZADO','CANCELADA','CANCELADO'];
const HISTORY_FILTERS = new Set(['historico', 'finalizadas', 'finalizadas_recentes']);
function sqlList(values) { return values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(','); }
function isClosedStatus(status) { return CLOSED_OS_STATUSES.includes(String(status || '').trim().toUpperCase()); }
function formatBRDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(safe.getDate())}/${pad(safe.getMonth() + 1)}/${safe.getFullYear()} ${pad(safe.getHours())}:${pad(safe.getMinutes())}`;
}
function chatArchiveSelectExpr() {
  const hasArquivada = columnExists('os', 'chat_arquivada');
  const hasStatusChat = columnExists('os', 'status_chat');
  return `(${hasArquivada ? 'COALESCE(o.chat_arquivada,0)' : '0'} = 1 OR ${hasStatusChat ? "UPPER(COALESCE(o.status_chat,'')) = 'ARQUIVADO'" : '0'})`;
}
function getOs(osId) {
  const hasEquip = tableExists('equipamentos');
  return db.prepare(`
    SELECT o.*, ${hasEquip ? 'e.nome' : 'NULL'} AS equipamento_nome, ${hasEquip ? 'e.setor' : 'NULL'} AS setor_equipamento,
           COALESCE(u.name, u.email, '-') AS solicitante_nome,
           COALESCE(mu.name, mu.email, '-') AS mecanico_nome
    FROM os o
    ${hasEquip ? 'LEFT JOIN equipamentos e ON e.id = o.equipamento_id' : ''}
    LEFT JOIN users u ON u.id = o.opened_by
    LEFT JOIN users mu ON mu.id = COALESCE(o.mecanico_user_id, o.responsavel_user_id)
    WHERE o.id = ?
  `).get(Number(osId));
}
function diasEmAberto(openedAt, closedAt) {
  const start = openedAt ? new Date(openedAt) : null;
  const end = closedAt ? new Date(closedAt) : new Date();
  if (!start || Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}
function buscarSolicitacaoVinculada(osId) {
  if (!tableExists('solicitacoes')) return null;
  if (tableExists('os_solicitacoes_vinculos')) {
    const row = db.prepare(`
      SELECT s.* FROM os_solicitacoes_vinculos v JOIN solicitacoes s ON s.id = v.solicitacao_id
      WHERE v.os_id = ? ORDER BY v.id DESC LIMIT 1
    `).get(Number(osId));
    if (row) return row;
  }
  if (columnExists('solicitacoes', 'os_id')) {
    return db.prepare(`SELECT * FROM solicitacoes WHERE os_id = ? ORDER BY id DESC LIMIT 1`).get(Number(osId)) || null;
  }
  return null;
}
function getUltimoHistorico(osId) {
  if (!tableExists('os_andamento_historico')) return null;
  return db.prepare(`SELECT * FROM os_andamento_historico WHERE os_id = ? ORDER BY datetime(registrado_em) DESC, id DESC LIMIT 1`).get(Number(osId)) || null;
}
function getAcaoNecessaria(codigo) {
  const map = {
    FALTA_MATERIAL: 'Solicitar/comprar material', AGUARDANDO_COMPRA: 'Acompanhar compras', MATERIAL_CHEGOU: 'Retomar execução',
    FALTA_MAO_DE_OBRA: 'Reprogramar equipe', EQUIPAMENTO_EM_PRODUCAO: 'Aguardar parada/liberação da produção',
    AGUARDANDO_TERCEIRO: 'Acompanhar prestador externo', AGUARDANDO_PECA_TORNEARIA: 'Acompanhar retorno da tornearia',
    FALTA_FERRAMENTA: 'Providenciar ferramenta ou recurso adequado', SERVICO_COMPLEXO_CONTINUIDADE: 'Reprogramar continuidade',
    RISCO_SEGURANCA: 'Liberar condição segura/bloqueio', AGUARDANDO_APROVACAO: 'Solicitar avaliação do encarregado', OUTRO: 'Avaliar observação operacional',
  };
  return map[String(codigo || '').toUpperCase()] || 'Registrar e acompanhar ação necessária';
}
function contarNaoLidasPorOS(osId, userId) {
  if (!userId || !tableExists('os_chat_mensagens')) return 0;
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM os_chat_mensagens m
    LEFT JOIN os_chat_leituras l ON l.os_id = m.os_id AND l.user_id = ?
    WHERE m.os_id = ? AND m.deleted_at IS NULL AND COALESCE(m.user_id, 0) <> ?
      AND m.id > COALESCE(l.ultima_mensagem_lida_id, 0)
  `).get(Number(userId), Number(osId), Number(userId));
  return Number(row?.total || 0);
}
function contarNaoLidas(userId) {
  if (!userId || !tableExists('os_chat_mensagens')) return 0;
  const archiveExpr = chatArchiveSelectExpr();
  return Number(db.prepare(`
    SELECT COUNT(*) AS total
    FROM os_chat_mensagens m
    JOIN os o ON o.id = m.os_id
    LEFT JOIN os_chat_leituras l ON l.os_id = m.os_id AND l.user_id = ?
    WHERE m.deleted_at IS NULL AND COALESCE(m.user_id, 0) <> ? AND m.id > COALESCE(l.ultima_mensagem_lida_id, 0)
      AND UPPER(COALESCE(o.status,'')) IN (${sqlList(ACTIVE_OS_STATUSES)})
      AND NOT (${archiveExpr})
  `).get(Number(userId), Number(userId))?.total || 0);
}
function listarMensagens(osId) {
  if (!tableExists('os_chat_mensagens')) return [];
  return db.prepare(`
    SELECT * FROM os_chat_mensagens
    WHERE os_id = ? AND deleted_at IS NULL
    ORDER BY datetime(created_at) ASC, id ASC
  `).all(Number(osId));
}
function ultimaMensagemExpr() {
  return `(SELECT cm.mensagem FROM os_chat_mensagens cm WHERE cm.os_id=o.id AND cm.deleted_at IS NULL ORDER BY datetime(cm.created_at) DESC, cm.id DESC LIMIT 1)`;
}
function ultimaMensagemDataExpr() {
  return `(SELECT cm.created_at FROM os_chat_mensagens cm WHERE cm.os_id=o.id AND cm.deleted_at IS NULL ORDER BY datetime(cm.created_at) DESC, cm.id DESC LIMIT 1)`;
}
function listarConversasOS(user, filtros = {}) {
  const userId = Number(user?.id || 0) || 0;
  const filtro = String(filtros.filtro || 'todas').toLowerCase();
  const isHistory = HISTORY_FILTERS.has(filtro);
  const hasMsgs = tableExists('os_chat_mensagens');
  const hasHist = tableExists('os_andamento_historico');
  const hasVinc = tableExists('os_solicitacoes_vinculos');
  const hasSol = tableExists('solicitacoes');
  const hasSolOsId = hasSol && columnExists('solicitacoes', 'os_id');
  const hasEquip = tableExists('equipamentos');
  const hasDataConclusao = columnExists('os', 'data_conclusao');
  const hasDataFim = columnExists('os', 'data_fim');
  const archiveExpr = chatArchiveSelectExpr();
  const lastMsg = hasMsgs ? ultimaMensagemExpr() : 'NULL';
  const lastAt = hasMsgs ? ultimaMensagemDataExpr() : 'NULL';
  const unread = hasMsgs ? `(SELECT COUNT(*) FROM os_chat_mensagens cm LEFT JOIN os_chat_leituras l ON l.os_id=cm.os_id AND l.user_id=? WHERE cm.os_id=o.id AND cm.deleted_at IS NULL AND COALESCE(cm.user_id, 0) <> ? AND cm.id > COALESCE(l.ultima_mensagem_lida_id,0))` : '0';
  const participantes = hasMsgs ? `(
    SELECT GROUP_CONCAT(nome_perfil, ', ')
    FROM (
      SELECT (COALESCE(NULLIF(TRIM(cm.autor_nome), ''), 'Sistema') || CASE WHEN COALESCE(NULLIF(TRIM(cm.perfil), ''), NULLIF(TRIM(cm.tipo), '')) IS NOT NULL THEN '/' || REPLACE(COALESCE(NULLIF(TRIM(cm.perfil), ''), NULLIF(TRIM(cm.tipo), '')), '_', ' ') ELSE '' END) AS nome_perfil,
             MIN(cm.id) AS ordem
      FROM os_chat_mensagens cm
      WHERE cm.os_id=o.id AND cm.deleted_at IS NULL
      GROUP BY COALESCE(cm.autor_nome, ''), COALESCE(cm.perfil, ''), COALESCE(cm.tipo, '')
      ORDER BY ordem
    )
  )` : 'NULL';
  const vincExists = hasSol
    ? [hasVinc ? `EXISTS(SELECT 1 FROM os_solicitacoes_vinculos v WHERE v.os_id=o.id)` : null, hasSolOsId ? `EXISTS(SELECT 1 FROM solicitacoes s WHERE s.os_id=o.id)` : null].filter(Boolean).join(' OR ') || '0'
    : '0';
  const vincAbertaExists = hasSol
    ? [
        hasVinc ? `EXISTS(SELECT 1 FROM os_solicitacoes_vinculos v JOIN solicitacoes s ON s.id=v.solicitacao_id WHERE v.os_id=o.id AND UPPER(COALESCE(s.status,'')) NOT IN (${sqlList(CLOSED_OS_STATUSES)}))` : null,
        hasSolOsId ? `EXISTS(SELECT 1 FROM solicitacoes s WHERE s.os_id=o.id AND UPPER(COALESCE(s.status,'')) NOT IN (${sqlList(CLOSED_OS_STATUSES)}))` : null,
      ].filter(Boolean).join(' OR ') || '0'
    : '0';
  const histExists = hasHist ? `EXISTS(SELECT 1 FROM os_andamento_historico h WHERE h.os_id=o.id)` : '0';
  const msgExists = hasMsgs ? `EXISTS(SELECT 1 FROM os_chat_mensagens cm WHERE cm.os_id=o.id AND cm.deleted_at IS NULL)` : '0';
  const histComprasExists = hasHist ? `EXISTS(SELECT 1 FROM os_andamento_historico h WHERE h.os_id=o.id AND (UPPER(COALESCE(h.motivo_codigo,'')) IN ('AGUARDANDO_COMPRA','FALTA_MATERIAL','AGUARDANDO_PECA_TORNEARIA') OR LOWER(COALESCE(h.motivo_nome,'')) LIKE '%compra%'))` : '0';
  const histMaterialExists = hasHist ? `EXISTS(SELECT 1 FROM os_andamento_historico h WHERE h.os_id=o.id AND (UPPER(COALESCE(h.motivo_codigo,'')) IN ('FALTA_MATERIAL','MATERIAL_CHEGOU','AGUARDANDO_PECA_TORNEARIA') OR LOWER(COALESCE(h.motivo_nome,'')) LIKE '%material%' OR LOWER(COALESCE(h.motivo_nome,'')) LIKE '%peça%' OR LOWER(COALESCE(h.motivo_nome,'')) LIKE '%peca%'))` : '0';
  const histInspecaoExists = hasMsgs ? `EXISTS(SELECT 1 FROM os_chat_mensagens cm WHERE cm.os_id=o.id AND cm.deleted_at IS NULL AND (LOWER(COALESCE(cm.perfil,'')) LIKE '%inspec%' OR LOWER(COALESCE(cm.tipo,'')) LIKE '%inspec%' OR LOWER(COALESCE(cm.mensagem,'')) LIKE '%inspe%'))` : '0';
  const histComprasMsgExists = hasMsgs ? `EXISTS(SELECT 1 FROM os_chat_mensagens cm WHERE cm.os_id=o.id AND cm.deleted_at IS NULL AND (LOWER(COALESCE(cm.perfil,'')) LIKE '%compra%' OR LOWER(COALESCE(cm.tipo,'')) LIKE '%compra%' OR LOWER(COALESCE(cm.mensagem,'')) LIKE '%compra%'))` : '0';
  const activeStatus = `UPPER(COALESCE(o.status,'')) IN (${sqlList(ACTIVE_OS_STATUSES)})`;
  const closedStatus = `UPPER(COALESCE(o.status,'')) IN (${sqlList(CLOSED_OS_STATUSES)})`;
  const pausedStatus = `UPPER(COALESCE(o.status,'')) = 'PAUSADA'`;
  const delayed = `(${activeStatus} AND (julianday('now','localtime') - julianday(COALESCE(o.opened_at,o.created_at,o.data_inicio))) > 1)`;
  const critical = `UPPER(COALESCE(o.prioridade,'')) IN ('CRITICA','CRÍTICA','ALTA','URGENTE','EMERGENCIAL')`;
  const hasSummaryReason = `(NULLIF(TRIM(COALESCE(o.ultimo_motivo_andamento,'')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(o.ultima_justificativa_andamento,'')), '') IS NOT NULL OR NULLIF(TRIM(COALESCE(o.ultimo_registro_andamento_em,'')), '') IS NOT NULL)`;
  const closedAtParts = ['o.closed_at'];
  if (hasDataConclusao) closedAtParts.push('o.data_conclusao');
  if (hasDataFim) closedAtParts.push('o.data_fim');
  const closedAtExpr = closedAtParts.length > 1 ? `COALESCE(${closedAtParts.join(', ')})` : closedAtParts[0];
  const where = isHistory ? `(${closedStatus} OR ${archiveExpr})` : `(${activeStatus} AND NOT (${archiveExpr}))`;
  const limit = isHistory ? 500 : 300;

  const rows = db.prepare(`
    SELECT o.id, o.status, o.prioridade, o.opened_at, o.closed_at,
           ${closedAtExpr} AS data_fechamento,
           COALESCE(${hasEquip ? 'e.nome' : 'NULL'}, o.equipamento_manual, o.equipamento, '-') AS equipamento,
           COALESCE(${hasEquip ? 'e.setor' : 'NULL'}, '-') AS setor,
           o.ultimo_motivo_andamento AS motivo_atual,
           o.ultima_justificativa_andamento AS ultima_justificativa,
           o.ultimo_registro_andamento_em AS ultima_atualizacao,
           COALESCE(u.name, u.email, '-') AS responsavel,
           ${lastMsg} AS ultima_mensagem,
           ${lastAt} AS ultima_mensagem_em,
           COALESCE(${lastAt}, o.ultimo_registro_andamento_em, o.opened_at) AS ultima_interacao_em,
           ${participantes} AS participantes,
           ${unread} AS nao_lidas,
           (${vincExists}) AS tem_solicitacao,
           (${vincAbertaExists}) AS tem_solicitacao_aberta,
           (${histExists} OR ${hasSummaryReason}) AS tem_justificativa,
           (${msgExists}) AS tem_chat,
           (${histMaterialExists} OR UPPER(COALESCE(o.status,'')) = 'AGUARDANDO_MATERIAL' OR LOWER(COALESCE(o.ultimo_motivo_andamento,'')) LIKE '%material%' OR LOWER(COALESCE(o.ultimo_motivo_andamento,'')) LIKE '%peça%' OR LOWER(COALESCE(o.ultimo_motivo_andamento,'')) LIKE '%peca%') AS aguarda_material,
           (${histComprasExists} OR ${histComprasMsgExists} OR UPPER(COALESCE(o.status,'')) = 'AGUARDANDO_COMPRAS' OR LOWER(COALESCE(o.ultimo_motivo_andamento,'')) LIKE '%compra%') AS aguarda_compras,
           (${histInspecaoExists} OR UPPER(COALESCE(o.status,'')) = 'AGUARDANDO_INSPECAO') AS tem_interacao_inspecao,
           (${pausedStatus}) AS esta_pausada,
           (${delayed}) AS esta_atrasada,
           (${critical}) AS eh_critica,
           (${closedStatus} OR ${archiveExpr}) AS finalizada_recente
    FROM os o
    ${hasEquip ? 'LEFT JOIN equipamentos e ON e.id = o.equipamento_id' : ''}
    LEFT JOIN users u ON u.id = COALESCE(o.mecanico_user_id, o.responsavel_user_id, o.opened_by)
    WHERE ${where}
    ORDER BY datetime(COALESCE(${isHistory ? closedAtExpr : lastAt}, ${lastAt}, o.ultimo_registro_andamento_em, o.opened_at)) DESC, o.id DESC
    LIMIT ${limit}
  `).all(userId, userId).map((row) => ({ ...row, dias_aberta: diasEmAberto(row.opened_at, row.closed_at), nao_lidas: Number(row.nao_lidas || 0), historico: isHistory }));

  if (isHistory) return rows;

  return rows.filter((row) => {
    const status = String(row.status || '').toUpperCase();
    if (isClosedStatus(status)) return false;
    if (filtro === 'nao_lidas') return row.nao_lidas > 0;
    if (filtro === 'aguardando_material') return Number(row.aguarda_material || 0) === 1 || Number(row.tem_solicitacao_aberta || row.tem_solicitacao || 0) === 1;
    if (filtro === 'aguardando_compras') return Number(row.aguarda_compras || 0) === 1 || Number(row.tem_solicitacao_aberta || 0) === 1;
    if (filtro === 'aguardando_manutencao') return ['ABERTA','ANDAMENTO','EM_ANDAMENTO','PAUSADA','AGUARDANDO_MANUTENCAO','PENDENTE'].includes(status);
    if (filtro === 'aguardando_inspecao') return Number(row.tem_interacao_inspecao || 0) === 1;
    if (filtro === 'criticas') return Number(row.eh_critica || 0) === 1;
    if (filtro === 'em_andamento') return ['ANDAMENTO','EM_ANDAMENTO','PAUSADA'].includes(status);
    return true;
  });
}

function buscarConversaPorOS(osId, user) {
  const os = getOs(osId);
  if (!os) return null;
  const historico = getUltimoHistorico(osId);
  const solicitacao = buscarSolicitacaoVinculada(osId);
  return {
    os: {
      ...os,
      equipamento_resolvido: os.equipamento_nome || os.equipamento_manual || os.equipamento || '-',
      setor_resolvido: os.setor_equipamento || '-',
      dias_aberta: diasEmAberto(os.opened_at, os.closed_at),
      motivo_atual: os.ultimo_motivo_andamento || historico?.motivo_nome || null,
      acao_necessaria: getAcaoNecessaria(historico?.motivo_codigo),
    },
    mensagens: listarMensagens(osId),
    solicitacao,
    naoLidas: contarNaoLidasPorOS(osId, user?.id),
  };
}
function usersParaNotificar(exceptUserId = null) {
  if (!tableExists('users')) return [];
  const roles = ['ADMIN','DIRETORIA','MANUTENCAO_SUPERVISOR','ENCARREGADO_MANUTENCAO','MECANICO','COMPRAS','INSPECAO_QUALIDADE','ALMOXARIFADO'];
  return db.prepare(`SELECT id, role FROM users WHERE IFNULL(ativo,1)=1`).all()
    .filter((u) => Number(u.id) !== Number(exceptUserId || 0) && roles.includes(normalizeRole(u.role)));
}
function criarNotificacoes(osId, titulo, mensagem, exceptUserId = null) {
  if (!tableExists('notificacoes')) return;
  const insert = db.prepare(`INSERT INTO notificacoes (user_id, origem_tipo, origem_id, titulo, mensagem, status_referencia) VALUES (?, 'OS_CHAT', ?, ?, ?, 'NOVA')`);
  usersParaNotificar(exceptUserId).forEach((u) => insert.run(u.id, Number(osId), titulo, mensagem));
}
function enviarMensagem(osId, user, mensagem, options = {}) {
  const text = normText(mensagem);
  if (!text) throw new Error('Mensagem vazia não pode ser salva.');
  if (!getOs(osId)) throw new Error('OS não encontrada.');
  const tipo = options.tipo || tipoFromRole(user?.role);
  const info = db.prepare(`
    INSERT INTO os_chat_mensagens (os_id, solicitacao_id, user_id, perfil, autor_nome, tipo, mensagem, anexo_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(Number(osId), options.solicitacao_id || null, Number(user?.id || 0) || null, perfilFromUser(user), userName(user), tipo, text, options.anexo_path || null);
  const msg = db.prepare(`SELECT * FROM os_chat_mensagens WHERE id = ?`).get(info.lastInsertRowid);
  criarNotificacoes(osId, `OS ${osId} – Nova mensagem`, `${msg.autor_nome || 'Sistema'}: ${text.slice(0, 120)}`, user?.id || null);
  return msg;
}
function registrarMensagemSistema(osId, tipo, mensagem, options = {}) {
  const user = { id: options.user_id || null, name: options.autor_nome || 'Sistema', role: 'SISTEMA' };
  return enviarMensagem(osId, user, mensagem, { ...options, tipo: tipo || 'SISTEMA' });
}
function arquivarConversaOS(osId, options = {}) {
  const id = Number(osId || 0);
  if (!id || !tableExists('os')) return null;
  const os = getOs(id);
  if (!os) return null;
  const closedAt = options.closed_at || os.closed_at || os.data_conclusao || os.data_fim || new Date();
  const mensagem = `Sistema: Ordem de Serviço encerrada em ${formatBRDateTime(closedAt)}. Conversa arquivada automaticamente.`;
  let msg = null;
  if (tableExists('os_chat_mensagens')) {
    const existing = db.prepare(`
      SELECT * FROM os_chat_mensagens
      WHERE os_id = ? AND tipo = 'OS_ENCERRADA_ARQUIVADA' AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 1
    `).get(id);
    msg = existing || registrarMensagemSistema(id, 'OS_ENCERRADA_ARQUIVADA', mensagem, { user_id: options.user_id || null });
  }
  const sets = [];
  if (columnExists('os', 'chat_arquivada')) sets.push('chat_arquivada = 1');
  if (columnExists('os', 'status_chat')) sets.push("status_chat = 'ARQUIVADO'");
  if (sets.length) db.prepare(`UPDATE os SET ${sets.join(', ')} WHERE id = ?`).run(id);
  return msg;
}
function marcarComoLida(osId, userId) {
  if (!userId) return null;
  const last = db.prepare(`SELECT id FROM os_chat_mensagens WHERE os_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`).get(Number(osId));
  const lastId = Number(last?.id || 0);
  db.prepare(`
    INSERT INTO os_chat_leituras (os_id, user_id, ultima_mensagem_lida_id, lido_em)
    VALUES (?, ?, ?, ${nowSql()})
    ON CONFLICT(os_id, user_id) DO UPDATE SET ultima_mensagem_lida_id=excluded.ultima_mensagem_lida_id, lido_em=excluded.lido_em
  `).run(Number(osId), Number(userId), lastId);
  if (tableExists('notificacoes')) db.prepare(`UPDATE notificacoes SET lida=1, lida_em=${nowSql()} WHERE user_id=? AND origem_tipo='OS_CHAT' AND origem_id=?`).run(Number(userId), Number(osId));
  return lastId;
}
function listarNotificacoesChat(userId) {
  if (!userId || !tableExists('notificacoes')) return [];
  return db.prepare(`
    SELECT * FROM notificacoes WHERE user_id=? AND origem_tipo='OS_CHAT' AND lida=0
    ORDER BY datetime(created_at) DESC, id DESC LIMIT 12
  `).all(Number(userId));
}
function criarVinculoSolicitacaoOS(osId, solicitacaoId, userId) {
  const osIdNum = Number(osId);
  const solicitacaoIdNum = Number(solicitacaoId);
  if (!osIdNum || !solicitacaoIdNum) return null;
  if (!getOs(osIdNum)) throw new Error('OS não encontrada para vínculo da solicitação.');
  if (!tableExists('solicitacoes')) throw new Error('Tabela de solicitações não encontrada.');
  const solicitacao = db.prepare(`SELECT * FROM solicitacoes WHERE id = ?`).get(solicitacaoIdNum);
  if (!solicitacao) throw new Error('Solicitação não encontrada para vínculo com a OS.');

  if (tableExists('os_solicitacoes_vinculos')) {
    db.prepare(`INSERT OR IGNORE INTO os_solicitacoes_vinculos (os_id, solicitacao_id, created_by) VALUES (?, ?, ?)`)
      .run(osIdNum, solicitacaoIdNum, Number(userId || 0) || null);
  }
  if (columnExists('solicitacoes','os_id')) {
    db.prepare(`UPDATE solicitacoes SET os_id = ? WHERE id = ?`).run(osIdNum, solicitacaoIdNum);
  }
  if (tableExists('os_chat_mensagens')) {
    const numero = solicitacao.numero || solicitacaoIdNum;
    registrarMensagemSistema(osIdNum, 'SOLICITACAO_CRIADA', `Solicitação de material nº ${numero} criada e vinculada à OS ${osIdNum}.`, { solicitacao_id: solicitacaoIdNum, user_id: userId });
  }
  return buscarSolicitacaoVinculada(osIdNum) || { ...solicitacao, os_id: osIdNum };
}
module.exports = { listarConversasOS, buscarConversaPorOS, listarMensagens, enviarMensagem, registrarMensagemSistema, arquivarConversaOS, marcarComoLida, contarNaoLidas, contarNaoLidasPorOS, listarNotificacoesChat, criarVinculoSolicitacaoOS, buscarSolicitacaoVinculada, ACTIVE_OS_STATUSES, CLOSED_OS_STATUSES };
