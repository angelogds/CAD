const db = require('../../database/db');

const NATIVE_LAYERS = [
  { nome: 'Geometria principal', slug: 'geometria_principal', cor_ref: '#0f172a', tipo_linha: 'solida', espessura_ref: 2, ordem: 10 },
  { nome: 'Linhas de centro', slug: 'linhas_de_centro', cor_ref: '#0284c7', tipo_linha: 'centro', espessura_ref: 1, ordem: 20 },
  { nome: 'Cotas', slug: 'cotas', cor_ref: '#166534', tipo_linha: 'cota', espessura_ref: 1, ordem: 30 },
  { nome: 'Textos', slug: 'textos', cor_ref: '#334155', tipo_linha: 'texto', espessura_ref: 1, ordem: 40 },
  { nome: 'Furos', slug: 'furos', cor_ref: '#7c3aed', tipo_linha: 'solida', espessura_ref: 1.5, ordem: 50 },
  { nome: 'Construção', slug: 'construcao', cor_ref: '#64748b', tipo_linha: 'traco', espessura_ref: 1, ordem: 60 },
  { nome: 'Solda', slug: 'solda', cor_ref: '#dc2626', tipo_linha: 'traco', espessura_ref: 1.2, ordem: 70 },
  { nome: 'Observações', slug: 'observacoes', cor_ref: '#92400e', tipo_linha: 'texto', espessura_ref: 1, ordem: 80 },
  { nome: 'Planificação', slug: 'planificacao', cor_ref: '#0891b2', tipo_linha: 'solida', espessura_ref: 1.4, ordem: 90 },
];

function seedDefaultLayers(desenhoId) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO desenho_camadas
    (desenho_id, nome, slug, cor_ref, tipo_linha, espessura_ref, visivel, bloqueado, ordem, criado_em, atualizado_em)
    VALUES (@desenho_id, @nome, @slug, @cor_ref, @tipo_linha, @espessura_ref, 1, 0, @ordem, datetime('now'), datetime('now'))`);
  const run = db.transaction(() => {
    NATIVE_LAYERS.forEach((layer) => stmt.run({ desenho_id: Number(desenhoId), ...layer }));
  });
  run();
}

function list(filters = {}) {
  const where = ['1=1'];
  const params = {};
  if (filters.categoria) { where.push('d.categoria = @categoria'); params.categoria = filters.categoria; }
  if (filters.subtipo) { where.push('d.subtipo = @subtipo'); params.subtipo = filters.subtipo; }
  if (filters.tipo_origem) { where.push('d.tipo_origem = @tipo_origem'); params.tipo_origem = filters.tipo_origem; }
  if (filters.q) { where.push('(d.codigo LIKE @q OR d.titulo LIKE @q)'); params.q = `%${filters.q}%`; }

  return db.prepare(`
    SELECT d.*, e.nome AS equipamento_nome, u.name AS criado_por_nome,
      (SELECT COUNT(*) FROM desenho_arquivos a WHERE a.desenho_id = d.id AND a.tipo_arquivo='PDF') AS total_pdfs,
      (SELECT COUNT(*) FROM desenho_bloco_instancias bi WHERE bi.desenho_id=d.id) AS total_blocos,
      (SELECT COUNT(*) FROM desenho_cotas c WHERE c.desenho_id=d.id) AS total_cotas
    FROM desenhos_tecnicos d
    LEFT JOIN equipamentos e ON e.id = d.equipamento_id
    LEFT JOIN users u ON u.id = d.criado_por
    WHERE ${where.join(' AND ')}
    ORDER BY datetime(d.atualizado_em) DESC
  `).all(params);
}

function getById(id) {
  const row = db.prepare(`
    SELECT d.*, e.nome AS equipamento_nome, u.name AS criado_por_nome
    FROM desenhos_tecnicos d
    LEFT JOIN equipamentos e ON e.id = d.equipamento_id
    LEFT JOIN users u ON u.id = d.criado_por
    WHERE d.id=?
  `).get(Number(id));
  if (!row) return null;
  seedDefaultLayers(row.id);
  return row;
}


function getByCodigo(codigo) {
  return db.prepare('SELECT * FROM desenhos_tecnicos WHERE codigo=? LIMIT 1').get(String(codigo || '').trim());
}

function getByCodigoExcludingId(codigo, id) {
  return db.prepare('SELECT * FROM desenhos_tecnicos WHERE codigo=? AND id<>? LIMIT 1').get(String(codigo || '').trim(), Number(id));
}

function getLastCadCodeLike() {
  // Ordenação numérica correta: extrai o número do código CAD e ordena por ele
  return db.prepare(`
    SELECT codigo FROM desenhos_tecnicos 
    WHERE codigo GLOB 'CAD[0-9]*'
    ORDER BY CAST(SUBSTR(codigo, 4) AS INTEGER) DESC 
    LIMIT 1
  `).get();
}

function getMaxCadNumber() {
  // Retorna o maior número usado em códigos CAD
  const row = db.prepare(`
    SELECT MAX(CAST(SUBSTR(codigo, 4) AS INTEGER)) as max_num 
    FROM desenhos_tecnicos 
    WHERE codigo GLOB 'CAD[0-9]*'
  `).get();
  return row?.max_num || 0;
}

function create(data) {
  const info = db.prepare(`
    INSERT INTO desenhos_tecnicos
    (codigo, titulo, categoria, subtipo, descricao, equipamento_id, status, revisao, material, observacoes, historico_revisao, criado_por, origem_modulo, origem_referencia, origem_integracao_em, tipo_origem, modo_cad_ativo, json_cad, json_3d, criado_em, atualizado_em)
    VALUES (@codigo, @titulo, @categoria, @subtipo, @descricao, @equipamento_id, @status, @revisao, @material, @observacoes, @historico_revisao, @criado_por, @origem_modulo, @origem_referencia, @origem_integracao_em, @tipo_origem, @modo_cad_ativo, @json_cad, @json_3d, datetime('now'), datetime('now'))
  `).run(data);
  const id = Number(info.lastInsertRowid);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Falha ao obter lastInsertRowid na criação do desenho técnico. Valor recebido: ${String(info.lastInsertRowid)}`);
  }
  seedDefaultLayers(id);
  return id;
}

