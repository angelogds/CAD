const db = require('../../database/db');
const { canAccessModule, normalizeRole } = require('../../config/rbac');
const pcm = require('../pcm/pcm.service');
const operational = require('../pcm/pcm.operational.service');
const osService = require('../os/os.service');

const RESULTADOS = ['SEM_NECESSIDADE', 'PREVENTIVA', 'CORRETIVA', 'AMBAS'];
const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'];
const canManage = (user) => Boolean(Number(user?.id) && canAccessModule(user?.role, 'pcm_manage'));
const isMechanic = (user) => Boolean(Number(user?.id) && normalizeRole(user?.role) === 'MECANICO');
const necessita = (item, tipo) => item.resultado === tipo || item.resultado === 'AMBAS';

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function requireManager(user) {
  if (!canManage(user)) fail('Somente Admin, Encarregado ou Supervisor de Manutenção pode programar e concluir roteiros.', 403);
}

function dateISO(value) {
  const date = String(value || '').trim();
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    fail('Informe uma data válida.');
  }
  return date;
}

function text(value, max = 4000) {
  if (value != null && typeof value !== 'string') fail('Texto inválido.');
  const result = String(value || '').trim();
  if (result.length > max) fail(`O texto deve ter no máximo ${max} caracteres.`);
  return result;
}

function ids(value) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  if (!list.length || list.length > 150 || list.some((id) => !/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id)))) {
    fail('Selecione de 1 a 150 equipamentos válidos por roteiro.');
  }
  return [...new Set(list.map(Number))];
}

function listMecanicos() {
  const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((row) => row.name));
  return db.prepare(`SELECT u.id,u.name AS nome FROM users u
    WHERE UPPER(COALESCE(u.role,''))='MECANICO'
      ${cols.has('ativo') ? 'AND COALESCE(u.ativo,1)=1' : ''}
      ${cols.has('archived_at') ? 'AND u.archived_at IS NULL' : ''}
      AND EXISTS (SELECT 1 FROM colaboradores c WHERE c.user_id=u.id AND COALESCE(c.ativo,1)=1)
    ORDER BY u.name`).all();
}

function validarMecanico(value) {
  const id = Number(value);
  const user = listMecanicos().find((item) => item.id === id);
  if (!user) fail('Selecione um mecânico ativo cadastrado no sistema.');
  return user;
}

function log(roteiroId, itemId, acao, user, detalhes = {}) {
  db.prepare('INSERT INTO inspecao_roteiro_logs (roteiro_id,item_id,acao,usuario_id,detalhes_json) VALUES (?,?,?,?,?)')
    .run(roteiroId, itemId || null, acao, Number(user.id), JSON.stringify(detalhes));
}

function listRoteiros(user) {
  if (!canManage(user) && !isMechanic(user)) fail('Sem acesso aos roteiros de inspeção.', 403);
  return db.prepare(`
    SELECT r.*,u.name AS responsavel_nome,COUNT(i.id) AS total,
      SUM(CASE WHEN i.inspecionado_em IS NOT NULL THEN 1 ELSE 0 END) AS inspecionados,
      SUM(CASE WHEN (i.resultado IN ('PREVENTIVA','AMBAS') AND i.preventiva_decisao='PENDENTE')
                    OR (i.resultado IN ('CORRETIVA','AMBAS') AND i.corretiva_decisao='PENDENTE') THEN 1 ELSE 0 END) AS pendentes_pcm
    FROM inspecao_roteiros r JOIN users u ON u.id=r.responsavel_user_id
    LEFT JOIN inspecao_roteiro_itens i ON i.roteiro_id=r.id
    ${canManage(user) ? '' : 'WHERE r.responsavel_user_id=?'}
    GROUP BY r.id ORDER BY CASE r.status WHEN 'ENVIADO_PCM' THEN 0 WHEN 'ABERTO' THEN 1 ELSE 2 END,r.data_prevista,r.id DESC
  `).all(...(canManage(user) ? [] : [Number(user.id)]));
}

function getRoteiro(id, user) {
  const roteiro = db.prepare(`SELECT r.*,u.name AS responsavel_nome FROM inspecao_roteiros r JOIN users u ON u.id=r.responsavel_user_id WHERE r.id=?`).get(Number(id));
  if (!roteiro) fail('Roteiro não encontrado.', 404);
  if (!canManage(user) && !(isMechanic(user) && Number(roteiro.responsavel_user_id) === Number(user.id))) {
    fail('Este roteiro pertence a outro mecânico.', 403);
  }
  const eqCols = new Set(db.prepare('PRAGMA table_info(equipamentos)').all().map((row) => row.name));
  const itens = db.prepare(`
    SELECT i.*,e.nome AS equipamento_nome,${eqCols.has('setor') ? 'e.setor' : 'NULL'} AS setor,
      ${eqCols.has('codigo') ? 'e.codigo' : 'NULL'} AS equipamento_codigo,
      up.name AS preventiva_responsavel_nome,uc.name AS corretiva_responsavel_nome
    FROM inspecao_roteiro_itens i JOIN equipamentos e ON e.id=i.equipamento_id
    LEFT JOIN users up ON up.id=i.preventiva_responsavel_id LEFT JOIN users uc ON uc.id=i.corretiva_responsavel_id
    WHERE i.roteiro_id=? ORDER BY setor,e.nome,i.id
  `).all(roteiro.id);
  return { ...roteiro, itens, total: itens.length, inspecionados: itens.filter((item) => item.inspecionado_em).length };
}

