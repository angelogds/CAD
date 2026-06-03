const fs = require('fs');
const path = require('path');
const db = require('../../database/db');
const storagePaths = require('../../config/storage');
const aiService = require('../ai/ai.service');
const { generateOrdemServicoPdf } = require('../../utils/pdf/pdfOS');

const SYSTEM_PROMPT_OS_DOCUMENTO = [
  'Você é o assistente técnico oficial da Manutenção Campo do Gado, da empresa Reciclagem Campo do Gado.',
  'Sua função é transformar dados simples de ordens de serviço, relatórios de manutenção, solicitações de materiais e registros técnicos em conteúdo profissional, claro, objetivo e institucional, pronto para ser inserido em um PDF padronizado.',
  'Regras obrigatórias:',
  '- Escreva sempre em português do Brasil.',
  '- Use linguagem técnica, direta e institucional.',
  '- Corrija erros de digitação e organize frases informais.',
  '- Preserve fielmente o sentido das informações fornecidas pelo usuário.',
  '- Não invente dados críticos, como quantidade, data, equipamento, responsável ou materiais.',
  '- Quando faltar informação, preencha com “Não informado” ou “Informação pendente de confirmação”.',
  '- Destaque prioridade, risco operacional e impacto na produção apenas quando houver base nas informações recebidas.',
  '- Organize o conteúdo para documento interno da Manutenção Campo do Gado.',
  '- Não gere HTML.',
  '- Não gere PDF.',
  '- Não use markdown.',
  '- Retorne apenas JSON válido conforme o schema definido pelo sistema.',
  'Padrão institucional:',
  'Empresa: Reciclagem Campo do Gado',
  'Setor: Manutenção Campo do Gado',
  'Assinatura padrão quando aplicável:',
  'Ângelo Gomes da Silva',
  'Encarregado de Manutenção',
  'Reciclagem Campo do Gado',
  'Para Ordem de Serviço, organize o conteúdo com título, subtítulo, identificação, descrição da solicitação, situação atual, serviço solicitado, análise técnica, impacto operacional, materiais, recomendações, pendências, prioridade, observação final, campos de assinatura e legendas de fotos.',
].join('\n');

const DOCUMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'tipo_documento', 'titulo', 'subtitulo', 'identificacao', 'descricao_solicitacao',
    'situacao_atual', 'servico_solicitado', 'analise_tecnica', 'impacto_operacional',
    'materiais_utilizados', 'materiais_necessarios', 'recomendacoes', 'pendencias',
    'observacao_final', 'assinaturas', 'fotos', 'nota_tecnica_fotos'
  ],
  properties: {
    tipo_documento: { type: 'string', enum: ['ordem_servico_manutencao'] },
    titulo: { type: 'string' },
    subtitulo: { type: 'string' },
    identificacao: {
      type: 'object',
      additionalProperties: false,
      required: [
        'numero_os', 'empresa_unidade', 'setor_solicitante', 'setor_destinatario',
        'solicitante', 'responsavel_manutencao', 'equipamento_local', 'tipo_manutencao',
        'data_abertura', 'hora_abertura', 'status', 'prioridade'
      ],
      properties: {
        numero_os: { type: 'string' },
        empresa_unidade: { type: 'string' },
        setor_solicitante: { type: 'string' },
        setor_destinatario: { type: 'string' },
        solicitante: { type: 'string' },
        responsavel_manutencao: { type: 'string' },
        equipamento_local: { type: 'string' },
        tipo_manutencao: { type: 'string' },
        data_abertura: { type: 'string' },
        hora_abertura: { type: 'string' },
        status: { type: 'string' },
        prioridade: { type: 'string' },
      },
    },
    descricao_solicitacao: { type: 'string' },
    situacao_atual: { type: 'string' },
    servico_solicitado: { type: 'string' },
    analise_tecnica: { type: 'string' },
    impacto_operacional: { type: 'string' },
    materiais_utilizados: { type: 'array', items: { type: 'string' } },
    materiais_necessarios: { type: 'array', items: { type: 'string' } },
    recomendacoes: { type: 'array', items: { type: 'string' } },
    pendencias: { type: 'array', items: { type: 'string' } },
    observacao_final: { type: 'string' },
    assinaturas: {
      type: 'object',
      additionalProperties: false,
      required: ['responsavel_manutencao', 'cargo', 'empresa', 'campo_solicitante'],
      properties: {
        responsavel_manutencao: { type: 'string' },
        cargo: { type: 'string' },
        empresa: { type: 'string' },
        campo_solicitante: { type: 'string' },
      },
    },
    fotos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nome_arquivo', 'legenda'],
        properties: {
          nome_arquivo: { type: 'string' },
          legenda: { type: 'string' },
        },
      },
    },
    nota_tecnica_fotos: { type: 'string' },
  },
};

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(String(name || '')); }
  catch (_e) { return false; }
}

