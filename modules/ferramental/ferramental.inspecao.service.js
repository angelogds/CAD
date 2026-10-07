const db = require('../../database/db');
const ocorrenciaService = require('./ferramental.ocorrencia.service');

const CHECKLISTS = {
  PADRAO: [
    ['IDENTIFICACAO', 'Identificação interna, patrimônio e QR legíveis'],
    ['ESTRUTURA', 'Estrutura, carcaça, cabos, mangueiras ou corpo sem avarias críticas'],
    ['FIXACOES', 'Parafusos, proteções, empunhaduras e fixações firmes'],
    ['ACIONAMENTO', 'Acionamento, gatilho, chave ou comando operando corretamente'],
    ['SEGURANCA', 'Dispositivos e proteções de segurança presentes e funcionais'],
    ['LIMPEZA', 'Ferramenta limpa e em condição adequada de uso'],
  ],
  ELETRICA: [
    ['IDENTIFICACAO', 'Identificação interna, patrimônio e QR legíveis'],
    ['CABO', 'Cabo de alimentação sem emendas expostas, cortes ou esmagamentos'],
    ['PLUGUE', 'Plugue, pinos e prensa-cabo íntegros'],
    ['CARCACA', 'Carcaça, empunhadura e isolação sem trincas ou partes soltas'],
    ['ACIONAMENTO', 'Interruptor, gatilho e trava operando corretamente'],
    ['PROTECAO', 'Proteções e acessórios de segurança instalados'],
    ['TESTE', 'Teste funcional sem ruído, aquecimento, cheiro ou vibração anormal'],
  ],
  SOLDA: [
    ['IDENTIFICACAO', 'Identificação interna, patrimônio e QR legíveis'],
    ['ALIMENTACAO', 'Cabo de alimentação, plugue e aterramento íntegros'],
    ['CABOS_SOLDA', 'Cabos, conectores, porta-eletrodo/tocha e garra terra íntegros'],
    ['PAINEL', 'Painel, comandos, bornes e ventilação sem danos'],
    ['CARCACA', 'Carcaça e proteções fechadas e firmes'],
    ['TESTE', 'Teste funcional sem aquecimento, ruído ou falha anormal'],
  ],
  ABRASIVA: [
    ['IDENTIFICACAO', 'Identificação interna, patrimônio e QR legíveis'],
    ['CABO', 'Cabo, plugue e prensa-cabo íntegros'],
    ['PROTECAO_DISCO', 'Capa/proteção do disco instalada e firme'],
    ['EMPUNHADURA', 'Empunhadura lateral e corpo sem folgas ou trincas'],
    ['ACIONAMENTO', 'Interruptor e trava operando corretamente'],
    ['EIXO', 'Eixo, flange e porca sem folga ou dano aparente'],
    ['TESTE', 'Teste em vazio sem vibração, ruído ou aquecimento anormal'],
  ],
  MANUAL: [
    ['IDENTIFICACAO', 'Identificação interna, patrimônio e QR legíveis'],
    ['CORPO', 'Corpo da ferramenta sem trincas, deformações ou corrosão crítica'],
    ['CABO_EMPUNHADURA', 'Cabos, empunhaduras e isolação firmes e sem danos'],
    ['FUNCIONALIDADE', 'Articulações, catracas, ajustes e encaixes funcionando'],
    ['DESGASTE', 'Desgaste compatível com uso seguro e sem risco de escorregamento'],
  ],
};

