const db = require('../../database/db');
const comprasService = require('./compras.service');
const osChatService = require('../os-chat/os-chat.service');

function fornecedorAtivo(id) {
  if (!id) return null;
  try {
    return db.prepare('SELECT id, nome FROM fornecedores WHERE id=? AND ativo=1').get(Number(id)) || null;
  } catch (_error) {
    return null;
  }
}

function asChecked(value) {
  return ['1', 'TRUE', 'ON', 'SIM'].includes(String(value || '').trim().toUpperCase());
}

function corrigirItemCompra(solicitacaoId, itemId, payload = {}, userId) {
  const solId = Number(solicitacaoId);
  const id = Number(itemId);
  if (!solId || !id) throw new Error('Solicitação ou item inválido.');

  return db.transaction(() => {
    const sol = db.prepare('SELECT * FROM solicitacoes WHERE id=?').get(solId);
    if (!sol) throw new Error('Solicitação não encontrada.');

    const item = db.prepare('SELECT * FROM solicitacao_itens WHERE id=? AND solicitacao_id=?').get(id, solId);
    if (!item) throw new Error('Item não pertence à solicitação.');
    if (String(item.status_compra || '').toUpperCase() === 'CANCELADO') {
      throw new Error('Item removido não pode ser corrigido por este fluxo.');
    }
    if (String(item.exclusao_status || '').toUpperCase() === 'PENDENTE') {
      throw new Error('Cancele primeiro o pedido de exclusão deste item.');
    }

    const recebido = Number(item.qtd_recebida_total || 0);
    if (recebido > 0) {
      throw new Error('Este item já possui recebimento no Almoxarifado. A compra não pode ser desmarcada por aqui; use o fluxo de ajuste de recebimento.');
    }

    const cotado = asChecked(payload.cotado);
    const comprado = asChecked(payload.comprado);
    const eraComprado = String(item.status_compra || '').toUpperCase() === 'COMPRADO';

    // Esta rota existe para corrigir uma marcação já feita. Ela nunca pode ser
    // usada para criar uma nova compra e, portanto, não contorna aprovação.
    if (comprado && !eraComprado) {
      throw new Error('Para marcar um novo item como comprado, use o fluxo normal de Compras e a aprovação aplicável.');
    }
    if (comprado && !cotado) throw new Error('Um item comprado precisa permanecer cotado.');

    let fornecedorId = Number(payload.fornecedor_id || 0) || null;
    let unitario = comprasService.calculos.parseCentavos(payload.valor_unitario, 'Valor unitário');

    if (cotado) {
      if (!fornecedorId || !fornecedorAtivo(fornecedorId)) {
        throw new Error('Fornecedor ativo é obrigatório para manter o item cotado.');
      }
    } else {
      fornecedorId = null;
      unitario = 0;
    }

    const cobertura = comprasService.calcularNecessidadeCompra(
      item.qtd_solicitada,
      comprasService.consultarSaldoItem(item.estoque_item_id),
    );
    const qtdCompraAnterior = Number(item.qtd_comprada || 0);
    const qtdCompra = comprado
      ? (qtdCompraAnterior > 0 ? qtdCompraAnterior : Number(cobertura.quantidade_sugerida || item.qtd_solicitada || 0))
      : null;

    db.prepare(`
      UPDATE solicitacao_itens
      SET fornecedor_id=?,
          valor_unitario_centavos=?,
          status_cotacao=?,
          status_compra=?,
          qtd_comprada=?,
          cotado_em=CASE WHEN ?='COTADO' THEN COALESCE(cotado_em,datetime('now')) ELSE NULL END,
          comprado_em=CASE WHEN ?='COMPRADO' THEN COALESCE(comprado_em,datetime('now')) ELSE NULL END,
          atualizado_por=?,
          updated_at=datetime('now')
      WHERE id=? AND solicitacao_id=?
    `).run(
      fornecedorId,
      unitario,
      cotado ? 'COTADO' : 'PENDENTE',
      comprado ? 'COMPRADO' : 'PENDENTE',
      qtdCompra,
      cotado ? 'COTADO' : 'PENDENTE',
      comprado ? 'COMPRADO' : 'PENDENTE',
      userId || null,
      id,
      solId,
    );

    const itens = db.prepare('SELECT * FROM solicitacao_itens WHERE solicitacao_id=?').all(solId);
    const subtotal = itens.reduce((sum, row) => {
      if (String(row.status_compra || '').toUpperCase() === 'CANCELADO') return sum;
      return sum + comprasService.calculos.subtotalCentavos(
        Number(row.qtd_solicitada || 0),
        Number(row.valor_unitario_centavos || 0),
      );
    }, 0);
    const frete = Number(sol.frete_centavos || 0);
    const desconto = Number(sol.desconto_centavos || 0);
    const total = Math.max(0, subtotal + frete - desconto);
    const status = comprasService.recalcularStatus(itens, sol.status);

    db.prepare(`
      UPDATE solicitacoes
      SET valor_total=?, valores_itens_revisados=1, status=?, updated_at=datetime('now')
      WHERE id=?
    `).run(total / 100, status, solId);

    if (sol.os_id) {
      try {
        const antes = `${item.status_cotacao || 'PENDENTE'}/${item.status_compra || 'PENDENTE'}`;
        const depois = `${cotado ? 'COTADO' : 'PENDENTE'}/${comprado ? 'COMPRADO' : 'PENDENTE'}`;
        osChatService.registrarMensagemSistema(
          sol.os_id,
          'COMPRA_ATUALIZADA',
          `Compras corrigiu o item #${id} da solicitação ${sol.numero || solId}: ${antes} → ${depois}.`,
          { solicitacao_id: solId, item_id: id, user_id: userId || null },
        );
      } catch (_error) {}
    }

    return comprasService.getSolicitacaoDetalhe(solId);
  })();
}

module.exports = { corrigirItemCompra };