function criarRoteiro(payload, user) {
  requireManager(user);
  const titulo = text(payload.titulo, 160);
  if (!titulo) fail('Informe o nome do roteiro.');
  const data = dateISO(payload.data_prevista);
  const mecanico = validarMecanico(payload.responsavel_user_id);
  const equipamentos = ids(payload.equipamento_ids);
  const instrucoes = text(payload.instrucoes);
  return db.transaction(() => {
    const ativos = pcm.listEquipamentosRoteiroBase();
    if (equipamentos.some((id) => !ativos.some((equipamento) => Number(equipamento.id) === id))) fail('O roteiro contém equipamento inválido ou inativo.');
    const result = db.prepare('INSERT INTO inspecao_roteiros (titulo,data_prevista,responsavel_user_id,instrucoes,criado_por) VALUES (?,?,?,?,?)')
      .run(titulo, data, mecanico.id, instrucoes || null, Number(user.id));
    const roteiroId = Number(result.lastInsertRowid);
    const insert = db.prepare('INSERT INTO inspecao_roteiro_itens (roteiro_id,equipamento_id) VALUES (?,?)');
    equipamentos.forEach((id) => insert.run(roteiroId, id));
    log(roteiroId, null, 'ROTEIRO_CRIADO', user, { equipamentos, responsavel_user_id: mecanico.id, data_prevista: data });
    return roteiroId;
  })();
}

function registrarInspecoes(roteiroId, registros, enviar, user) {
  if (!isMechanic(user)) fail('A inspeção deve ser registrada pelo mecânico eleito.', 403);
  if (!Array.isArray(registros) || registros.length > 150) fail('Inspeções inválidas.');
  return db.transaction(() => {
    const roteiro = getRoteiro(roteiroId, user);
    if (roteiro.status !== 'ABERTO') fail('O roteiro já foi enviado ao PCM e está disponível para consulta.', 409);
    const seen = new Set();
    for (const registro of registros) {
      const item = roteiro.itens.find((row) => row.id === Number(registro.id));
      if (!item || seen.has(item.id)) fail('Equipamento não pertence a este roteiro ou está repetido.');
      seen.add(item.id);
      const resultado = text(registro.resultado, 30);
      if (!resultado) continue;
      if (!RESULTADOS.includes(resultado)) fail('Selecione um resultado válido para a inspeção.');
      const preventiva = ['PREVENTIVA', 'AMBAS'].includes(resultado) ? text(registro.orientacao_preventiva) : '';
      const corretiva = ['CORRETIVA', 'AMBAS'].includes(resultado) ? text(registro.orientacao_corretiva) : '';
      if (['PREVENTIVA', 'AMBAS'].includes(resultado) && !preventiva) fail(`Descreva a preventiva indicada para ${item.equipamento_nome}.`);
      if (['CORRETIVA', 'AMBAS'].includes(resultado) && !corretiva) fail(`Descreva a corretiva indicada para ${item.equipamento_nome}.`);
      const prioridade = text(registro.prioridade_sugerida || 'MEDIA', 10);
      if (!PRIORIDADES.includes(prioridade)) fail('Prioridade sugerida inválida.');
      const observacao = text(registro.observacao);
      const mudou = item.resultado !== resultado || (item.orientacao_preventiva || '') !== preventiva
        || (item.orientacao_corretiva || '') !== corretiva || (item.observacao || '') !== observacao || item.prioridade_sugerida !== prioridade;
      if (!mudou) continue;
      db.prepare(`UPDATE inspecao_roteiro_itens SET resultado=?,orientacao_preventiva=?,orientacao_corretiva=?,observacao=?,
        prioridade_sugerida=?,inspecionado_em=datetime('now'),inspecionado_por=? WHERE id=? AND roteiro_id=?`)
        .run(resultado, preventiva || null, corretiva || null, observacao || null, prioridade, Number(user.id), item.id, roteiro.id);
      log(roteiro.id, item.id, 'INSPECAO_REGISTRADA', user, { anterior: item.resultado, resultado, preventiva, corretiva, observacao, prioridade });
    }
    if (enviar) {
      if (getRoteiro(roteiro.id, user).itens.some((item) => !item.inspecionado_em)) fail('Registre a inspeção de todos os equipamentos antes de enviar ao PCM.');
      db.prepare("UPDATE inspecao_roteiros SET status='ENVIADO_PCM',enviado_em=datetime('now') WHERE id=?").run(roteiro.id);
      log(roteiro.id, null, 'ROTEIRO_ENVIADO_PCM', user);
    }
    return getRoteiro(roteiro.id, user);
  })();
}