function update(id, data) {
  db.prepare(`
    UPDATE desenhos_tecnicos
    SET codigo=@codigo, titulo=@titulo, categoria=@categoria, subtipo=@subtipo, descricao=@descricao,
        equipamento_id=@equipamento_id, status=@status, revisao=@revisao, material=@material,
        observacoes=@observacoes, historico_revisao=@historico_revisao,
        tipo_origem=@tipo_origem, modo_cad_ativo=@modo_cad_ativo,
        json_cad=@json_cad, json_3d=@json_3d,
        origem_modulo=@origem_modulo, origem_referencia=@origem_referencia, origem_integracao_em=@origem_integracao_em,
        atualizado_em=datetime('now')
    WHERE id=@id
  `).run({ ...data, id: Number(id) });
}

function updateCadMetadata(id, payload = {}) {
  db.prepare(`
    UPDATE desenhos_tecnicos
    SET codigo=@codigo,
        titulo=@titulo,
        material=@material,
        equipamento_id=@equipamento_id,
        observacoes=@observacoes,
        atualizado_em=datetime('now')
    WHERE id=@id
  `).run({
    id: Number(id),
    codigo: payload.codigo,
    titulo: payload.titulo,
    material: payload.material || null,
    equipamento_id: payload.equipamento_id || null,
    observacoes: payload.observacoes || null,
  });
}

function updateCadData(id, payload = {}) {
  db.prepare(`
    UPDATE desenhos_tecnicos
    SET json_cad=@json_cad,
        json_3d=@json_3d,
        modo_cad_ativo=1,
        tipo_origem='cad',
        preview_3d_path=@preview_3d_path,
        atualizado_em=datetime('now')
    WHERE id=@id
  `).run({ id: Number(id), json_cad: payload.json_cad || null, json_3d: payload.json_3d || null, preview_3d_path: payload.preview_3d_path || null });
}

function replaceCadObjects(desenhoId, objetos = []) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM desenho_cad_objetos WHERE desenho_id=?').run(Number(desenhoId));
    const stmt = db.prepare(`INSERT INTO desenho_cad_objetos
      (desenho_id, tipo_objeto, camada, ordem, x, y, x2, y2, largura, altura, raio, angulo, rotacao, espessura, texto, estilo_json, props_json, criado_em, atualizado_em)
      VALUES (@desenho_id, @tipo_objeto, @camada, @ordem, @x, @y, @x2, @y2, @largura, @altura, @raio, @angulo, @rotacao, @espessura, @texto, @estilo_json, @props_json, datetime('now'), datetime('now'))`);
    objetos.forEach((obj, idx) => stmt.run({
      desenho_id: Number(desenhoId),
      tipo_objeto: obj.type || 'objeto',
      camada: obj.layer || 'geometria_principal',
      ordem: idx,
      x: obj.x ?? null,
      y: obj.y ?? null,
      x2: obj.x2 ?? null,
      y2: obj.y2 ?? null,
      largura: obj.width ?? null,
      altura: obj.height ?? null,
      raio: obj.radius ?? null,
      angulo: obj.angle ?? null,
      rotacao: obj.rotation ?? null,
      espessura: obj.thickness ?? null,
      texto: obj.text ?? null,
      estilo_json: JSON.stringify(obj.style || {}),
      props_json: JSON.stringify(obj),
    }));
  });
  tx();
}

