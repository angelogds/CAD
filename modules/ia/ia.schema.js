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

module.exports = {
  safeJSONStringify,
  parseAIJSON,
  normalizeCriticidade,
  buildTeamSuggestion,
};