function analisarNecessidade(roteiroId, itemId, payload, user) {
  requireManager(user);
  const tipo = text(payload.tipo, 15);
  if (!['PREVENTIVA', 'CORRETIVA'].includes(tipo)) fail('Tipo de manutenção inválido.');
  const prefix = tipo.toLowerCase(); // Whitelist acima: nunca usar nomes de coluna recebidos do cliente.
  const decisao = text(payload.decisao, 15);
  if (!['PROGRAMADA', 'DISPENSADA'].includes(decisao)) fail('Decisão do PCM inválida.');
  return db.transaction(() => {
    const roteiro = getRoteiro(roteiroId, user);
    if (roteiro.status !== 'ENVIADO_PCM') fail('A programação depende do envio da inspeção pelo mecânico.', 409);
    const item = roteiro.itens.find((row) => row.id === Number(itemId));
    if (!item || !necessita(item, tipo)) fail('Esta necessidade não foi indicada neste roteiro.');
    if (item[`${prefix}_decisao`] !== 'PENDENTE') return { decisao: item[`${prefix}_decisao`], osId: item[`${prefix}_os_id`], existente: true };
    const parecer = text(payload.parecer);
    if (decisao === 'DISPENSADA') {
      if (!parecer) fail('Justifique por que a manutenção indicada não será programada.');
      db.prepare(`UPDATE inspecao_roteiro_itens SET ${prefix}_decisao='DISPENSADA',${prefix}_parecer=? WHERE id=?`).run(parecer, item.id);
      log(roteiro.id, item.id, `${tipo}_DISPENSADA_PCM`, user, { parecer });
      return { decisao, osId: null };
    }
    const data = dateISO(payload.data_programada);
    const responsavel = validarMecanico(payload.responsavel_user_id);
    const prioridade = text(payload.prioridade || item.prioridade_sugerida, 10);
    if (!PRIORIDADES.includes(prioridade)) fail('Prioridade da programação inválida.');
    const orientacao = item[`orientacao_${prefix}`];
    const osId = osService.createOSAutomatica({
      equipamento_id: item.equipamento_id, tipo, prioridade, opened_by: Number(user.id), origem: 'INSPECAO',
      descricao: `Roteiro de inspeção #${roteiro.id} — ${item.equipamento_nome}\nOrientação do mecânico: ${orientacao}${parecer ? `\nParecer do PCM: ${parecer}` : ''}`,
      metadata: { roteiro_inspecao_id: roteiro.id, roteiro_item_id: item.id, inspecionado_por: item.inspecionado_por },
    });
    operational.scheduleBacklogItem(osId, { data_programada: data, responsavel_user_id: responsavel.id, observacao: parecer }, Number(user.id));
    // A programação guarda o executor futuro. A alocação/início da OS segue
    // o fluxo operacional existente, sem abrir uma execução durante a inspeção.
    db.prepare(`UPDATE inspecao_roteiro_itens SET ${prefix}_decisao='PROGRAMADA',${prefix}_os_id=?,${prefix}_data=?,${prefix}_responsavel_id=?,${prefix}_parecer=? WHERE id=?`)
      .run(osId, data, responsavel.id, parecer || null, item.id);
    log(roteiro.id, item.id, `${tipo}_PROGRAMADA_PCM`, user, { os_id: osId, data_programada: data, responsavel_user_id: responsavel.id, prioridade, parecer });
    return { decisao, osId };
  })();
}

function concluirRoteiro(roteiroId, user) {
  requireManager(user);
  return db.transaction(() => {
    const roteiro = getRoteiro(roteiroId, user);
    if (roteiro.status === 'CONCLUIDO') return false;
    if (roteiro.status !== 'ENVIADO_PCM' || roteiro.itens.some((item) => !item.inspecionado_em)) fail('O mecânico precisa enviar o roteiro completo antes da conclusão.');
    const pendente = roteiro.itens.some((item) => ['PREVENTIVA', 'CORRETIVA'].some((tipo) => necessita(item, tipo) && item[`${tipo.toLowerCase()}_decisao`] === 'PENDENTE'));
    if (pendente) fail('Avalie todas as orientações de preventiva e corretiva antes de concluir o roteiro.');
    db.prepare("UPDATE inspecao_roteiros SET status='CONCLUIDO',concluido_em=datetime('now'),concluido_por=? WHERE id=?").run(Number(user.id), roteiro.id);
    log(roteiro.id, null, 'ROTEIRO_CONCLUIDO', user);
    return true;
  })();
}

module.exports = { canManage, necessita, listMecanicos, listRoteiros, getRoteiro, criarRoteiro, registrarInspecoes, analisarNecessidade, concluirRoteiro };
