const iaService = require("../ia/ia.service");

async function analisarFotosFechamento({ fotos = [], audioTranscricao = null, contexto = {} }) {
  const imagens = Array.isArray(fotos) ? fotos.filter(Boolean) : [];
  if (!imagens.length) {
    return {
      observacao_ia: "Sem imagens de fechamento para análise visual.",
      confianca: 0,
      evidencias_visuais: [],
    };
  }

  const model = process.env.OPENAI_MODEL_FECHAMENTO_OS || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini';
  const userText = JSON.stringify({
    instrucao: "Analise múltiplas fotos de fechamento e retorne avaliação visual cautelosa.",
    regra_prioridade_multimodal: "áudio tem prioridade semântica; foto somente complementa",
    audio_transcricao: audioTranscricao ? String(audioTranscricao) : null,
    contexto,
  });

  try {
    const response = await aiCore.askMultimodal({
      model,
      systemPrompt: PROMPT_ANALISE_FOTOS_FECHAMENTO,
      userText,
      images: imagens,
      temperature: 0.1,
      maxOutputTokens: 300,
    });
    const parsed = parseAIJSON(response.text);
    const confiancaRaw = Number(parsed?.confianca);
    return {
      observacao_ia: String(parsed?.observacao_ia || "Há indícios visuais de execução, porém a evidência aparenta ser parcial.").trim(),
      confianca: Number.isFinite(confiancaRaw) ? Math.max(0, Math.min(100, Math.round(confiancaRaw))) : 0,
      evidencias_visuais: Array.isArray(parsed?.evidencias_visuais) ? parsed.evidencias_visuais : [],
    };
  } catch (_err) {
    return {
      observacao_ia: "Análise visual indisponível no momento; há indícios limitados pelas fotos anexadas.",
      confianca: 0,
      evidencias_visuais: [],
    };
  }
}

module.exports = {
  gerarAberturaAutomaticaDaOS: iaService.gerarAberturaAutomaticaDaOS,
  gerarFechamentoAutomaticoOS: iaService.gerarFechamentoAutomaticoOS,
  registrarLogIA: iaService.registrarLogIA,

  transcreverAudioOS: iaService.transcreverAudioOS,
  transcreverAudioFechamento: iaService.transcreverAudioFechamento,
  gerarResumoTecnicoFechamento: iaService.gerarResumoTecnicoFechamento,
  analisarFotosFechamento: iaService.analisarFotosFechamento,
  buscarHistoricoSemelhante: iaService.buscarHistoricoSemelhante,
  gerarAcoesInteligentes: iaService.gerarAcoesInteligentes,
};
