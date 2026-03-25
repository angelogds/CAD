const db = require('../../database/db');
const academiaService = require('./academia.service');
const aiCore = require('../ai/ai.service');
const aiPrompts = require('../ai/ai.prompts');

const BASE_SYSTEM_PROMPT = `Você é o Professor IA da Academia da Manutenção da empresa Campo do Gado.
Atue em português do Brasil com linguagem institucional prática de manutenção.
Não trate o módulo como escola formal e não use termos de certificação oficial.
Foque em capacitação interna, segurança, checklist técnico e melhoria contínua.`;

function safeJSONStringify(value) {
  try {
    return JSON.stringify(value || {});
  } catch (_e) {
    return '{}';
  }
}

function logInteracao({ usuarioId, cursoId, tipo, pergunta, resposta }) {
  try {
    db.prepare(`
      INSERT INTO academia_interacoes_ia (usuario_id, curso_id, tipo_interacao, pergunta, resposta, criado_em)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(usuarioId || null, cursoId || null, tipo, pergunta || null, resposta || null);
  } catch (_e) {
    // não quebrar o fluxo por falha de log
  }
}

async function callOpenAI({ model, prompt, payload, action }) {
  const result = await aiCore.askText({
    model,
    systemPrompt: `${BASE_SYSTEM_PROMPT}\n${aiPrompts.buildProfessorPrompt(action)}\n${prompt || ''}`.trim(),
    userPayload: payload,
    temperature: 0.3,
  });
  return result.text;
}

function fallbackByAction(action, curso) {
  const titulo = curso?.titulo || 'curso atual';
  if (action === 'resumir') return `Resumo rápido de ${titulo}: revise objetivos do bloco, siga o checklist técnico, registre evidências e valide critérios de segurança.`;
  if (action === 'gerar_perguntas') return 'Perguntas de fixação: 1) Quais sinais de falha são críticos? 2) Qual checklist mínimo antes de intervir? 3) Quais riscos de segurança devem ser mitigados?';
  if (action === 'iniciar_avaliacao') return 'Avaliação sugerida: 5 questões objetivas + 1 estudo de caso curto + checklist de compreensão aplicado ao equipamento que você atende.';
  if (action === 'recomendar_proximo') return academiaService.getDashboardData(null).recomendacaoIA || 'Recomendo avançar para um bloco prático de aplicação na fábrica.';
  return 'Professor IA temporariamente indisponível. Revise o bloco atual, o e-book interno e finalize a avaliação para liberar a etapa complementar externa.';
}

function resolveWarning(err) {
  if (err?.code === 'AI_KEY_MISSING') {
    return 'IA ainda não ativada. Configure OPENAI_API_KEY.';
  }
  if (err?.code === 'AI_KEY_PLACEHOLDER' || err?.code === 'AI_UNAUTHORIZED') {
    return 'Configuração da IA inválida. Revise a chave da API.';
  }
  if (err?.code === 'AI_RATE_LIMIT') {
    return 'IA indisponível por limite ou cobrança da API.';
  }
  if (err?.code === 'AI_DISABLED') {
    return 'Professor IA desativado no ambiente. Solicite ativação ao administrador.';
  }
  if (err?.code === 'AI_MODEL_MISSING' || err?.code === 'AI_MODEL_NOT_FOUND' || err?.providerStatus === 404) {
    return 'Modelo da IA inválido ou indisponível. Revise OPENAI_MODEL_ACADEMIA/OPENAI_MODEL_AVALIACAO.';
  }
  if (err?.code === 'AI_BAD_REQUEST' || err?.providerStatus === 400) {
    return 'Falha de configuração da IA. Revise modelo e parâmetros da requisição.';
  }
  if (err?.code === 'AI_TIMEOUT') {
    return 'Professor IA indisponível no momento. Tente novamente em instantes.';
  }

  return 'Professor IA indisponível no momento. Tente novamente em instantes.';
}

function logProfessorIAError({ err, model }) {
  const cfg = aiCore.getAIConfig();
  console.error('[ProfessorIA] Erro ao consultar OpenAI:', {
    code: err?.code,
    message: err?.message,
    technical: err?.technical,
    providerStatus: err?.providerStatus,
    providerBodySummary: err?.providerBodySummary,
    providerModel: err?.providerModel || model,
    aiEnabled: cfg.enabled,
    hasApiKey: cfg.hasApiKey,
    apiKeyLooksPlaceholder: cfg.apiKeyLooksPlaceholder,
    apiKeyMasked: cfg.hasApiKey ? `****${String(cfg.apiKey).slice(-4)}` : '(ausente)',
  });
}

async function responderProfessorIA({ usuarioId, cursoId, action, pergunta, modo = 'curso' }) {
  const curso = cursoId ? academiaService.getCursoDetalhe(cursoId, usuarioId) : null;
  const model = action === 'iniciar_avaliacao'
    ? (process.env.OPENAI_MODEL_AVALIACAO || process.env.OPENAI_MODEL_ACADEMIA || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini')
    : (process.env.OPENAI_MODEL_ACADEMIA || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini');

  const normalizedModo = ['curso', 'ef', 'preventiva'].includes(String(modo || '').toLowerCase())
    ? String(modo || '').toLowerCase()
    : 'curso';

  const modoPromptMap = {
    curso: 'A resposta deve atuar como professora do curso atual, ensinando por tópicos curtos e claros.',
    ef: 'A resposta deve preparar para EF (teste final), com foco em revisão aplicada, critérios de acerto e erros comuns.',
    preventiva: 'A resposta deve ligar o conteúdo à manutenção preventiva, com itens de inspeção, periodicidade e evidências de execução.',
  };

  const actionPromptMap = {
    perguntar: 'Responda a dúvida técnica do colaborador com passo a passo objetivo, linguagem de professor e cautelas de segurança. Sempre estruture em tópicos com títulos curtos.',
    resumir: 'Resuma o conteúdo recebido em tópicos curtos, com foco em aplicação prática de fábrica.',
    gerar_perguntas: 'Crie perguntas de fixação (objetiva, discursiva curta, estudo de caso e checklist de compreensão).',
    iniciar_avaliacao: 'Monte uma avaliação institucional interna (sem linguagem de certificação oficial) com gabarito sucinto.',
    recomendar_proximo: 'Recomende a próxima trilha/curso interno e indique se já cabe etapa complementar externa no Cursa.',
  };

  const payload = {
    action,
    modo: normalizedModo,
    pergunta: pergunta || null,
    curso: curso ? {
      id: curso.id,
      titulo: curso.titulo,
      descricao: curso.descricao,
      blocos: (curso.blocos || []).map((b) => ({ titulo: b.titulo, resumo: b.resumo })),
      ebooks: (curso.ebooks || []).map((e) => ({ titulo: e.titulo, resumo: e.resumo })),
      avaliacao: curso.avaliacao,
      etapaExterna: curso.etapaExterna,
    } : null,
  };

  try {
    const resposta = await callOpenAI({
      model,
      prompt: `${actionPromptMap[action] || actionPromptMap.perguntar} ${modoPromptMap[normalizedModo]}`.trim(),
      payload,
      action,
    });

    const texto = String(resposta || '').trim() || fallbackByAction(action, curso);
    logInteracao({ usuarioId, cursoId, tipo: action, pergunta, resposta: texto });
    academiaService.registrarPontuacao(usuarioId, 'USO_PROFESSOR_IA', 5, `Interação IA (${action})`);

    return { ok: true, resposta: texto };
  } catch (err) {
    logProfessorIAError({ err, model });
    const fallback = fallbackByAction(action, curso);
    logInteracao({
      usuarioId,
      cursoId,
      tipo: action,
      pergunta,
      resposta: `${fallback}\n[erro=${safeJSONStringify({ code: err?.code, message: err?.message, status: err?.providerStatus })}]`,
    });

    return {
      ok: true,
      resposta: fallback,
      warning: resolveWarning(err),
    };
  }
}

module.exports = {
  responderProfessorIA,
};
