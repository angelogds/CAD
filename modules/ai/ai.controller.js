const db = require('../../database/db');
const { askText, getAIConfig } = require('./ai.service');
const prompts = require('./ai.prompts');

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

  if (!pergunta) return res.status(400).json({ ok: false, error: 'Informe uma pergunta.' });

  try {
    const result = await askText({
      systemPrompt: prompts.buildAssistentePrompt(contexto),
      userPayload: { pergunta, contexto },
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
  const action = String(req.body?.action || 'checklist').trim();
  const plano = getPreventivaContext(planoId);
  if (!plano) return res.status(404).json({ ok: false, error: 'Plano preventivo não encontrado.' });

  try {
    const result = await askText({
      systemPrompt: prompts.buildPreventivaPrompt(action),
      userPayload: {
        action,
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

module.exports = {
  renderChat,
  askGeneral,
  analyzeOS,
  analyzePreventiva,
};
