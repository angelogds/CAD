// Compatibilidade para instalações antigas onde a tabela equipamentos nasceu
// apenas com `codigo`. Alguns pontos do PCM também aceitam a identificação
// alternativa `tag`; a coluna é opcional e não substitui nem altera `codigo`.
module.exports.up = ({ tableExists, addColumnIfMissing }) => {
  if (!tableExists("equipamentos")) return;
  addColumnIfMissing("equipamentos", "tag", "tag TEXT");
};
