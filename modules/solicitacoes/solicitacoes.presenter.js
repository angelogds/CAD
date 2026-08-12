const PENDENTE = "Informação pendente de confirmação";

function fallback(value, fallbackText = "Não informado") {
  if (value === null || value === undefined) return fallbackText;
  const text = String(value).trim();
  return text || fallbackText;
}

function optionalText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeSolicitacaoForView(solicitacao) {
  const motivo = optionalText(solicitacao.motivo || solicitacao.descricao) || PENDENTE;
  const observacoes = optionalText(solicitacao.observacoes_compras || solicitacao.observacoes);
  const observacoesSemDuplicacao = observacoes?.localeCompare(motivo, "pt-BR", { sensitivity: "base" }) === 0
    ? null
    : observacoes;

  return {
    id: solicitacao.id,
    numero: fallback(solicitacao.numero, `#${solicitacao.id}`),
    solicitante_nome: fallback(solicitacao.solicitante_nome, PENDENTE),
    setor_origem: fallback(solicitacao.setor_origem),
    setor_destino: fallback(solicitacao.setor_destino || solicitacao.destino_uso || "Setor de Compras"),
    responsavel_nome: fallback(solicitacao.responsavel_nome || solicitacao.compras_nome || solicitacao.almox_nome, PENDENTE),
    prioridade: fallback(solicitacao.prioridade),
    status: fallback(solicitacao.status),
    created_at: solicitacao.created_at || null,
    titulo: fallback(solicitacao.titulo),
    descricao: fallback(solicitacao.descricao, PENDENTE),
    aplicacao: fallback(solicitacao.equipamento_nome || solicitacao.destino_uso || solicitacao.tipo_origem, PENDENTE),
    observacoes: observacoesSemDuplicacao,
    fornecedor: fallback(solicitacao.fornecedor_nome || solicitacao.fornecedor, "Não informado"),
    previsao_entrega: solicitacao.previsao_entrega || null,
    valor_total: solicitacao.valor_total || null,
    equipamento_nome: fallback(solicitacao.equipamento_nome || solicitacao.destino_uso, "Não informado"),
    motivo,
    cotacao_inicio_em: solicitacao.cotacao_inicio_em || null,
    comprada_em: solicitacao.comprada_em || null,
    recebida_em: solicitacao.recebida_em || null,
    fechada_em: solicitacao.fechada_em || null,
    os_id: solicitacao.os_id || null,
  };
}

module.exports = { fallback, normalizeSolicitacaoForView };
