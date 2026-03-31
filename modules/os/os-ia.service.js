const db = require("../../database/db");

const aiCore = require('../ai/ai.service');
const iaService = require('../ia/ia.service');

const PROMPT_ABERTURA = "Você é um planejador de manutenção industrial com foco operacional. Ao receber dados de abertura de OS, gere decisão técnica automática para execução em chão de fábrica. Responda somente JSON válido com os campos: resumo_usuario, descricao_tecnica, acao_corretiva, acao_preventiva, materiais_citados, tipo_intervencao, confianca, observacao_ia. Regras obrigatórias: (1) resumo_usuario deve ser claro para operação; (2) descricao_tecnica deve usar linguagem técnica objetiva; (3) acao_corretiva e acao_preventiva devem ser aplicáveis em campo; (4) materiais_citados deve listar apenas materiais explicitamente citados/inferíveis com segurança; (5) tipo_intervencao deve sugerir categoria prática como INSPECAO, REPARO, SUBSTITUICAO ou AJUSTE; (6) confianca entre 0 e 100 conforme qualidade dos dados; (7) observacao_ia deve justificar limitações e hipóteses. Não invente medições.";

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
    const analisePadronizada = await iaService.gerarAnalisePadronizada(payload, {
      model,
      systemPrompt: PROMPT_ABERTURA,
    });
    const ai = analisePadronizada.data;
    const confidenciaBaixa = !analisePadronizada.valid || Number(ai.confianca) < 40;
    const criticidadeInferida = confidenciaBaixa
      ? normalizeCriticidade(payload?.nao_conformidade?.severidade)
      : normalizeCriticidade(payload?.nao_conformidade?.severidade || "MEDIA");

    const result = {
      diagnostico_inicial: String(ai.resumo_usuario || "").trim(),
      causa_provavel: String(ai.observacao_ia || "").trim(),
      risco_operacional: confidenciaBaixa
        ? "Classificação operacional com baixa confiança automática. Validar em campo."
        : "Risco operacional inferido automaticamente conforme padrão do histórico.",
      servico_sugerido: String(ai.tipo_intervencao || "").trim(),
      criticidade_sugerida: criticidadeInferida,
      prioridade_sugerida: criticidadeInferida,
      acao_corretiva: String(ai.acao_corretiva || "").trim(),
      acao_preventiva: String(ai.acao_preventiva || "").trim(),
      sugestao_equipe: buildTeamSuggestion(criticidadeInferida, null),
      justificativa_interna: confidenciaBaixa
        ? "IA retornou payload inválido ou com baixa confiança. Fallback de criticidade aplicado."
        : String(ai.observacao_ia || "").trim(),
      risco_seguranca: confidenciaBaixa
        ? "Executar intervenção sob APR e LOTO por baixa confiança da análise automática."
        : "Risco de segurança a confirmar em inspeção inicial.",
      observacao_seguranca: confidenciaBaixa
        ? "Baixa confiança da IA: revisão humana obrigatória antes da execução."
        : "Revisão técnica recomendada antes da execução.",
      descricao_tecnica_os: String(ai.descricao_tecnica || "").trim(),
      observacao_ia: String(ai.observacao_ia || "").trim(),
      materiais_citados: Array.isArray(ai.materiais_citados) ? ai.materiais_citados : [],
      tipo_intervencao: String(ai.tipo_intervencao || "").trim(),
      confianca_ia: Number(ai.confianca || 0),
      payload_ia_valido: analisePadronizada.valid ? 1 : 0,
    };

    registrarLogIA({
      usuarioId: payload?.usuario_id,
      osId: payload?.os_id,
      naoConformidadeId: payload?.nao_conformidade_id,
      tipo,
      entrada: payload,
      resposta: {
        ...result,
        erros_validacao: analisePadronizada.errors || [],
        fallback_aplicado: analisePadronizada.fallbackApplied ? 1 : 0,
      },
      status: analisePadronizada.valid ? "OK" : "FALLBACK",
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