function insertCadHistory(desenhoId, acao, payloadJson, criadoPor) {
  db.prepare(`INSERT INTO desenho_cad_historico (desenho_id, acao, payload_json, criado_por, criado_em)
    VALUES (?, ?, ?, ?, datetime('now'))`).run(Number(desenhoId), acao, payloadJson || null, criadoPor || null);
}

function inactivate(id) { db.prepare(`UPDATE desenhos_tecnicos SET status='INATIVO', atualizado_em=datetime('now') WHERE id=?`).run(Number(id)); }
function duplicate(id, novoCodigo, criadoPor) {
  const row = getById(id);
  if (!row) return null;
  const newId = create({
    ...row,
    codigo: novoCodigo,
    titulo: `${row.titulo} (cópia)`,
    revisao: 0,
    status: 'ATIVO',
    historico_revisao: 'Duplicado do desenho #' + row.id,
    criado_por: criadoPor || row.criado_por,
  });
  listBlocoInstancias(id).forEach((inst) => {
    createBlocoInstancia(newId, { ...inst, id: undefined, desenho_id: undefined });
  });
  listCotas(id).forEach((cota) => {
    saveCota(newId, { ...cota, id: undefined, desenho_id: undefined });
  });
  return newId;
}

function saveArquivo(desenhoId, payload) {
  db.prepare(`INSERT INTO desenho_arquivos (desenho_id, tipo_arquivo, svg_source, arquivo_pdf, preview_path, revisao, criado_em)
    VALUES (@desenho_id, @tipo_arquivo, @svg_source, @arquivo_pdf, @preview_path, @revisao, datetime('now'))`).run({ desenho_id: Number(desenhoId), ...payload });
}

function listRevisoes(desenhoId) {
  return db.prepare(`SELECT * FROM desenho_arquivos WHERE desenho_id=? ORDER BY revisao DESC, id DESC`).all(Number(desenhoId));
}

function listBiblioteca(filters = {}) {
  const where = ['1=1'];
  const params = {};
  if (!filters.includeInactive) where.push('ativo = 1');
  if (filters.categoria) { where.push('categoria=@categoria'); params.categoria = filters.categoria; }
  if (filters.subtipo) { where.push('subtipo=@subtipo'); params.subtipo = filters.subtipo; }
  if (filters.q) { where.push('(nome LIKE @q OR descricao LIKE @q)'); params.q = `%${filters.q}%`; }
  return db.prepare(`SELECT * FROM desenho_blocos WHERE ${where.join(' AND ')} ORDER BY atualizado_em DESC`).all(params);
}

function getBlocoById(id) {
  return db.prepare('SELECT * FROM desenho_blocos WHERE id=?').get(Number(id));
}

function createBloco(payload) {
  const info = db.prepare(`INSERT INTO desenho_blocos
    (nome, categoria, subtipo, descricao, definicao_json, origem_desenho_id, ativo, criado_em, atualizado_em)
    VALUES (@nome, @categoria, @subtipo, @descricao, @definicao_json, @origem_desenho_id, @ativo, datetime('now'), datetime('now'))`).run(payload);
  return Number(info.lastInsertRowid);
}

function updateBloco(id, payload) {
  db.prepare(`UPDATE desenho_blocos
    SET nome=@nome, categoria=@categoria, subtipo=@subtipo, descricao=@descricao,
      definicao_json=@definicao_json, ativo=@ativo, atualizado_em=datetime('now')
    WHERE id=@id`).run({ ...payload, id: Number(id) });
}

function duplicateBloco(id) {
  const row = getBlocoById(id);
  if (!row) return null;
  return createBloco({ ...row, nome: `${row.nome} (cópia)`, ativo: 1 });
}

