const db = require('../../database/db');
const academiaService = require('./academia.service');
const { getAIConfig, createAIKeyMissingError } = require('../ai.service');

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
    systemPrompt: `${aiPrompts.buildProfessorPrompt(action)}\n${prompt || ''}`.trim(),
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

async function responderProfessorIA({ usuarioId, cursoId, action, pergunta }) {
  const curso = cursoId ? academiaService.getCursoDetalhe(cursoId, usuarioId) : null;
  const model = action === 'iniciar_avaliacao'
    ? (process.env.OPENAI_MODEL_AVALIACAO || process.env.OPENAI_MODEL_ACADEMIA || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini')
    : (process.env.OPENAI_MODEL_ACADEMIA || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini');

  const actionPromptMap = {
    perguntar: 'Responda a dúvida técnica do colaborador com passo a passo objetivo e cautelas de segurança.',
    resumir: 'Resuma o conteúdo recebido em tópicos curtos, com foco em aplicação prática de fábrica.',
    gerar_perguntas: 'Crie perguntas de fixação (objetiva, discursiva curta, estudo de caso e checklist de compreensão).',
    iniciar_avaliacao: 'Monte uma avaliação institucional interna (sem linguagem de certificação oficial) com gabarito sucinto.',
    recomendar_proximo: 'Recomende a próxima trilha/curso interno e indique se já cabe etapa complementar externa no Cursa.',
  };

  const payload = {
    action,
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
      prompt: actionPromptMap[action] || actionPromptMap.perguntar,
      payload,
      action,
    });

    const texto = String(resposta || '').trim() || fallbackByAction(action, curso);
    logInteracao({ usuarioId, cursoId, tipo: action, pergunta, resposta: texto });
    academiaService.registrarPontuacao(usuarioId, 'USO_PROFESSOR_IA', 5, `Interação IA (${action})`);

    return { ok: true, resposta: texto };
  } catch (err) {
    const fallback = fallbackByAction(action, curso);
    logInteracao({ usuarioId, cursoId, tipo: action, pergunta, resposta: `${fallback}\n[erro=${err.message}]` });
    const warning = err?.code === 'AI_KEY_MISSING'
      ? 'IA ainda não ativada. Configure OPENAI_API_KEY (ou use OPENAI_APIKEY/OPENAI_KEY) para habilitar o Professor IA.'
      : 'Professor IA em modo contingência no momento. Tente novamente em instantes.';
    return {
      ok: true,
      resposta: fallback,
      warning,
    };
  }
}

module.exports = {
  responderProfessorIA,
};
