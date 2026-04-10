const db = require('../../database/db');
const {
  askText,
  getAIConfig,
  gerarDiagnosticoOS,
  melhorarDescricaoOperador,
  sugerirPecasPorFalha,
  normalizeStructuredAIResponse,
  semanticSearch,
  chatbotContextual,
  generateExecutiveReport,
  getEquipmentRecommendations,
  getEquipmentHealth,
  testOpenAIConnection,
  getStatus,
  clearCache,
} = require('./ai.service');
const embeddingsService = require('./ai.embeddings.service');
const visionService = require('./ai.vision.service');
const prompts = require('./ai.prompts');

const GRAXARIA_SYSTEM_PROMPT = `Você é o Técnico IA da Manutenção do Campo do Gado, especialista em reciclagem animal (graxaria).
Fale de forma direta, prática e técnica, como um encarregado de manutenção experiente.
Use linguagem simples, evite enrolação e sempre foque em segurança, qualidade e redução de parada.

Sempre responda em português do Brasil.`;

function tableExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(String(name || ''));
  } catch (_e) {
    return false;
  }
}

function normalizeContext(value) {
  const allowed = ['geral', 'os', 'equipamento', 'preventiva', 'academia'];
  const ctx = String(value || 'geral').toLowerCase();
  return allowed.includes(ctx) ? ctx : 'geral';
}

function toFriendlyError(err) {
  const code = String(err?.code || 'AI_ERROR');
  if (code === 'AI_DISABLED') return { code, message: 'IA desativada neste ambiente. Fale com o administrador.' };
  if (code === 'AI_KEY_MISSING') return { code, message: 'IA ainda não configurada no servidor.' };
  if (code === 'AI_TIMEOUT') return { code, message: 'A IA demorou para responder. Tente novamente.' };
  if (code === 'AI_EMPTY_RESPONSE') return { code, message: 'A IA não retornou conteúdo útil. Tente reformular.' };
  return { code, message: 'Não foi possível consultar a IA agora.' };
}

function getOSContext(osId) {
  return db.prepare(`
    SELECT o.id, o.descricao, o.tipo, o.status, o.grau, o.prioridade, o.sintoma_principal,
           o.setor, o.resumo_tecnico, o.causa_diagnostico, o.opened_at,
           e.id AS equipamento_id, e.nome AS equipamento_nome, e.tipo AS equipamento_tipo, e.setor AS equipamento_setor
    FROM os o
    LEFT JOIN equipamentos e ON e.id = o.equipamento_id
    WHERE o.id = ?
    LIMIT 1
  `).get(Number(osId));
}

