const aiCore = require("../ai/ai.service");
const repo = require("./ia.repository");
const prompts = require("./ia.prompt");
const { parseAIJSON, normalizeCriticidade, buildTeamSuggestion } = require("./ia.schema");

async function callOpenAIJSON({ model, systemPrompt, payload }) {
  const result = await aiCore.askText({
    model: model || process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini",
    systemPrompt,
    userPayload: payload,
    temperature: 0.2,
  });

  return parseAIJSON(result.text);
}

async function gerarAberturaAutomaticaDaOS(payload) {
  const tipo = "GERACAO_OS_AUTOMATICA";
  const model = process.env.OPENAI_MODEL_OS_AUTOMATICA || process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";

  try {
    const ai = await callOpenAIJSON({ model, systemPrompt: prompts.PROMPT_ABERTURA, payload });
    const result = {
      diagnostico_inicial: String(ai.diagnostico_inicial || "").trim(),
      causa_provavel: String(ai.causa_provavel || "").trim(),
      risco_operacional: String(ai.risco_operacional || "").trim(),
      servico_sugerido: String(ai.servico_sugerido || "").trim(),
      criticidade_sugerida: normalizeCriticidade(ai.criticidade_sugerida || ai.prioridade_sugerida),
      prioridade_sugerida: normalizeCriticidade(ai.prioridade_sugerida || ai.criticidade_sugerida),
      acao_corretiva: String(ai.acao_corretiva || ai.servico_sugerido || "").trim(),
      acao_preventiva: String(ai.acao_preventiva || "").trim(),
      sugestao_equipe: buildTeamSuggestion(ai.criticidade_sugerida || ai.prioridade_sugerida, ai.sugestao_equipe),
      justificativa_interna: String(ai.justificativa_interna || "").trim(),
      risco_seguranca: String(ai.risco_seguranca || ai.observacao_seguranca || "").trim(),
      observacao_seguranca: String(ai.observacao_seguranca || ai.risco_seguranca || "").trim(),
      descricao_tecnica_os: String(ai.descricao_tecnica_os || "").trim(),
    };

    repo.registrarLogIA({
      usuarioId: payload?.usuario_id,
      osId: payload?.os_id,
      naoConformidadeId: payload?.nao_conformidade_id,
      tipo,
      entrada: payload,
      resposta: result,
      status: "OK",
    });

    return result;
  } catch (err) {
    const fallback = {
      diagnostico_inicial: "Análise inicial automática indisponível no momento.",
      causa_provavel: "Verificar componentes relacionados ao sintoma informado.",
      risco_operacional: "Avaliar risco conforme severidade registrada pelo operador.",
      servico_sugerido: "Realizar inspeção técnica inicial e correção conforme diagnóstico em campo.",
      criticidade_sugerida: normalizeCriticidade(payload?.nao_conformidade?.severidade),
      prioridade_sugerida: normalizeCriticidade(payload?.nao_conformidade?.severidade),
      acao_corretiva: "Executar inspeção direcionada no componente afetado e corrigir falha identificada.",
      acao_preventiva: "Padronizar inspeção de rotina e reaperto/lubrificação conforme condição encontrada.",
      sugestao_equipe: buildTeamSuggestion(payload?.nao_conformidade?.severidade, null),
      justificativa_interna: "Fallback aplicado por indisponibilidade de resposta da IA.",
      risco_seguranca: "Aplicar bloqueio e etiquetagem (LOTO) e avaliar exposição dos operadores.",
      observacao_seguranca: "Aplicar bloqueio e etiquetagem (LOTO) antes da intervenção.",
      descricao_tecnica_os: "OS gerada automaticamente a partir de não conformidade. Validar condições do equipamento e executar intervenção segura.",
    };

    repo.registrarLogIA({
      usuarioId: payload?.usuario_id,
      osId: payload?.os_id,
      naoConformidadeId: payload?.nao_conformidade_id,
      tipo,
      entrada: payload,
      resposta: { erro: err.message, fallback },
      status: "FALLBACK",
    });

    return fallback;
  }
}

async function gerarFechamentoAutomaticoOS(payload) {
  const tipo = "FECHAMENTO_OS";
  const model = process.env.OPENAI_MODEL_FECHAMENTO_OS || process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";

  try {
    const ai = await callOpenAIJSON({ model, systemPrompt: prompts.PROMPT_FECHAMENTO, payload });
    const result = {
      descricao_servico_executado: String(ai.descricao_servico_executado || "").trim(),
      acao_corretiva_realizada: String(ai.acao_corretiva_realizada || "").trim(),
      recomendacao_para_evitar_reincidencia: String(ai.recomendacao_para_evitar_reincidencia || "").trim(),
      observacao_final_tecnica: String(ai.observacao_final_tecnica || "").trim(),
    };

    repo.registrarLogIA({
      usuarioId: payload?.usuario_id,
      osId: payload?.os_id,
      naoConformidadeId: payload?.nao_conformidade_id,
      tipo,
      entrada: payload,
      resposta: result,
      status: "OK",
    });

    return result;
  } catch (err) {
    const fallback = {
      descricao_servico_executado: "Fechamento técnico automático indisponível. Serviço registrado com base nas ações selecionadas.",
      acao_corretiva_realizada: "Ação corretiva registrada conforme checklist de execução.",
      recomendacao_para_evitar_reincidencia: "Manter monitoramento do equipamento e reforçar rotina preventiva.",
      observacao_final_tecnica: "Validar em campo a estabilidade operacional após a intervenção.",
    };

    repo.registrarLogIA({
      usuarioId: payload?.usuario_id,
      osId: payload?.os_id,
      naoConformidadeId: payload?.nao_conformidade_id,
      tipo,
      entrada: payload,
      resposta: { erro: err.message, fallback },
      status: "FALLBACK",
    });

    return fallback;
  }
}

