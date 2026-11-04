const db = require('../../database/db');
const { canAccessModule } = require('../../config/rbac');
const dateBr = require('../../utils/data-hora-br');
const operational = require('./pcm.operational.service');

const ACTIVE = ['PROGRAMADA', 'EM_ANDAMENTO'];
const canView = user => Boolean(Number(user?.id) && canAccessModule(user.role, 'agenda_servicos_view'));
const canManage = user => Boolean(Number(user?.id) && canAccessModule(user.role, 'pcm_manage'));
const tableExists = name => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
const ready = () => tableExists('pcm_programacao_demandas');

function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function manager(user) { if (!canManage(user)) fail('Somente a gestão do PCM pode programar serviços e instalações.', 403); }
function date(value) { const result = String(value || '').trim(); if (!dateBr.isValidISODate(result)) fail('Informe uma data válida.'); return result; }
function text(value, max = 2000) {
  if (value != null && typeof value !== 'string') fail('Texto inválido.');
  const result = String(value || '').trim(); if (result.length > max) fail(`Use no máximo ${max} caracteres.`); return result;
}
function demanda(id) { const row = db.prepare('SELECT * FROM demandas WHERE id=?').get(Number(id)); if (!row) fail('Demanda não encontrada.', 404); return row; }
function semana(input) {
  const monday = new Date(`${date(input || dateBr.todayISO())}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const dias = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday); day.setUTCDate(day.getUTCDate() + index); return day.toISOString().slice(0, 10);
  });
  return { semana_inicio: dias[0], semana_fim: dias[6], dias };
}

function equipe() {
  const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map(row => row.name));
  const archived = new Set(columns.has('archived_at') ? db.prepare('SELECT id FROM users WHERE archived_at IS NOT NULL').all().map(row => row.id) : []);
  return operational.listMechanics().filter(person => canAccessModule(person.role, 'agenda_servicos_view') && !archived.has(person.id));
}

function destinatarios() {
  const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map(row => row.name));
  return db.prepare(`SELECT id,role FROM users WHERE ${cols.has('ativo') ? 'COALESCE(ativo,1)=1' : '1=1'} ${cols.has('archived_at') ? 'AND archived_at IS NULL' : ''}`).all().filter(canView);
}

function avisar(evento) {
  const d = demanda(evento.demanda_id);
  const executor = db.prepare('SELECT name FROM users WHERE id=?').get(evento.responsavel_user_id);
  const estado = { PROGRAMADA: evento.versao > 1 ? 'Agenda atualizada' : 'Serviço programado', EM_ANDAMENTO: 'Serviço em andamento', CONCLUIDA: 'Etapa concluída', CANCELADA: 'Programação cancelada' }[evento.status];
  const titulo = `${estado}: ${evento.etapa === 'INSTALACAO' ? 'instalação' : 'demanda'} #${d.id}`;
  const mensagem = `${d.titulo}\n${dateBr.formatDateBR(evento.data_programada)}${evento.horario ? ` às ${evento.horario}` : ''} • ${evento.local_servico}\nResponsável: ${executor?.name || 'Não informado'}${evento.data_realizada ? `\nRealizado em: ${dateBr.formatDateBR(evento.data_realizada)}` : ''}${evento.preparacao ? `\nPreparação e materiais: ${evento.preparacao}` : ''}`;
  const insert = db.prepare("INSERT OR IGNORE INTO notificacoes (user_id,origem_tipo,origem_id,titulo,mensagem,status_referencia) VALUES (?,'PCM_AGENDA',?,?,?,?)");
  destinatarios().forEach(user => insert.run(user.id, evento.id, titulo, mensagem, `${evento.status}:${evento.versao}`));
}

function auditar(evento, userId, acao) {
  db.prepare('INSERT INTO demanda_logs (demanda_id,user_id,texto) VALUES (?,?,?)').run(evento.demanda_id, userId,
    `${acao} na agenda do PCM — ${evento.etapa === 'INSTALACAO' ? 'Instalação' : 'Serviço'} em ${dateBr.formatDateBR(evento.data_programada)}${evento.horario ? ` às ${evento.horario}` : ''}; local: ${evento.local_servico}; responsável #${evento.responsavel_user_id}; situação ${evento.status}${evento.data_realizada ? `; realizado em ${dateBr.formatDateBR(evento.data_realizada)}` : ''}.${evento.preparacao ? ` Preparação e materiais: ${evento.preparacao}` : ''}`);
}

function getEvento(id) { const row = db.prepare('SELECT * FROM pcm_programacao_demandas WHERE id=?').get(Number(id)); if (!row) fail('Programação não encontrada.', 404); return row; }

function programar(demandaId, payload, user) {
  manager(user);
  const etapa = text(payload.etapa, 15);
  if (!['SERVICO', 'INSTALACAO'].includes(etapa)) fail('Selecione serviço ou instalação.');
  const data = date(payload.data_programada);
  const horario = text(payload.horario, 5);
  if (horario && !/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) fail('Horário inválido.');
  const local = text(payload.local_servico, 180); if (!local) fail('Informe o local do serviço ou instalação.');
  const preparacao = text(payload.preparacao);
  const horas = Number(payload.horas_estimadas || 2); if (!Number.isFinite(horas) || horas <= 0 || horas > 72) fail('Informe duração maior que zero e até 72 horas.');
  const responsavel = equipe().find(person => person.id === Number(payload.responsavel_user_id));
  if (!responsavel) fail('Selecione um responsável ativo da manutenção.');
  return db.transaction(() => {
    const d = demanda(demandaId);
    if (d.status === 'CANCELADA') fail('Uma demanda cancelada não pode ser programada.');
    if (etapa === 'INSTALACAO' && (Number(d.requer_instalacao) !== 1 || d.status !== 'CONCLUIDA')) fail('A instalação exige fabricação concluída e marcada para instalação posterior.');
    if (etapa === 'SERVICO' && d.status === 'CONCLUIDA') fail('Esta demanda já foi concluída. Programe a instalação, quando necessária.');
    const atual = db.prepare('SELECT * FROM pcm_programacao_demandas WHERE demanda_id=? AND etapa=?').get(d.id, etapa);
    const values = { data_programada: data, horario: horario || null, responsavel_user_id: responsavel.id, local_servico: local, preparacao: preparacao || null, horas_estimadas: horas };
    if (atual?.status === 'CONCLUIDA' && etapa === 'INSTALACAO') fail('Esta etapa já foi realizada e não pode ser reprogramada.');
    if (atual && ACTIVE.includes(atual.status) && Object.entries(values).every(([key, value]) => atual[key] === value)) return { ...atual, alterado: false };
    if (atual) {
      if (atual.status === 'EM_ANDAMENTO') fail('Uma etapa em andamento deve ser concluída ou cancelada antes de uma nova programação.');
      db.prepare("UPDATE pcm_programacao_demandas SET data_programada=?,horario=?,responsavel_user_id=?,local_servico=?,preparacao=?,horas_estimadas=?,status='PROGRAMADA',data_realizada=NULL,versao=versao+1,updated_by=?,updated_at=datetime('now') WHERE id=?")
        .run(data, horario || null, responsavel.id, local, preparacao || null, horas, user.id, atual.id);
    } else {
      db.prepare('INSERT INTO pcm_programacao_demandas (demanda_id,etapa,data_programada,horario,responsavel_user_id,local_servico,preparacao,horas_estimadas,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(d.id, etapa, data, horario || null, responsavel.id, local, preparacao || null, horas, user.id, user.id);
    }
    const evento = db.prepare('SELECT * FROM pcm_programacao_demandas WHERE demanda_id=? AND etapa=?').get(d.id, etapa);
    auditar(evento, user.id, atual ? 'Programação atualizada' : 'Programação criada');
    avisar(evento);
    return { ...evento, alterado: true };
  })();
}

function alterarStatus(id, payload, user) {
  manager(user);
  const status = text(payload.status, 20);
  if (!['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'].includes(status)) fail('Situação inválida para a agenda.');
  const dataRealizada = status === 'CONCLUIDA' ? date(payload.data_realizada) : null;
  if (dataRealizada && dataRealizada > dateBr.todayISO()) fail('A data realizada não pode estar no futuro.');
  return db.transaction(() => {
    const atual = getEvento(id);
    if (atual.status === status) return { ...atual, alterado: false };
    if (!ACTIVE.includes(atual.status)) fail('Esta etapa já foi concluída ou cancelada.');
    const origem = demanda(atual.demanda_id);
    if (status !== 'CANCELADA' && (origem.status === 'CANCELADA' || (atual.etapa === 'INSTALACAO' && (origem.status !== 'CONCLUIDA' || !origem.requer_instalacao)))) fail('A demanda não está disponível para execução desta etapa.');
    db.prepare("UPDATE pcm_programacao_demandas SET status=?,data_realizada=?,versao=versao+1,updated_by=?,updated_at=datetime('now') WHERE id=?")
      .run(status, dataRealizada, user.id, atual.id);
    if (['EM_ANDAMENTO', 'CONCLUIDA'].includes(status) && atual.etapa === 'SERVICO') {
      require('../demandas/demandas.service').updateStatus(origem.id, { status, responsavel_user_id: origem.responsavel_user_id || atual.responsavel_user_id, user_id: user.id });
    }
    const evento = getEvento(atual.id); auditar(evento, user.id, 'Situação atualizada'); avisar(evento);
    return { ...evento, alterado: true };
  })();
}

function aoAtualizarStatusDemanda(id, status, userId) {
  if (!ready()) return;
  const rows = db.prepare("SELECT * FROM pcm_programacao_demandas WHERE demanda_id=? AND status IN ('PROGRAMADA','EM_ANDAMENTO')").all(Number(id));
  for (const row of rows) {
    let destino = null;
    if (status === 'CANCELADA' || (row.etapa === 'INSTALACAO' && status !== 'CONCLUIDA')) destino = 'CANCELADA';
    else if (status === 'CONCLUIDA' && row.etapa === 'SERVICO') destino = 'CONCLUIDA';
    if (!destino) continue;
    db.prepare("UPDATE pcm_programacao_demandas SET status=?,data_realizada=?,versao=versao+1,updated_by=?,updated_at=datetime('now') WHERE id=?")
      .run(destino, destino === 'CONCLUIDA' ? dateBr.todayISO() : null, userId || row.updated_by, row.id);
    const evento = getEvento(row.id); auditar(evento, userId || row.updated_by, 'Sincronização com a demanda'); avisar(evento);
  }
}

function listEventos(input, user) {
  if (!canView(user)) fail('Sem acesso à agenda de serviços da reciclagem.', 403);
  if (!ready()) return [];
  const semanaInicio = date(input.semana_inicio || dateBr.todayISO());
  const base = semana(semanaInicio);
  return db.prepare(`SELECT p.*,d.titulo,d.status AS demanda_status,d.prioridade,d.requer_instalacao,
      e.nome AS equipamento,u.name AS responsavel,d.setor_origem
    FROM pcm_programacao_demandas p JOIN demandas d ON d.id=p.demanda_id
    LEFT JOIN equipamentos e ON e.id=d.equipamento_id JOIN users u ON u.id=p.responsavel_user_id
    WHERE p.data_programada BETWEEN ? AND ? ORDER BY p.data_programada,COALESCE(p.horario,'23:59'),p.id`).all(base.semana_inicio, base.semana_fim);
}

function listPendentes(user, busca = '') {
  manager(user);
  if (!ready()) return [];
  const q = `%${text(busca, 120)}%`;
  return db.prepare(`SELECT d.id,d.titulo,d.status,d.prioridade,d.requer_instalacao,d.prazo_previsto,d.setor_origem,e.nome AS equipamento_nome,
      CASE WHEN d.status='CONCLUIDA' THEN 'INSTALACAO' ELSE 'SERVICO' END AS etapa
    FROM demandas d LEFT JOIN equipamentos e ON e.id=d.equipamento_id
    WHERE d.status<>'CANCELADA' AND (d.status<>'CONCLUIDA' OR d.requer_instalacao=1)
      AND (d.titulo LIKE ? OR CAST(d.id AS TEXT) LIKE ? OR COALESCE(e.nome,'') LIKE ?)
      AND NOT EXISTS (SELECT 1 FROM pcm_programacao_demandas p WHERE p.demanda_id=d.id
        AND p.etapa=CASE WHEN d.status='CONCLUIDA' THEN 'INSTALACAO' ELSE 'SERVICO' END AND p.status<>'CANCELADA'
        AND (d.status='CONCLUIDA' OR p.status<>'CONCLUIDA'))
    ORDER BY CASE WHEN d.status='CONCLUIDA' THEN 0 ELSE 1 END,CASE d.prioridade WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 ELSE 2 END,d.id DESC`).all(q, q, q);
}

function historicoDemanda(demandaId) {
  if (!ready()) return [];
  return db.prepare('SELECT p.*,u.name AS responsavel FROM pcm_programacao_demandas p JOIN users u ON u.id=p.responsavel_user_id WHERE p.demanda_id=? ORDER BY p.id').all(Number(demandaId));
}

function marcarInstalacao(id, value, user) {
  manager(user);
  return db.transaction(() => {
    const d = demanda(id);
    const flag = value === '1' ? 1 : 0;
    if (d.status === 'CANCELADA') fail('Demanda cancelada.');
    if (!flag && db.prepare("SELECT 1 FROM pcm_programacao_demandas WHERE demanda_id=? AND etapa='INSTALACAO' AND status<>'CANCELADA'").get(d.id)) fail('Já existe uma instalação vinculada a esta fabricação.');
    if (Number(d.requer_instalacao) === flag) return;
    db.prepare("UPDATE demandas SET requer_instalacao=?,updated_at=datetime('now') WHERE id=?").run(flag, d.id);
    db.prepare('INSERT INTO demanda_logs (demanda_id,user_id,texto) VALUES (?,?,?)').run(d.id, user.id, flag ? 'Fabricação marcada para instalação posterior na agenda do PCM.' : 'Marcação de instalação posterior removida.');
  })();
}

function notificacoes(user) {
  if (!canView(user) || !tableExists('notificacoes') || !ready()) return { total: 0, items: [] };
  const total = db.prepare("SELECT COUNT(*) n FROM notificacoes WHERE user_id=? AND origem_tipo='PCM_AGENDA' AND lida=0").get(user.id).n;
  const items = db.prepare("SELECT n.*,p.data_programada FROM notificacoes n JOIN pcm_programacao_demandas p ON p.id=n.origem_id WHERE n.user_id=? AND n.origem_tipo='PCM_AGENDA' AND n.lida=0 ORDER BY n.id DESC LIMIT 8").all(user.id);
  return { total, items };
}

function marcarLidas(user) {
  if (!canView(user)) fail('Sem permissão.', 403);
  db.prepare("UPDATE notificacoes SET lida=1,lida_em=datetime('now') WHERE user_id=? AND origem_tipo='PCM_AGENDA' AND lida=0").run(user.id);
}

module.exports = { canView, canManage, equipe, semana, programar, alterarStatus, aoAtualizarStatusDemanda, listEventos, listPendentes, historicoDemanda, marcarInstalacao, notificacoes, marcarLidas };
