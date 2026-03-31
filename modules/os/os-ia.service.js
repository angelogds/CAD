const iaService = require("../ia/ia.service");

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