async function transcreverAudioOS(payload = {}) {
  const model = process.env.OPENAI_MODEL_TRANSCRICAO_OS || process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";
  try {
    const ai = await callOpenAIJSON({ model, systemPrompt: prompts.PROMPT_TRANSCRICAO_AUDIO_OS, payload });
    return {
      transcricao_limpa: String(ai.transcricao_limpa || payload.transcricao || "").trim(),
      sintoma_principal: String(ai.sintoma_principal || "").trim(),
      severidade_sugerida: normalizeCriticidade(ai.severidade_sugerida || "MEDIA"),
      observacao_curta: String(ai.observacao_curta || "").trim(),
    };
  } catch (_e) {
    return {
      transcricao_limpa: String(payload.transcricao || "").trim(),
      sintoma_principal: String(payload.sintoma_principal || "").trim(),
      severidade_sugerida: normalizeCriticidade(payload.severidade || "MEDIA"),
      observacao_curta: String(payload.observacao_curta || "").trim(),
    };
  }
}

async function transcreverAudioFechamento(payload = {}) {
  const model = process.env.OPENAI_MODEL_TRANSCRICAO_FECHAMENTO || process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";
  try {
    const ai = await callOpenAIJSON({ model, systemPrompt: prompts.PROMPT_TRANSCRICAO_AUDIO_FECHAMENTO, payload });
    return {
      transcricao_limpa: String(ai.transcricao_limpa || payload.transcricao || "").trim(),
      acao_executada: String(ai.acao_executada || "").trim(),
      resultado_teste: String(ai.resultado_teste || "").trim(),
      observacao_final: String(ai.observacao_final || "").trim(),
    };
  } catch (_e) {
    return {
      transcricao_limpa: String(payload.transcricao || "").trim(),
      acao_executada: String(payload.acao_executada || "").trim(),
      resultado_teste: String(payload.resultado_teste || "").trim(),
      observacao_final: String(payload.observacao_final || "").trim(),
    };
  }
}

async function gerarResumoTecnicoFechamento(payload = {}) {
  return gerarFechamentoAutomaticoOS(payload);
}

async function analisarFotosFechamento(payload = {}) {
  const model = process.env.OPENAI_MODEL_ANALISE_FOTOS || process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";
  try {
    const ai = await callOpenAIJSON({ model, systemPrompt: prompts.PROMPT_ANALISE_FOTOS_FECHAMENTO, payload });
    return {
      conformidade_visual: String(ai.conformidade_visual || "").trim(),
      riscos_residuais: String(ai.riscos_residuais || "").trim(),
      recomendacoes_finais: String(ai.recomendacoes_finais || "").trim(),
    };
  } catch (_e) {
    return {
      conformidade_visual: "Análise visual automática indisponível.",
      riscos_residuais: "Requer validação presencial do responsável técnico.",
      recomendacoes_finais: "Executar checklist visual padrão antes da liberação final.",
    };
  }
}

function buscarHistoricoSemelhante(payload = {}) {
  return repo.buscarHistoricoSemelhante({
    equipamentoId: payload.equipamento_id,
    sintoma: payload.sintoma_principal,
    descricao: payload.descricao,
    limit: payload.limit || 8,
  });
}

async function gerarAcoesInteligentes(payload = {}) {
  const historico = Array.isArray(payload.historico) && payload.historico.length
    ? payload.historico
    : buscarHistoricoSemelhante(payload);

  const model = process.env.OPENAI_MODEL_ACOES_INTELIGENTES || process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";
  try {
    const ai = await callOpenAIJSON({
      model,
      systemPrompt: prompts.PROMPT_ACOES_INTELIGENTES,
      payload: {
        ...payload,
        historico_semelhante: historico,
      },
    });

    return {
      acoes_imediatas: Array.isArray(ai.acoes_imediatas) ? ai.acoes_imediatas : [],
      acoes_preventivas: Array.isArray(ai.acoes_preventivas) ? ai.acoes_preventivas : [],
      pecas_sugeridas: Array.isArray(ai.pecas_sugeridas) ? ai.pecas_sugeridas : [],
      justificativa: String(ai.justificativa || "").trim(),
      historico_semelhante: historico,
    };
  } catch (_e) {
    const sugestoes = historico
      .map((h) => String(h.causa_diagnostico || h.resumo_tecnico || "").trim())
      .filter(Boolean)
      .slice(0, 5);

    return {
      acoes_imediatas: sugestoes,
      acoes_preventivas: ["Reforçar plano preventivo e inspeções periódicas do equipamento."],
      pecas_sugeridas: [],
      justificativa: "Ações sugeridas por fallback com base no histórico semelhante recente.",
      historico_semelhante: historico,
    };
  }
}

module.exports = {
  registrarLogIA: repo.registrarLogIA,
  gerarAberturaAutomaticaDaOS,
  gerarFechamentoAutomaticoOS,
  transcreverAudioOS,
  transcreverAudioFechamento,
  gerarResumoTecnicoFechamento,
  analisarFotosFechamento,
  buscarHistoricoSemelhante,
  gerarAcoesInteligentes,
};
