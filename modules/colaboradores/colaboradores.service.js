const db = require('../../database/db');

function safeNumber(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function listColaboradores(filters = {}) {
  const where = ['c.deleted_at IS NULL'];
  const params = {};

  if (filters.search) {
    where.push('(c.nome LIKE @search OR c.apelido LIKE @search OR c.funcao LIKE @search)');
    params.search = `%${String(filters.search).trim()}%`;
  }

  if (filters.setor) {
    where.push('upper(c.setor) = upper(@setor)');
    params.setor = filters.setor;
  }

  if (filters.status) {
    where.push('upper(c.status) = upper(@status)');
    params.status = filters.status;
  }

  return db.prepare(`
    SELECT c.id, c.nome, c.apelido, c.funcao, c.setor, c.status, c.telefone, c.data_admissao,
           c.foto_url, c.user_id,
           (SELECT COUNT(1) FROM movimentacoes_ferramentas mf
             WHERE mf.colaborador_id=c.id AND mf.deleted_at IS NULL AND mf.status IN ('ativo','pendente','confirmado')) AS ferramentas_ativas,
           (SELECT COUNT(1) FROM entregas_epi ee
             WHERE ee.colaborador_id=c.id AND ee.deleted_at IS NULL AND ee.status IN ('ativo','pendente','confirmado')) AS epis_ativos
    FROM colaboradores c
    WHERE ${where.join(' AND ')}
    ORDER BY c.nome ASC
  `).all(params);
}

function getColaboradorById(id) {
  return db.prepare(`
    SELECT c.*, l.nome AS lider_nome, cd.tipo_sanguineo, cd.contato_emergencia,
           cd.restricao_operacional, cd.observacoes
    FROM colaboradores c
    LEFT JOIN colaboradores l ON l.id = c.lider_id
    LEFT JOIN colaborador_detalhes cd ON cd.colaborador_id = c.id AND cd.deleted_at IS NULL
    WHERE c.id = ? AND c.deleted_at IS NULL
  `).get(Number(id));
}

function upsertDetalhes(colaboradorId, data, actor = {}) {
  db.prepare(`
    INSERT INTO colaborador_detalhes (colaborador_id, tipo_sanguineo, contato_emergencia, restricao_operacional, observacoes, updated_at)
    VALUES (@colaborador_id, @tipo_sanguineo, @contato_emergencia, @restricao_operacional, @observacoes, datetime('now'))
    ON CONFLICT(colaborador_id) DO UPDATE SET
      tipo_sanguineo=excluded.tipo_sanguineo,
      contato_emergencia=excluded.contato_emergencia,
      restricao_operacional=excluded.restricao_operacional,
      observacoes=excluded.observacoes,
      updated_at=datetime('now'),
      deleted_at=NULL,
      deleted_by=NULL
  `).run({
    colaborador_id: Number(colaboradorId),
    tipo_sanguineo: String(data.tipo_sanguineo || '').trim() || null,
    contato_emergencia: String(data.contato_emergencia || '').trim() || null,
    restricao_operacional: String(data.restricao_operacional || '').trim() || null,
    observacoes: String(data.observacoes || '').trim() || null,
  });

  insertLog({ colaboradorId, entidade: 'colaborador_detalhes', acao: 'upsert', detalhe: data, actor });
}

function createOrUpdateColaborador(payload, actor = {}) {
  const data = {
    nome: String(payload.nome || '').trim(),
    apelido: String(payload.apelido || '').trim() || null,
    funcao: String(payload.funcao || 'AUXILIAR').trim().toUpperCase(),
    setor: String(payload.setor || 'MANUTENCAO').trim().toUpperCase(),
    data_admissao: payload.data_admissao || null,
    status: String(payload.status || 'ATIVO').trim().toUpperCase(),
    telefone: String(payload.telefone || '').trim() || null,
    foto_url: String(payload.foto_url || '').trim() || null,
    lider_id: safeNumber(payload.lider_id),
    user_id: safeNumber(payload.user_id),
  };

  if (!data.nome) throw new Error('Nome é obrigatório.');

  if (payload.id) {
    db.prepare(`
      UPDATE colaboradores
      SET nome=@nome, apelido=@apelido, funcao=@funcao, setor=@setor, data_admissao=@data_admissao,
          status=@status, telefone=@telefone, foto_url=@foto_url, lider_id=@lider_id, user_id=@user_id,
          ativo=CASE WHEN upper(@status)='ATIVO' THEN 1 ELSE 0 END, updated_at=datetime('now')
      WHERE id=@id
    `).run({ id: Number(payload.id), ...data });
    insertLog({ colaboradorId: Number(payload.id), entidade: 'colaboradores', acao: 'update', detalhe: data, actor });
    return Number(payload.id);
  }

  const info = db.prepare(`
    INSERT INTO colaboradores (nome, apelido, funcao, setor, data_admissao, status, telefone, foto_url, lider_id, user_id, ativo, created_at, updated_at)
    VALUES (@nome, @apelido, @funcao, @setor, @data_admissao, @status, @telefone, @foto_url, @lider_id, @user_id,
      CASE WHEN upper(@status)='ATIVO' THEN 1 ELSE 0 END, datetime('now'), datetime('now'))
  `).run(data);

  insertLog({ colaboradorId: Number(info.lastInsertRowid), entidade: 'colaboradores', acao: 'create', detalhe: data, actor });
  return Number(info.lastInsertRowid);
}

function ensureFerramenta(payload) {
  const codigo = String(payload.codigo_patrimonio || '').trim();
  if (!codigo) throw new Error('Código de patrimônio é obrigatório.');

  let row = db.prepare('SELECT id FROM ferramentas WHERE codigo_patrimonio=? AND deleted_at IS NULL').get(codigo);
  if (row) return Number(row.id);

  const info = db.prepare(`
    INSERT INTO ferramentas (nome, codigo_patrimonio, categoria, valor, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    String(payload.nome || '').trim() || codigo,
    codigo,
    String(payload.categoria || '').trim() || null,
    safeNumber(payload.valor, 0)
  );
  return Number(info.lastInsertRowid);
}

function lancarFerramental(colaboradorId, payload, actor = {}) {
  const ferramentaId = ensureFerramenta(payload);
  const info = db.prepare(`
    INSERT INTO movimentacoes_ferramentas (colaborador_id, ferramenta_id, tipo, data, status, observacao, responsavel, created_at)
    VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?, datetime('now'))
  `).run(
    Number(colaboradorId),
    ferramentaId,
    String(payload.tipo || 'entrega').trim().toLowerCase(),
    payload.data || null,
    String(payload.status || 'pendente').trim().toLowerCase(),
    String(payload.observacao || '').trim() || null,
    actor.name || payload.responsavel || null
  );

  insertLog({ colaboradorId, entidade: 'movimentacoes_ferramentas', entidadeId: Number(info.lastInsertRowid), acao: 'create', detalhe: payload, actor });
  return Number(info.lastInsertRowid);
}

function ensureEpi(payload) {
  const name = String(payload.nome || '').trim();
  if (!name) throw new Error('Nome do EPI é obrigatório.');

  let row = db.prepare('SELECT id FROM epis WHERE upper(nome)=upper(?) AND IFNULL(ca,"")=IFNULL(?,"") AND deleted_at IS NULL').get(name, String(payload.ca || '').trim() || null);
  if (row) return Number(row.id);

  const info = db.prepare(`
    INSERT INTO epis (nome, ca, validade, categoria, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(name, String(payload.ca || '').trim() || null, payload.validade || null, String(payload.categoria || '').trim() || null);

  return Number(info.lastInsertRowid);
}

function lancarEpi(colaboradorId, payload, actor = {}) {
  const epiId = ensureEpi(payload);
  const info = db.prepare(`
    INSERT INTO entregas_epi (colaborador_id, epi_id, quantidade, data_entrega, validade, status, observacao, created_at)
    VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?, datetime('now'))
  `).run(
    Number(colaboradorId),
    epiId,
    safeNumber(payload.quantidade, 1),
    payload.data_entrega || null,
    payload.validade || null,
    String(payload.status || 'pendente').trim().toLowerCase(),
    String(payload.observacao || '').trim() || null
  );

  insertLog({ colaboradorId, entidade: 'entregas_epi', entidadeId: Number(info.lastInsertRowid), acao: 'create', detalhe: payload, actor });
  return Number(info.lastInsertRowid);
}

function ensureMaterial(payload) {
  const nome = String(payload.nome || '').trim();
  if (!nome) throw new Error('Nome do material é obrigatório.');

  let row = db.prepare('SELECT id FROM materiais WHERE upper(nome)=upper(?) AND deleted_at IS NULL').get(nome);
  if (row) return Number(row.id);

  const info = db.prepare('INSERT INTO materiais (nome, unidade, created_at, updated_at) VALUES (?, ?, datetime(\'now\'), datetime(\'now\'))').run(
    nome,
    String(payload.unidade || 'UN').trim().toUpperCase()
  );

  return Number(info.lastInsertRowid);
}

function lancarRetiradaMaterial(colaboradorId, payload, actor = {}) {
  const destino = String(payload.destino || '').trim();
  if (!destino) throw new Error('Toda retirada deve possuir destino.');

  const materialId = payload.material_id ? Number(payload.material_id) : ensureMaterial(payload);

  const info = db.prepare(`
    INSERT INTO retiradas_materiais
      (colaborador_id, material_id, quantidade, data, destino, equipamento, os_id, autorizado_por, entregue_por, created_at)
    VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    Number(colaboradorId),
    materialId,
    safeNumber(payload.quantidade, 1),
    payload.data || null,
    destino,
    String(payload.equipamento || '').trim() || null,
    safeNumber(payload.os_id),
    String(payload.autorizado_por || actor.name || '').trim() || null,
    String(payload.entregue_por || '').trim() || null
  );

  insertLog({ colaboradorId, entidade: 'retiradas_materiais', entidadeId: Number(info.lastInsertRowid), acao: 'create', detalhe: payload, actor });
  return Number(info.lastInsertRowid);
}

function criarCertificado(colaboradorId, payload, actor = {}) {
  const info = db.prepare(`
    INSERT INTO certificados
      (colaborador_id, tipo, titulo, instituicao, carga_horaria, data_emissao, validade, arquivo_url, status_validacao, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    Number(colaboradorId),
    String(payload.tipo || 'interno').trim().toLowerCase(),
    String(payload.titulo || '').trim(),
    String(payload.instituicao || '').trim() || null,
    safeNumber(payload.carga_horaria),
    payload.data_emissao || null,
    payload.validade || null,
    String(payload.arquivo_url || '').trim() || null,
    String(payload.status_validacao || 'pendente').trim().toLowerCase()
  );

  insertLog({ colaboradorId, entidade: 'certificados', entidadeId: Number(info.lastInsertRowid), acao: 'create', detalhe: payload, actor });
  return Number(info.lastInsertRowid);
}

function validarCertificado(colaboradorId, certId, status, actor = {}) {
  db.prepare(`
    UPDATE certificados
    SET status_validacao=?, validado_por=?, validado_em=datetime('now')
    WHERE id=? AND colaborador_id=? AND deleted_at IS NULL
  `).run(String(status || 'aprovado').trim().toLowerCase(), Number(actor.id || 0) || null, Number(certId), Number(colaboradorId));

  insertLog({ colaboradorId, entidade: 'certificados', entidadeId: Number(certId), acao: `validacao:${status}`, detalhe: {}, actor });
}

function criarDocumento(colaboradorId, payload, actor = {}) {
  const info = db.prepare(`
    INSERT INTO documentos_colaborador (colaborador_id, tipo, arquivo_url, data, created_at)
    VALUES (?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))
  `).run(
    Number(colaboradorId),
    String(payload.tipo || 'termo').trim(),
    String(payload.arquivo_url || '').trim(),
    payload.data || null
  );

  insertLog({ colaboradorId, entidade: 'documentos_colaborador', entidadeId: Number(info.lastInsertRowid), acao: 'create', detalhe: payload, actor });
  return Number(info.lastInsertRowid);
}

function confirmarCiencia(colaboradorId, entidade, entidadeId, actor = {}) {
  const tableMap = {
    movimentacoes_ferramentas: 'movimentacoes_ferramentas',
    entregas_epi: 'entregas_epi',
    documentos_colaborador: 'documentos_colaborador',
  };
  const table = tableMap[entidade];
  if (!table) throw new Error('Entidade inválida para confirmação.');

  if (table === 'documentos_colaborador') {
    db.prepare(`
      UPDATE documentos_colaborador
      SET confirmado_em=datetime('now'), confirmado_por=?
      WHERE id=? AND colaborador_id=? AND deleted_at IS NULL
    `).run(Number(actor.id || 0) || null, Number(entidadeId), Number(colaboradorId));
  } else {
    db.prepare(`
      UPDATE ${table}
      SET status='confirmado', confirmado_em=datetime('now'), confirmado_por=?
      WHERE id=? AND colaborador_id=? AND deleted_at IS NULL
    `).run(Number(actor.id || 0) || null, Number(entidadeId), Number(colaboradorId));
  }

  insertLog({ colaboradorId, entidade: table, entidadeId: Number(entidadeId), acao: 'confirmacao_digital', detalhe: { at: nowIso() }, actor });
}

function changeRegistroStatus(table, id, status, actor = {}, colaboradorId = null) {
  const allowed = ['movimentacoes_ferramentas', 'entregas_epi'];
  if (!allowed.includes(table)) throw new Error('Tabela inválida.');
  db.prepare(`UPDATE ${table} SET status=?, observacao=COALESCE(observacao,''), deleted_at=NULL WHERE id=? AND deleted_at IS NULL`).run(status, Number(id));
  insertLog({ colaboradorId, entidade: table, entidadeId: Number(id), acao: `status:${status}`, detalhe: {}, actor });
}

function softDelete(table, id, actor = {}, colaboradorId = null) {
  db.prepare(`UPDATE ${table} SET deleted_at=datetime('now'), deleted_by=? WHERE id=?`).run(Number(actor.id || 0) || null, Number(id));
  insertLog({ colaboradorId, entidade: table, entidadeId: Number(id), acao: 'soft_delete', detalhe: {}, actor });
}

function getDashboard(id) {
  const colaboradorId = Number(id);
  return {
    episAtivos: db.prepare(`SELECT COUNT(1) AS total FROM entregas_epi WHERE colaborador_id=? AND deleted_at IS NULL AND status IN ('ativo','confirmado','pendente')`).get(colaboradorId).total,
    ferramentasAtivas: db.prepare(`SELECT COUNT(1) AS total FROM movimentacoes_ferramentas WHERE colaborador_id=? AND deleted_at IS NULL AND status IN ('ativo','confirmado','pendente')`).get(colaboradorId).total,
    materiaisMes: db.prepare(`SELECT IFNULL(SUM(quantidade),0) AS total FROM retiradas_materiais WHERE colaborador_id=? AND deleted_at IS NULL AND strftime('%Y-%m', data)=strftime('%Y-%m','now')`).get(colaboradorId).total,
    pendencias: db.prepare(`SELECT
      (SELECT COUNT(1) FROM movimentacoes_ferramentas WHERE colaborador_id=? AND deleted_at IS NULL AND status='pendente') +
      (SELECT COUNT(1) FROM entregas_epi WHERE colaborador_id=? AND deleted_at IS NULL AND status='pendente') +
      (SELECT COUNT(1) FROM certificados WHERE colaborador_id=? AND deleted_at IS NULL AND status_validacao='pendente') AS total`).get(colaboradorId, colaboradorId, colaboradorId).total,
    cursosConcluidos: db.prepare(`SELECT COUNT(1) AS total FROM certificados WHERE colaborador_id=? AND deleted_at IS NULL AND status_validacao='aprovado'`).get(colaboradorId).total,
  };
}

function getTimeline(id) {
  return db.prepare(`
    SELECT created_at, entidade, entidade_id, acao, responsavel_nome, detalhe_json
    FROM colaborador_logs
    WHERE colaborador_id=?
    ORDER BY datetime(created_at) DESC
    LIMIT 120
  `).all(Number(id));
}

function getTabData(id) {
  const colaboradorId = Number(id);
  return {
    ferramental: db.prepare(`
      SELECT mf.*, f.nome AS ferramenta_nome, f.codigo_patrimonio, f.categoria, f.valor
      FROM movimentacoes_ferramentas mf
      JOIN ferramentas f ON f.id = mf.ferramenta_id
      WHERE mf.colaborador_id=? AND mf.deleted_at IS NULL
      ORDER BY datetime(mf.data) DESC, mf.id DESC
    `).all(colaboradorId),
    epis: db.prepare(`
      SELECT ee.*, e.nome AS epi_nome, e.ca, e.categoria
      FROM entregas_epi ee
      JOIN epis e ON e.id = ee.epi_id
      WHERE ee.colaborador_id=? AND ee.deleted_at IS NULL
      ORDER BY date(COALESCE(ee.validade, e.validade)) ASC, ee.id DESC
    `).all(colaboradorId),
    materiais: db.prepare(`
      SELECT rm.*, m.nome AS material_nome, m.unidade
      FROM retiradas_materiais rm
      JOIN materiais m ON m.id = rm.material_id
      WHERE rm.colaborador_id=? AND rm.deleted_at IS NULL
      ORDER BY datetime(rm.data) DESC, rm.id DESC
    `).all(colaboradorId),
    escala: db.prepare(`
      SELECT a.tipo_turno, a.horario_inicio, a.horario_fim, a.observacao, s.semana_numero, s.data_inicio, s.data_fim
      FROM escala_alocacoes a
      JOIN escala_semanas s ON s.id = a.semana_id
      WHERE a.colaborador_id=?
      ORDER BY date(s.data_inicio) DESC
      LIMIT 24
    `).all(colaboradorId),
    cursosInternos: db.prepare(`
      SELECT * FROM certificados
      WHERE colaborador_id=? AND deleted_at IS NULL AND tipo='interno'
      ORDER BY date(data_emissao) DESC
    `).all(colaboradorId),
    certificadosExternos: db.prepare(`
      SELECT * FROM certificados
      WHERE colaborador_id=? AND deleted_at IS NULL AND tipo='externo'
      ORDER BY date(data_emissao) DESC
    `).all(colaboradorId),
    documentos: db.prepare(`
      SELECT * FROM documentos_colaborador
      WHERE colaborador_id=? AND deleted_at IS NULL
      ORDER BY datetime(data) DESC
    `).all(colaboradorId),
  };
}

function getReportData(id) {
  const colaborador = getColaboradorById(id);
  const dashboard = getDashboard(id);
  const tabs = getTabData(id);

  const custoFerramental = db.prepare(`
    SELECT IFNULL(SUM(f.valor),0) AS total
    FROM movimentacoes_ferramentas mf
    JOIN ferramentas f ON f.id = mf.ferramenta_id
    WHERE mf.colaborador_id=? AND mf.deleted_at IS NULL AND mf.status IN ('ativo','confirmado','pendente')
  `).get(Number(id)).total;

  return { colaborador, dashboard, tabs, custoFerramental };
}

function insertLog({ colaboradorId = null, entidade, entidadeId = null, acao, detalhe = {}, actor = {} }) {
  db.prepare(`
    INSERT INTO colaborador_logs (colaborador_id, entidade, entidade_id, acao, detalhe_json, responsavel_id, responsavel_nome, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    colaboradorId ? Number(colaboradorId) : null,
    entidade,
    entidadeId ? Number(entidadeId) : null,
    acao,
    JSON.stringify(detalhe || {}),
    Number(actor.id || 0) || null,
    actor.name || null
  );
}

module.exports = {
  listColaboradores,
  getColaboradorById,
  createOrUpdateColaborador,
  upsertDetalhes,
  lancarFerramental,
  lancarEpi,
  lancarRetiradaMaterial,
  criarCertificado,
  validarCertificado,
  criarDocumento,
  confirmarCiencia,
  changeRegistroStatus,
  softDelete,
  getDashboard,
  getTimeline,
  getTabData,
  getReportData,
};