function getOSHistory(equipamentoId, limit = 5) {
  if (!equipamentoId) return [];
  return db.prepare(`
    SELECT id, descricao, status, resumo_tecnico, causa_diagnostico, opened_at, closed_at
    FROM os
    WHERE equipamento_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(Number(equipamentoId), Number(limit));
}

function getPreventivaContext(planoId) {
  return db.prepare(`
    SELECT p.*, e.nome AS equipamento_nome, e.tipo AS equipamento_tipo, e.setor AS equipamento_setor
    FROM preventiva_planos p
    LEFT JOIN equipamentos e ON e.id = p.equipamento_id
    WHERE p.id = ?
    LIMIT 1
  `).get(Number(planoId));
}

function getPreventivaHistory(planoId, limit = 6) {
  return db.prepare(`
    SELECT id, data_prevista, data_executada, status, responsavel, observacao
    FROM preventiva_execucoes
    WHERE plano_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(Number(planoId), Number(limit));
}

function getEquipamentoContext(equipamentoId) {
  if (!equipamentoId) return null;
  return db.prepare(`
    SELECT id, nome, setor, tipo
    FROM equipamentos
    WHERE id = ?
    LIMIT 1
  `).get(Number(equipamentoId));
}

function buildGeneralContext({ equipamentoId, osId }) {
  let contextoExtra = '';

  const equipamento = getEquipamentoContext(equipamentoId);
  if (equipamento) {
    contextoExtra += `Equipamento: ${equipamento.nome} (${equipamento.setor} - ${equipamento.tipo})\n`;
  }

  const os = getOSContext(osId);
  if (os) {
    contextoExtra += `OS #${os.id}: ${os.descricao || 'Sem descrição'} (${os.status || 'sem status'})\n`;
  }

  return contextoExtra.trim();
}

function renderChat(req, res) {
  const cfg = getAIConfig();
  return res.render('ai/chat', {
    layout: 'layout',
    title: 'Assistente IA',
    activeMenu: 'ai',
    aiConfigured: cfg.enabled && !!cfg.apiKey,
    aiEnabled: cfg.enabled,
  });
}

async function askGeneral(req, res) {
  const pergunta = String(req.body?.pergunta || '').trim();
  const contexto = normalizeContext(req.body?.contexto);
  const equipamentoId = Number(req.body?.equipamento_id) || null;
  const osId = Number(req.body?.os_id) || null;

  if (!pergunta) return res.status(400).json({ ok: false, error: 'Informe uma pergunta.' });

  try {
    const contextoExtra = buildGeneralContext({
      equipamentoId,
      osId,
    });

    const result = await askText({
      systemPrompt: `${GRAXARIA_SYSTEM_PROMPT}\n\n${prompts.buildAssistentePrompt(contexto)}`,
      userPayload: {
        pergunta,
        contexto,
        contexto_extra: contextoExtra || null,
      },
    });

    return res.json({ ok: true, resposta: result.text });
  } catch (err) {
    const friendly = toFriendlyError(err);
    console.warn('[ai.askGeneral]', { code: friendly.code, technical: err?.technical || err?.message });
    return res.status(503).json({ ok: false, error: friendly.message, code: friendly.code });
  }
}

async function analyzeOS(req, res) {
  const osId = Number(req.params.id);
  const action = String(req.body?.action || 'analisar').trim();
  const os = getOSContext(osId);
  if (!os) return res.status(404).json({ ok: false, error: 'OS não encontrada.' });

  try {
    const result = await askText({
      systemPrompt: prompts.buildOSPrompt(action),
      userPayload: {
        action,
        os,
        historico_basico: getOSHistory(os.equipamento_id, 5),
      },
    });
    return res.json({ ok: true, resposta: result.text });
  } catch (err) {
    const friendly = toFriendlyError(err);
    console.warn('[ai.analyzeOS]', { osId, code: friendly.code, technical: err?.technical || err?.message });
    return res.status(503).json({ ok: false, error: friendly.message, code: friendly.code });
  }
}

async function analyzePreventiva(req, res) {
  const planoId = Number(req.params.id);
  const action = String(req.body?.action || 'perguntar').trim();
  const pergunta = String(req.body?.pergunta || '').trim();
  const plano = getPreventivaContext(planoId);
  if (!plano) return res.status(404).json({ ok: false, error: 'Plano preventivo não encontrado.' });

  try {
    const result = await askText({
      systemPrompt: prompts.buildPreventivaPrompt(action),
      userPayload: {
        action,
        pergunta: pergunta || null,
        preventiva: plano,
        historico_basico: getPreventivaHistory(planoId, 6),
      },
    });
    return res.json({ ok: true, resposta: result.text });
  } catch (err) {
    const friendly = toFriendlyError(err);
    console.warn('[ai.analyzePreventiva]', { planoId, code: friendly.code, technical: err?.technical || err?.message });
    return res.status(503).json({ ok: false, error: friendly.message, code: friendly.code });
  }
}



async function diagnosticarOS(req, res) {
  try {
    const payload = req.body || {};
    const diagnostico = await gerarDiagnosticoOS(payload);
    const similares = await embeddingsService.buscarOSSimilares({
      equipamentoId: Number(payload.equipamento_id || 0) || null,
      texto: [payload.descricao, payload.sintoma_principal].filter(Boolean).join(' '),
      limit: 5,
    });
    const pecas = await sugerirPecasPorFalha({ ...payload, diagnostico, similares });
    return res.json({ ok: true, ...diagnostico, pecas_sugeridas: pecas, os_similares: similares });
  } catch (err) {
    const friendly = toFriendlyError(err);
    return res.status(503).json({ ok: false, error: friendly.message, code: friendly.code });
  }
}

async function melhorarDescricaoOS(req, res) {
  try {
    const texto = String(req.body?.texto || req.body?.descricao || '').trim();
    if (texto.length < 5) return res.status(400).json({ ok: false, error: 'Texto insuficiente para melhoria.' });
    const result = await melhorarDescricaoOperador(texto, req.body?.contexto || {});
    return res.json({ ok: true, ...result });
  } catch (err) {
    const friendly = toFriendlyError(err);
    return res.status(503).json({ ok: false, error: friendly.message, code: friendly.code });
  }
}

async function analisarImagemOS(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ ok: false, error: 'Envie uma imagem.' });
  const result = await visionService.analisarImagemFalha({
    fileBuffer: file.buffer,
    mimeType: file.mimetype,
    fileName: file.originalname,
  });
  return res.json({ ok: true, ...result });
}

async function status(req, res) {
  return res.json({ ok: true, status: getStatus() });
}

async function testConnection(req, res) {
  const result = await testOpenAIConnection();
  if (!result.ok && !result.skipped) return res.status(503).json({ ok: false, ...result });
  return res.json({ ok: true, ...result });
}

async function clearAICache(req, res) {
  return res.json(clearCache());
}

async function chatbotMessage(req, res) {
  const message = String(req.body?.message || req.body?.mensagem || '').trim();
  if (!message) return res.status(400).json({ ok: false, error: 'Informe a mensagem.' });
  try {
    const data = await chatbotContextual({
      message,
      context: req.body?.context || {},
      conversationId: req.body?.conversation_id || null,
      userId: req.session?.user?.id || null,
    });
    return res.json({ ok: true, ...data });
  } catch (err) {
    const friendly = toFriendlyError(err);
    return res.status(503).json({ ok: false, error: friendly.message, code: friendly.code });
  }
}

