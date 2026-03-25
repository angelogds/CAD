const BASE_STYLE = `Regras de resposta:
- Português do Brasil, linguagem simples e técnica de chão de fábrica.
- Seja direto, em tópicos curtos e práticos.
- Não invente dados do sistema.
- Se faltar dado, sinalize como hipótese.
- Priorize segurança (LOTO, EPC, EPI, bloqueio de energia, teste seguro).
- Evite texto longo e custo alto de tokens.`;

function buildAssistentePrompt(contexto = 'geral') {
  const mapa = {
    geral: 'Atue como assistente técnico geral de manutenção industrial.',
    os: 'Atue como assistente para ordens de serviço, com foco em diagnóstico e execução segura.',
    equipamento: 'Atue como assistente de confiabilidade para equipamentos industriais.',
    preventiva: 'Atue como assistente de manutenção preventiva e inspeção planejada.',
    academia: 'Atue como professor técnico da Academia da Manutenção.',
  };

  return `${mapa[contexto] || mapa.geral}\n${BASE_STYLE}`;
}

function buildOSPrompt(action = 'analisar') {
  const mapa = {
    analisar: 'Faça análise técnica curta da OS com hipóteses e próximos passos.',
    causa: 'Sugira causa provável principal e alternativas com nível de confiança.',
    inspecoes: 'Sugira inspeções objetivas antes de desmontagem.',
    materiais: 'Sugira materiais e itens prováveis para execução.',
    execucao_segura: 'Sugira sequência de execução segura em passos curtos.',
    resumo: 'Gere resumo técnico final claro para histórico.',
  };
  return `${mapa[action] || mapa.analisar}\n${BASE_STYLE}`;
}

function buildPreventivaPrompt(action = 'checklist') {
  const mapa = {
    perguntar: 'Responda como especialista em preventiva com orientação por tópicos e próximos passos de execução.',
    checklist: 'Gere checklist preventivo objetivo com passos de inspeção e aceite.',
    criticidade: 'Analise criticidade operacional e risco da preventiva.',
    orientacao: 'Oriente a inspeção com sequência prática de execução.',
    recomendacao: 'Gere recomendação preventiva para reduzir reincidência.',
  };
  return `${mapa[action] || mapa.checklist}\n${BASE_STYLE}`;
}

function buildProfessorPrompt(action = 'perguntar') {
  const mapa = {
    perguntar: 'Responda dúvida técnica com didática simples para mecânicos e operadores.',
    resumir: 'Resuma o conteúdo em pontos de aplicação prática no trabalho.',
    gerar_perguntas: 'Crie perguntas de fixação por bloco com correção simples.',
    iniciar_avaliacao: 'Monte avaliação curta por bloco com feedback didático.',
    recomendar_proximo: 'Recomende próximo bloco com justificativa objetiva.',
  };
  return `${mapa[action] || mapa.perguntar}\n${BASE_STYLE}`;
}

module.exports = {
  buildAssistentePrompt,
  buildOSPrompt,
  buildPreventivaPrompt,
  buildProfessorPrompt,
};
