const iaService = require('../ia/ia.service');
const { askText } = require('../ai/ai.service');

function montarFallbackJustificativaAndamento(payload = {}) {
  const numeroOS = payload.numero_os ? `OS #${payload.numero_os}` : 'OS';
  const dataAbertura = String(payload.data_abertura || '').slice(0, 10);
  const abertura = dataAbertura ? ` desde ${dataAbertura.split('-').reverse().join('/')}` : '';
  const motivo = String(payload.texto_padrao || '').trim();
  const observacao = String(payload.observacao_mecanico || '').trim();
  return [
    `${numeroOS} mantida em andamento${abertura}.`,
    motivo,
    observacao ? `Observação complementar da equipe: ${observacao}` : '',
  ].filter(Boolean).join(' ');
}

async function gerarJustificativaTecnicaAndamentoOS(payload = {}) {
  const fallback = montarFallbackJustificativaAndamento(payload);
  if (!fallback) return '';

  try {
    const result = await askText({
      systemPrompt: [
        'Você redige justificativas institucionais curtas para manutenção industrial.',
        'Use somente os dados fornecidos. Não invente datas, causas, peças, testes, responsáveis ou providências.',
        'Preserve o sentido operacional do motivo padrão e da observação do mecânico.',
        'Responda somente com um parágrafo objetivo em português-BR, sem markdown.',
      ].join(' '),
      userPayload: payload,
      model: process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
      maxOutputTokens: 220,
      temperature: 0.1,
    });
    return String(result?.text || fallback).trim() || fallback;
  } catch (_e) {
    return fallback;
  }
}

module.exports = {
  gerarJustificativaTecnicaAndamentoOS,
  montarFallbackJustificativaAndamento,
  gerarAberturaAutomaticaDaOS: iaService.gerarAberturaAutomaticaDaOS,
  gerarFechamentoAutomaticoOS: iaService.gerarFechamentoAutomaticoOS,
  registrarLogIA: iaService.registrarLogIA,
  transcreverAudioOS: iaService.transcreverAudioOS,
  transcreverAudioFechamento: iaService.transcreverAudioFechamento,
  gerarResumoTecnicoFechamento: iaService.gerarResumoTecnicoFechamento,
  analisarFotosFechamento: iaService.analisarFotosFechamento,
  buscarHistoricoSemelhante: iaService.buscarHistoricoSemelhante,
  gerarAcoesInteligentes: iaService.gerarAcoesInteligentes,
  analisarOSGraxaria: iaService.analisarOSGraxaria,
};