async function chatbotStream(req, res) {
  return chatbotMessage(req, res);
}

async function semanticSearchHandler(req, res) {
  const query = String(req.body?.query || '').trim();
  if (!query) return res.status(400).json({ ok: false, error: 'Informe query.' });
  const data = await semanticSearch({
    query,
    equipamentoId: Number(req.body?.equipamento_id || 0) || null,
    limit: Number(req.body?.limit || 6),
  });
  return res.json({ ok: true, resultados: data });
}

async function executiveReport(req, res) {
  const data = await generateExecutiveReport({ periodDays: Number(req.body?.period_days || 7) });
  return res.json({ ok: true, report: data });
}

async function equipamentoRecommendations(req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID de equipamento inválido.' });
  const data = await getEquipmentRecommendations(id);
  if (!data) return res.status(404).json({ ok: false, error: 'Equipamento não encontrado.' });
  return res.json({ ok: true, ...data });
}

async function equipamentoHealth(req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID de equipamento inválido.' });
  const data = await getEquipmentHealth(id);
  if (!data) return res.status(404).json({ ok: false, error: 'Equipamento não encontrado.' });
  return res.json({ ok: true, ...data });
}

async function analyzeImage(req, res) {
  const imageBase64 = String(req.body?.image_base64 || '').trim();
  if (!imageBase64) return res.status(400).json({ ok: false, error: 'Informe image_base64.' });
  const osId = Number(req.body?.os_id || 0) || null;
  const equipamentoId = Number(req.body?.equipamento_id || 0) || null;
  if (osId) {
    const analysis = await visionService.analyzeOSImage(osId, imageBase64, req.body?.context || {});
    return res.json({ ok: true, analysis });
  }
  const analysis = await visionService.analyzeEquipmentImage(imageBase64, { equipamentoId, context: req.body?.context || {} });
  return res.json({ ok: true, analysis });
}

function dashboard(req, res) {
  const statusData = getStatus();
  const total = tableExists('os') ? (db.prepare(`SELECT COUNT(*) AS total FROM os`).get()?.total || 0) : 0;
  const comIA = tableExists('os') ? (db.prepare(`SELECT COUNT(*) AS total FROM os WHERE ai_diagnostico IS NOT NULL OR ai_analise_completa IS NOT NULL`).get()?.total || 0) : 0;
  const uso7 = tableExists('ai_usage_logs') ? (db.prepare(`SELECT COUNT(*) AS total FROM ai_usage_logs WHERE datetime(criado_em) >= datetime('now','-7 days')`).get()?.total || 0) : 0;
  const topCausas = tableExists('os') ? db.prepare(`
    SELECT COALESCE(causa_diagnostico, ai_diagnostico, 'Sem causa') AS causa, COUNT(*) AS total
    FROM os
    GROUP BY causa
    ORDER BY total DESC
    LIMIT 5
  `).all() : [];
  return res.json({
    ok: true,
    total_os_com_analise_ia: Number(comIA || 0),
    uso_ultimos_7_dias: Number(uso7 || 0),
    top_causas_provaveis: topCausas,
    taxa_adocao: Number(total ? ((Number(comIA || 0) / Number(total)) * 100).toFixed(2) : 0),
    cache_hits: statusData.cache.hits,
    erros_recentes: statusData.errors_recentes,
    status_geral_ia: statusData.ok ? 'operacional' : 'degradado',
  });
}

async function webhookOSCreated(req, res) {
  const osId = Number(req.body?.os_id || req.body?.id || 0);
  if (!osId) return res.status(400).json({ ok: false, error: 'os_id obrigatório.' });
  try {
    await embeddingsService.indexOS(osId);
    return res.json({ ok: true, message: 'OS indexada para busca semântica.' });
  } catch (_e) {
    return res.status(202).json({ ok: true, warning: 'Falha ao indexar imediatamente, operação não bloqueante.' });
  }
}

function rankingFalhas(req, res) {
  const dias = Number(req.query?.dias || 90);
  const ranking = embeddingsService.rankingFalhasEquipamentos({ dias, limit: Number(req.query?.limit || 15) });
  const alertas = embeddingsService.preverFalhasEAlertas({ dias: Math.max(15, Math.min(dias, 60)) });
  return res.json({ ok: true, ranking, alertas });
}

async function diagnosticoEstruturado(req, res) {
  const dados = normalizeStructuredAIResponse(req.body || {});
  return res.json({ ok: true, ...dados });
}

module.exports = {
  renderChat,
  askGeneral,
  analyzeOS,
  analyzePreventiva,
  diagnosticarOS,
  melhorarDescricaoOS,
  analisarImagemOS,
  rankingFalhas,
  diagnosticoEstruturado,
  status,
  testConnection,
  clearAICache,
  chatbotMessage,
  chatbotStream,
  semanticSearchHandler,
  executiveReport,
  equipamentoRecommendations,
  equipamentoHealth,
  analyzeImage,
  dashboard,
  webhookOSCreated,
};
