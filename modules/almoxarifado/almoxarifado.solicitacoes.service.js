const db = require('../../database/db');
const compras = require('../compras/compras.service');
const { normalizeSetorCorporativo } = require('../compras/compras-setores');
const token = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function consultar(filters = {}) {
  // A visibilidade usa exatamente a liberação de Compras, incluindo Demandas.
  const solicitacoes = compras.listSolicitacoesPorStatus({ historico: true })
    .filter(s => !['CANCELADA', 'CANCELADO'].includes(String(s.status).toUpperCase()));
  const ids = solicitacoes.map(s => s.id);
  const linhas = ids.length ? db.prepare(`SELECT si.*,e.nome equipamento_nome,e.codigo equipamento_codigo,f.nome fornecedor_item_nome
    FROM solicitacao_itens si JOIN solicitacoes s ON s.id=si.solicitacao_id
    LEFT JOIN equipamentos e ON e.id=s.equipamento_id
    LEFT JOIN fornecedores f ON f.id=si.fornecedor_id
    WHERE si.solicitacao_id IN (SELECT value FROM json_each(?))
      AND UPPER(COALESCE(si.status_compra,''))<>'CANCELADO' ORDER BY si.id`).all(JSON.stringify(ids)) : [];
  const porSolicitacao = new Map();
  for (const linha of linhas) {
    if (!porSolicitacao.has(linha.solicitacao_id)) porSolicitacao.set(linha.solicitacao_id, []);
    porSolicitacao.get(linha.solicitacao_id).push(linha);
  }
  const q = String(filters.q || '').trim().slice(0, 120);
  const setor = normalizeSetorCorporativo(filters.setor);
  const registros = solicitacoes.map(s => {
    const itens = porSolicitacao.get(s.id) || [];
    const comprados = itens.filter(i => i.status_compra === 'COMPRADO');
    const aReceber = comprados.filter(i => Number(i.qtd_comprada || 0) > Number(i.qtd_recebida_total || 0));
    const aguardando = itens.filter(i => !['COMPRADO', 'ATENDIDO_ESTOQUE'].includes(i.status_compra));
    const encerrada = s.status === 'FECHADA' || (itens.length > 0 && !aReceber.length && !aguardando.length);
    const parcial = aReceber.some(i => Number(i.qtd_recebida_total) > 0) || (aReceber.length && comprados.some(i => Number(i.qtd_recebida_total) > 0));
    const etapa = encerrada ? 'RECEBIDA' : aReceber.length ? (parcial ? 'PARCIAL' : 'A_RECEBER') : 'AGUARDANDO_COMPRAS';
    return { ...s, equipamento_nome: itens[0]?.equipamento_nome || null, equipamento_codigo: itens[0]?.equipamento_codigo || null,
      setor_exibicao: normalizeSetorCorporativo(s.setor_origem) || 'Não informado',
      itens_total: itens.length, itens_comprados: comprados.length, itens_a_receber: aReceber.length,
      itens_aguardando: aguardando.length, encerrada, etapa,
      etapa_nome: { RECEBIDA: 'Recebimento concluído', PARCIAL: 'Recebimento parcial', A_RECEBER: 'Pronta para receber', AGUARDANDO_COMPRAS: 'Aguardando Compras' }[etapa],
      divergencia_fechada: s.status === 'FECHADA' && aReceber.length > 0,
      busca: token([s.numero, s.titulo, s.solicitante_nome, s.fornecedor_nome, s.fornecedor, s.setor_origem,
        itens[0]?.equipamento_nome, itens[0]?.equipamento_codigo, ...itens.flatMap(i => [i.item_nome,i.fornecedor_item_nome])].join(' ')) };
  }).filter(s => (!setor || s.setor_exibicao === setor) && (!q || s.busca.includes(token(q))));
  const resumo = { abertas: registros.filter(s => !s.encerrada).length, fechadas: registros.filter(s => s.encerrada).length,
    aReceber: registros.filter(s => !s.encerrada && s.itens_a_receber > 0).length,
    parciais: registros.filter(s => !s.encerrada && s.etapa === 'PARCIAL').length,
    aguardandoCompras: registros.filter(s => !s.encerrada && !s.itens_a_receber).length };
  const aba = String(filters.aba || 'ABERTAS').toUpperCase() === 'FECHADAS' ? 'FECHADAS' : 'ABERTAS';
  const situacao = String(filters.situacao || '').toUpperCase();
  const filas = registros.filter(s => (aba === 'FECHADAS' ? s.encerrada : !s.encerrada)
    && (!situacao || situacao === 'TODAS' ||
      (situacao === 'PENDENTES' ? s.itens_a_receber > 0 : situacao === 'NAO_CHEGOU' ? s.etapa === 'A_RECEBER' : situacao === 'PARCIAL' ? s.etapa === 'PARCIAL' :
        situacao === 'AGUARDANDO_COMPRAS' ? s.etapa === 'AGUARDANDO_COMPRAS' : true)))
    .sort((a,b) => Number(b.itens_a_receber > 0) - Number(a.itens_a_receber > 0) || b.id - a.id);
  const paginas = Math.max(1, Math.ceil(filas.length / 20));
  const pagina = Math.min(paginas, Math.max(1, Math.trunc(Number(filters.pagina) || 1)));
  return { lista: filas.slice((pagina - 1) * 20, pagina * 20), resumo, aba, q, setor, situacao,
    pagina, paginas, total: filas.length, idsVisiveis: new Set(registros.map(s => s.id)) };
}
module.exports = { consultar };