function getTableColumns(table) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name); }
  catch (_e) { return []; }
}

function columnExists(table, column) {
  return getTableColumns(table).includes(column);
}

function ensureInstitutionalTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ordem_servico_documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      tipo_documento TEXT NOT NULL DEFAULT 'ordem_servico_manutencao',
      numero_os TEXT NOT NULL,
      conteudo_ia_json TEXT NOT NULL,
      pdf_url TEXT,
      status TEXT NOT NULL DEFAULT 'GERADO',
      criado_por INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (os_id) REFERENCES os(id)
    );
    CREATE TABLE IF NOT EXISTS ordem_servico_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordem_servico_id INTEGER NOT NULL,
      acao TEXT NOT NULL,
      usuario TEXT,
      data_hora TEXT NOT NULL DEFAULT (datetime('now')),
      observacao TEXT
    );
  `);

  if (tableExists('os')) {
    const cols = getTableColumns('os');
    const alters = [];
    if (!cols.includes('conteudo_ia_json')) alters.push('ALTER TABLE os ADD COLUMN conteudo_ia_json TEXT');
    if (!cols.includes('pdf_url')) alters.push('ALTER TABLE os ADD COLUMN pdf_url TEXT');
    if (!cols.includes('setor_solicitante')) alters.push('ALTER TABLE os ADD COLUMN setor_solicitante TEXT');
    if (!cols.includes('setor_destinatario')) alters.push('ALTER TABLE os ADD COLUMN setor_destinatario TEXT');
    if (!cols.includes('responsavel_manutencao')) alters.push('ALTER TABLE os ADD COLUMN responsavel_manutencao TEXT');
    for (const sql of alters) {
      try { db.prepare(sql).run(); } catch (_e) {}
    }
  }
}

function safeText(value, fallback = 'Não informado') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function parseDateTimeParts(value) {
  const text = String(value || '').trim();
  if (!text) return { data: 'Não informado', hora: 'Não informado', isoDate: new Date().toISOString().slice(0, 10) };
  const d = new Date(text.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return { data: text.slice(0, 10) || 'Não informado', hora: 'Não informado', isoDate: new Date().toISOString().slice(0, 10) };
  return {
    data: d.toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
    hora: d.toISOString().slice(11, 16),
    isoDate: d.toISOString().slice(0, 10),
  };
}

function publicPathToAbsolute(pathPublic) {
  const p = String(pathPublic || '').trim();
  if (!p) return null;
  if (path.isAbsolute(p) && fs.existsSync(p)) return p;
  if (p.startsWith('/uploads/')) return path.join(storagePaths.UPLOAD_DIR, p.replace(/^\/uploads\/?/, ''));
  if (p.startsWith('/pdfs/')) return path.join(storagePaths.PDF_DIR, p.replace(/^\/pdfs\/?/, ''));
  return null;
}

function mapFotos(os) {
  return (os?.fotos_abertura || [])
    .filter((foto) => !String(foto?.path || '').toLowerCase().match(/\.mp4|\.mov|\.avi|\.webm$/))
    .map((foto, index) => {
      const publicPath = foto.path || foto.filepath || foto.caminho_arquivo || '';
      return {
        nome_arquivo: path.basename(publicPath || foto.legenda || `foto_${index + 1}`),
        descricao_usuario: foto.legenda || foto.filename || `Foto de abertura ${index + 1}`,
        pathPublic: publicPath,
        absolutePath: publicPathToAbsolute(publicPath),
      };
    });
}

function buildPayloadFromOS(os = {}) {
  const opened = parseDateTimeParts(os.opened_at || os.created_at);
  const materiaisUtilizados = Array.isArray(os.pecas_utilizadas)
    ? os.pecas_utilizadas.map((p) => [p.quantidade, p.peca_descricao].filter(Boolean).join(' - ')).filter(Boolean)
    : [];
  return {
    tipo_documento: 'ordem_servico_manutencao',
    numero_os: `OS-${String(os.id || '').padStart(6, '0')}`,
    data_abertura: opened.data,
    hora_abertura: opened.hora,
    empresa_unidade: 'Reciclagem Campo do Gado',
    setor_solicitante: safeText(os.setor_solicitante),
    setor_destinatario: safeText(os.setor_destinatario, 'Manutenção'),
    solicitante: safeText(os.solicitante_nome || os.opened_by_nome || os.created_by_nome),
    responsavel_manutencao: safeText(os.responsavel_manutencao || os.executor_nome || os.mecanico_nome, 'Ângelo Gomes da Silva'),
    equipamento_local: safeText(os.equipamento_resolvido || os.equipamento_nome || os.equipamento_manual || os.equipamento),
    tipo_manutencao: safeText(os.tipo_manutencao || os.tipo, 'Corretiva'),
    prioridade_informada: safeText(os.prioridade || os.grau || os.severidade, 'Normal'),
    status: safeText(os.status, 'Aberta'),
    descricao_simples: safeText(os.descricao || os.nao_conformidade),
    servico_solicitado: safeText(os.ai_servico_sugerido || os.resumo_tecnico || os.acao_executada, 'Informação pendente de confirmação'),
    situacao_atual: safeText(os.ai_diagnostico_inicial || os.diagnostico || os.causa_diagnostico, 'Informação pendente de confirmação'),
    servicos_executados: safeText(os.ai_descricao_servico_executado || os.acao_executada, 'Não informado'),
    materiais_utilizados: materiaisUtilizados,
    materiais_necessarios: [],
    risco_identificado: safeText(os.ai_risco_operacional || os.ai_observacao_seguranca, 'Informação pendente de confirmação'),
    impacto_operacional: safeText(os.ai_risco_operacional, 'Informação pendente de confirmação'),
    recomendacoes_tecnicas: safeText(os.ai_acao_preventiva_sugerida || os.ai_recomendacao_reincidencia, 'Informação pendente de confirmação'),
    pendencias: [],
    observacoes: safeText(os.observacao_ia || os.ai_justificativa_criticidade, 'Não informado'),
    fotos: mapFotos(os).map(({ nome_arquivo, descricao_usuario }) => ({ nome_arquivo, descricao_usuario })),
  };
}

function buildFallbackDocument(payload = {}) {
  const fotos = (payload.fotos || []).map((foto, index) => ({
    nome_arquivo: safeText(foto.nome_arquivo, `foto_${index + 1}`),
    legenda: `Foto ${index + 1} - ${safeText(foto.descricao_usuario, 'Registro visual relacionado à ordem de serviço')}.`,
  }));
  const prioridade = safeText(payload.prioridade_informada, 'Normal');
  return {
    tipo_documento: 'ordem_servico_manutencao',
    titulo: 'ORDEM DE SERVIÇO DE MANUTENÇÃO',
    subtitulo: `Verificação em ${safeText(payload.equipamento_local).toLowerCase()}`,
    identificacao: {
      numero_os: safeText(payload.numero_os),
      empresa_unidade: 'Reciclagem Campo do Gado',
      setor_solicitante: safeText(payload.setor_solicitante),
      setor_destinatario: safeText(payload.setor_destinatario, 'Manutenção'),
      solicitante: safeText(payload.solicitante),
      responsavel_manutencao: safeText(payload.responsavel_manutencao, 'Ângelo Gomes da Silva'),
      equipamento_local: safeText(payload.equipamento_local),
      tipo_manutencao: safeText(payload.tipo_manutencao, 'Corretiva'),
      data_abertura: safeText(payload.data_abertura),
      hora_abertura: safeText(payload.hora_abertura),
      status: safeText(payload.status, 'Aberta'),
      prioridade,
    },
    descricao_solicitacao: safeText(payload.descricao_simples),
    situacao_atual: safeText(payload.situacao_atual, 'Informação pendente de confirmação'),
    servico_solicitado: safeText(payload.servico_solicitado, 'Informação pendente de confirmação'),
    analise_tecnica: safeText(payload.risco_identificado, 'Análise técnica pendente de inspeção em campo.'),
    impacto_operacional: safeText(payload.impacto_operacional, 'Informação pendente de confirmação'),
    materiais_utilizados: payload.materiais_utilizados || [],
    materiais_necessarios: payload.materiais_necessarios || [],
    recomendacoes: [safeText(payload.recomendacoes_tecnicas, 'Realizar inspeção técnica, registrar evidências e atualizar a OS após a avaliação.')],
    pendencias: payload.pendencias?.length ? payload.pendencias : ['Confirmar informações técnicas após avaliação no local.'],
    observacao_final: 'Ordem de serviço registrada para controle interno da Manutenção Campo do Gado e acompanhamento da intervenção.',
    assinaturas: {
      responsavel_manutencao: safeText(payload.responsavel_manutencao, 'Ângelo Gomes da Silva'),
      cargo: 'Encarregado de Manutenção',
      empresa: 'Reciclagem Campo do Gado',
      campo_solicitante: 'Assinatura do solicitante / setor',
    },
    fotos,
    nota_tecnica_fotos: 'As imagens anexadas servem como registro visual do local ou equipamento relacionado à ordem de serviço, auxiliando no acompanhamento técnico, comprovação da demanda e histórico interno da manutenção.',
  };
}

function validateDocumentJSON(doc) {
  const required = ['tipo_documento', 'titulo', 'subtitulo', 'identificacao', 'descricao_solicitacao', 'situacao_atual', 'servico_solicitado', 'analise_tecnica', 'impacto_operacional', 'materiais_utilizados', 'materiais_necessarios', 'recomendacoes', 'pendencias', 'observacao_final', 'assinaturas', 'fotos'];
  for (const key of required) if (!(key in (doc || {}))) throw new Error(`JSON de documento incompleto: campo ${key} ausente.`);
  if (!Array.isArray(doc.materiais_utilizados)) throw new Error('materiais_utilizados deve ser array.');
  if (!Array.isArray(doc.materiais_necessarios)) throw new Error('materiais_necessarios deve ser array.');
  if (!Array.isArray(doc.recomendacoes)) throw new Error('recomendacoes deve ser array.');
  if (!Array.isArray(doc.pendencias)) throw new Error('pendencias deve ser array.');
  if (!Array.isArray(doc.fotos)) throw new Error('fotos deve ser array.');
  return true;
}

async function generateDocumentContent(payload) {
  try {
    const generated = await aiService.askJSONSchemaStrict({
      systemPrompt: SYSTEM_PROMPT_OS_DOCUMENTO,
      userPayload: payload,
      model: process.env.OPENAI_MODEL_OS_DOCUMENTO || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
      schemaName: 'ordem_servico_manutencao_pdf',
      schema: DOCUMENT_SCHEMA,
      maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS_OS_DOCUMENTO || 1800),
      temperature: 0.1,
    });
    validateDocumentJSON(generated);
    return generated;
  } catch (err) {
    console.warn('[OS_DOCUMENTO][IA_WARN] Gerando PDF com fallback local:', err?.message || err);
    return buildFallbackDocument(payload);
  }
}

function storeGeneratedDocument({ osId, userId, numeroOS, content, pdfUrl, fotos = [] }) {
  ensureInstitutionalTables();
  const json = JSON.stringify(content || {});
  db.prepare(`
    INSERT INTO ordem_servico_documentos (os_id, tipo_documento, numero_os, conteudo_ia_json, pdf_url, criado_por, criado_em, atualizado_em)
    VALUES (?, 'ordem_servico_manutencao', ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(Number(osId), String(numeroOS || `OS-${osId}`), json, pdfUrl || null, userId || null);

  if (tableExists('os')) {
    const sets = [];
    const values = [];
    if (columnExists('os', 'conteudo_ia_json')) { sets.push('conteudo_ia_json = ?'); values.push(json); }
    if (columnExists('os', 'pdf_url')) { sets.push('pdf_url = ?'); values.push(pdfUrl || null); }
    if (sets.length) db.prepare(`UPDATE os SET ${sets.join(', ')} WHERE id = ?`).run(...values, Number(osId));
  }

  try {
    const insertFoto = db.prepare(`
      INSERT INTO ordem_servico_fotos (ordem_servico_id, nome_arquivo, caminho_arquivo, descricao_usuario, legenda_ia, criado_em)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    for (const foto of fotos || []) {
      insertFoto.run(Number(osId), foto.nome_arquivo || null, foto.pathPublic || null, foto.descricao_usuario || null, foto.legenda || null);
    }
  } catch (_e) {}

  try {
    db.prepare(`
      INSERT INTO ordem_servico_historico (ordem_servico_id, acao, usuario, data_hora, observacao)
      VALUES (?, 'PDF_INSTITUCIONAL_GERADO', ?, datetime('now'), ?)
    `).run(Number(osId), userId ? String(userId) : 'sistema', pdfUrl || null);
  } catch (_e) {}
}

async function gerarPDFInstitucionalOS(os, { userId = null } = {}) {
  ensureInstitutionalTables();
  if (!os?.id) throw new Error('OS inválida para geração do PDF institucional.');
  const payload = buildPayloadFromOS(os);
  const content = await generateDocumentContent(payload);
  const fotos = mapFotos(os).map((foto, index) => ({
    ...foto,
    legenda: content.fotos?.[index]?.legenda || `Foto ${index + 1} - Registro visual relacionado à OS.`,
  }));
  const opened = parseDateTimeParts(os.opened_at || os.created_at);
  const numeroLimpo = String(os.id || '').padStart(6, '0');
  const filename = `OS_${numeroLimpo}_Manutencao_Campo_do_Gado_${opened.isoDate}.pdf`;
  const outputDir = path.join(storagePaths.PDF_DIR, 'os');
  fs.mkdirSync(outputDir, { recursive: true });
  const absolutePath = path.join(outputDir, filename);
  const pdfUrl = `/pdfs/os/${filename}`;

  await generateOrdemServicoPdf({ content, fotos, outputPath: absolutePath, issuedAt: new Date() });
  storeGeneratedDocument({ osId: os.id, userId, numeroOS: content.identificacao?.numero_os || `OS-${numeroLimpo}`, content, pdfUrl, fotos });
  return { pdfUrl, absolutePath, filename, content };
}

function getLatestInstitutionalDocument(osId) {
  ensureInstitutionalTables();
  return db.prepare(`
    SELECT * FROM ordem_servico_documentos
    WHERE os_id = ? AND tipo_documento = 'ordem_servico_manutencao'
    ORDER BY id DESC
    LIMIT 1
  `).get(Number(osId)) || null;
}

module.exports = {
  SYSTEM_PROMPT_OS_DOCUMENTO,
  DOCUMENT_SCHEMA,
  ensureInstitutionalTables,
  buildPayloadFromOS,
  buildFallbackDocument,
  validateDocumentJSON,
  gerarPDFInstitucionalOS,
  getLatestInstitutionalDocument,
};