function listCamadas(desenhoId) {
  seedDefaultLayers(desenhoId);
  return db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM desenho_entidades e WHERE e.desenho_id=c.desenho_id AND e.camada=c.slug) AS total_entidades,
      (SELECT COUNT(*) FROM desenho_bloco_instancias bi WHERE bi.desenho_id=c.desenho_id AND bi.camada=c.slug) AS total_blocos
    FROM desenho_camadas c
    WHERE c.desenho_id=?
    ORDER BY c.ordem, c.id
  `).all(Number(desenhoId));
}

function updateCamada(id, payload) {
  db.prepare(`UPDATE desenho_camadas SET nome=@nome, visivel=@visivel, bloqueado=@bloqueado, ordem=@ordem, atualizado_em=datetime('now') WHERE id=@id`)
    .run({ ...payload, id: Number(id) });
}

function createCamada(desenhoId, payload) {
  const info = db.prepare(`INSERT INTO desenho_camadas
    (desenho_id, nome, slug, cor_ref, tipo_linha, espessura_ref, visivel, bloqueado, ordem, criado_em, atualizado_em)
    VALUES (@desenho_id, @nome, @slug, @cor_ref, @tipo_linha, @espessura_ref, @visivel, @bloqueado, @ordem, datetime('now'), datetime('now'))`).run({
    desenho_id: Number(desenhoId),
    visivel: 1,
    bloqueado: 0,
    ...payload,
  });
  return Number(info.lastInsertRowid);
}

function createBlocoInstancia(desenhoId, payload) {
  const info = db.prepare(`INSERT INTO desenho_bloco_instancias
    (desenho_id, bloco_id, nome_instancia, x, y, escala, rotacao, camada, props_override_json, criado_em, atualizado_em)
    VALUES (@desenho_id, @bloco_id, @nome_instancia, @x, @y, @escala, @rotacao, @camada, @props_override_json, datetime('now'), datetime('now'))`).run({
    desenho_id: Number(desenhoId),
    ...payload,
  });
  return Number(info.lastInsertRowid);
}

function listBlocoInstancias(desenhoId) {
  return db.prepare(`SELECT bi.*, b.nome AS bloco_nome, b.definicao_json, b.subtipo FROM desenho_bloco_instancias bi
    INNER JOIN desenho_blocos b ON b.id = bi.bloco_id
    WHERE bi.desenho_id=? ORDER BY bi.id DESC`).all(Number(desenhoId));
}

function saveCota(desenhoId, payload) {
  const info = db.prepare(`INSERT INTO desenho_cotas
    (desenho_id, tipo_cota, entidade_origem_id, camada, x1, y1, x2, y2, x3, y3, valor, texto, unidade, angulo_ref, estilo_json, criado_em)
    VALUES (@desenho_id, @tipo_cota, @entidade_origem_id, @camada, @x1, @y1, @x2, @y2, @x3, @y3, @valor, @texto, @unidade, @angulo_ref, @estilo_json, datetime('now'))`).run({
    desenho_id: Number(desenhoId),
    camada: 'cotas',
    ...payload,
  });
  return Number(info.lastInsertRowid);
}

function listCotas(desenhoId) {
  return db.prepare('SELECT * FROM desenho_cotas WHERE desenho_id=? ORDER BY id DESC').all(Number(desenhoId));
}


function getByOrigem(modulo, referencia) {
  return db.prepare('SELECT * FROM desenhos_tecnicos WHERE origem_modulo=? AND origem_referencia=? ORDER BY id DESC LIMIT 1').get(String(modulo || ''), String(referencia || ''));
}

function listAplicacoesByEquipamento(equipamentoId) {
  return db.prepare(`
    SELECT d.id, d.codigo, d.titulo, d.categoria, d.revisao, d.tipo_origem,
      (SELECT arquivo_pdf FROM desenho_arquivos da WHERE da.desenho_id=d.id AND da.tipo_arquivo='PDF' ORDER BY da.id DESC LIMIT 1) AS arquivo_pdf
    FROM desenho_aplicacoes a
    INNER JOIN desenhos_tecnicos d ON d.id = a.desenho_id
    WHERE a.equipamento_id=?
    ORDER BY d.atualizado_em DESC
  `).all(Number(equipamentoId));
}

function vincularEquipamento(desenhoId, equipamentoId, posicaoAplicacao, observacao) {
  db.prepare(`INSERT INTO desenho_aplicacoes (desenho_id, equipamento_id, posicao_aplicacao, observacao, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`).run(Number(desenhoId), Number(equipamentoId), posicaoAplicacao || null, observacao || null);
  db.prepare(`UPDATE desenhos_tecnicos SET equipamento_id=?, atualizado_em=datetime('now') WHERE id=?`).run(Number(equipamentoId), Number(desenhoId));
}

module.exports = {
  NATIVE_LAYERS,
  list,
  getById,
  getByCodigo,
  getByCodigoExcludingId,
  getLastCadCodeLike,
  getMaxCadNumber,
  create,
  update,
  updateCadMetadata,
  updateCadData,
  replaceCadObjects,
  insertCadHistory,
  inactivate,
  duplicate,
  saveArquivo,
  listRevisoes,
  listBiblioteca,
  getBlocoById,
  createBloco,
  updateBloco,
  duplicateBloco,
  listCamadas,
  updateCamada,
  createCamada,
  createBlocoInstancia,
  listBlocoInstancias,
  saveCota,
  listCotas,
  listAplicacoesByEquipamento,
  vincularEquipamento,
  getByOrigem,
};
