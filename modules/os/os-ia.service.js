const db = require("../../database/db");

const aiCore = require('../ai/ai.service');

const PROMPT_ABERTURA = "Você é um planejador de manutenção industrial com foco operacional. Ao receber dados de abertura de OS, gere decisão técnica automática para execução em chão de fábrica. Responda somente JSON válido com os campos: criticidade_sugerida, diagnostico_inicial, causa_provavel, risco_operacional, risco_seguranca, acao_corretiva, acao_preventiva, servico_sugerido, prioridade_sugerida, sugestao_equipe, descricao_tecnica_os, justificativa_interna. Regras obrigatórias: (1) criticidade_sugerida deve ser BAIXA, MEDIA, ALTA ou CRITICA; (2) seguir lógica de criticidade: vazamento leve -> BAIXA/MEDIA, vazamento crítico -> ALTA/CRITICA, equipamento essencial parado -> CRITICA, risco de segurança -> CRITICA, falha intermitente -> MEDIA, ruído -> BAIXA/MEDIA, aquecimento -> MEDIA/ALTA; (3) sugestao_equipe deve trazer quantidade_recomendada, perfil_minimo e racional, obedecendo: BAIXA=1 mecânico, MEDIA=2 mecânicos, ALTA=2 mecânicos, CRITICA=3+ equipe/grupo; (4) ação corretiva e preventiva devem ser técnicas, objetivas e aplicáveis; (5) justificativa_interna deve explicar a escolha da criticidade com base nos dados recebidos. Não invente medições.";

const PROMPT_FECHAMENTO = "Você é um assistente técnico de encerramento de ordens de serviço da empresa Campo do Gado. Receberá dados estruturados do serviço executado, incluindo não conformidade original, descrição inicial da OS, ações realizadas, peças trocadas e resultado do teste. Gere um texto técnico claro, objetivo e padronizado para histórico de manutenção. Responda em português do Brasil. Não invente detalhes não informados. Retorne somente JSON válido com os campos: descricao_servico_executado, acao_corretiva_realizada, recomendacao_para_evitar_reincidencia, observacao_final_tecnica.";

function safeJSONStringify(value) {
  try {
    return JSON.stringify(value || {});
  } catch (_e) {
    return "{}";
  }
}

function parseAIJSON(rawText) {
  if (!rawText) throw new Error("Resposta vazia da IA.");
  const cleaned = String(rawText).trim();
  try {
    return JSON.parse(cleaned);
  } catch (_e) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("JSON inválido retornado pela IA.");
  }
}

function normalizeCriticidade(value) {
  const p = String(value || "").toUpperCase().trim();
  if (["BAIXA", "MEDIA", "ALTA", "CRITICA"].includes(p)) return p;
  if (p === "MÉDIA") return "MEDIA";
  if (p === "CRÍTICA") return "CRITICA";
  return "MEDIA";
}

function buildTeamSuggestion(criticidade, sugestaoEquipe) {
  const crit = normalizeCriticidade(criticidade);
  const regra = {
    BAIXA: { quantidade_recomendada: 1, perfil_minimo: "1 MECANICO" },
    MEDIA: { quantidade_recomendada: 2, perfil_minimo: "2 MECANICOS" },
    ALTA: { quantidade_recomendada: 2, perfil_minimo: "2 MECANICOS" },
    CRITICA: { quantidade_recomendada: 3, perfil_minimo: "EQUIPE 3+ MECANICOS" },
  }[crit];

  const suggested = typeof sugestaoEquipe === "object" && sugestaoEquipe ? sugestaoEquipe : {};
  return {
    criticidade: crit,
    quantidade_recomendada: Number(suggested.quantidade_recomendada || regra.quantidade_recomendada),
    perfil_minimo: String(suggested.perfil_minimo || regra.perfil_minimo),
    racional: String(suggested.racional || "Dimensionamento definido por regra operacional da criticidade.").trim(),
  };
}

async function callOpenAIJSON({ model, systemPrompt, payload }) {
  const result = await aiCore.askText({
    model: model || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
    systemPrompt,
    userPayload: payload,
    temperature: 0.2,
  });

  return parseAIJSON(result.text);
}

function registrarLogIA({ usuarioId, osId, naoConformidadeId, tipo, entrada, resposta, status }) {
  try {
    db.prepare(
      `INSERT INTO os_ia_logs (usuario_id, os_id, nao_conformidade_id, tipo, entrada_json, resposta_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      usuarioId || null,
      osId || null,
      naoConformidadeId || null,
      tipo,
      safeJSONStringify(entrada),
      safeJSONStringify(resposta),
      status || "OK"
    );
  } catch (_e) {
    // logs não devem quebrar o fluxo principal
  }
}

async function gerarAberturaAutomaticaDaOS(payload) {
  const tipo = "GERACAO_OS_AUTOMATICA";
  const model = process.env.OPENAI_MODEL_OS_AUTOMATICA || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';

  try {
    const contextoCompacto = Array.isArray(payload?.contexto?.historico_semelhante_compacto)
      ? payload.contexto.historico_semelhante_compacto.slice(0, 5)
      : [];
    const payloadPrompt = {
      ...payload,
      contexto_compacto_relevante: {
        historico_semelhante_top5: contextoCompacto,
      },
    };

    const ai = await callOpenAIJSON({
      model,
      systemPrompt: `${PROMPT_ABERTURA} Use o contexto_compacto_relevante para reduzir respostas genéricas e priorizar ações já eficazes em casos semelhantes.`,
      payload: payloadPrompt,
    });
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

    registrarLogIA({
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

    registrarLogIA({
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
  const model = process.env.OPENAI_MODEL_FECHAMENTO_OS || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';

  try {
    const ai = await callOpenAIJSON({ model, systemPrompt: PROMPT_FECHAMENTO, payload });
    const result = {
      descricao_servico_executado: String(ai.descricao_servico_executado || "").trim(),
      acao_corretiva_realizada: String(ai.acao_corretiva_realizada || "").trim(),
      recomendacao_para_evitar_reincidencia: String(ai.recomendacao_para_evitar_reincidencia || "").trim(),
      observacao_final_tecnica: String(ai.observacao_final_tecnica || "").trim(),
    };

    registrarLogIA({
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

    registrarLogIA({
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

module.exports = {
  gerarAberturaAutomaticaDaOS,
  gerarFechamentoAutomaticoOS,
  registrarLogIA,
};