function int(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function isoDate(value) {
  const raw = clean(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(raw + 'T12:00:00Z');
  return Number.isNaN(d.getTime()) ? null : raw;
}

function addDays(dateValue, days) {
  const base = new Date((dateValue || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function assertSchema() {
  const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ferramental_inspecoes'").get();
  if (!row) throw new Error('A estrutura de inspeções do Ferramental V1.4 ainda não foi migrada.');
}

function nextCode() {
  const rows = db.prepare("SELECT codigo FROM ferramental_inspecoes WHERE codigo LIKE 'INSP-FER-%'").all();
  let max = 0;
  for (const row of rows) {
    const n = Number(String(row.codigo || '').replace('INSP-FER-', ''));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `INSP-FER-${String(max + 1).padStart(4, '0')}`;
}


function assertNoOperationalUse(toolId) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ferramental_usos'").get();
  if (!exists) return;
  const active = db.prepare(`
    SELECT u.codigo, usr.name AS usuario_nome
    FROM ferramental_usos u
    JOIN users usr ON usr.id=u.retirado_por_user_id
    WHERE u.ferramenta_id=? AND u.status='EM_USO'
    LIMIT 1
  `).get(int(toolId));
  if (active) {
    throw new Error(`Ferramenta em uso por ${active.usuario_nome} (${active.codigo}). Registre a devolução antes da inspeção.`);
  }
}

function getTool(toolId) {
  return db.prepare('SELECT * FROM ferramental_itens WHERE id=? AND ativo=1 LIMIT 1').get(int(toolId)) || null;
}

function getConfig(toolId) {
  assertSchema();
  return db.prepare(`
    SELECT c.*, f.codigo_interno, f.descricao
    FROM ferramental_inspecao_config c
    JOIN ferramental_itens f ON f.id=c.ferramenta_id
    WHERE c.ferramenta_id=?
    LIMIT 1
  `).get(int(toolId)) || null;
}

function getActiveBlock(toolId) {
  assertSchema();
  return db.prepare(`
    SELECT b.*, u.name AS criado_por_nome, lu.name AS liberado_por_nome
    FROM ferramental_bloqueios b
    LEFT JOIN users u ON u.id=b.created_by
    LEFT JOIN users lu ON lu.id=b.liberado_por_user_id
    WHERE b.ferramenta_id=? AND b.ativo=1
    ORDER BY b.created_at DESC
    LIMIT 1
  `).get(int(toolId)) || null;
}

function assertToolUnblocked(toolId) {
  const block = getActiveBlock(toolId);
  if (block) {
    throw new Error(`Ferramenta bloqueada para uso: ${block.motivo}`);
  }
  return true;
}

function createInspectionItems(inspecaoId, profile) {
  const checklist = CHECKLISTS[profile] || CHECKLISTS.PADRAO;
  const stmt = db.prepare(`
    INSERT INTO ferramental_inspecao_itens
      (inspecao_id,codigo_item,descricao,resultado,ordem)
    VALUES (?,?,?,'PENDENTE',?)
  `);
  checklist.forEach((item, index) => stmt.run(inspecaoId, item[0], item[1], index + 1));
}

function scheduleInspection(toolId, data = {}, actorUserId) {
  assertSchema();
  const tid = int(toolId);
  const actor = int(actorUserId);
  if (!tid || !actor) throw new Error('Ferramenta ou usuário inválido.');
  const tool = getTool(tid);
  if (!tool) throw new Error('Ferramenta não encontrada.');
  if (tool.status === 'BAIXADA') throw new Error('Ferramenta baixada não pode receber nova inspeção.');

  const config = getConfig(tid);
  const profile = clean(data.perfil_checklist, 30).toUpperCase() || config?.perfil_checklist || 'PADRAO';
  if (!CHECKLISTS[profile]) throw new Error('Perfil de checklist inválido.');
  const type = clean(data.tipo, 30).toUpperCase() || 'PERIODICA';
  if (!['PERIODICA','EXTRAORDINARIA','RETORNO_MANUTENCAO'].includes(type)) throw new Error('Tipo de inspeção inválido.');
  const scheduled = isoDate(data.data_programada) || config?.proxima_data || today();

  const existing = db.prepare(`
    SELECT id,codigo FROM ferramental_inspecoes
    WHERE ferramenta_id=? AND status='AGENDADA'
    LIMIT 1
  `).get(tid);
  if (existing) throw new Error(`Já existe a inspeção ${existing.codigo} agendada para esta ferramenta.`);

  return db.transaction(() => {
    const code = nextCode();
    const result = db.prepare(`
      INSERT INTO ferramental_inspecoes (
        codigo,ferramenta_id,tipo,status,data_programada,perfil_checklist,created_by,observacao
      ) VALUES (?,?,?,'AGENDADA',?,?,?,?)
    `).run(
      code, tid, type, scheduled, profile, actor, clean(data.observacao, 1000) || null
    );
    createInspectionItems(result.lastInsertRowid, profile);
    return Number(result.lastInsertRowid);
  })();
}

function configure(toolId, data = {}, actorUserId) {
  assertSchema();
  const tid = int(toolId);
  const actor = int(actorUserId);
  const tool = getTool(tid);
  if (!tool) throw new Error('Ferramenta não encontrada.');

  const periodicity = Number(data.periodicidade_dias);
  const alertDays = Number(data.alerta_dias);
  const profile = clean(data.perfil_checklist, 30).toUpperCase() || 'PADRAO';
  if (!Number.isInteger(periodicity) || periodicity < 1 || periodicity > 3650) throw new Error('Periodicidade inválida.');
  if (!Number.isInteger(alertDays) || alertDays < 0 || alertDays > 365) throw new Error('Antecedência de alerta inválida.');
  if (!CHECKLISTS[profile]) throw new Error('Perfil de checklist inválido.');

  const nextDate = isoDate(data.proxima_data) || addDays(today(), periodicity);
  const required = data.obrigatoria === '0' || data.obrigatoria === 0 ? 0 : 1;

  db.prepare(`
    INSERT INTO ferramental_inspecao_config (
      ferramenta_id,obrigatoria,periodicidade_dias,alerta_dias,perfil_checklist,
      proxima_data,ativo,updated_by
    ) VALUES (?,?,?,?,?,?,1,?)
    ON CONFLICT(ferramenta_id) DO UPDATE SET
      obrigatoria=excluded.obrigatoria,
      periodicidade_dias=excluded.periodicidade_dias,
      alerta_dias=excluded.alerta_dias,
      perfil_checklist=excluded.perfil_checklist,
      proxima_data=excluded.proxima_data,
      ativo=1,
      updated_by=excluded.updated_by,
      updated_at=datetime('now')
  `).run(tid, required, periodicity, alertDays, profile, nextDate, actor);

  const scheduled = db.prepare(`
    SELECT id,perfil_checklist FROM ferramental_inspecoes
    WHERE ferramenta_id=? AND status='AGENDADA'
    LIMIT 1
  `).get(tid);
  if (required && scheduled) {
    db.transaction(() => {
      db.prepare(`
        UPDATE ferramental_inspecoes
        SET data_programada=?, perfil_checklist=?, updated_at=datetime('now')
        WHERE id=? AND status='AGENDADA'
      `).run(nextDate, profile, scheduled.id);
      if (scheduled.perfil_checklist !== profile) {
        db.prepare('DELETE FROM ferramental_inspecao_itens WHERE inspecao_id=?').run(scheduled.id);
        createInspectionItems(scheduled.id, profile);
      }
    })();
  } else if (required && !scheduled) {
    scheduleInspection(tid, {
      tipo: 'PERIODICA',
      data_programada: nextDate,
      perfil_checklist: profile,
      observacao: 'Inspeção criada automaticamente pelo plano periódico V1.4.',
    }, actor);
  }
  return tid;
}

function inspectionDetail(inspectionId) {
  assertSchema();
  const id = int(inspectionId);
  if (!id) return null;
  const inspection = db.prepare(`
    SELECT i.*, f.codigo_interno, f.descricao, f.status AS ferramenta_status,
           f.condicao AS ferramenta_condicao, f.numero_serie, f.patrimonio,
           u.name AS executada_por_nome
    FROM ferramental_inspecoes i
    JOIN ferramental_itens f ON f.id=i.ferramenta_id
    LEFT JOIN users u ON u.id=i.executada_por_user_id
    WHERE i.id=?
    LIMIT 1
  `).get(id);
  if (!inspection) return null;
  const items = db.prepare(`
    SELECT *
    FROM ferramental_inspecao_itens
    WHERE inspecao_id=?
    ORDER BY ordem,id
  `).all(id);
  return { inspection, items, block: getActiveBlock(inspection.ferramenta_id) };
}

function createInspectionBlock(toolId, inspectionId, actor, reason) {
  const current = getActiveBlock(toolId);
  if (current && current.origem_tipo === 'INSPECAO') {
    db.prepare(`
      UPDATE ferramental_bloqueios
      SET origem_id=?, motivo=?, created_by=?, created_at=datetime('now')
      WHERE id=?
    `).run(inspectionId, reason, actor, current.id);
    return current.id;
  }
  const result = db.prepare(`
    INSERT INTO ferramental_bloqueios
      (ferramenta_id,origem_tipo,origem_id,motivo,ativo,created_by)
    VALUES (?,'INSPECAO',?,?,1,?)
  `).run(toolId, inspectionId, reason, actor);
  return Number(result.lastInsertRowid);
}

function releaseInspectionBlock(toolId, actor, note) {
  db.prepare(`
    UPDATE ferramental_bloqueios
    SET ativo=0, liberado_por_user_id=?, liberado_em=datetime('now'),
        liberacao_observacao=?
    WHERE ferramenta_id=? AND ativo=1 AND origem_tipo='INSPECAO'
  `).run(actor, clean(note, 1000) || 'Liberada após inspeção aprovada.', toolId);
}

function ensureMaintenanceOccurrence(toolId, inspectionCode, actor, observation) {
  const active = db.prepare(`
    SELECT id FROM ferramental_ocorrencias
    WHERE ferramenta_id=? AND status IN ('ABERTA','EM_ANALISE','EM_ACOMPANHAMENTO')
    LIMIT 1
  `).get(toolId);
  if (active) return active.id;
  return ocorrenciaService.createPcmOccurrence(actor, toolId, {
    tipo: 'MANUTENCAO',
    descricao: `Inspeção ${inspectionCode} reprovada. ${clean(observation, 700) || 'Ferramenta bloqueada até tratamento pelo PCM.'}`,
  });
}

function executeInspection(inspectionId, data = {}, actorUserId) {
  assertSchema();
  const actor = int(actorUserId);
  const detail = inspectionDetail(inspectionId);
  if (!detail || !actor) throw new Error('Inspeção inválida.');
  if (detail.inspection.status !== 'AGENDADA') throw new Error('Esta inspeção já foi concluída.');
  assertNoOperationalUse(detail.inspection.ferramenta_id);

  const result = clean(data.resultado_final, 40).toUpperCase();
  if (!['APROVADA','APROVADA_RESTRICAO','REPROVADA'].includes(result)) {
    throw new Error('Informe o resultado final da inspeção.');
  }

  const answers = [];
  let nonCompliant = 0;
  for (const item of detail.items) {
    const value = clean(data[`item_${item.id}`], 30).toUpperCase();
    if (!['OK','NAO_CONFORME','NAO_APLICAVEL'].includes(value)) {
      throw new Error('Preencha todos os itens do checklist.');
    }
    if (value === 'NAO_CONFORME') nonCompliant += 1;
    answers.push({
      id: item.id,
      result: value,
      observation: clean(data[`obs_${item.id}`], 500) || null,
    });
  }
  if (nonCompliant && result === 'APROVADA') {
    throw new Error('Existem itens não conformes. Use aprovação com restrição ou reprovação.');
  }
  const observation = clean(data.observacao, 1000);
  if ((result === 'APROVADA_RESTRICAO' || result === 'REPROVADA') && !observation) {
    throw new Error('Descreva a restrição ou motivo da reprovação.');
  }

  const config = getConfig(detail.inspection.ferramenta_id);
  const validity = result === 'REPROVADA'
    ? null
    : addDays(today(), config?.periodicidade_dias || 30);

  return db.transaction(() => {
    const updateItem = db.prepare(`
      UPDATE ferramental_inspecao_itens
      SET resultado=?, observacao=?
      WHERE id=? AND inspecao_id=?
    `);
    answers.forEach((answer) => updateItem.run(answer.result, answer.observation, answer.id, detail.inspection.id));

    db.prepare(`
      UPDATE ferramental_inspecoes
      SET status=?, validade_ate=?, executada_por_user_id=?,
          observacao=?, executed_at=datetime('now'), updated_at=datetime('now')
      WHERE id=?
    `).run(result, validity, actor, observation || null, detail.inspection.id);

    if (result === 'REPROVADA') {
      const reason = `${detail.inspection.codigo} reprovada${observation ? ': ' + observation : ''}`;
      createInspectionBlock(detail.inspection.ferramenta_id, detail.inspection.id, actor, reason);
      ensureMaintenanceOccurrence(detail.inspection.ferramenta_id, detail.inspection.codigo, actor, observation);
    } else {
      releaseInspectionBlock(detail.inspection.ferramenta_id, actor, `${detail.inspection.codigo} ${result}`);
    }

    if (config?.ativo && config?.obrigatoria) {
      const nextDate = addDays(today(), config.periodicidade_dias);
      db.prepare(`
        UPDATE ferramental_inspecao_config
        SET proxima_data=?, updated_by=?, updated_at=datetime('now')
        WHERE ferramenta_id=?
      `).run(nextDate, actor, detail.inspection.ferramenta_id);

      const pending = db.prepare(`
        SELECT id FROM ferramental_inspecoes
        WHERE ferramenta_id=? AND status='AGENDADA'
        LIMIT 1
      `).get(detail.inspection.ferramenta_id);
      if (!pending && result !== 'REPROVADA') {
        scheduleInspection(detail.inspection.ferramenta_id, {
          tipo: 'PERIODICA',
          data_programada: nextDate,
          perfil_checklist: config.perfil_checklist,
          observacao: 'Próxima inspeção periódica gerada automaticamente pela V1.4.',
        }, actor);
      }
    }

    db.prepare(`
      INSERT INTO ferramental_movimentacoes (
        ferramenta_id,tipo,actor_user_id,observacao
      ) VALUES (?,?,?,?)
    `).run(
      detail.inspection.ferramenta_id,
      result === 'REPROVADA' ? 'INSPECAO_REPROVADA' : 'INSPECAO_APROVADA',
      actor,
      `${detail.inspection.codigo} • ${result}${observation ? ' • ' + observation : ''}`
    );

    return detail.inspection.id;
  })();
}

function releaseBlock(toolId, actorUserId, observation) {
  assertSchema();
  const tid = int(toolId);
  const actor = int(actorUserId);
  const note = clean(observation, 1000);
  const block = getActiveBlock(tid);
  if (!block) throw new Error('A ferramenta não possui bloqueio ativo.');
  if (!note) throw new Error('Informe o motivo técnico da liberação.');
  db.prepare(`
    UPDATE ferramental_bloqueios
    SET ativo=0, liberado_por_user_id=?, liberado_em=datetime('now'),
        liberacao_observacao=?
    WHERE id=? AND ativo=1
  `).run(actor, note, block.id);
  db.prepare(`
    INSERT INTO ferramental_movimentacoes
      (ferramenta_id,tipo,actor_user_id,observacao)
    VALUES (?,'BLOQUEIO_LIBERADO',?,?)
  `).run(tid, actor, note);
}

function toolInspectionStatus(toolId) {
  assertSchema();
  const tid = int(toolId);
  const config = getConfig(tid);
  const block = getActiveBlock(tid);
  const last = db.prepare(`
    SELECT *
    FROM ferramental_inspecoes
    WHERE ferramenta_id=? AND status<>'AGENDADA' AND status<>'CANCELADA'
    ORDER BY COALESCE(executed_at,created_at) DESC,id DESC
    LIMIT 1
  `).get(tid) || null;
  const next = db.prepare(`
    SELECT *
    FROM ferramental_inspecoes
    WHERE ferramenta_id=? AND status='AGENDADA'
    ORDER BY data_programada,id
    LIMIT 1
  `).get(tid) || null;

  let situation = 'SEM_PLANO';
  if (block) situation = 'BLOQUEADA';
  else if (next) {
    if (next.data_programada < today()) situation = 'VENCIDA';
    else if (config && next.data_programada <= addDays(today(), config.alerta_dias)) situation = 'A_VENCER';
    else situation = 'EM_DIA';
  } else if (config?.obrigatoria) {
    situation = config.proxima_data && config.proxima_data < today() ? 'VENCIDA' : 'SEM_AGENDAMENTO';
  }
  return { config, block, last, next, situation };
}

function dashboard() {
  assertSchema();
  const tools = db.prepare(`
    SELECT f.id,f.codigo_interno,f.descricao,f.status,f.condicao,
           c.proxima_data,c.periodicidade_dias,c.alerta_dias,c.perfil_checklist,c.obrigatoria
    FROM ferramental_itens f
    LEFT JOIN ferramental_inspecao_config c ON c.ferramenta_id=f.id AND c.ativo=1
    WHERE f.ativo=1
    ORDER BY f.descricao COLLATE NOCASE
  `).all().map((tool) => ({ ...tool, inspecao: toolInspectionStatus(tool.id) }));

  const scheduled = db.prepare(`
    SELECT i.*, f.codigo_interno, f.descricao
    FROM ferramental_inspecoes i
    JOIN ferramental_itens f ON f.id=i.ferramenta_id
    WHERE i.status='AGENDADA'
    ORDER BY i.data_programada, f.descricao COLLATE NOCASE
    LIMIT 100
  `).all();

  const recent = db.prepare(`
    SELECT i.*, f.codigo_interno, f.descricao, u.name AS executada_por_nome
    FROM ferramental_inspecoes i
    JOIN ferramental_itens f ON f.id=i.ferramenta_id
    LEFT JOIN users u ON u.id=i.executada_por_user_id
    WHERE i.status<>'AGENDADA'
    ORDER BY COALESCE(i.executed_at,i.created_at) DESC
    LIMIT 30
  `).all();

  const resumo = {
    configuradas: tools.filter((t) => t.inspecao.config?.ativo).length,
    aVencer: tools.filter((t) => t.inspecao.situation === 'A_VENCER').length,
    vencidas: tools.filter((t) => t.inspecao.situation === 'VENCIDA').length,
    bloqueadas: tools.filter((t) => t.inspecao.situation === 'BLOQUEADA').length,
  };
  return { tools, scheduled, recent, resumo, profiles: Object.keys(CHECKLISTS) };
}

function ownStatus(userId) {
  assertSchema();
  const uid = int(userId);
  if (!uid) return [];
  const tools = db.prepare(`
    SELECT DISTINCT f.id,f.codigo_interno,f.descricao
    FROM ferramental_equipe_membros m
    JOIN ferramental_custodias c ON c.equipe_id=m.equipe_id AND c.ativo=1
    JOIN ferramental_itens f ON f.id=c.ferramenta_id AND f.ativo=1
    WHERE m.user_id=?
    ORDER BY f.descricao COLLATE NOCASE
  `).all(uid);
  return tools.map((tool) => ({ ...tool, inspecao: toolInspectionStatus(tool.id) }));
}

module.exports = {
  CHECKLISTS,
  configure,
  scheduleInspection,
  inspectionDetail,
  executeInspection,
  getConfig,
  getActiveBlock,
  assertToolUnblocked,
  releaseBlock,
  toolInspectionStatus,
  dashboard,
  ownStatus,
};
