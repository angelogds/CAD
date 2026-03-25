const db = require("../../database/db");

const aiCore = require('../ai/ai.service');

const PROMPT_ABERTURA = "Você é um assistente técnico de manutenção industrial da empresa Campo do Gado. Receberá dados estruturados de uma não conformidade aberta por um operador, junto com contexto do equipamento e histórico recente. Gere uma análise técnica inicial objetiva e realista, sem inventar medições ou detalhes não informados. Use português do Brasil, foco em manutenção industrial, segurança e praticidade de chão de fábrica. Retorne somente JSON válido com os campos: diagnostico_inicial, causa_provavel, risco_operacional, servico_sugerido, prioridade_sugerida, observacao_seguranca, descricao_tecnica_os.";

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

function normalizePrioridade(value) {
  const p = String(value || "").toUpperCase().trim();
  if (["BAIXA", "MEDIA", "ALTA", "CRITICA"].includes(p)) return p;
  if (p === "MÉDIA") return "MEDIA";
  if (p === "CRÍTICA") return "CRITICA";
  return "MEDIA";
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
    const ai = await callOpenAIJSON({ model, systemPrompt: PROMPT_ABERTURA, payload });
    const result = {
      diagnostico_inicial: String(ai.diagnostico_inicial || "").trim(),
      causa_provavel: String(ai.causa_provavel || "").trim(),
      risco_operacional: String(ai.risco_operacional || "").trim(),
      servico_sugerido: String(ai.servico_sugerido || "").trim(),
      prioridade_sugerida: normalizePrioridade(ai.prioridade_sugerida),
      observacao_seguranca: String(ai.observacao_seguranca || "").trim(),
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
      prioridade_sugerida: normalizePrioridade(payload?.nao_conformidade?.severidade),
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
